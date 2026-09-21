import { z } from "zod";

export const POLICY_VERSION = "2026-09-21-v5";
export const CUTOFF_NOTICE =
  "Please do not order during the final 30 minutes before your movie ends. New orders close 30 minutes before the scheduled movie end.";
export const checkoutConsentSchema = z
  .object({
    policyVersion: z.literal(POLICY_VERSION),
    terms: z.literal(true),
    privacy: z.literal(true),
    refund: z.literal(true),
    cutoff: z.literal(true),
  })
  .strict();
export type CheckoutConsent = z.infer<typeof checkoutConsentSchema>;
export const CHECKOUT_POLICIES = [
  { key: "terms", text: "I agree to the Terms of Service", href: "/terms" },
  {
    key: "privacy",
    text: "I consent to using my order details to process payment, prepare and deliver this order, and provide order support",
    href: "/privacy",
  },
  {
    key: "refund",
    text: "I acknowledge the Refund & Cancellation Policy",
    href: "/refunds",
  },
  {
    key: "cutoff",
    text: "I understand that I must not order during the final 30 minutes before my movie ends",
    href: "/delivery",
  },
] as const;
