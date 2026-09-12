import { describe, expect, it } from "vitest";
import { MAHARAJA_SEAT_LABELS, describeMaharajaSeat } from "@shared/maharaja-seats";
describe("supplied Maharaja layout", () => {
  it("has 540 unique section-qualified physical seats", () => {
    expect(MAHARAJA_SEAT_LABELS).toHaveLength(540);
    expect(new Set(MAHARAJA_SEAT_LABELS).size).toBe(540);
    expect(MAHARAJA_SEAT_LABELS.every(label => label.length <= 16)).toBe(true);
  });
  it.each([["MS", 97], ["SD", 203], ["RC", 60], ["SL", 180]])("preserves the %s section count", (code, count) => {
    expect(MAHARAJA_SEAT_LABELS.filter(label => label.startsWith(`${code}-`))).toHaveLength(count);
  });
  it("does not confuse repeated row labels across sections", () => {
    expect(describeMaharajaSeat("MS-A01")).toBe("Motorized Slider · A01");
    expect(describeMaharajaSeat("RC-A01")).toBe("Recliner · A01");
    expect(MAHARAJA_SEAT_LABELS).not.toContain("SL-G23");
  });
});
