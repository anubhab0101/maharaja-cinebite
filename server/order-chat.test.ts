import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatEligible, chatInput, orderChatRouter } from "./order-chat";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock("./durable-store", () => ({ database: mocks.database }));
const orderNumber = `CB-${"A".repeat(24)}`;
const old = {
  createdAt: new Date(Date.now() - 21 * 60000),
  status: "PREPARING",
  paymentStatus: "CONFIRMED",
  snapshot: { customerPhone: "9876543210" },
};
function fakeDb(rows: unknown[][]) {
  const write = vi.fn();
  const db: any = {
    select: () => {
      const result = rows.shift() ?? [];
      const c: any = {
        from: () => c,
        where: () => c,
        limit: () => c,
        for: () => c,
        then: (resolve: any) => Promise.resolve(result).then(resolve),
      };
      return c;
    },
    insert: () => ({
      values: (value: unknown) => {
        write(value);
        return { onDuplicateKeyUpdate: async () => {} };
      },
    }),
    transaction: async (fn: any) => fn(db),
  };
  mocks.database.mockResolvedValue(db);
  return write;
}
const caller = (role?: string, origin = "https://cinema.example") =>
  orderChatRouter.createCaller({
    req: { ip: "chat-test", headers: { origin } },
    res: { setHeader: vi.fn() },
    user: role ? { id: 1, role } : null,
  } as unknown as TrpcContext);
beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_APP_URL = "https://cinema.example";
});
describe("delayed order chat", () => {
  it("opens at 20 minutes only for paid active orders", () => {
    const now = Date.now();
    expect(
      chatEligible({ ...old, createdAt: new Date(now - 1199999) }, now)
    ).toBe(false);
    expect(
      chatEligible({ ...old, createdAt: new Date(now - 1200000) }, now)
    ).toBe(true);
    for (const status of ["DELIVERED", "CANCELED"])
      expect(chatEligible({ ...old, status })).toBe(false);
    expect(chatEligible({ ...old, paymentStatus: "PENDING" })).toBe(false);
  });
  it("bounds messages and uses unguessable order numbers", () => {
    expect(chatInput.safeParse({ orderNumber: "CB-1234" }).success).toBe(false);
    expect(
      chatInput.safeParse({
        orderNumber,
        message: { id: crypto.randomUUID(), text: "x".repeat(501) },
      }).success
    ).toBe(false);
  });
  it("rejects anonymous staff access", async () => {
    await expect(caller().inbox()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
  it("rejects wrong origin", async () => {
    await expect(
      caller(undefined, "https://other.example").customer({
        orderNumber,
        phone: "9876543210",
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("requires the full matching phone", async () => {
    fakeDb([[old]]);
    await expect(
      caller().customer({ orderNumber, phone: "9876543211" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("does not expose or recreate messages after delivery", async () => {
    const writes = fakeDb([[{ ...old, status: "DELIVERED" }]]);
    expect(
      await caller().customer({ orderNumber, phone: "9876543210" })
    ).toEqual({ open: false, messages: [] });
    expect(writes).not.toHaveBeenCalled();
  });
  it("persists a message once and deduplicates retried message IDs", async () => {
    const message = { id: crypto.randomUUID(), text: "How long please?" };
    let writes = fakeDb([[old], []]);
    const first = await caller().customer({
      orderNumber,
      phone: "9876543210",
      message,
    });
    expect(first.messages).toHaveLength(1);
    expect(writes).toHaveBeenCalledTimes(1);
    writes = fakeDb([[old], [{ payload: { messages: first.messages } }]]);
    await caller().customer({ orderNumber, phone: "9876543210", message });
    expect(writes).not.toHaveBeenCalled();
  });
});
