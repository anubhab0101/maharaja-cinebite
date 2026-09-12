import { describe, expect, it } from "vitest";
import { checkoutConsentSchema, POLICY_VERSION, CHECKOUT_POLICIES } from "../shared/consent";
const accepted = { policyVersion: POLICY_VERSION, terms: true, privacy: true, refund: true, cutoff: true };
describe("checkout consent contract", () => {
  it("accepts explicit current-version choices", () => expect(checkoutConsentSchema.safeParse(accepted).success).toBe(true));
  it("rejects the old blanket boolean", () => expect(checkoutConsentSchema.safeParse(true).success).toBe(false));
  it("rejects an old policy version", () => expect(checkoutConsentSchema.safeParse({ ...accepted, policyVersion: "old" }).success).toBe(false));
  for (const { key } of CHECKOUT_POLICIES) {
    it(`rejects unchecked ${key}`, () => expect(checkoutConsentSchema.safeParse({ ...accepted, [key]: false }).success).toBe(false));
    it(`rejects missing ${key}`, () => expect(checkoutConsentSchema.safeParse({ ...accepted, [key]: undefined }).success).toBe(false));
  }
  it("does not accept marketing consent by implication", () => expect(checkoutConsentSchema.safeParse({ ...accepted, marketing: true }).success).toBe(false));
});
