import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { findOrderByNumberAndPhone, subscribe } from "../cinebites-store";
import { securityHeaders, createRateLimiter } from "./security";
import { sdk } from "./sdk";
import { hasStaffRole } from "@shared/cinebites";
import { registerPaymentWebhook } from "../payment-webhook";
import { database } from "../durable-store";
import { sql } from "drizzle-orm";
import { menuEvents } from "../menu-events";
import { startStaffPushWorker } from "../staff-push";
import { startSelfPing } from "./self-ping";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.listen(port, () => probe.close(() => resolve(true)));
    probe.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 3000) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No available port found");
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  // Explicit proxy addresses/subnets only. Never infer trust from a request.
  const trustedProxies = process.env.TRUSTED_PROXY_CIDRS?.split(",").map(value => value.trim()).filter(Boolean);
  if (trustedProxies?.length) {
    if (trustedProxies.some(value => /^(true|false|\*|0\.0\.0\.0\/0|::\/0)$/i.test(value))) throw new Error("Unsafe proxy trust configuration");
    app.set("trust proxy", trustedProxies);
  }
  if (process.env.NODE_ENV === "production") {
    const required = ["DATABASE_URL", "PUBLIC_APP_URL", "JWT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "OWNER_EMAIL", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
    if (required.some(key => !process.env[key])) throw new Error("Required production configuration is missing");
    if ((process.env.JWT_SECRET?.length ?? 0) < 32 || /placeholder|your-|replace/i.test(process.env.JWT_SECRET ?? "")) throw new Error("Set a strong JWT secret");
    if (new URL(process.env.PUBLIC_APP_URL!).protocol !== "https:") throw new Error("Production PUBLIC_APP_URL must use HTTPS");
    const db = await database();
    if (!db) throw new Error("Database required");
    await db.execute(sql`SELECT publicId, snapshot, providerOrderId FROM orders LIMIT 0`);
    await db.execute(sql`SELECT payload FROM store_entities LIMIT 0`);
    const [legacy] = await db.execute(sql`SELECT COUNT(*) AS missing FROM orders WHERE snapshot IS NULL`);
    if (Number((legacy as any)[0]?.missing) > 0) throw new Error("Legacy order backfill required before serving production traffic");
  }

  // HTTP Security Headers (OWASP recommendations)
  app.use(securityHeaders);
  let menuConnections = 0;
  app.get("/api/menu-events", (req, res) => {
    if (menuConnections >= 500) { res.sendStatus(503); return; }
    menuConnections++;
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" });
    res.flushHeaders();
    const changed = () => { res.write("data: menu-changed\n\n"); };
    changed();
    menuEvents.on("changed", changed);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 25000);
    req.on("close", () => { menuConnections--; clearInterval(heartbeat); menuEvents.off("changed", changed); });
  });
  registerPaymentWebhook(app);

  // Safe request body limits (protects against Memory Exhaustion / DoS)
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // API rate limiters (protects against Brute Force & abuse)
  const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
  const authLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, message: "Too many login attempts, please try again later." });

  app.use("/api", apiLimiter);
  app.use("/api/auth", authLimiter);

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // 1. Direct handlers for search engine & security compliance files
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      "# CineBites Robot Exclusion Protocol\nUser-agent: *\nAllow: /\nDisallow: /maharaja\nDisallow: /rasoi\nDisallow: /api/\n\nSitemap: https://cinebite.store/sitemap.xml\n"
    );
  });

  app.get("/sitemap.xml", (_req, res) => {
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://cinebite.store/</loc>\n    <lastmod>2026-09-12</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://cinebite.store/login</loc>\n    <lastmod>2026-09-12</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.3</priority>\n  </url>\n</urlset>`
    );
  });

  app.get("/.well-known/security.txt", (_req, res) => {
    res.type("text/plain").send(
      "Contact: mailto:anubhabmohapatra.01@gmail.com\nExpires: 2027-12-31T23:59:59.000Z\nPreferred-Languages: en, hi\nCanonical: https://cinebite.store/.well-known/security.txt\nPolicy: https://cinebite.store/\n"
    );
  });

  // 2. Strict sensitive path blocker (Never leak or fallback to SPA for dotfiles, config, or source files)
  app.use((req, res, next) => {
    const rawPath = (req.path || "").split("?")[0].toLowerCase();

    // Whitelist security.txt
    if (rawPath === "/.well-known/security.txt") {
      return next();
    }

    // Deny all dotfiles/hidden directories (e.g. /.git, /.env, /.vscode, /.well-known/...)
    if (/(?:^|\/)\.[^/]+/.test(rawPath)) {
      res.status(404).type("text/plain").send("Not Found");
      return;
    }

    // Deny sensitive files & source extensions
    const sensitiveFilePattern =
      /\.(env|git|sql|db|sqlite|sqlite3|dump|log|bak|backup|old|orig|zip|tar|gz|rar|7z|conf|config|ini|yaml|yml|ts|tsx|md|lock)$/;
    const sensitiveExactFiles = [
      "/package.json",
      "/package-lock.json",
      "/pnpm-lock.yaml",
      "/tsconfig.json",
      "/components.json",
      "/drizzle.config.ts",
      "/vite.config.ts",
      "/vitest.config.ts",
    ];

    if (process.env.NODE_ENV === "production" && (sensitiveFilePattern.test(rawPath) || sensitiveExactFiles.includes(rawPath))) {
      res.status(404).type("text/plain").send("Not Found");
      return;
    }

    next();
  });

  app.get('/api/staff-manifest', async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user || !hasStaffRole(user.role, ['OWNER_ADMIN', 'ADMIN', 'MANAGER', 'KITCHEN', 'CASHIER'])) return res.sendStatus(403);
      const { staffManifest } = await import('../../shared/staff-manifest');
      return res.type('application/manifest+json').json(staffManifest);
    } catch { return res.sendStatus(401); }
  });

  app.get("/health", async (_req, res) => {
    try {
      const db = await database();
      if (!db) throw new Error("Database unavailable");
      await db.execute(sql`SELECT 1`);
      res.json({ ok: true, service: "cinebites" });
    } catch { res.status(503).json({ ok: false, service: "cinebites" }); }
  });

  // Scoped SSE event stream: Prevents unauthorized eavesdropping on all cinema orders
  app.get("/api/events", async (req, res) => {
    let authenticatedUser = null;
    try {
      authenticatedUser = await sdk.authenticateRequest(req);
    } catch {
      authenticatedUser = null;
    }

    const isStaff = authenticatedUser && hasStaffRole(authenticatedUser.role, ["OWNER_ADMIN", "ADMIN", "MANAGER", "KITCHEN", "CASHIER"]);
    const trackedOrderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber : null;
    const phoneLast4 = typeof req.query.phoneLast4 === "string" && /^\d{4}$/.test(req.query.phoneLast4)
      ? req.query.phoneLast4
      : null;

    // A public stream needs both customer factors and must be validated before
    // subscribing. An order number alone is not an authorization token.
    const trackedOrder = !isStaff && trackedOrderNumber && phoneLast4
      ? await findOrderByNumberAndPhone(trackedOrderNumber, phoneLast4)
      : null;
    if (!isStaff && !trackedOrder) {
      res.status(401).json({ error: "Unauthorized. Staff login or valid order tracking details required." });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ connectedAt: new Date().toISOString(), scoped: !isStaff })}\n\n`);

    const unsubscribe = subscribe((event) => {
      // If staff, stream all events. If customer, stream only events matching their order.
      if (isStaff) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      } else if (event.order.id === trackedOrder!.id) {
        // Redact phone number and instructions from public SSE payload
        const safeOrder = {
          id: event.order.id,
          orderNumber: event.order.orderNumber,
          status: event.order.status,
          updatedAt: event.order.updatedAt,
        };
        res.write(`event: ${event.type}\ndata: ${JSON.stringify({ type: event.type, order: safeOrder })}\n\n`);
      }
    });

    const heartbeat = setInterval(async () => {
      if (isStaff) {
        try {
          const current = await sdk.authenticateRequest(req);
          if (!hasStaffRole(current.role, ["OWNER_ADMIN", "ADMIN", "MANAGER", "KITCHEN", "CASHIER"])) throw new Error("Revoked");
        } catch { clearInterval(heartbeat); unsubscribe(); res.end(); return; }
      }
      if (!res.writableEnded) res.write(`event: heartbeat\ndata: {}\n\n`);
    }, 20000);
    req.on("close", () => { clearInterval(heartbeat); unsubscribe(); res.end(); });
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));

  const isBundled =
    import.meta.dirname.endsWith("dist") ||
    import.meta.dirname.includes(path.sep + "dist");

  if (process.env.NODE_ENV === "production" || isBundled) {
    serveStatic(app);
  } else {
    await setupVite(app, server);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = process.env.NODE_ENV === "production" ? preferredPort : await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    const stopSelfPing = startSelfPing();
    server.once("close", stopSelfPing);
  });
  const stopStaffPush = startStaffPushWorker();
  server.on("close", stopStaffPush);
}

startServer().catch(error => { console.error("Server startup failed", error); process.exitCode = 1; });
