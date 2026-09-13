import { describe, it, expect } from "vitest";
import { schemaRepairPlan } from "./schema-repair-plan";
const base = ["id", "orderNumber", "status", "paymentStatus", "idempotencyKey"];
describe("empty legacy schema repair", () => {
  it("adds only the missing 0005 schema", () => {
    const plan = schemaRepairPlan(base, [], false, 0);
    expect(plan).toHaveLength(8);
    expect(plan.join(" ")).not.toMatch(/DROP|DELETE|TRUNCATE/i);
  });
  it("refuses orders needing backfill", () => {
    expect(() => schemaRepairPlan(base, [], false, 1)).toThrow("zero orders");
  });
  it("refuses an unknown baseline", () => {
    expect(() => schemaRepairPlan([], [], false, 0)).toThrow("Unsupported");
  });
  it("is a no-op after repair", () => {
    expect(schemaRepairPlan([...base, "publicId", "snapshot", "providerOrderId", "checkoutHash", "showtimeId"], ["publicId", "providerOrderId"], true, 0)).toEqual([]);
  });
  it("resumes after partially applied DDL", () => {
    const plan = schemaRepairPlan([...base, "publicId"], ["publicId"], true, 0);
    expect(plan).toHaveLength(5);
    expect(plan.join(" ")).not.toContain("ADD COLUMN `publicId`");
  });
});
