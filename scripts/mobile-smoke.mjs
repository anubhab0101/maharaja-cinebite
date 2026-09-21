// Local browser smoke test. No .env, database, production server or real orders.
// Run pnpm build first, then node scripts/mobile-smoke.mjs.
import express from "express";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";

const root = path.resolve(import.meta.dirname, "..");
const artifactDir = path.join(root, "node_modules/.cache/mobile-smoke");
await mkdir(artifactDir, { recursive: true });
const order = id => ({
  id,
  orderNumber: `TEST-${id}`,
  status: "NEW",
  paymentStatus: "CONFIRMED",
  screen: "Audi 1",
  seat: "RC-A01",
  customerName: "Test customer",
  phoneLast4: "0000",
  totalPaise: 10000,
  priority: "NORMAL",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items: [
    {
      id: "popcorn",
      name: "Test Popcorn",
      quantity: 1,
      pricePaise: 10000,
      options: [],
    },
  ],
});
let queue = [order("one")];
const menu = [
  {
    id: "popcorn",
    name: "Test Popcorn",
    category: "Popcorn",
    pricePaise: 10000,
    description: "Test only",
    available: true,
    options: [],
  },
];
const data = name =>
  ({
    "auth.me": {
      id: 1,
      name: "Test Owner",
      email: "test@example.invalid",
      role: "OWNER_ADMIN",
    },
    "kitchen.queue": queue,
    "kitchen.menu": menu,
    "admin.menu": menu,
    "catalog.menu": menu,
    "admin.orders": queue,
    "admin.audit": [],
    "admin.stats": {
      revenuePaise: 10000,
      ordersToday: 1,
      pending: 1,
      preparing: 0,
      ready: 0,
      delivered: 0,
    },
    "admin.orderingControl": { paused: false },
    "admin.pendingPayments": [],
    "admin.privacyRequests": [],
    "admin.shiftSummary": {
      shiftLabel: "Test shift",
      startedAt: new Date().toISOString(),
      completedOrders: 0,
      canceledOrders: 0,
      averagePreparationMinutes: 0,
      fastestOrderMinutes: 0,
      revenuePaise: 0,
    },
  })[name] ?? [];
const app = express();
app.get("/api/trpc/:names", (req, res) =>
  res.json(
    req.params.names
      .split(",")
      .map(name => ({ result: { data: { json: data(name) } } }))
  )
);
app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  res.write("event: ready\ndata: {}\n\n");
  req.on("close", () => res.end());
});
app.use("/api", (_req, res) =>
  res.status(405).json({ error: "No writes allowed in mobile smoke fixture" })
);
app.use(express.static(path.join(root, "dist/public")));
app.get("*", (_req, res) =>
  res.sendFile(path.join(root, "dist/public/index.html"))
);
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  await context.route("**/*", route =>
    route.request().url().startsWith(url) ? route.continue() : route.abort()
  );
  await context.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = utterance =>
      window.__spoken.push(utterance.text);
    window.speechSynthesis.cancel = () => {};
    window.Notification.requestPermission = async () => "denied";
  });
  context.setDefaultTimeout(15000);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => {
    errors.push(error.message);
    console.error("Browser error:", error.message);
  });
  page.on("console", message => {
    if (message.type() === "error")
      console.error("Browser console:", message.text());
  });
  async function fits(label) {
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1
      ),
      `${label}: horizontal page overflow`
    );
  }
  await page.goto(`${url}/maharaja`);
  console.log("Admin document loaded");
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Enable sound & notifications", exact: true })
    .waitFor();
  await fits("admin overview");
  await page.screenshot({
    path: path.join(artifactDir, "admin-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("heading", { name: "Cinema management" }).waitFor();
  await page
    .getByRole("navigation", { name: "All management tools" })
    .getByRole("button", { name: "Refunds", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Refund review queue", exact: true })
    .waitFor();
  await fits("refund form");
  await page
    .getByRole("navigation", { name: "Mobile cinema management" })
    .getByRole("button", { name: "Orders", exact: true })
    .click();
  await page.getByText("TEST-one", { exact: true }).first().waitFor();
  await fits("order table");
  for (const tab of [
    "Menu",
    "Shift summary",
    "Staff",
    "Movies & showtimes",
    "Seat QRs",
    "Session Links",
    "Audit log",
  ]) {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page
      .getByRole("navigation", { name: "All management tools" })
      .getByRole("button", { name: tab, exact: true })
      .click();
    await page.locator("h1").filter({ hasText: tab }).waitFor();
    await fits(`admin ${tab}`);
    if (tab === "Menu") {
      await page
        .getByRole("button", { name: "Add menu item", exact: true })
        .click();
      await page.getByLabel("Item ID", { exact: true }).waitFor();
      await fits("menu edit form");
    }
  }
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  assert.ok(
    await page
      .locator(".admin-app")
      .evaluate(el => el.classList.contains("staff-dark"))
  );
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.goto(`${url}/rasoi`);
  await page
    .getByRole("heading", { name: "Service queue", exact: true })
    .waitFor();
  await page.getByText("TEST-one", { exact: true }).first().waitFor();
  await fits("kitchen queue");
  await page
    .getByRole("button", { name: "Enable sound & notifications", exact: true })
    .click();
  await page.getByRole("button", { name: "Mute order alerts" }).waitFor();
  const before = await page.evaluate(() => window.__spoken.length);
  queue = [...queue, order("two")];
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page
    .getByText("1 new order received. Check the queue.", { exact: true })
    .first()
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.__spoken.length),
    before + 1,
    "new order speaks once"
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText("TEST-two", { exact: true }).first().waitFor();
  assert.equal(
    await page.evaluate(() => window.__spoken.length),
    before + 1,
    "refresh does not repeat the alert"
  );
  await page.screenshot({
    path: path.join(artifactDir, "kitchen-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await fits("320px kitchen");
  await page.goto(`${url}/maharaja`);
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await fits("320px admin");
  for (const route of ["/history", "/", "/login"]) {
    await page.goto(`${url}${route}`);
    await page.locator("h1").first().waitFor();
    await fits(`320px ${route}`);
  }
  await page.goto(`${url}/maharaja`);
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator(".admin-sidebar").waitFor({ state: "visible" });
  await fits("desktop admin");
  console.log("Mobile navigation and alert checks passed");
  console.log(
    "Service worker state:",
    await page.evaluate(async () => ({
      secure: isSecureContext,
      workers: (await navigator.serviceWorker.getRegistrations()).map(r => ({
        scope: r.scope,
        active: r.active?.state,
        waiting: r.waiting?.state,
        installing: r.installing?.state,
      })),
    }))
  );
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  await page.goto(`${url}/rasoi`);
  await page.getByRole("heading", { name: "You are offline" }).waitFor();
  assert.deepEqual(errors, [], "no browser runtime errors");
  console.log(
    JSON.stringify({
      status: "PASS",
      widths: [390, 320],
      checks: [
        "admin navigation",
        "refund form",
        "order table",
        "kitchen queue",
        "new-order voice",
        "deduplication",
        "offline fallback",
      ],
      screenshots: artifactDir,
    })
  );
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
