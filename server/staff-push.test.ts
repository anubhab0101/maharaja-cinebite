import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  staffEndpoint,
  staffPushRouter,
  runStaffPushSweep,
} from "./staff-push";
import type { TrpcContext } from "./_core/context";
const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  send: vi.fn(),
  staff: vi.fn(),
}));
vi.mock("./durable-store", () => ({ database: mocks.db }));
vi.mock("./cinebites-store", () => ({ listStaff: mocks.staff }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/device",
  keys: { p256dh: "A".repeat(87), auth: "A".repeat(22) },
  userId: 7,
  joinedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const subrow = { key: "staff-push:device", payload: sub };
const order = {
  id: 1,
  publicId: "one",
  orderNumber: "CB-PRIVATE",
  status: "NEW",
  paymentConfirmedAt: new Date(),
};
const caller = (role?: string) =>
  staffPushRouter.createCaller({
    req: { headers: { origin: "https://cinema.example" } },
    res: {},
    user: role ? { id: 7, role } : null,
  } as TrpcContext);
function db(results: unknown[][]) {
  const writes = vi.fn();
  const remove = vi.fn();
  const store: any = {
    select: () => {
      const r = results.shift() ?? [];
      const c: any = {
        from: () => c,
        where: () => c,
        orderBy: () => c,
        limit: () => c,
        for: () => c,
        then: (resolve: any) => Promise.resolve(r).then(resolve),
      };
      return c;
    },
    transaction: async (fn: any) => fn(store),
    insert: () => ({
      values: () => ({ onDuplicateKeyUpdate: async () => {} }),
    }),
    update: () => ({
      set: (v: unknown) => {
        writes(v);
        return { where: async () => {} };
      },
    }),
    delete: () => ({
      where: async (v: unknown) => {
        remove(v);
      },
    }),
  };
  mocks.db.mockResolvedValue(store);
  return { writes, remove };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STAFF_PUSH_ENABLED", "true");
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "A".repeat(87));
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "B".repeat(43));
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:staff@example.com");
  vi.stubEnv("PUBLIC_APP_URL", "https://cinema.example");
  mocks.staff.mockResolvedValue([
    { email: "staff@example.com", role: "KITCHEN", status: "ACTIVE" },
  ]);
  mocks.send.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.unstubAllEnvs());
describe("staff background push", () => {
  it("allows supported providers and blocks SSRF/lookalikes", () => {
    expect(staffEndpoint("https://web.push.apple.com/test")).toBe(true);
    for (const url of [
      "http://web.push.apple.com/test",
      "https://web.push.apple.com.evil.test/x",
      "https://127.0.0.1/x",
      "https://user@web.push.apple.com/x",
    ])
      expect(staffEndpoint(url)).toBe(false);
  });
  it("requires staff permissions and never exposes private VAPID key", async () => {
    await expect(caller().config()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller("READ_ONLY").config()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(JSON.stringify(await caller("KITCHEN").config())).not.toContain(
      "B".repeat(43)
    );
  });
  it("does nothing when explicitly disabled", async () => {
    vi.stubEnv("STAFF_PUSH_ENABLED", "false");
    await runStaffPushSweep();
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("removes revoked staff devices instead of sending", async () => {
    mocks.staff.mockResolvedValue([]);
    const f = db([[subrow], [order], [{ email: "staff@example.com" }]]);
    await runStaffPushSweep();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(f.remove).toHaveBeenCalledTimes(2);
  });
  it("claims durable attempts and sends only generic content", async () => {
    const f = db([
      [subrow],
      [order],
      [{ email: "staff@example.com" }],
      [{ payload: { attempts: 0, leaseUntil: 0, done: false } }],
      [subrow],
      [order],
    ]);
    await runStaffPushSweep();
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload = mocks.send.mock.calls[0][1];
    expect(payload).toContain('"type":"staff-order"');
    expect(payload).not.toContain("CB-PRIVATE");
    expect(f.writes).toHaveBeenLastCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ done: true }),
      })
    );
  });
  it("does not resend completed jobs", async () => {
    db([
      [subrow],
      [order],
      [{ email: "staff@example.com" }],
      [{ payload: { attempts: 1, leaseUntil: 0, done: true } }],
    ]);
    await runStaffPushSweep();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not send after a device withdrew", async () => {
    db([
      [subrow],
      [order],
      [{ email: "staff@example.com" }],
      [{ payload: { attempts: 0, leaseUntil: 0, done: false } }],
      [],
      [order],
    ]);
    await runStaffPushSweep();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("removes expired provider endpoints on 410", async () => {
    const f = db([
      [subrow],
      [order],
      [{ email: "staff@example.com" }],
      [{ payload: { attempts: 0, leaseUntil: 0, done: false } }],
      [subrow],
      [order],
    ]);
    mocks.send.mockRejectedValue({ statusCode: 410 });
    await runStaffPushSweep();
    expect(f.remove).toHaveBeenCalledTimes(2);
  });
});
