import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { and, asc, eq } from "drizzle-orm";
import { sessionLinks, showtimes } from "../drizzle/schema";
import { getDb } from "./db";
import { isFreshImportedShow } from "./showtime-import-validation";

function toPublicLink(token: string, baseUrl = process.env.PUBLIC_APP_URL || "http://localhost:3000") {
  return `${baseUrl.replace(/\/$/, "")}/?session=${encodeURIComponent(token)}`;
}

export async function generateSessionLinks(baseUrl?: string) {
  const db = await getDb();
  if (!db) return [];
  const shows = await db.select({ id: showtimes.id, screenName: showtimes.screenName }).from(showtimes).orderBy(asc(showtimes.id));
  const result = [];
  for (const show of shows) {
    const screenName = show.screenName || "Unassigned screen";
    const existing = (await db.select().from(sessionLinks).where(and(eq(sessionLinks.showtimeId, show.id), eq(sessionLinks.screenName, screenName))).limit(1))[0];
    const record = existing ?? (await db.insert(sessionLinks).values({ token: randomBytes(24).toString("base64url"), showtimeId: show.id, screenName, active: 1 }).$returningId())[0];
    const link = await db.select().from(sessionLinks).where(eq(sessionLinks.id, record.id)).limit(1);
    const row = link[0];
    if (row) result.push({ ...row, url: toPublicLink(row.token, baseUrl), qrDataUrl: await QRCode.toDataURL(toPublicLink(row.token, baseUrl), { errorCorrectionLevel: "M", margin: 1, width: 280 }) });
  }
  return result;
}

export async function listSessionLinks(baseUrl?: string) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ session: sessionLinks, show: showtimes }).from(sessionLinks).innerJoin(showtimes, eq(sessionLinks.showtimeId, showtimes.id)).where(eq(sessionLinks.active, 1)).orderBy(asc(showtimes.showDate), asc(showtimes.startTime));
  return Promise.all(rows.map(async ({ session, show }) => ({ ...session, show, url: toPublicLink(session.token, baseUrl), qrDataUrl: await QRCode.toDataURL(toPublicLink(session.token, baseUrl), { errorCorrectionLevel: "M", margin: 1, width: 280 }) })));
}

export async function resolveSessionLink(token: string) {
  const db = await getDb();
  if (!db) return null;
  const row = (await db.select({ session: sessionLinks, show: showtimes }).from(sessionLinks).innerJoin(showtimes, eq(sessionLinks.showtimeId, showtimes.id)).where(and(eq(sessionLinks.token, token), eq(sessionLinks.active, 1))).limit(1))[0];
  if (!row || !isFreshImportedShow(row.show) || (row.session.expiresAt && row.session.expiresAt.getTime() < Date.now())) return null;
  return { ...row.session, show: row.show, url: toPublicLink(row.session.token) };
}
