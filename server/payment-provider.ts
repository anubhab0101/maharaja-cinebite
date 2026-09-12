import crypto from "crypto";

export type PaymentIntent = {
  provider: "razorpay";
  providerOrderId: string;
  amountPaise: number;
  currency: "INR";
  keyId?: string;
};

export type ConfirmPaymentInput = {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
};

export type VerifyPaymentInput = ConfirmPaymentInput & {
  amountPaise: number;
  receipt: string;
};

export interface PaymentProvider {
  createIntent(input: { amountPaise: number; receipt: string }): Promise<PaymentIntent>;
  verifySignature(input: ConfirmPaymentInput): boolean;
  verifyPayment(input: VerifyPaymentInput): Promise<boolean>;
  verifyCapturedPayment(input: VerifyPaymentInput): Promise<boolean>;
  refund(input: { providerPaymentId: string; amountPaise: number; reason: string }): Promise<{ refundId: string; status: "PROCESSING" | "SUCCEEDED" }>;
}

/**
 * Constant-time Razorpay HMAC-SHA256 signature verification.
 * Prevents cryptographic timing attack vulnerabilities.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): boolean {
  if (!orderId || !paymentId || !signature || !secret) {
    return false;
  }
  try {
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(`${orderId}|${paymentId}`);
    const expectedSignature = hmac.digest("hex");

    if (expectedSignature.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Real Razorpay Production Gateway Adapter
 */
export class RazorpayLiveProvider implements PaymentProvider {
  private keyId: string;
  private keySecret: string;

  constructor(keyId: string, keySecret: string) {
    this.keyId = keyId;
    this.keySecret = keySecret;
  }

  async createIntent(input: { amountPaise: number; receipt: string }): Promise<PaymentIntent> {
    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: "INR",
        receipt: input.receipt,
        payment_capture: 1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Razorpay order creation failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { id: string; amount: number; currency: "INR" };
    if (!data.id || data.amount !== input.amountPaise || data.currency !== "INR") {
      throw new Error("Payment gateway returned an invalid order");
    }
    return {
      provider: "razorpay",
      providerOrderId: data.id,
      amountPaise: data.amount,
      currency: "INR",
      keyId: this.keyId,
    };
  }

  verifySignature(input: ConfirmPaymentInput): boolean {
    return verifyRazorpaySignature(
      input.providerOrderId,
      input.providerPaymentId,
      input.signature,
      this.keySecret
    );
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<boolean> {
    return this.verifySignature(input) && this.verifyCapturedPayment(input);
  }

  async verifyCapturedPayment(input: VerifyPaymentInput): Promise<boolean> {
    if (!/^pay_[A-Za-z0-9]+$/.test(input.providerPaymentId) ||
      !/^order_[A-Za-z0-9]+$/.test(input.providerOrderId)) return false;
    const headers = { Authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}` };
    const [paymentResponse, orderResponse] = await Promise.all([
      fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.providerPaymentId)}`, { headers, signal: AbortSignal.timeout(15000) }),
      fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(input.providerOrderId)}`, { headers, signal: AbortSignal.timeout(15000) }),
    ]);
    if (!paymentResponse.ok || !orderResponse.ok) throw new Error("Payment verification is temporarily unavailable; retry verification");
    const payment = await paymentResponse.json();
    const order = await orderResponse.json();
    // All values come from the authenticated provider API. A signed payment for
    // another receipt, another amount, or an authorization without capture fails.
    return payment.id === input.providerPaymentId && payment.order_id === input.providerOrderId &&
      payment.status === "captured" && payment.amount === input.amountPaise && payment.currency === "INR" &&
      order.id === input.providerOrderId && order.receipt === input.receipt &&
      order.amount === input.amountPaise && order.currency === "INR" && order.status === "paid";
  }

  async refund(input: { providerPaymentId: string; amountPaise: number; reason: string }) {
    const authHeader = `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`;
    const response = await fetch(`https://api.razorpay.com/v1/payments/${input.providerPaymentId}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: input.amountPaise,
        notes: { reason: input.reason },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Razorpay refund failed: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { id: string; status: string };
    return {
      refundId: data.id,
      status: data.status === "processed" ? ("SUCCEEDED" as const) : ("PROCESSING" as const),
    };
  }
}

/**
 * Razorpay Test & Development Mock Provider
 */
export class RazorpayTestProvider implements PaymentProvider {
  async verifyCapturedPayment(_input: VerifyPaymentInput): Promise<boolean> { return false; }
  async createIntent(input: { amountPaise: number; receipt: string }): Promise<PaymentIntent> {
    return {
      provider: "razorpay",
      providerOrderId: `order_mock_${input.receipt}`,
      amountPaise: input.amountPaise,
      currency: "INR",
      keyId: "rzp_test_mockkey",
    };
  }

  verifySignature(input: ConfirmPaymentInput): boolean {
    return process.env.NODE_ENV === "test" && input.providerOrderId.startsWith("order_mock_") &&
      input.providerPaymentId.startsWith("pay_mock_") && input.signature === "mock_test_signature";
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<boolean> {
    return this.verifySignature(input) && input.providerOrderId === `order_mock_${input.receipt}`;
  }

  async refund(input: { providerPaymentId: string; amountPaise: number; reason: string }) {
    return {
      refundId: `ref_mock_${Date.now()}`,
      status: "SUCCEEDED" as const,
    };
  }
}

/**
 * Singleton factory for payment gateway provider
 */
export function getPaymentProvider(): PaymentProvider {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (keyId && keySecret) {
    return new RazorpayLiveProvider(keyId, keySecret);
  }

  // A mock gateway must never be available on an internet-facing production
  // deployment: accepting its synthetic payment IDs would turn a missing
  // configuration into an order-confirmation bypass.
  if (process.env.NODE_ENV === "production") {
    throw new Error("Razorpay production credentials are required in production");
  }

  if (process.env.NODE_ENV === "test") return new RazorpayTestProvider();
  throw new Error("Configure Razorpay test or live credentials to accept payments");
}

export function isLivePaymentGatewayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}
