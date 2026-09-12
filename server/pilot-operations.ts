import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { database, readEntities, writeEntity } from "./durable-store";
import { orders, payments, refunds, auditLogs, storeEntities } from "../drizzle/schema";
import { confirmOrderPayment } from "./cinebites-store";

export const pauseSchema = z.object({ paused: z.boolean(), reason: z.string().trim().min(3).max(160) });
export async function orderingControl() {
  const entries = await readEntities<{ paused: boolean; reason: string }>("ordering");
  const entry = entries?.[0];
  if (entry && typeof entry.paused !== "boolean") throw new Error("Invalid ordering control");
  return { paused: entry?.paused ?? false };
}
export async function setOrderingControl(input: z.infer<typeof pauseSchema>, actor: string) {
  await writeEntity("ordering", "global", { ...input, updatedAt: new Date().toISOString() }, actor, "ORDERING_CONTROL_CHANGED");
  return { paused: input.paused };
}
async function providerGet(path: string) {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error("Razorpay credentials required");
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Razorpay lookup unavailable; retry later");
  return response.json();
}
export function capturedPaymentIds(data: unknown, orderId: string) {
  const response = z.object({ items: z.array(z.object({ id: z.string().regex(/^pay_[A-Za-z0-9]+$/), order_id: z.string(), status: z.string() })) }).parse(data);
  return response.items.filter(row => row.order_id === orderId && row.status === "captured").map(row => row.id);
}
export async function pendingPayments() {
  const db = await database();
  if (!db) throw new Error("Database required");
  return db.select({ id: orders.id, orderNumber: orders.orderNumber, createdAt: orders.createdAt }).from(orders).where(and(eq(orders.paymentStatus, "PENDING"), isNotNull(orders.providerOrderId))).orderBy(desc(orders.createdAt)).limit(100);
}
export async function reconcilePayment(orderId: number, actor: string) {
  const db = await database();
  if (!db) throw new Error("Database required");
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order?.publicId || !order.providerOrderId || !/^order_[A-Za-z0-9]+$/.test(order.providerOrderId)) throw new Error("Stored payment intent missing");
  if (order.paymentStatus === "CONFIRMED") return { status: "ALREADY_CONFIRMED" };
  const ids = capturedPaymentIds(await providerGet(`orders/${order.providerOrderId}/payments`), order.providerOrderId);
  if (!ids.length) return { status: "NO_CAPTURED_PAYMENT" };
  if (ids.length !== 1) throw new Error("Multiple captured payments need manual investigation");
  // Existing confirmation re-fetches the payment/order and validates amount,
  // currency, receipt, capture and stored intent under its normal row lock.
  await confirmOrderPayment({ orderId: order.publicId, providerOrderId: order.providerOrderId, providerPaymentId: ids[0], signature: "" }, actor, true);
  return { status: "CONFIRMED" };
}
export function verifiedRefund(data: unknown, expected: { refundId: string; paymentId: string; amount: number }) {
  const row = z.object({ id: z.string(), payment_id: z.string(), amount: z.number().int(), currency: z.literal("INR"), status: z.enum(["pending", "processed", "failed"]) }).parse(data);
  if (row.id !== expected.refundId || row.payment_id !== expected.paymentId || row.amount !== expected.amount) throw new Error("Refund does not match the recorded request");
  return row.status === "processed" ? "SUCCEEDED" as const : row.status === "failed" ? "FAILED" as const : "PROCESSING" as const;
}
export async function syncRefund(id: number, refundId: string, actorId: number) {
  if (!/^rfnd_[A-Za-z0-9]+$/.test(refundId)) throw new Error("Invalid refund reference");
  const data = await providerGet(`refunds/${refundId}`);
  const db = await database();
  if (!db) throw new Error("Database required");
  return db.transaction(async tx => {
    const [request] = await tx.select().from(refunds).where(eq(refunds.id, id)).limit(1).for("update");
    if (!request || (request.refundId && request.refundId !== refundId)) throw new Error("Refund request/reference mismatch");
    const [payment] = await tx.select().from(payments).where(eq(payments.id, request.paymentId)).limit(1);
    if (!payment || payment.orderId !== request.orderId) throw new Error("Original payment missing");
    const status = verifiedRefund(data, { refundId, paymentId: payment.providerPaymentId, amount: request.amountPaise });
    if (request.status === "SUCCEEDED" && status !== "SUCCEEDED") throw new Error("Cannot regress a completed refund");
    await tx.update(refunds).set({ refundId, status }).where(eq(refunds.id, id));
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: "REFUND_STATUS_VERIFIED", entityType: "order", entityId: String(request.orderId), detail: JSON.stringify({ requestId: id, refundId, status }) });
    return { status };
  });
}

export const privacySchema = z.object({ id: z.string().uuid().optional(), expectedUpdatedAt: z.string().datetime().optional(), orderId: z.number().int().positive(), type: z.enum(["ACCESS", "CORRECTION", "DELETION"]), status: z.enum(["REQUESTED", "VERIFIED", "RESOLVED", "REJECTED"]), legalHold: z.boolean(), note: z.string().trim().min(5).max(500), identityVerified: z.boolean() });
export type PrivacyRequest = z.infer<typeof privacySchema> & { id: string; updatedAt: string };
export function validatePrivacyTransition(input: z.infer<typeof privacySchema>) {
  if (["VERIFIED", "RESOLVED"].includes(input.status) && !input.identityVerified) throw new Error("Verify the customer's identity first");
}
export async function savePrivacyRequest(input: z.infer<typeof privacySchema>, actorId: number) {
  validatePrivacyTransition(input);
  const db = await database();
  if (!db) throw new Error("Database required");
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1).for("update");
    if (!order) throw new Error("Order not found");
    const id = input.id ?? randomUUID();
    const key = `privacy:${id}`;
    const [existing] = await tx.select().from(storeEntities).where(eq(storeEntities.key, key)).limit(1).for("update");
    if (input.id && (!existing || (existing.payload as PrivacyRequest).orderId !== input.orderId)) throw new Error("Privacy request/order mismatch");
    if (input.id && (!input.expectedUpdatedAt || (existing!.payload as PrivacyRequest).updatedAt !== input.expectedUpdatedAt)) throw new Error("Request changed; reload before updating or releasing a hold");
    const payload = { ...input, id, updatedAt: new Date().toISOString() };
    await tx.insert(storeEntities).values({ key, kind: "privacy", payload }).onDuplicateKeyUpdate({ set: { payload } });
    await tx.insert(auditLogs).values({ actorUserId: actorId, action: "PRIVACY_REQUEST_UPDATED", entityType: "order", entityId: String(order.id), detail: JSON.stringify({ requestId: id, status: input.status, legalHold: input.legalHold, identityVerified: input.identityVerified, note: input.note }) });
    return payload;
  });
}
