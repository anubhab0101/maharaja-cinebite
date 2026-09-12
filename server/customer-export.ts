import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { database } from "./durable-store";
import { orders, consentRecords, auditLogs, payments, refunds, orderItems, storeEntities } from "../drizzle/schema";
import type { PrivacyRequest } from "./pilot-operations";

export const customerExportInput = z.object({ afterId: z.number().int().nonnegative().default(0) });

// Explicit business-record allowlist: never export users, auth sessions,
// seat/session QR secrets or generic configuration payloads.
export async function exportCustomerPage(afterId: number, actorId: number) {
  const db = await database();
  if (!db) throw new Error("Database required for export");
  return db.transaction(async tx => {
    const found = await tx.select().from(orders).where(gt(orders.id, afterId)).orderBy(asc(orders.id)).limit(201);
    const rows = found.slice(0, 200);
    const ids = rows.map(row => row.id);
    const publicIds = rows.map(row => row.publicId).filter((id): id is string => !!id);
    const records = {
      orders: rows,
      items: ids.length ? await tx.select().from(orderItems).where(inArray(orderItems.orderId, ids)) : [],
      consents: ids.length ? await tx.select().from(consentRecords).where(inArray(consentRecords.orderId, ids)) : [],
      consentEvidence: publicIds.length ? await tx.select().from(auditLogs).where(and(eq(auditLogs.action, "CHECKOUT_CONSENT"), inArray(auditLogs.entityId, publicIds))) : [],
      payments: ids.length ? await tx.select().from(payments).where(inArray(payments.orderId, ids)) : [],
      refunds: ids.length ? await tx.select().from(refunds).where(inArray(refunds.orderId, ids)) : [],
      privacyRequests: ids.length ? (await tx.select().from(storeEntities).where(eq(storeEntities.kind, "privacy"))).map(row => row.payload as PrivacyRequest).filter(row => ids.includes(row.orderId)) : [],
    };
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: "CUSTOMER_DATA_EXPORTED", entityType: "export", detail: JSON.stringify({ afterId, count: rows.length, lastId: rows.at(-1)?.id ?? null }) });
    return { exportedAt: new Date().toISOString(), records, nextCursor: found.length > 200 ? rows.at(-1)!.id : null };
  });
}
