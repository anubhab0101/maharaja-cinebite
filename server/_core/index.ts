import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { subscribe } from "../cinebites-store";
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
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // API rate limiters (protects against Brute Force & abuse)
  const apiLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 120 });
  const authLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30, message: "Too many login attempts, please try again later." });

  app.use("/api", apiLimiter);
  app.use("/api/oauth", authLimiter);

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  app.get("/health", (_req, res) => res.json({ ok: true, service: "cinebites", realtime: "ready", timestamp: new Date().toISOString() }));

  // Scoped SSE event stream: Prevents unauthorized eavesdropping on all cinema orders
  app.get("/api/events", async (req, res) => {
    let authenticatedUser = null;
    try {
      authenticatedUser = await sdk.authenticateRequest(req);
    } catch {
      authenticatedUser = null;
    }

    const isStaff = authenticatedUser && hasStaffRole(authenticatedUser.role, ["OWNER_ADMIN", "ADMIN", "MANAGER", "KITCHEN", "CASHIER"]);
    const trackedOrderId = typeof req.query.orderId === "string" ? req.query.orderId : null;
    const trackedOrderNumber = typeof req.query.orderNumber === "string" ? req.query.orderNumber : null;

    // Reject unauthenticated requests that attempt to listen without scoping to their own order
    if (!isStaff && !trackedOrderId && !trackedOrderNumber) {
      res.status(401).json({ error: "Unauthorized. Staff login or valid order tracking parameter required." });
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
      } else if (
        (trackedOrderId && event.order.id === trackedOrderId) ||
        (trackedOrderNumber && event.order.orderNumber === trackedOrderNumber)
      ) {
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
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`Server running on http://localhost:${port}/`));
}

startServer().catch(console.error);
