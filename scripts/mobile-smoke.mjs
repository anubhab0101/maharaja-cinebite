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
      name: "Festival Combo with Large Cheese Popcorn and Two Cold Drinks",
      quantity: 1,
      pricePaise: 10000,
      options: [],
    },
  ],
});
let queue = [order("one")];
let tracked = null;
let paused = false;
let chatMessages = [];
const menuStreams = new Set();
const menu = [
  {
    id: "popcorn",
    name: "Festival Combo with Large Cheese Popcorn and Two Cold Drinks",
    category: "Popcorn",
    pricePaise: 10000,
    description: "Test only",
    available: true,
    discountPercent: 15,
    options: [],
  },
];
const data = name =>
  ({
    "order.track": tracked,
    "catalog.orderingControl": { paused },
    "kitchen.orderingControl": { paused },
    "chat.inbox": [],
    "offers.config": {
      enabled: true,
      publicKey: "A".repeat(87),
      consentVersion: "offers-2026-09-21-v1",
    },
    "offers.summary": { enabled: false, subscribers: 0, campaigns: [] },
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
app.use(express.json());
app.post("/api/trpc/kitchen.setOrderingControl", (req, res) => {
  const input = req.body[0]?.json ?? req.body.json;
  paused = input.paused;
  res.json([{ result: { data: { json: { paused } } } }]);
});
app.post("/api/trpc/chat.customer", (req, res) => {
  const input = req.body[0]?.json ?? req.body.json;
  if (!input || input.phone !== "9876543210") return res.status(400).end();
  if (input.message && !chatMessages.some(m => m.id === input.message.id))
    chatMessages.push({
      ...input.message,
      sender: "customer",
      sentAt: new Date().toISOString(),
    });
  res.json([
    { result: { data: { json: { open: true, messages: chatMessages } } } },
  ]);
});
app.get("/api/trpc/:names", (req, res) =>
  res.json(
    req.params.names
      .split(",")
      .map(name => ({ result: { data: { json: data(name) } } }))
  )
);
app.get(["/api/events", "/api/menu-events"], (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
  });
  res.write("event: ready\ndata: {}\n\n");
  if (req.path === "/api/menu-events") menuStreams.add(res);
  req.on("close", () => {
    menuStreams.delete(res);
    res.end();
  });
});
app.get("/api/staff-manifest", (_req, res) =>
  res.json({
    name: "CineBite Staff",
    short_name: "CineBite",
    start_url: "/rasoi",
    scope: "/",
    display: "standalone",
    icons: [{ src: "/logo.png", sizes: "512x512", type: "image/png" }],
  })
);
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
    Object.defineProperty(window.Notification, "permission", {
      configurable: true,
      get: () => "default",
    });
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
  assert.equal(await page.getByRole("button", { name: "Enable sound & notifications", exact: true }).count(), 0, "admin must not mount kitchen alerts");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator('link[rel="manifest"]').waitFor({ state: "attached" });
  assert.ok(
    (await page.locator('link[rel="manifest"]').getAttribute("href")).includes(
      "/api/staff-manifest"
    )
  );
  await fits("admin overview");
  await page.getByRole("button", { name: "Install CineBite app", exact: true }).click();
  await page.getByText(/On iPhone: Safari/).waitFor();
  await page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "Add CineBite to Home Screen" }) }).getByRole("button", { name: "Close", exact: true }).click();
  await page.evaluate(() => {
    window.__installCalls = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    event.prompt = async () => { window.__installCalls++; };
    event.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Install CineBite app", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__installCalls), 1, "install button invokes available native prompt exactly once");
  await page.screenshot({
    path: path.join(artifactDir, "admin-mobile.png"),
    fullPage: true,
  });
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
    "Offer notifications",
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
      await page
        .getByLabel("Discount (%) — 0 disables it", { exact: true })
        .fill("15");
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
  assert.equal(await page.getByRole("button", { name: "Enable sound & notifications", exact: true }).isVisible(), false, "kitchen alerts default collapsed");
  await page.getByText(/Kitchen notification settings/).click();
  await page.getByRole("button", { name: "Pause new orders", exact: true }).waitFor();
  page.on("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Pause new orders", exact: true }).click();
  await page.getByRole("button", { name: "Resume orders", exact: true }).waitFor();
  assert.equal(paused, true);
  await page.getByText("TEST-one", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Resume orders", exact: true }).click();
  await page.getByRole("button", { name: "Pause new orders", exact: true }).waitFor();
  assert.equal(paused, false);
  await page.getByRole("button", { name: "Menu Stock" }).click();
  const stockName = page.locator("strong").filter({ hasText: menu[0].name });
  await stockName.waitFor();
  await page.getByText("Highest Sell", { exact: true }).waitFor();
  assert.equal(await stockName.evaluate(el => getComputedStyle(el).whiteSpace), "normal");
  await page.getByRole("button", { name: `Mark sold out: ${menu[0].name}`, exact: true }).waitFor();
  await fits("kitchen stock names");
  await page.screenshot({ path: path.join(artifactDir, "kitchen-stock-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Done", exact: true }).click();
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
    if (route === "/") {
      assert.equal(
        await page.locator('link[rel="manifest"]').count(),
        0,
        "customer page has no installation manifest"
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Install CineBite app" })
          .count(),
        0,
        "customer has no install button"
      );
      const offers = page.getByRole("region", {
        name: "Optional cinema offers",
      });
      await offers.waitFor();
      menu[0].available = false;
      for (const stream of menuStreams) stream.write("data: menu-changed\n\n");
      await page
        .getByRole("button", { name: "Sold out", exact: true })
        .first()
        .waitFor({ timeout: 7000 });
      menu[0].available = true;
      for (const stream of menuStreams) stream.write("data: menu-changed\n\n");
      assert.equal(
        await offers.getByRole("checkbox").isChecked(),
        false,
        "marketing consent defaults off"
      );
      assert.equal(
        await offers
          .getByRole("button", { name: "Allow offer notifications" })
          .isDisabled(),
        true
      );
      await offers.getByRole("checkbox").check();
      assert.equal(
        await offers
          .getByRole("button", { name: "Allow offer notifications" })
          .isEnabled(),
        true
      );
      await offers
        .getByRole("button", { name: "Allow offer notifications" })
        .click();
      await offers
        .getByText(
          "Notifications are blocked in browser settings. Ordering is unaffected."
        )
        .waitFor();
      await page.screenshot({
        path: path.join(artifactDir, "customer-offers.png"),
        fullPage: true,
      });
      await page.goto(`${url}/support`);
      await page
        .getByRole("heading", { name: "Contact & support", exact: true })
        .waitFor();
      await page
        .getByRole("link", { name: "+91 9776942999", exact: true })
        .waitFor();
      await fits("mobile support policy");
      await page.goto(`${url}/retention`);
      await page
        .getByRole("heading", {
          name: "Retention & deletion — implementation notice",
        })
        .waitFor();
      await fits("mobile retention policy");
      tracked = {
        ...order("chat"),
        orderNumber: `CB-${"A".repeat(24)}`,
        createdAt: new Date(Date.now() - 19 * 60000).toISOString(),
      };
      await page.goto(`${url}/?track=${tracked.orderNumber}&phone=0000`);
      await page.getByText("Order Summary", { exact: true }).waitFor();
      assert.equal(
        await page.getByRole("region", { name: "Delayed order chat" }).count(),
        0
      );
      tracked.createdAt = new Date(Date.now() - 21 * 60000).toISOString();
      const chat = page.getByRole("region", { name: "Delayed order chat" });
      await chat.waitFor({ timeout: 15000 });
      await chat.getByLabel("Phone used for this order").fill("9876543210");
      await chat.getByRole("button", { name: "Open chat" }).click();
      await chat
        .getByLabel("Message", { exact: true })
        .fill("Please update my order");
      await chat.getByRole("button", { name: "Send message" }).click();
      await chat
        .getByText("Please update my order", { exact: false })
        .first()
        .waitFor();
      await fits("customer delayed chat");
      await page.screenshot({
        path: path.join(artifactDir, "customer-chat.png"),
        fullPage: true,
      });
      tracked.status = "DELIVERED";
      await chat.waitFor({ state: "detached", timeout: 10000 });
      tracked = null;
    }
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
