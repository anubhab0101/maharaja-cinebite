// Isolated production-bundle UI test. All API responses are synthetic; no DB/payments.
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = path.resolve("dist/public");
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html" })[path.extname(file)] || "application/octet-stream");
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const width of [390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    let orderingEnabled = true;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith("/api/trpc/")) {
        const names = url.pathname.split("/api/trpc/")[1].split(",");
        const data = names.map(name => ({ result: { data: { json: name === "catalog.menu" ? [] : name === "catalog.orderingWindow" ? { orderingEnabled } : null } } }));
        await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
      } else if (url.hostname !== "127.0.0.1") {
        // Remote fonts/preview telemetry aren't needed for this offline UI check.
        await route.fulfill({ status: 200, body: "" });
      } else await route.continue();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/?showtimeId=1`);
    await page.getByRole("heading", { name: "Good films deserve great food." }).waitFor();
    const heading = page.locator(".cine-ascii-ripple");
    const size = await heading.boundingBox();
    await heading.dispatchEvent("pointerdown", { clientX: size.x + size.width / 2 });
    await page.waitForFunction(() => document.querySelector(".cine-ascii-visual").textContent !== "great food.");
    assert.equal((await heading.boundingBox()).width, size.width);
    await page.waitForFunction(() => document.querySelector(".cine-ascii-visual").textContent === "great food.");
    const add = page.getByRole("button", { name: "Add", exact: true }).first();
    await add.click();
    await page.getByRole("button", { name: "Open cart" }).click();
    const checkout = page.getByRole("button", { name: /Review & pay/ });
    await checkout.focus();
    assert.equal(await checkout.evaluate(el => el.type), "button");
    await page.screenshot({ path: path.join(os.tmpdir(), `cinebite-animation-${width}.png`), fullPage: true });
    await checkout.press("Enter");
    await page.getByRole("heading", { name: /Lock in the good stuff/ }).waitFor();
    orderingEnabled = false;
    await page.goto(`http://127.0.0.1:${server.address().port}/?showtimeId=1`);
    await page.getByRole("heading", { name: "Good films deserve great food." }).waitFor();
    await page.screenshot({ path: path.join(os.tmpdir(), `cinebite-heading-${width}.png`), fullPage: true });
    assert.equal(await page.locator(".cine-animated-button").first().isDisabled(), true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator(".cine-ascii-ripple").dispatchEvent("pointerdown", { clientX: 30 });
    await page.waitForTimeout(150);
    assert.equal(await page.locator(".cine-ascii-visual").textContent(), "great food.");
    assert.equal(await page.locator(".cine-button-shine").first().evaluate(el => getComputedStyle(el).animationName), "none");
    await page.screenshot({ path: path.join(os.tmpdir(), `cinebite-heading-${width}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    console.log(`PASS ${width}px: ripple restores/stable width, cart click, keyboard checkout, disabled buttons, reduced motion, no browser errors`);
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
