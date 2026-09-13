import { describe, expect, it } from "vitest";
import { validateListingUrl, validateMovieUrl, parseRuntime, validateImport, isFreshImportedShow, BMS_SOURCE } from "./showtime-import-validation";
import { getOrderingWindowState } from "@shared/cinebites";

const url = "https://in.bookmyshow.com/cinemas/BHUB/maharaja-christie-4k-dolby-atmos-64-channel/buytickets/MPDB/20260913";
const now = new Date("2026-09-12T12:00:00Z");
const input = () => ({ sourceUrl: url, date: "2026-09-13", screenName: "Verified Screen", observedAt: now.toISOString(), movies: [{ title: "Dandakali", movieUrl: "https://in.bookmyshow.com/movies/BHUB/dandakali/ET00510338", certificate: "UA16+", language: "Odia", format: "2D", durationMinutes: 160, times: ["10:05 AM"] }] });

describe("manual showtime import validation", () => {
  it("recognizes only the requested dated venue", () => expect(validateListingUrl(url).date).toBe("2026-09-13"));
  it.each([url.replace("https:", "http:"), url.replace("in.bookmyshow.com", "in.bookmyshow.com.evil.test"), url.replace("MPDB", "OTHER"), url + "?redirect=http://localhost", url.replace("20260913", "20260230")])("rejects unsupported listing %s", value => expect(() => validateListingUrl(value)).toThrow());
  it("rejects movie links to arbitrary hosts or internal endpoints", () => {
    expect(() => validateMovieUrl("http://127.0.0.1/maharaja")).toThrow();
    expect(() => validateMovieUrl("https://in.bookmyshow.com/api/private")).toThrow();
  });
  it.each([["2h 40m", 160], ["3h 17m", 197], ["2h", 120], ["150 min", 150]])("parses explicit runtime %s", (text, minutes) => expect(parseRuntime(text as string)).toBe(minutes));
  it.each(["runtime unavailable", "20m", "7h 10m", "2h 10m or 3h 20m"])("rejects missing/ambiguous runtime %s", text => expect(() => parseRuntime(text)).toThrow());
  it("accepts a fresh complete observation", () => expect(validateImport(input(), now).movies).toHaveLength(1));
  it("rejects mismatched dates and stale observations", () => {
    expect(() => validateImport({ ...input(), date: "2026-09-14" }, now)).toThrow("date mismatch");
    expect(() => validateImport({ ...input(), observedAt: "2026-09-11T12:00:00Z" }, now)).toThrow("15 minutes");
  });
  it("rejects empty or duplicate show slots", () => {
    expect(() => validateImport({ ...input(), movies: [] }, now)).toThrow();
    const duplicate = input(); duplicate.movies[0].times.push("10:05 AM");
    expect(() => validateImport(duplicate, now)).toThrow("Duplicate");
  });
  it("fails closed on stale or withdrawn imported schedules", () => {
    expect(isFreshImportedShow({ source: BMS_SOURCE, availability: "LISTED", syncedAt: now }, now)).toBe(true);
    expect(isFreshImportedShow({ source: BMS_SOURCE, availability: "LISTED", syncedAt: new Date("2026-09-10T12:00:00Z") }, now)).toBe(false);
    expect(isFreshImportedShow({ source: BMS_SOURCE, availability: "WITHDRAWN", syncedAt: now }, now)).toBe(false);
  });
  it("uses runtime to open +15 and close -30, including midnight crossover", () => {
    const w = getOrderingWindowState({ showDate: "2026-09-13", startTime: "10:05 AM", durationMinutes: 160 });
    expect(new Date(w.openAt).toISOString()).toBe("2026-09-13T04:50:00.000Z");
    expect(new Date(w.cutoffAt).toISOString()).toBe("2026-09-13T06:45:00.000Z");
    const late = getOrderingWindowState({ showDate: "2026-09-13", startTime: "10:10 PM", durationMinutes: 197 });
    expect(new Date(late.cutoffAt).toISOString()).toBe("2026-09-13T19:27:00.000Z");
  });
});
