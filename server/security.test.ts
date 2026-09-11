import { describe, expect, it } from "vitest";
import crypto from "crypto";
import { isValidStorageKey, sanitizeText, createRateLimiter } from "./_core/security";
import { verifyRazorpaySignature } from "./payment-provider";
import { createOrder, findOrderByNumberAndPhone } from "./cinebites-store";

describe("Security & Defense Hardening", () => {
  it("rejects path traversal attempts in storage keys", () => {
    expect(isValidStorageKey("../../etc/passwd")).toBe(false);
    expect(isValidStorageKey("..\\windows\\system32")).toBe(false);
    expect(isValidStorageKey("images/../../secret.key")).toBe(false);
    expect(isValidStorageKey("null\0byte.png")).toBe(false);
    expect(isValidStorageKey("normal/image_123.jpg")).toBe(true);
    expect(isValidStorageKey("menu-assets/combo.webp")).toBe(true);
  });

  it("sanitizes user input to prevent XSS attacks", () => {
    expect(sanitizeText("<script>alert('xss')</script>Rahul")).toBe("scriptalert('xss')/scriptRahul");
    expect(sanitizeText("   Aman Kumar   ")).toBe("Aman Kumar");
  });

  it("verifies authentic Razorpay signatures and blocks tampering", () => {
    const orderId = "order_9A33XWu170gUtm";
    const paymentId = "pay_29AeAqabbxiFt7";
    const secret = "EnLsGLKdRSt4avuHQ0Wjvr2V";

    // Generate valid signature
    const validSignature = crypto
      .createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    // Test authentic verification
    expect(verifyRazorpaySignature(orderId, paymentId, validSignature, secret)).toBe(true);

    // Test forged signature with wrong secret
    expect(verifyRazorpaySignature(orderId, paymentId, validSignature, "wrong_secret")).toBe(false);

    // Test tampered payment ID
    expect(verifyRazorpaySignature(orderId, "tampered_pay_id", validSignature, secret)).toBe(false);

    // Test invalid length
    expect(verifyRazorpaySignature(orderId, paymentId, "short_invalid_signature", secret)).toBe(false);
  });

  it("rate limiter restricts excessive requests within window", () => {
    const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 2 });
    const mockReq = { headers: {}, socket: { remoteAddress: "192.168.1.100" } } as any;

    let callCount = 0;
    let blockedStatus = 0;
    const mockRes = {
      status: (code: number) => {
        blockedStatus = code;
        return { json: () => {} };
      },
    } as any;
    const next = () => { callCount++; };

    limiter(mockReq, mockRes, next); // request 1 -> allowed
    limiter(mockReq, mockRes, next); // request 2 -> allowed
    limiter(mockReq, mockRes, next); // request 3 -> blocked

    expect(callCount).toBe(2);
    expect(blockedStatus).toBe(429);
  });

  it("creates authoritative backend orders and allows safe customer tracking", async () => {
    const order = await createOrder({
      screen: "Maharaja Audi 01",
      seat: "J14",
      customerName: "Priya Sharma",
      phone: "+91 9876543210",
      items: [{ itemId: "festival-combo", quantity: 2 }],
      instructions: "Extra caramel on popcorn",
    });

    expect(order.orderNumber).toMatch(/^CB-\d{4}$/);
    expect(order.phoneLast4).toBe("3210");
    expect(order.platformFeePaise).toBe(1000);
    expect(order.totalPaise).toBe(24400); // (11700 * 2) + 1000 platform fee
    expect(order.customerName).toBe("Priya Sharma");

    // Test finding order with valid phoneLast4
    const tracked = findOrderByNumberAndPhone(order.orderNumber, "3210");
    expect(tracked).toBeDefined();
    expect(tracked?.totalPaise).toBe(24400);

    // Test tracking rejection with wrong phone
    const unauthenticatedTrack = findOrderByNumberAndPhone(order.orderNumber, "9999");
    expect(unauthenticatedTrack).toBeUndefined();
  });

  it("strictly requires full 10-digit phone number for lookup and blocks partial searches", async () => {
    const order = await createOrder({
      screen: "Screen 02",
      seat: "D10",
      customerName: "Aman Gupta",
      phone: "9876543210",
      items: [{ itemId: "large-popcorn", quantity: 1 }],
      paymentStatus: "CONFIRMED",
    });

    const { findOrdersByFullPhone } = await import("./cinebites-store");

    // Full 10-digit search matches
    const matches = findOrdersByFullPhone("9876543210");
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((m) => m.orderNumber === order.orderNumber)).toBe(true);

    // Partial 4-digit search is strictly rejected
    const partialMatch = findOrdersByFullPhone("3210");
    expect(partialMatch).toEqual([]);

    // 9-digit incomplete number is rejected
    const incompleteMatch = findOrdersByFullPhone("987654321");
    expect(incompleteMatch).toEqual([]);
  });

  it("manages order payment lifecycle and confirms orders with cryptographic record", async () => {
    const { confirmOrderPayment } = await import("./cinebites-store");

    const order = await createOrder({
      screen: "Screen 01",
      seat: "A5",
      customerName: "Rohan",
      phone: "9123456780",
      items: [{ itemId: "masala-tea", quantity: 2 }],
      paymentStatus: "PENDING",
    });

    expect(order.paymentStatus).toBe("PENDING");

    const confirmed = await confirmOrderPayment({
      orderId: order.id,
      providerOrderId: "order_mock_123",
      providerPaymentId: "pay_mock_456",
      signature: "sig_mock_789",
    });

    expect(confirmed.paymentStatus).toBe("CONFIRMED");
    expect(confirmed.status).toBe("NEW");
  });

  it("checkRateLimit blocks excessive actions by key", async () => {
    const { checkRateLimit } = await import("./_core/security");
    const testKey = "test-spam-key-" + Date.now();

    expect(checkRateLimit(testKey, 3, 2000)).toBe(true); // 1
    expect(checkRateLimit(testKey, 3, 2000)).toBe(true); // 2
    expect(checkRateLimit(testKey, 3, 2000)).toBe(true); // 3
    expect(checkRateLimit(testKey, 3, 2000)).toBe(false); // 4 -> blocked!
  });
});
