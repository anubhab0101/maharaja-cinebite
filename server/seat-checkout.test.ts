import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { POLICY_VERSION } from "@shared/consent";

const mocks = vi.hoisted(() => ({ seat: vi.fn(), window: vi.fn(), create: vi.fn() }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));
vi.mock("./showtime-management", async importOriginal => ({ ...await importOriginal<typeof import("./showtime-management")>(), resolveSeatSession: mocks.seat }));
vi.mock("./showtimes", async importOriginal => ({ ...await importOriginal<typeof import("./showtimes")>(), getShowtimeWindow: mocks.window }));
vi.mock("./cinebites-store", async importOriginal => ({ ...await importOriginal<typeof import("./cinebites-store")>(), createOrder: mocks.create, ensurePaymentIntent: vi.fn(async () => ({ id: "test-intent" })) }));
const caller = appRouter.createCaller({ user: null, req: { headers: {}, ip: "seat-checkout-test" }, res: {} } as TrpcContext);
const input = { screen: "Screen 1", seat: "MS-A01", seatToken: "a".repeat(64), showtimeId: 1, customerName: "Test Customer", phone: "9876543210", items: [{ itemId: "popcorn", quantity: 1 }], idempotencyKey: "7eb8ccdc-8822-4a52-9742-31e0b5f7f7a4", consent: { policyVersion: POLICY_VERSION, terms: true, privacy: true, refund: true, cutoff: true } } as const;
const request = () => ({ ...input, items: [...input.items] });

beforeEach(() => {
  mocks.seat.mockResolvedValue({ screenName: "Screen 1", seat: "MS-A01", show: { id: 1 } });
  mocks.window.mockResolvedValue({ orderingEnabled: true, screenName: "Screen 1" });
  mocks.create.mockReset().mockResolvedValue({ id: "test", orderNumber: "CB-test", totalPaise: 100, screen: "Screen 1", seat: "MS-A01", status: "NEW", paymentStatus: "PENDING" });
});

describe("permanent seat checkout boundary", () => {
  it("allows the resolved seat and current open show without a temporary session token", async () => {
    await expect(caller.order.create(request())).resolves.toMatchObject({ order: { id: "test" } });
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it.each([{ seat: "MS-A02" }, { screen: "Screen 2" }, { showtimeId: 2 }])("rejects changed seat, screen or show before creating an order: %j", async change => {
    await expect(caller.order.create({ ...request(), ...change })).rejects.toThrow("seat or show has changed");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects an invalid seat token or missing current show", async () => {
    for (const value of [null, { screenName: "Screen 1", seat: "MS-A01", show: null }]) {
      mocks.seat.mockResolvedValue(value);
      await expect(caller.order.create(request())).rejects.toThrow("seat or show has changed");
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("still rejects a closed ordering window", async () => {
    mocks.window.mockResolvedValue({ orderingEnabled: false, screenName: "Screen 1" });
    await expect(caller.order.create(request())).rejects.toThrow("Ordering is unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not expose seat tokens or show editing to unauthenticated customers", async () => {
    await expect(caller.admin.configuredSeats()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.saveShowtime({ movieTitle: "Movie", screenName: "Screen 1", showDate: "2026-09-13", startTime: "10:00 AM", durationMinutes: 150, availability: "LISTED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
