import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import crypto from "crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { findOrderByNumberAndPhone, subscribe, syncOrdersFromDatabase, syncStaffFromDatabase } from "../cinebites-store";
import { securityHeaders, createRateLimiter } from "./security";
import { sdk } from "./sdk";
import { hasStaffRole } from "@shared/cinebites";

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

  // HTTP Security Headers (OWASP recommendations)
  app.use(securityHeaders);

  // Safe request body limits (protects against Memory Exhaustion / DoS)
  app.use(
    express.json({
      limit: "1mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // API rate limiters (protects against Brute Force & abuse)
  const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
  const authLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, message: "Too many login attempts, please try again later." });

  app.use("/api", apiLimiter);
  app.use("/api/oauth", authLimiter);

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/health", (_req, res) => res.json({ ok: true, service: "cinebites", realtime: "ready", timestamp: new Date().toISOString() }));

  // 1. Direct handlers for search engine & security compliance files
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send(
      "# CineBites Robot Exclusion Protocol\nUser-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /kitchen\nDisallow: /api/\n\nSitemap: https://cinebite.store/sitemap.xml\n"
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

    if (sensitiveFilePattern.test(rawPath) || sensitiveExactFiles.includes(rawPath)) {
      res.status(404).type("text/plain").send("Not Found");
      return;
    }

    next();
  });

  // Razorpay Webhook Listener
  app.post("/api/payment/webhook", async (req, res) => {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      const signature = req.headers["x-razorpay-signature"] as string | undefined;

      if (webhookSecret && signature) {
        const rawBody = (req as any).rawBody || JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac("sha256", webhookSecret)
          .update(rawBody)
          .digest("hex");

        if (expectedSignature !== signature) {
          console.warn("[Razorpay Webhook] Signature mismatch received");
          res.status(400).json({ error: "Invalid webhook signature" });
          return;
        }
      }

      const event = req.body?.event;
      console.log(`[Razorpay Webhook] Event received: ${event}`);

      // Always return 200 OK so Razorpay registers successful delivery
      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("[Razorpay Webhook] Error handling webhook:", err);
      res.status(200).json({ status: "ok" });
    }
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
      ? findOrderByNumberAndPhone(trackedOrderNumber, phoneLast4)
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

    const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: {}\n\n`), 20000);
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
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    syncOrdersFromDatabase().then(() => console.log("[DB] Orders synchronized on boot")).catch(console.warn);
    syncStaffFromDatabase().then(() => console.log("[DB] Staff synchronized on boot")).catch(console.warn);
    startKeepAlive();
  });
}

function startKeepAlive() {
  // Don't ping if running on local machine on standard dev port without external URL
  const isLocalDev = process.env.NODE_ENV === "development" && !process.env.RENDER_EXTERNAL_URL && !process.env.PUBLIC_APP_URL;
  if (isLocalDev) {
    return;
  }

  const rawUrl =
    process.env.PUBLIC_APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "https://cinebite.store";

  const target = `${rawUrl.replace(/\/$/, "")}/health`;
  console.log(`[Keep-Alive] Self-ping active. Target: ${target} (every 7 minutes)`);

  // Initial ping 20s after startup
  setTimeout(async () => {
    try {
      const res = await fetch(target);
      if (res.ok) console.log(`[Keep-Alive] Initial self-ping completed.`);
    } catch (err: any) {
      console.warn(`[Keep-Alive] Initial self-ping notice: ${err.message}`);
    }
  }, 20 * 1000);

  // Periodic ping every 7 minutes (Render sleeps after 15m idle)
  setInterval(async () => {
    try {
      const res = await fetch(target);
      if (res.ok) {
        console.log(`[Keep-Alive] Self-ping successful at ${new Date().toLocaleTimeString()}`);
      }
    } catch (err: any) {
      console.warn(`[Keep-Alive] Self-ping warning: ${err.message}`);
    }
  }, 7 * 60 * 1000);
}

startServer().catch(console.error);
