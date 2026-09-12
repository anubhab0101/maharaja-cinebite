import { z } from "zod";

export const BMS_VENUE = "Maharaja (Christie 4K, DOLBY ATMOS 64 CHANNEL)";
export const BMS_SOURCE = "BOOKMYSHOW_BROWSER";
export const SHOWTIME_FRESHNESS_MS = 36 * 60 * 60 * 1000;

export function validateListingUrl(value: string) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/cinemas\/(BHUB|bhubaneswar)\/maharaja-christie-4k-dolby-atmos-64-channel\/buytickets\/MPDB\/(\d{4})(\d{2})(\d{2})\/?$/);
  if (url.origin !== "https://in.bookmyshow.com" || url.username || url.password || url.search || url.hash || !match) throw new Error("Only the dated Maharaja MPDB public listing URL is supported");
  const date = `${match[2]}-${match[3]}-${match[4]}`;
  if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error("Invalid listing date");
  return { url: url.href, date };
}

export function validateMovieUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== "https://in.bookmyshow.com" || url.username || url.password || url.search || url.hash || !/^\/movies\/(?:BHUB\/|bhubaneswar\/)?[a-z0-9-]+\/ET\d+\/?$/i.test(url.pathname)) throw new Error("Invalid public movie URL");
  return url.href;
}

export function parseRuntime(headerText: string) {
  const matches = Array.from(headerText.matchAll(/\b(?:(\d{1,2})\s*h(?:ours?)?(?:\s*(\d{1,2})\s*m(?:in(?:utes?)?)?)?|(\d{2,3})\s*m(?:in(?:utes?)?)?)\b/gi));
  const values = Array.from(new Set(matches.map(m => Number(m[1] ?? 0) * 60 + Number(m[2] ?? m[3] ?? 0))));
  if (values.length !== 1 || values[0] < 46 || values[0] > 360) throw new Error("Movie runtime missing, ambiguous or outside supported range");
  return values[0];
}

export const importedMovieSchema = z.object({
  title: z.string().trim().min(1).max(180),
  movieUrl: z.string().transform(validateMovieUrl),
  language: z.string().trim().min(1).max(40),
  format: z.string().trim().min(1).max(40),
  certificate: z.string().max(16),
  durationMinutes: z.number().int().min(46).max(360),
  times: z.array(z.string().regex(/^(0[1-9]|1[0-2]):[0-5]\d (AM|PM)$/)).min(1).max(20),
});
export const importSchema = z.object({
  sourceUrl: z.string().transform(value => validateListingUrl(value).url),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  screenName: z.string().trim().min(1).max(64),
  observedAt: z.string().datetime(),
  movies: z.array(importedMovieSchema).min(1).max(12),
});
export type ShowtimeImport = z.infer<typeof importSchema>;

export function validateImport(value: unknown, now = new Date()): ShowtimeImport {
  const parsed = importSchema.parse(value);
  if (validateListingUrl(parsed.sourceUrl).date !== parsed.date) throw new Error("Listing date mismatch");
  const age = now.getTime() - Date.parse(parsed.observedAt);
  if (age < -60000 || age > 15 * 60000) throw new Error("Scrape must be applied within 15 minutes of observation");
  const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const days = (Date.parse(parsed.date) - Date.parse(today)) / 86400000;
  if (days < 0 || days > 7) throw new Error("Only today through the next seven days can be imported");
  const slots = new Set<string>();
  for (const movie of parsed.movies) for (const time of movie.times) {
    if (slots.has(time)) throw new Error("Duplicate or ambiguous show slot for this single-screen venue");
    slots.add(time);
  }
  return parsed;
}

export function isFreshImportedShow(row: { source: string; availability: string; syncedAt: Date }, now = new Date()) {
  if (row.availability === "WITHDRAWN") return false;
  if (row.source !== BMS_SOURCE) return true;
  const age = now.getTime() - row.syncedAt.getTime();
  return age >= -60000 && age <= SHOWTIME_FRESHNESS_MS && row.availability === "LISTED";
}
