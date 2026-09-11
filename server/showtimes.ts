import { and, asc, eq } from "drizzle-orm";
import { showtimes } from "../drizzle/schema";
import { getDb } from "./db";
import { getOrderingWindowState } from "@shared/cinebites";

const venue = "Maharaja (Christie 4K, DOLBY ATMOS 64 CHANNEL)";

export async function listShowtimes(showDate?: string) {
  const db = await getDb();
  if (!db) return [];
  if (!showDate) return db.select().from(showtimes).orderBy(asc(showtimes.showDate), asc(showtimes.startTime));
  return db.select().from(showtimes).where(and(eq(showtimes.showDate, showDate), eq(showtimes.venueName, venue))).orderBy(asc(showtimes.startTime));
}

export async function listShowtimeDates() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ showDate: showtimes.showDate }).from(showtimes).groupBy(showtimes.showDate).orderBy(asc(showtimes.showDate));
  return rows.map((row) => row.showDate);
}

export async function getShowtimeWindow(showtimeId: number) {
  const db = await getDb();
  if (!db) return null;
  const row = (await db.select().from(showtimes).where(eq(showtimes.id, showtimeId)).limit(1))[0];
  if (!row) return null;
  const window = getOrderingWindowState({ showDate: row.showDate, startTime: row.startTime, durationMinutes: row.durationMinutes });
  return { ...row, ...window, orderingEnabled: window.state === "OPEN" };
}
