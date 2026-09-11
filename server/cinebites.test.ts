import { describe, expect, it } from "vitest";
import { getOrderingWindowState, hasStaffRole, isValidTransition, rupees } from "@shared/cinebites";
import { getStats, listMenu, listOrderHistory, listOrders, listStaff } from "./cinebites-store";

describe("CineBites production baseline", () => {
  it("keeps money in paise and formats Indian rupees", () => {
    expect(rupees(48900)).toBe("₹489");
    expect(rupees(1224000)).toBe("₹12,240");
  });

  it("allows only forward kitchen transitions", () => {
    expect(isValidTransition("NEW", "PREPARING")).toBe(true);
    expect(isValidTransition("READY", "PREPARING")).toBe(false);
    expect(isValidTransition("DELIVERED", "READY")).toBe(false);
  });

  it("starts without demo menu, orders, staff, or inflated metrics", () => {
    expect(listMenu()).toEqual([]);
    expect(listOrders()).toEqual([]);
    expect(listStaff()).toEqual([]);
    expect(listOrderHistory({ status: "ALL", sort: "newest" })).toEqual([]);
    expect(getStats()).toMatchObject({ ordersToday: 0, revenuePaise: 0, pending: 0, preparing: 0, ready: 0, delivered: 0, paymentFailures: 0, popularItem: "—" });
  });

  it("recognizes only approved staff roles", () => {
    expect(hasStaffRole("admin", ["ADMIN"])).toBe(true);
    expect(hasStaffRole("KITCHEN", ["ADMIN"])).toBe(false);
    expect(hasStaffRole("unknown", ["READ_ONLY"])).toBe(true);
  });

  it("opens ordering 15 minutes after showtime and closes 30 minutes before the end", () => {
    expect(getOrderingWindowState({ showDate: "2026-09-09", startTime: "08:25 AM", durationMinutes: 197, now: new Date("2026-09-09T02:54:00.000Z") }).state).toBe("NOT_STARTED");
    expect(getOrderingWindowState({ showDate: "2026-09-09", startTime: "08:25 AM", durationMinutes: 197, now: new Date("2026-09-09T03:10:00.000Z") }).state).toBe("OPEN");
    expect(getOrderingWindowState({ showDate: "2026-09-09", startTime: "08:25 AM", durationMinutes: 197, now: new Date("2026-09-09T05:42:00.000Z") }).state).toBe("CUTOFF");
  });

  it("pauses ordering for 15 minutes after every twentieth accepted order", () => {
    expect(getOrderingWindowState({ showDate: "2026-09-09", startTime: "08:25 AM", durationMinutes: 197, acceptedOrders: 20, lastAcceptedAt: new Date("2026-09-09T03:00:00.000Z"), now: new Date("2026-09-09T03:10:00.000Z") }).state).toBe("COOL_DOWN");
    expect(getOrderingWindowState({ showDate: "2026-09-09", startTime: "08:25 AM", durationMinutes: 197, acceptedOrders: 20, lastAcceptedAt: new Date("2026-09-09T03:00:00.000Z"), now: new Date("2026-09-09T03:16:00.000Z") }).state).toBe("OPEN");
  });
});
