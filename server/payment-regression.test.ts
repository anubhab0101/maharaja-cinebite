import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import { createOrder, confirmOrderPayment, resetDemoData, subscribe, updateOrderStatus } from "./cinebites-store";
import { getPaymentProvider, RazorpayLiveProvider } from "./payment-provider";
import { getClientIp, isLocalDevLoginAllowed, safeRedirect, createRateLimiter } from "./_core/security";
import { getDb } from "./db";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
const newOrder = () => createOrder({ screen: "Audi 1", seat: "A1", customerName: "Test Customer", phone: "9876543210", items: [{ itemId: "masala-tea", quantity: 1 }] });
beforeEach(() => { resetDemoData(); vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("RAZORPAY_KEY_ID", ""); vi.stubEnv("RAZORPAY_KEY_SECRET", ""); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("payment ownership", () => {
  it("does not publish confirmation when the database transaction fails", async () => {
    const order = await newOrder();
    vi.mocked(getDb).mockResolvedValueOnce(null).mockResolvedValueOnce({ transaction: vi.fn().mockRejectedValue(new Error("Database unavailable")) } as any);
    const listener = vi.fn();
    const stop = subscribe(listener);
    try {
      await expect(confirmOrderPayment({ orderId: order.id, providerOrderId: `order_mock_${order.orderNumber}`, providerPaymentId: "pay_mock_db", signature: "mock_test_signature" })).rejects.toThrow("Database unavailable");
      expect(order.paymentStatus).toBe("PENDING");
      expect(listener).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it("accepts a captured payment with the matching provider receipt and amount", async () => {
    const provider = new RazorpayLiveProvider("test-key", "test-secret");
    const input = { providerOrderId: "order_123", providerPaymentId: "pay_123", receipt: "CB-A", amountPaise: 5000,
      signature: crypto.createHmac("sha256", "test-secret").update("order_123|pay_123").digest("hex") };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "pay_123", order_id: "order_123", status: "captured", amount: 5000, currency: "INR" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "order_123", receipt: "CB-A", amount: 5000, currency: "INR", status: "paid" }) }));
    expect(await provider.verifyPayment(input)).toBe(true);
  });

  it("rejects a valid payment for a different order and does not notify kitchen", async () => {
    const a = await newOrder();
    const b = await newOrder();
    const listener = vi.fn();
    const stop = subscribe(listener);
    try {
      await expect(confirmOrderPayment({ orderId: b.id, providerOrderId: `order_mock_${a.orderNumber}`, providerPaymentId: "pay_mock_one", signature: "mock_test_signature" })).rejects.toThrow("does not match");
      expect(b.paymentStatus).toBe("PENDING");
      expect(listener).not.toHaveBeenCalled();
      await expect(updateOrderStatus(b.id, "PREPARING", "staff")).rejects.toThrow("Unpaid");
    } finally { stop(); }
  });

  it("duplicate concurrent confirmation emits one kitchen event", async () => {
    const order = await newOrder();
    const listener = vi.fn();
    const stop = subscribe(listener);
    try {
      const input = { orderId: order.id, providerOrderId: `order_mock_${order.orderNumber}`, providerPaymentId: "pay_mock_one", signature: "mock_test_signature" };
      await Promise.all([confirmOrderPayment(input), confirmOrderPayment(input)]);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(order.paymentStatus).toBe("CONFIRMED");
    } finally { stop(); }
  });

  it.each(["production", "development", ""])("does not fall back to synthetic payments in %s", mode => {
    vi.stubEnv("NODE_ENV", mode);
    expect(() => getPaymentProvider()).toThrow();
  });

  it.each(["receipt", "amount", "currency", "status", "order_id"])("rejects mismatching provider %s despite a valid HMAC", async field => {
    const provider = new RazorpayLiveProvider("test-key", "test-secret");
    const input = { providerOrderId: "order_123", providerPaymentId: "pay_123", receipt: "CB-A", amountPaise: 5000,
      signature: crypto.createHmac("sha256", "test-secret").update("order_123|pay_123").digest("hex") };
    const payment: Record<string, unknown> = { id: "pay_123", order_id: "order_123", status: "captured", amount: 5000, currency: "INR" };
    const order: Record<string, unknown> = { id: "order_123", receipt: "CB-A", amount: 5000, currency: "INR", status: "paid" };
    if (field === "receipt") order.receipt = "CB-B";
    else payment[field] = field === "amount" ? 1 : "incorrect";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({ ok: true, json: async () => payment }).mockResolvedValueOnce({ ok: true, json: async () => order }));
    expect(await provider.verifyPayment(input)).toBe(false);
  });
});

describe("request trust boundaries", () => {
  it("forwarded headers cannot rotate the limiter key", () => {
    const next = vi.fn();
    const json = vi.fn();
    const res = { status: vi.fn(() => ({ json })) } as any;
    const limiter = createRateLimiter({ windowMs: 60000, maxRequests: 1 });
    const req = { ip: "198.51.100.5", socket: { remoteAddress: "198.51.100.5" }, headers: { "x-forwarded-for": "127.0.0.1" } } as any;
    expect(getClientIp(req)).toBe("198.51.100.5");
    limiter(req, res, next);
    req.headers["x-forwarded-for"] = "203.0.113.1";
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
  });
  it("requires opt-in, development mode, and direct loopback for dev login", () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("ENABLE_DEV_LOGIN", "true");
    const req = { socket: { remoteAddress: "127.0.0.1" }, headers: {} } as any;
    expect(isLocalDevLoginAllowed(req)).toBe(true);
    req.headers["x-forwarded-for"] = "127.0.0.1";
    expect(isLocalDevLoginAllowed(req)).toBe(false);
    req.headers = {}; vi.stubEnv("NODE_ENV", "production");
    expect(isLocalDevLoginAllowed(req)).toBe(false);
  });
  it.each(["//evil.example", "/\\evil.example", "/\nevil.example", "https://evil.example", null])("rejects unsafe login redirect %s", value => {
    expect(safeRedirect(value)).toBe("/maharaja");
  });
  it("preserves internal routes", () => expect(safeRedirect("/rasoi?tab=queue")).toBe("/rasoi?tab=queue"));
});
