import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express } from "express";
import { eq } from "drizzle-orm";
import { orders } from "../drizzle/schema";
import { database } from "./durable-store";
import { confirmOrderPayment } from "./cinebites-store";

export function verifyWebhook(body: Buffer, signature: unknown, secret: string): boolean {
  if (!secret || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function registerPaymentWebhook(app: Express) {
  // Register BEFORE express.json: Razorpay signs the exact unmodified bytes.
  app.post(["/api/webhooks/razorpay", "/api/payment/webhook"], express.raw({ type: "application/json", limit: "256kb" }), async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";
    if (!secret) { res.status(503).json({ error: "Webhook not configured" }); return; }
    if (!Buffer.isBuffer(req.body) || !verifyWebhook(req.body, req.headers["x-razorpay-signature"], secret)) {
      res.status(401).json({ error: "Invalid signature" }); return;
    }
    let event;
    try { event = JSON.parse(req.body.toString("utf8")); }
    catch { res.status(400).json({ error: "Invalid JSON" }); return; }
    if (!event || !["payment.captured", "order.paid"].includes(event.event)) { res.sendStatus(204); return; }
    const payment = event.payload?.payment?.entity;
    if (!payment || typeof payment.id !== "string" || typeof payment.order_id !== "string") {
      res.status(400).json({ error: "Missing payment" }); return;
    }
    try {
      const db = await database();
      if (!db) throw new Error("Database unavailable");
      const [order] = await db.select().from(orders).where(eq(orders.providerOrderId, payment.order_id)).limit(1);
      // Retry unknown associations: a checkout transaction may still be committing.
      if (!order?.publicId) { res.status(503).json({ error: "Order association not ready" }); return; }
      await confirmOrderPayment({ orderId: order.publicId, providerOrderId: payment.order_id, providerPaymentId: payment.id }, "razorpay_webhook", true);
      res.sendStatus(204);
    } catch {
      console.error("[Payments] Webhook processing failed; provider retry required");
      res.status(503).json({ error: "Payment processing temporarily unavailable" });
    }
  });
}
