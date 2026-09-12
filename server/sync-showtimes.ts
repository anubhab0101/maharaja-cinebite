import "dotenv/config";
import { parseArgs } from "node:util";
import { scrapeBookMyShow } from "./bookmyshow-browser";
import { applyShowtimeImport } from "./showtime-import-store";
import { closeDatabase } from "./db";
import { getOrderingWindowState } from "@shared/cinebites";
import { readFile, stat } from "node:fs/promises";
import { validateImport } from "./showtime-import-validation";

async function main() {
  const { values } = parseArgs({ options: { url: { type: "string" }, input: { type: "string" }, screen: { type: "string" }, apply: { type: "boolean", default: false }, help: { type: "boolean", default: false } } });
  if (values.help) {
    console.log('Preview: pnpm showtimes:sync --url "BOOKMYSHOW_DATED_URL"\nManual export preview: pnpm showtimes:sync --input "FRESH_OPERATOR_EXPORT.json"\nSave to configured DATABASE_URL: add --screen "EXACT_CONFIGURED_SCREEN" --apply\nNo recurring schedule is installed. Browser installation: pnpm exec playwright install chromium');
    return;
  }
  if (Boolean(values.url) === Boolean(values.input)) throw new Error("Supply exactly one of --url or --input (fresh operator browser export JSON)");
  if (values.apply && !values.screen) throw new Error("--screen is required with --apply");
  let result;
  if (values.input) {
    if ((await stat(values.input)).size > 256 * 1024) throw new Error("Import file exceeds 256 KB");
    const exported = JSON.parse(await readFile(values.input, "utf8"));
    result = validateImport({ ...exported, screenName: values.screen ?? exported.screenName });
  } else {
    result = await scrapeBookMyShow(values.url!, values.screen ?? "UNMAPPED_PREVIEW");
  }
  console.log(JSON.stringify({ mode: values.apply ? "APPLY" : "PREVIEW_ONLY", ...result, windows: result.movies.flatMap(movie => movie.times.map(startTime => {
    const window = getOrderingWindowState({ showDate: result.date, startTime, durationMinutes: movie.durationMinutes });
    const format = (time: number) => new Date(time).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    return { movie: movie.title, startTime, opens: format(window.openAt), closes: format(window.cutoffAt) };
  })) }, null, 2));
  if (values.apply) console.log(JSON.stringify(await applyShowtimeImport(result), null, 2));
  else console.log("Preview only: no database connection/write or schedule created.");
}
main().catch(error => {
  // Browser/parser errors can be reported; SQL errors may contain connection or
  // customer data, so never print the raw database error/stack from this CLI.
  console.error(error?.sql || error?.cause?.sql ? "Database import failed; transaction rolled back. Verify schema and screen mapping." : String(error?.message ?? "Import failed"));
  process.exitCode = 1;
}).finally(closeDatabase);
