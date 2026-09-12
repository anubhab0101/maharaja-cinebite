import { and, eq, inArray } from "drizzle-orm";
import { database } from "./durable-store";
import { auditLogs, consentRecords, orderItems, orders, payments, refunds, storeEntities } from "../drizzle/schema";
import type { PrivacyRequest } from "./pilot-operations";
import { retentionDecision } from "./retention-policy";

export type RetentionApproval = { reference: string; allRetentionExpired: true; noDisputeOrLegalHold: true; externalCopiesReviewed: true };

// Run as an offline operator command, not alongside the web server. Each exact
// order is locked and rechecked in the same transaction as deletion.
export async function cleanupOrder(orderNumber: string, approval?: RetentionApproval, now = new Date()) {
  const db = await database();
  if (!db) throw new Error("Database required");
  return db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(orders.orderNumber, orderNumber)).limit(1).for("update");
    if (!order) throw new Error("Order not found; no changes made");
    const consents = await tx.select().from(consentRecords).where(eq(consentRecords.orderId, order.id));
    const paymentRows = await tx.select().from(payments).where(eq(payments.orderId, order.id));
    const refundRows = await tx.select().from(refunds).where(eq(refunds.orderId, order.id));
    const auditScope = and(eq(auditLogs.entityType, "order"), inArray(auditLogs.entityId, [String(order.id), orderNumber, order.publicId ?? orderNumber]));
    const events = await tx.select().from(auditLogs).where(auditScope);
    const privacyEntries = await tx.select().from(storeEntities).where(eq(storeEntities.kind, "privacy"));
    const relatedRequests = privacyEntries.filter(row => (row.payload as PrivacyRequest).orderId === order.id);
    const decision = retentionDecision({ status: order.status, paymentStatus: order.paymentStatus, refundCount: refundRows.length, hasSnapshot: !!order.snapshot,
      dates: [order.createdAt, order.updatedAt, ...(order.paymentConfirmedAt ? [order.paymentConfirmedAt] : []), ...consents.map(row => row.createdAt), ...paymentRows.map(row => row.createdAt), ...refundRows.map(row => row.createdAt), ...events.map(row => row.createdAt)] }, now);
    const counts = { orders: 1, consents: consents.length, payments: paymentRows.length, auditEvents: events.length };
    if (relatedRequests.some(row => { const request = row.payload as PrivacyRequest; return request.legalHold || !["RESOLVED", "REJECTED"].includes(request.status); })) {
      decision.eligibleForReview = false;
      decision.reasons.push("Open privacy request or legal hold prevents deletion");
    }
    if (!approval) return { mode: "PREVIEW", ...decision, counts, requiresLegalRelease: true };
    if (!decision.eligibleForReview) throw new Error(`Deletion blocked: ${decision.reasons.join("; ")}`);
    if (!approval.allRetentionExpired || !approval.noDisputeOrLegalHold || !approval.externalCopiesReviewed || !/^[A-Za-z0-9_-]{8,80}$/.test(approval.reference)) throw new Error("Documented retention release required");
    await tx.delete(orderItems).where(eq(orderItems.orderId, order.id));
    for (const row of relatedRequests) await tx.delete(storeEntities).where(eq(storeEntities.key, row.key));
    await tx.delete(consentRecords).where(eq(consentRecords.orderId, order.id));
    await tx.delete(payments).where(eq(payments.orderId, order.id));
    await tx.delete(auditLogs).where(auditScope);
    await tx.delete(orders).where(eq(orders.id, order.id));
    // Do not put the deleted customer's identifiers back into the audit log.
    await tx.insert(auditLogs).values({ action: "RETENTION_CLEANUP", entityType: "retention", detail: JSON.stringify({ reference: approval.reference, counts, completedAt: now.toISOString() }) });
    return { mode: "DELETED", counts, reference: approval.reference };
  });
}
