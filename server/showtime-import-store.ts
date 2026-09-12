import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { auditLogs, screens, sessionLinks, showtimes } from "../drizzle/schema";
import { database } from "./durable-store";
import { BMS_SOURCE, BMS_VENUE, validateImport } from "./showtime-import-validation";
import { getOrderingWindowState } from "@shared/cinebites";

export async function applyShowtimeImport(value: unknown) {
  // Validate at the write boundary, not only during browser extraction.
  const input = validateImport(value);
  const db = await database();
  if (!db) throw new Error("Database required for import");
  return db.transaction(async tx => {
    const [screen] = await tx.select().from(screens).where(and(eq(screens.name, input.screenName), eq(screens.active, 1))).limit(1).for("update");
    if (!screen) throw new Error("Map to an existing active cinema screen; no guessed screen will be created");
    const scope = and(eq(showtimes.venueName, BMS_VENUE), eq(showtimes.showDate, input.date));
    const existing = await tx.select().from(showtimes).where(scope).for("update");
    if (existing.some(row => row.source !== BMS_SOURCE || row.screenName !== input.screenName)) throw new Error("Conflicting legacy or screen-mapping data exists for this date; review before importing");
    // Keep withdrawn rows/orders for audit/history, but revoke new checkout.
    for (const row of existing) {
      await tx.update(showtimes).set({ availability: "WITHDRAWN" }).where(eq(showtimes.id, row.id));
      await tx.update(sessionLinks).set({ active: 0 }).where(eq(sessionLinks.showtimeId, row.id));
    }
    const result = [];
    for (const movie of input.movies) for (const startTime of movie.times) {
      const eventId = new URL(movie.movieUrl).pathname.split("/").filter(Boolean).pop()!;
      const sourceShowId = createHash("sha256").update(`MPDB|${input.date}|${eventId}|${startTime}`).digest("hex");
      const record = {
        venueName: BMS_VENUE, city: "Bhubaneswar", address: "Bhoi Nagar, Service Road, Vani Vihar, Bhubaneswar, Odisha 751022",
        movieTitle: movie.title, certificate: movie.certificate, language: movie.language, format: movie.format,
        screenName: input.screenName, showDate: input.date, startTime, durationMinutes: movie.durationMinutes,
        availability: "LISTED", source: BMS_SOURCE, sourceUrl: input.sourceUrl, sourceShowId, syncedAt: new Date(input.observedAt),
      };
      await tx.insert(showtimes).values(record).onDuplicateKeyUpdate({ set: record });
      const [show] = await tx.select().from(showtimes).where(and(eq(showtimes.source, BMS_SOURCE), eq(showtimes.sourceShowId, sourceShowId))).limit(1);
      const window = getOrderingWindowState(record);
      const [oldLink] = await tx.select().from(sessionLinks).where(and(eq(sessionLinks.showtimeId, show.id), eq(sessionLinks.screenName, input.screenName))).limit(1);
      const token = oldLink?.token ?? randomBytes(24).toString("base64url");
      await tx.insert(sessionLinks).values({ token, showtimeId: show.id, screenName: input.screenName, active: 1, expiresAt: new Date(window.finishAt) })
        .onDuplicateKeyUpdate({ set: { active: 1, expiresAt: new Date(window.finishAt) } });
      result.push({ showtimeId: show.id, movie: movie.title, startTime, durationMinutes: movie.durationMinutes, opensAt: new Date(window.openAt).toISOString(), closesAt: new Date(window.cutoffAt).toISOString() });
    }
    await tx.insert(auditLogs).values({ action: "SHOWTIMES_IMPORTED", entityType: "showtime", entityId: input.date, detail: JSON.stringify({ source: BMS_SOURCE, sourceUrl: input.sourceUrl, count: result.length, screen: input.screenName, runtimes: input.movies.map(m => ({ movieUrl: m.movieUrl, minutes: m.durationMinutes })) }) });
    return { imported: result.length, date: input.date, shows: result };
  });
}
