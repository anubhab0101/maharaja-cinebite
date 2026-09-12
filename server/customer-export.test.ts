import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { customerExportInput } from "./customer-export";
import { database } from "./durable-store";
import type { TrpcContext } from "./_core/context";
vi.mock("./durable-store", async importOriginal => ({ ...await importOriginal<typeof import("./durable-store")>(), database: vi.fn() }));
beforeEach(() => { vi.mocked(database).mockReset(); });
describe("customer export access", () => {
  for (const role of [null, "KITCHEN", "MANAGER", "READ_ONLY", "CASHIER"]) {
    it(`rejects ${role ?? "anonymous"} before reading database`, async () => {
      const caller = appRouter.createCaller({ user: role ? { id: 912, role } : null, req: { headers: {} }, res: {} } as unknown as TrpcContext);
      await expect(caller.admin.exportCustomerData({ afterId: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(database).not.toHaveBeenCalled();
    });
  }
  for (const role of ["ADMIN", "OWNER_ADMIN"]) {
    it(`allows ${role} and marks response no-store`, async () => {
      const setHeader = vi.fn();
      const values = vi.fn().mockResolvedValue(undefined);
      const tx = { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }) }), insert: () => ({ values }) };
      vi.mocked(database).mockResolvedValue({ transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as never);
      const caller = appRouter.createCaller({ user: { id: role === "ADMIN" ? 901 : 902, role }, req: { headers: {} }, res: { setHeader } } as unknown as TrpcContext);
      const result = await caller.admin.exportCustomerData({ afterId: 0 });
      expect(result.records.orders).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(values).toHaveBeenCalledWith(expect.objectContaining({ action: "CUSTOMER_DATA_EXPORTED" }));
      expect(database).toHaveBeenCalled();
      expect(setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    });
  }
  it("rejects invalid cursors", () => {
    for (const afterId of [-1, 1.5, "1"]) expect(customerExportInput.safeParse({ afterId }).success).toBe(false);
  });
});
