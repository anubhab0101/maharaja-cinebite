import { chromium, type Page } from "playwright";
import { BMS_VENUE, parseRuntime, validateListingUrl, validateMovieUrl, validateImport } from "./showtime-import-validation";

async function openPublic(page: Page, url: string) {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
  if (!response || response.status() >= 400) throw new Error(`Public page unavailable (${response?.status() ?? "no response"}); no bypass attempted`);
  if (new URL(page.url()).origin !== "https://in.bookmyshow.com") throw new Error("Unexpected redirect");
  const title = await page.title();
  if (/captcha|just a moment|access denied|attention required/i.test(title)) throw new Error("Source challenge detected; import stopped");
}

export async function scrapeBookMyShow(sourceUrl: string, screenName: string) {
  const { url, date } = validateListingUrl(sourceUrl);
  // Clean, temporary browser: no stolen session cookies, stealth plugins or
  // proxy rotation. Browser rendering is the only fallback from direct HTTP.
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await openPublic(page, url);
    await page.locator('main [aria-label^="Book "]').first().waitFor({ state: "visible" });
    const extracted = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) throw new Error("Main listing missing");
      const selected = Array.from(main.querySelectorAll('[aria-pressed="true"], [aria-selected="true"]')).map(e => e.textContent?.trim() ?? "");
      const links = Array.from(main.querySelectorAll<HTMLAnchorElement>('a[href*="/movies/"]')).filter(a => a.closest('[role="row"], tr'));
      const movies = links.map(a => {
        let group: Element | null = a.parentElement;
        while (group && !group.querySelector('[aria-label^="Book "]')) group = group.parentElement;
        if (!group || group.querySelectorAll('a[href*="/movies/"]').length !== 1) throw new Error("Movie/show grouping changed");
        return {
          label: a.textContent?.trim() ?? "", movieUrl: a.href,
          language: group.querySelector('a[href*="languages="]')?.textContent?.trim() ?? "",
          format: a.parentElement?.textContent?.match(/,\s*(2D|3D)\b/)?.[1] ?? "",
          times: Array.from(group.querySelectorAll('[aria-label^="Book "]')).map(b => b.getAttribute("aria-label")!.replace(/^Book\s+/, "").trim()),
        };
      });
      return { text: main.textContent ?? "", selected, movies, buttonCount: main.querySelectorAll('[aria-label^="Book "]').length };
    });
    if (!extracted.text.includes(BMS_VENUE)) throw new Error("Unexpected venue");
    const dateValue = new Date(`${date}T12:00:00Z`);
    const expectedDay = `${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dateValue.getUTCDay()]}${date.slice(-2)}${["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][dateValue.getUTCMonth()]}`;
    if (!extracted.selected.some(label => label.replace(/\s/g, "").toLowerCase() === expectedDay)) throw new Error("Selected date does not match requested date");
    if (!extracted.movies.length || extracted.movies.length > 12 || extracted.movies.reduce((sum, m) => sum + m.times.length, 0) !== extracted.buttonCount) throw new Error("Incomplete show listing; previous data preserved");
    const movies = [];
    for (const movie of extracted.movies) {
      const movieUrl = validateMovieUrl(movie.movieUrl);
      await openPublic(page, movieUrl);
      if (!page.url().includes(new URL(movieUrl).pathname.split("/").pop()!)) throw new Error("Movie identity changed after navigation");
      await page.locator("main h1").waitFor({ state: "visible" });
      const heading = (await page.locator("main h1").innerText()).trim();
      const certificate = movie.label.match(/\s+\(([^()]*)\)$/)?.[1] ?? "";
      const title = movie.label.replace(/\s+\([^()]*\)$/, "").trim();
      if (heading.toLowerCase() !== title.toLowerCase()) throw new Error("Movie title/runtime association mismatch");
      const header = (await page.locator("main").innerText()).split("About the movie")[0];
      movies.push({ ...movie, title, certificate, durationMinutes: parseRuntime(header) });
    }
    return validateImport({ sourceUrl: url, date, screenName, observedAt: new Date().toISOString(), movies });
  } finally { await browser.close(); }
}
