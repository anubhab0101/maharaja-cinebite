import { randomUUID } from "node:crypto";
import { and, eq, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { auditLogs, orders, screens, seats, sessionLinks, showtimes } from "../drizzle/schema";
import { database } from "./durable-store";
import { BMS_VENUE, isFreshImportedShow } from "./showtime-import-validation";
import { getOrderingWindowState } from "@shared/cinebites";

export const manualShowtimeSchema = z.object({
  id: z.number().int().positive().optional(),
  screenName: z.string().trim().min(1).max(64),
  movieTitle: z.string().trim().min(1).max(180),
  showDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid calendar date"),
  startTime: z.string().regex(/^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/),
  durationMinutes: z.number().int().min(46).max(360),
  availability: z.enum(["LISTED", "WITHDRAWN"]),
});

type ScheduledShow = { showDate: string; startTime: string; durationMinutes: number };
export function showsOverlap(a: ScheduledShow, b: ScheduledShow) {
  const x = getOrderingWindowState(a), y = getOrderingWindowState(b);
  return x.openAt - 15 * 60000 < y.finishAt && y.openAt - 15 * 60000 < x.finishAt;
}

export function currentShow<T extends ScheduledShow & { source: string; availability: string; syncedAt: Date }>(rows: T[], now = new Date()): T | null {
  // Include closed/stale running shows when checking ambiguity; never switch to
  // a different film just because ordering for one of two overlaps is disabled.
  const running = rows.filter(row => {
    if (row.availability === "WITHDRAWN") return false;
    const window = getOrderingWindowState(row);
    return now.getTime() >= window.openAt - 15 * 60000 && now.getTime() < window.finishAt;
  });
  return running.length === 1 && isFreshImportedShow(running[0], now) ? running[0] : null;
}

export async function configuredSeats() {
  const db = await database();
  if (!db) throw new Error("Database required");
  return db.select({ screenName: screens.name, seat: seats.label, token: seats.qrToken })
    .from(seats).innerJoin(screens, eq(seats.screenId, screens.id)).where(eq(screens.active, 1));
}

export async function resolveSeatSession(token: string) {
  const db = await database();
  if (!db) throw new Error("Database required");
  const [seat] = await db.select({ screenName: screens.name, seat: seats.label }).from(seats)
    .innerJoin(screens, eq(seats.screenId, screens.id))
    .where(and(eq(seats.qrToken, token), eq(screens.active, 1))).limit(1);
  if (!seat) return null;
  const now = new Date();
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const yesterday = new Date(now.getTime() - 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const rows = await db.select().from(showtimes).where(and(eq(showtimes.screenName, seat.screenName), gte(showtimes.showDate, yesterday), lte(showtimes.showDate, today)));
  return { ...seat, show: currentShow(rows, now) };
}

export async function saveManualShowtime(value: z.infer<typeof manualShowtimeSchema>, actorUserId: number) {
  const input = manualShowtimeSchema.parse(value);
  const db = await database();
  if (!db) throw new Error("Database required");
  return db.transaction(async tx => {
    const [screen] = await tx.select().from(screens).where(and(eq(screens.name, input.screenName), eq(screens.active, 1))).limit(1).for("update");
    if (!screen) throw new TRPCError({ code: "BAD_REQUEST", message: "Configure this screen and its seats in Seat QRs first." });
    const [before] = input.id ? await tx.select().from(showtimes).where(eq(showtimes.id, input.id)).limit(1).for("update") : [];
    if (input.id && !before) throw new TRPCError({ code: "NOT_FOUND", message: "Showtime no longer exists." });
    if (before && (before.movieTitle !== input.movieTitle || before.screenName !== input.screenName || before.showDate !== input.showDate || before.startTime !== input.startTime || before.durationMinutes !== input.durationMinutes)) {
      const [order] = await tx.select({ id: orders.id }).from(orders).where(eq(orders.showtimeId, before.id)).limit(1);
      if (order) throw new TRPCError({ code: "CONFLICT", message: "This show already has orders. You can withdraw it, but cannot change its movie, screen or timing. Add a separate corrected show after withdrawing it." });
    }
    const others = await tx.select().from(showtimes).where(eq(showtimes.screenName, input.screenName)).for("update");
    if (input.availability === "LISTED" && others.some(row => row.id !== input.id && row.availability !== "WITHDRAWN" && showsOverlap(row, input))) {
      throw new TRPCError({ code: "CONFLICT", message: "Another movie overlaps this time on the same screen. Edit or withdraw that show first." });
    }
    const { id, ...fields } = input;
    const record = { ...fields, source: "MANUAL", sourceShowId: before?.sourceShowId ?? randomUUID(),
      sourceUrl: before?.sourceUrl ?? "", syncedAt: new Date(), venueName: BMS_VENUE,
      city: "Bhubaneswar", address: before?.address ?? "" };
    let savedId = id;
    if (id) await tx.update(showtimes).set(record).where(eq(showtimes.id, id));
    else savedId = (await tx.insert(showtimes).values(record).$returningId())[0].id;
    // Existing printed show links keep working only for their original screen.
    await tx.update(sessionLinks).set({ active: 0 }).where(eq(sessionLinks.showtimeId, savedId!));
    await tx.update(sessionLinks).set({ active: input.availability === "LISTED" ? 1 : 0, expiresAt: new Date(getOrderingWindowState(input).finishAt) })
      .where(and(eq(sessionLinks.showtimeId, savedId!), eq(sessionLinks.screenName, input.screenName)));
    await tx.insert(auditLogs).values({ actorUserId, action: "SHOWTIME_SAVED", entityType: "showtime", entityId: String(savedId), detail: JSON.stringify({ before, after: record }) });
    return { id: savedId! };
  });
}
