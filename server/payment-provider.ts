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

export interface PaymentProvider {
  createIntent(input: { amountPaise: number; receipt: string }): Promise<PaymentIntent>;
  verifySignature(input: ConfirmPaymentInput): boolean;
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
    // In test mode, accept matching mock order signatures or test prefix
    if (!input.providerOrderId || !input.providerPaymentId) return false;
    if (input.providerOrderId.startsWith("order_mock_") || input.providerPaymentId.startsWith("pay_mock_")) {
      return true;
    }
    return false;
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
  return new RazorpayTestProvider();
}
