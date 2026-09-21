import { createHash } from "node:crypto";
import { z } from "zod";
import { and, eq, gte, asc, sql } from "drizzle-orm";
import webpush from "web-push";
import { TRPCError } from "@trpc/server";
import { database } from "./durable-store";
import { orders, storeEntities, users } from "../drizzle/schema";
import { router, staffProcedure } from "./_core/trpc";
import { validPushEndpoint } from "./offer-push";
import { listStaff } from "./cinebites-store";
import { ENV } from "./_core/env";
import { hasStaffRole } from "../shared/cinebites";
import { checkRateLimit } from "./_core/security";

const roles = [
  "OWNER_ADMIN",
  "ADMIN",
  "MANAGER",
  "KITCHEN",
  "CASHIER",
] as const;
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function staffEndpoint(s: string) {
  if (validPushEndpoint(s)) return true;
  try {
    const u = new URL(s);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      /^([a-z0-9-]+\.)?web\.push\.apple\.com$/.test(u.hostname) &&
      u.pathname.startsWith("/") &&
      u.pathname.length > 1
    );
  } catch {
    return false;
  }
}
export function staffPushConfig() {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY ?? "";
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY ?? "";
  const subject = process.env.WEB_PUSH_SUBJECT ?? "";
  return {
    enabled:
      process.env.STAFF_PUSH_ENABLED === "true" &&
      /^[\w-]{87}$/.test(publicKey) &&
      /^[\w-]{43}$/.test(privateKey) &&
      /^(mailto:|https:\/\/)/.test(subject),
    publicKey,
    privateKey,
    subject,
  };
}
export const staffSubscription = z.object({
  endpoint: z.string().max(2048).refine(staffEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^[\w-]{87}$/),
    auth: z.string().regex(/^[\w-]{22}$/),
  }),
});
type Sub = z.infer<typeof staffSubscription> & {
  userId: number;
  joinedAt: string;
  expiresAt: string;
};
type Job = {
  attempts: number;
  leaseUntil: number;
  done: boolean;
  expiresAt: string;
};
function origin(req: { headers: Record<string, unknown> }) {
  if (
    !process.env.PUBLIC_APP_URL ||
    req.headers.origin !== new URL(process.env.PUBLIC_APP_URL).origin
  )
    throw new TRPCError({ code: "FORBIDDEN" });
}
async function requiredDb() {
  const db = await database();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
  return db;
}
export const staffPushRouter = router({
  status: staffProcedure("kitchen:read")
    .input(z.object({ deviceId: z.string().regex(/^[a-f0-9]{64}$/) }))
    .query(async ({ input, ctx }) => {
      const db = await requiredDb();
      const [row] = await db
        .select()
        .from(storeEntities)
        .where(eq(storeEntities.key, `staff-push:${input.deviceId}`))
        .limit(1);
      const sub = row?.payload as Sub | undefined;
      return {
        active: Boolean(
          sub &&
          sub.userId === ctx.user.id &&
          sub.expiresAt > new Date().toISOString()
        ),
        expiresAt: sub?.userId === ctx.user.id ? sub.expiresAt : null,
      };
    }),
  config: staffProcedure("kitchen:read").query(() => {
    const c = staffPushConfig();
    return { enabled: c.enabled, publicKey: c.enabled ? c.publicKey : null };
  }),
  subscribe: staffProcedure("kitchen:read")
    .input(staffSubscription)
    .mutation(async ({ input, ctx }) => {
      origin(ctx.req);
      if (!staffPushConfig().enabled)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Staff push keys are not configured yet.",
        });
      if (!checkRateLimit(`staff-push:${ctx.user.id}`, 20, 3600000))
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      const db = await requiredDb();
      const key = `staff-push:${hash(input.endpoint)}`;
      const now = new Date();
      const payload: Sub = {
        ...input,
        userId: ctx.user.id,
        joinedAt: now.toISOString(),
        expiresAt: new Date(+now + 7 * 86400000).toISOString(),
      };
      await db.transaction(async tx => {
        const lockKey = "staff-push-config:enrollment";
        await tx.insert(storeEntities).values({ key: lockKey, kind: "staff-push-config", payload: {} }).onDuplicateKeyUpdate({ set: { key: lockKey } });
        await tx.select().from(storeEntities).where(eq(storeEntities.key, lockKey)).limit(1).for("update");
        const existing = await tx.select().from(storeEntities).where(eq(storeEntities.kind, "staff-push")).limit(101);
        const previous = existing.find(row => row.key === key)?.payload as Sub | undefined;
        if (!previous && existing.length >= 100) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Staff device limit reached. Remove unused devices before adding another." });
        if (previous?.userId === ctx.user.id && previous.expiresAt > now.toISOString()) payload.joinedAt = previous.joinedAt;
        await tx.insert(storeEntities).values({ key, kind: "staff-push", payload }).onDuplicateKeyUpdate({ set: { payload } });
      });
      return { expiresAt: payload.expiresAt };
    }),
  disable: staffProcedure("kitchen:read")
    .input(z.object({ endpoint: z.string().max(2048) }))
    .mutation(async ({ input, ctx }) => {
      origin(ctx.req);
      const db = await requiredDb();
      await db
        .delete(storeEntities)
        .where(
          and(
            eq(storeEntities.key, `staff-push:${hash(input.endpoint)}`),
            sql`JSON_EXTRACT(${storeEntities.payload}, '$.userId') = ${ctx.user.id}`
          )
        );
      return { success: true };
    }),
  test: staffProcedure("kitchen:read")
    .input(z.object({ endpoint: z.string().max(2048) }))
    .mutation(async ({ input, ctx }) => {
      origin(ctx.req);
      if (!checkRateLimit(`staff-push-test:${ctx.user.id}`, 5, 60000))
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      const db = await requiredDb();
      const [row] = await db
        .select()
        .from(storeEntities)
        .where(eq(storeEntities.key, `staff-push:${hash(input.endpoint)}`))
        .limit(1);
      const sub = row?.payload as Sub | undefined;
      if (
        !sub ||
        sub.userId !== ctx.user.id ||
        sub.expiresAt < new Date().toISOString()
      )
        throw new TRPCError({ code: "NOT_FOUND" });
      await send(sub, "test");
      return { accepted: true };
    }),
});
async function send(sub: Sub, notificationId: string) {
  const config = staffPushConfig();
  if (!config.enabled) throw new Error("Staff push disabled");
  return webpush.sendNotification(
    sub,
    JSON.stringify({
      type: "staff-order",
      notificationId,
      test: notificationId === "test",
    }),
    {
      vapidDetails: {
        subject: config.subject,
        publicKey: config.publicKey,
        privateKey: config.privateKey,
      },
      TTL: 300,
      urgency: "high",
      timeout: 5000,
    }
  );
}
export async function runStaffPushSweep() {
  if (!staffPushConfig().enabled) return;
  const db = await requiredDb();
  const now = Date.now();
  await db
    .delete(storeEntities)
    .where(
      and(
        sql`${storeEntities.kind} IN ('staff-push','staff-push-job')`,
        sql`JSON_UNQUOTE(JSON_EXTRACT(${storeEntities.payload}, '$.expiresAt')) < ${new Date(now).toISOString()}`
      )
    );
  const subscriptions = await db
    .select()
    .from(storeEntities)
    .where(eq(storeEntities.kind, "staff-push"))
    .limit(100);
  if (!subscriptions.length) return;
  const directory = await listStaff();
  const recent = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, "CONFIRMED"),
        eq(orders.status, "NEW"),
        gte(orders.paymentConfirmedAt, new Date(now - 3600000))
      )
    )
    .orderBy(asc(orders.paymentConfirmedAt))
    .limit(100);
  for (const row of subscriptions) {
    const sub = row.payload as Sub;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, sub.userId))
      .limit(1);
    const email = user?.email?.trim().toLowerCase();
    const member = directory.find(m => m.email.trim().toLowerCase() === email);
    const owner =
      email && (email === ENV.ownerEmail || ENV.adminEmails.includes(email));
    if (
      !user ||
      (!owner &&
        (!member ||
          member.status === "SUSPENDED" ||
          !hasStaffRole(member.role, [...roles])))
    ) {
      await db.delete(storeEntities).where(eq(storeEntities.key, row.key));
      continue;
    }
    for (const order of recent) {
      if (
        !order.paymentConfirmedAt ||
        order.paymentConfirmedAt.toISOString() < sub.joinedAt
      )
        continue;
      const key = `staff-push-job:${hash(`${row.key}:${order.publicId}`)}`;
      const claimed = await db.transaction(async tx => {
        const initial: Job = {
          attempts: 0,
          leaseUntil: 0,
          done: false,
          expiresAt: new Date(now + 86400000).toISOString(),
        };
        await tx
          .insert(storeEntities)
          .values({ key, kind: "staff-push-job", payload: initial })
          .onDuplicateKeyUpdate({ set: { key } });
        const [saved] = await tx
          .select()
          .from(storeEntities)
          .where(eq(storeEntities.key, key))
          .limit(1)
          .for("update");
        const job = saved.payload as Job;
        if (job.done || job.attempts >= 3 || job.leaseUntil > Date.now())
          return null;
        const payload = {
          ...job,
          attempts: job.attempts + 1,
          leaseUntil: Date.now() + 60000,
        };
        await tx
          .update(storeEntities)
          .set({ payload })
          .where(eq(storeEntities.key, key));
        return payload;
      });
      if (!claimed) continue;
      // Recheck withdrawal and order progress after acquiring a delivery claim.
      const [active] = await db
        .select()
        .from(storeEntities)
        .where(eq(storeEntities.key, row.key))
        .limit(1);
      const [current] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .limit(1);
      if (
        !active ||
        (active.payload as Sub).userId !== sub.userId ||
        current?.status !== "NEW"
      ) {
        await db
          .update(storeEntities)
          .set({ payload: { ...claimed, done: true } })
          .where(eq(storeEntities.key, key));
        continue;
      }
      try {
        await send(sub, hash(order.orderNumber));
        await db
          .update(storeEntities)
          .set({ payload: { ...claimed, done: true } })
          .where(eq(storeEntities.key, key));
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        console.warn("Staff push attempt failed", {
          status: status ?? "transport",
          attempt: claimed.attempts,
        });
        if (status === 404 || status === 410) {
          await db.delete(storeEntities).where(eq(storeEntities.key, row.key));
          break;
        }
        // Lease expiry retries transient/uncertain sends, at most three attempts.
      }
    }
  }
}
export function startStaffPushWorker() {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await runStaffPushSweep();
    } catch {
      console.error(
        "Staff push sweep failed; will retry. Check database/configuration."
      );
    } finally {
      busy = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, 15000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
