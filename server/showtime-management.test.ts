import { describe, expect, it } from "vitest";
import { currentShow, manualShowtimeSchema, showsOverlap } from "./showtime-management";
import { BMS_SOURCE } from "./showtime-import-validation";
import { getOrderingWindowState } from "@shared/cinebites";

const show = { id: 1, screenName: "Screen 1", movieTitle: "Movie", showDate: "2026-09-13", startTime: "10:00 AM", durationMinutes: 150, source: "MANUAL", availability: "LISTED" as const, syncedAt: new Date("2026-09-01T00:00:00Z") };
const at = (time: string) => new Date(`2026-09-13T${time}:00+05:30`);

describe("permanent seat show selection", () => {
  it("does not select a future movie or keep a finished movie", () => {
    expect(currentShow([show], at("09:59"))).toBeNull();
    expect(currentShow([show], at("10:00"))?.id).toBe(1);
    expect(currentShow([show], at("12:30"))).toBeNull();
  });
  it("keeps the current movie through the cutoff without opening checkout", () => {
    for (const [time, state] of [["10:14", "NOT_STARTED"], ["10:15", "OPEN"], ["11:59", "OPEN"], ["12:00", "CUTOFF"]]) {
      const selected = currentShow([show], at(time));
      expect(selected?.id).toBe(1);
      expect(getOrderingWindowState({ ...selected!, now: at(time) }).state).toBe(state);
    }
  });
  it("selects the next movie only when it starts", () => {
    const next = { ...show, id: 2, startTime: "01:00 PM" };
    expect(currentShow([show, next], at("12:45"))).toBeNull();
    expect(currentShow([show, next], at("13:00"))?.id).toBe(2);
  });
  it("handles a movie continuing after midnight", () => {
    expect(currentShow([{ ...show, startTime: "11:00 PM" }], new Date("2026-09-14T00:30:00+05:30"))?.id).toBe(1);
  });
  it("rejects stale imports, withdrawn shows and ambiguous overlapping shows", () => {
    expect(currentShow([{ ...show, source: BMS_SOURCE }], at("11:00"))).toBeNull();
    expect(currentShow([{ ...show, availability: "WITHDRAWN" }], at("11:00"))).toBeNull();
    expect(currentShow([show, { ...show, id: 2 }], at("11:00"))).toBeNull();
    expect(currentShow([show, { ...show, id: 2, source: BMS_SOURCE }], at("11:00"))).toBeNull();
  });
});

describe("manual schedule validation", () => {
  it("accepts a valid show and rejects impossible dates, times and runtimes", () => {
    expect(manualShowtimeSchema.safeParse(show).success).toBe(true);
    for (const changes of [{ showDate: "2026-02-30" }, { startTime: "13:00 PM" }, { startTime: "10:60 AM" }, { durationMinutes: 45 }, { durationMinutes: 361 }, { movieTitle: " " }]) {
      expect(manualShowtimeSchema.safeParse({ ...show, ...changes }).success).toBe(false);
    }
  });
  it("rejects overlapping runtimes while allowing adjacent shows, including midnight", () => {
    expect(showsOverlap(show, { ...show, startTime: "12:29 PM" })).toBe(true);
    expect(showsOverlap(show, { ...show, startTime: "12:30 PM" })).toBe(false);
    expect(showsOverlap({ ...show, startTime: "11:00 PM" }, { ...show, showDate: "2026-09-14", startTime: "12:30 AM" })).toBe(true);
  });
});
