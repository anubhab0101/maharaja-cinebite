import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "./db";
import { orders, screens, seats, storeEntities, auditLogs, consentRecords } from "../drizzle/schema";
import type { KitchenOrder } from "@shared/cinebites";
import { createHash } from "node:crypto";
import { checkoutConsentSchema, type CheckoutConsent } from "@shared/consent";
import { menuEvents } from "./menu-events";
import { TRPCError } from "@trpc/server";
import { menuPrice } from "../shared/menu-pricing";
import type { MenuItem } from "../shared/cinebites";

export async function database() {
  const db = await getDb();
  if (!db && process.env.NODE_ENV !== "test") throw new Error("Database unavailable; refusing non-durable operation");
  return db;
}

export async function readOrders() {
  const db = await database();
  if (!db) return null;
  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt));
  if (rows.some(row => !row.snapshot)) throw new Error("Legacy orders need data migration before this store can serve them");
  return rows.map(row => ({ ...row.snapshot!, status: row.status, paymentStatus: row.paymentStatus, updatedAt: row.updatedAt.toISOString() }));
}

export async function readOrder(id: string) {
  const db = await database();
  if (!db) return null;
  const [row] = await db.select().from(orders).where(or(eq(orders.publicId, id), eq(orders.orderNumber, id))).limit(1);
  return row?.snapshot ? { ...row.snapshot, status: row.status, paymentStatus: row.paymentStatus, updatedAt: row.updatedAt.toISOString() } : undefined;
}

export async function readEntities<T>(kind: string): Promise<T[] | null> {
  const db = await database();
  if (!db) return null;
  const rows = await db.select().from(storeEntities).where(eq(storeEntities.kind, kind));
  return rows.map(row => row.payload as T);
}

export async function writeEntity(kind: string, id: string, payload: unknown, actor: string, action: string) {
  const db = await database();
  if (!db) return;
  await db.transaction(async tx => {
    const key = `${kind}:${createHash("sha256").update(id).digest("hex")}`;
    await tx.insert(storeEntities).values({ key, kind, payload })
      .onDuplicateKeyUpdate({ set: { payload } });
    await tx.insert(auditLogs).values({ action, entityType: kind, entityId: id, detail: JSON.stringify({ actor }) });
  });
  if (kind === "menu") menuEvents.emit("changed");
}

export async function persistOrder(order: KitchenOrder, input: { idempotencyKey?: string; checkoutHash?: string; showtimeId?: number; consent?: CheckoutConsent; items?: { itemId: string; quantity: number; options?: string[] }[] }) {
  const consent = input.consent ? checkoutConsentSchema.parse(input.consent) : undefined;
  const db = await database();
  if (!db) return;
  await db.transaction(async tx => {
    const [screen] = await tx.select().from(screens).where(and(eq(screens.name, order.screen), eq(screens.active, 1))).limit(1);
    for (const line of [...(input.items ?? [])].sort((a,b) => a.itemId.localeCompare(b.itemId))) {
      const key = `menu:${createHash("sha256").update(line.itemId).digest("hex")}`;
      const [row] = await tx.select().from(storeEntities).where(eq(storeEntities.key, key)).limit(1).for("update");
      const current = row?.payload as MenuItem | undefined;
      const index = input.items!.indexOf(line);
      if (!current?.available) throw new TRPCError({ code: "BAD_REQUEST", message: "An item is sold out. Refresh your cart before paying." });
      if (menuPrice(current) !== order.items[index]?.pricePaise || (line.options ?? []).some(option => !current.options.includes(option))) throw new TRPCError({ code: "BAD_REQUEST", message: "Menu changed. Review your cart before paying." });
    }
    if (!screen) throw new Error("Screen is not configured or is inactive");
    const [seat] = await tx.select().from(seats).where(and(eq(seats.screenId, screen.id), eq(seats.label, order.seat))).limit(1);
    if (!seat) throw new Error("Seat is not configured for this screen");
    const [inserted] = await tx.insert(orders).values({
      orderNumber: order.orderNumber, publicId: order.id, snapshot: order,
      status: "NEW", source: order.source, paymentStatus: order.paymentStatus,
      screenId: screen.id, seatId: seat.id, customerName: order.customerName,
      customerPhoneLast4: order.phoneLast4, totalPaise: order.totalPaise,
      instructions: order.instructions, idempotencyKey: input.idempotencyKey ?? order.id,
      checkoutHash: input.checkoutHash, showtimeId: input.showtimeId,
    }).$returningId();
    if (consent) {
      const acceptedAt = new Date();
      await tx.insert(consentRecords).values({ orderId: inserted.id, policyVersion: consent.policyVersion, terms: Number(consent.terms), privacy: Number(consent.privacy), refund: Number(consent.refund), retention: 0, support: 0, createdAt: acceptedAt });
      await tx.insert(auditLogs).values({ action: "CHECKOUT_CONSENT", entityType: "order", entityId: order.id, detail: JSON.stringify({ orderId: inserted.id, ...consent, acceptedAt: acceptedAt.toISOString() }), createdAt: acceptedAt });
    }
    await tx.insert(auditLogs).values({ action: "ORDER_CREATED", entityType: "order", entityId: order.id, detail: "customer checkout" });
  });
}

export async function persistStatus(order: KitchenOrder, previous: string, actor: string) {
  const db = await database();
  if (!db) return;
  await db.transaction(async tx => {
    const [row] = await tx.select().from(orders).where(eq(orders.orderNumber, order.orderNumber)).limit(1).for("update");
    if (!row || row.status !== previous || row.paymentStatus !== "CONFIRMED") throw new Error("Order changed; refresh the queue before retrying");
    if (order.status === "CANCELED") throw new Error("Cancellation requires refund review");
    await tx.update(orders).set({ status: order.status, snapshot: order, updatedAt: new Date() }).where(eq(orders.id, row.id));
    if (order.status === "DELIVERED") await tx.delete(storeEntities).where(eq(storeEntities.key, `order-chat:${order.orderNumber}`));
    await tx.insert(auditLogs).values({ action: "ORDER_STATUS_CHANGED", entityType: "order", entityId: order.id, detail: JSON.stringify({ actor, from: previous, to: order.status }) });
  });
}
