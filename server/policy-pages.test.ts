import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CINEMA_CONTACT,
  SOFTWARE_CREDIT,
  FOOD_OPERATOR,
} from "../shared/operator";
import { POLICY_VERSION, checkoutConsentSchema } from "../shared/consent";

describe("approved policy publication", () => {
  it("separates software ownership and food operation", () => {
    expect(SOFTWARE_CREDIT).toBe(
      "CineBite — A software product by ASAYLES Tech."
    );
    expect(FOOD_OPERATOR).toContain("Maharaja's in-house F&B");
  });
  it("uses published cinema contacts, never the developer number", () => {
    expect(CINEMA_CONTACT.phones).toEqual(["+91 9776942999", "+91 7873042999"]);
    expect(CINEMA_CONTACT.email).toBe("customercare@maharajapicturepalace.com");
    expect(JSON.stringify(CINEMA_CONTACT)).not.toContain("9776600696");
  });
  it("requires fresh acceptance of the changed notice", () => {
    expect(POLICY_VERSION).toBe("2026-09-21-v5");
    expect(
      checkoutConsentSchema.safeParse({
        policyVersion: "2026-09-12-v4",
        terms: true,
        privacy: true,
        refund: true,
        cutoff: true,
      }).success
    ).toBe(false);
  });
  it("makes retention accessible and does not claim automatic erasure or annual renewal", () => {
    const app = readFileSync("client/src/App.tsx", "utf8");
    const policies = readFileSync("client/src/pages/ServiceInfo.tsx", "utf8");
    expect(app).toContain('"Retention & deletion", "/retention"');
    expect(policies).toContain("no consent is automatically renewed");
    expect(policies).toContain("not a promise to erase every record");
  });
});
