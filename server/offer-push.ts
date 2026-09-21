import { z } from "zod";
import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import webpush from "web-push";
import { TRPCError } from "@trpc/server";
import { storeEntities, auditLogs } from "../drizzle/schema";
import { database } from "./durable-store";
import { router, publicProcedure, adminProcedure } from "./_core/trpc";
import { checkRateLimit, getClientIp } from "./_core/security";

export const OFFER_CONSENT_VERSION = "offers-2026-09-21-v1";
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
// Only browser push providers, never arbitrary URLs/IPs or redirects (SSRF).
export function validPushEndpoint(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      !u.hash &&
      ((u.hostname === "fcm.googleapis.com" &&
        /^\/(fcm\/send|wp)\/.+/.test(u.pathname)) ||
        (u.hostname === "updates.push.services.mozilla.com" &&
          /^\/wpush\/v2\/.+/.test(u.pathname)))
    );
  } catch {
    return false;
  }
}
const endpoint = z
  .string()
  .max(2048)
  .refine(validPushEndpoint, "This browser push provider is not supported");
const manageToken = z.string().regex(/^[a-f0-9]{64}$/);
export const subscriptionInput = z.object({
  endpoint,
  manageToken,
  consent: z.literal(true),
  consentVersion: z.literal(OFFER_CONSENT_VERSION),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{87}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }),
});
export const campaignInput = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(3).max(60),
  body: z.string().trim().min(5).max(180),
});
type Subscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  ownerHash: string;
  consentVersion: string;
  consentAt: string;
  expiresAt: string;
};
type Campaign = z.infer<typeof campaignInput> & {
  createdAt: string;
  cursor: string;
  processing: boolean;
  done: boolean;
  accepted: number;
  failed: number;
  skipped: number;
  attempted: number;
};
function configuration() {
  const {
    WEB_PUSH_PUBLIC_KEY: publicKey = "",
    WEB_PUSH_PRIVATE_KEY: privateKey = "",
    WEB_PUSH_SUBJECT: subject = "",
  } = process.env;
  const enabled =
    process.env.OFFERS_PUSH_ENABLED === "true" &&
    process.env.OFFERS_NOTICE_APPROVED === "true" &&
    /^[A-Za-z0-9_-]{87}$/.test(publicKey) &&
    /^[A-Za-z0-9_-]{43}$/.test(privateKey) &&
    /^(mailto:|https:\/\/)/.test(subject);
  return {
    enabled,
    publicKey: enabled ? publicKey : null,
    privateKey,
    subject,
  };
}
async function dbRequired() {
  const db = await database();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE" });
  return db;
}
function requireEnabled() {
  if (!configuration().enabled)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Offer push setup is not enabled",
    });
}
function originCheck(req: { headers: Record<string, unknown> }) {
  const expected = process.env.PUBLIC_APP_URL;
  if (!expected || req.headers.origin !== new URL(expected).origin)
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Invalid request origin",
    });
}
async function subscriptions() {
  const db = await dbRequired();
  const rows = await db
    .select()
    .from(storeEntities)
    .where(eq(storeEntities.kind, "offer_subscription"))
    .limit(5001);
  if (rows.length > 5000)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Subscription capacity review required",
    });
  return rows.map(row => ({
    key: row.key,
    value: row.payload as Subscription,
  }));
}
async function removeExpired() {
  const db = await dbRequired();
  // Expiry stops delivery immediately; physical cleanup occurs on these operations.
  await db
    .delete(storeEntities)
    .where(
      and(
        eq(storeEntities.kind, "offer_subscription"),
        sql`JSON_UNQUOTE(JSON_EXTRACT(${storeEntities.payload}, '$.expiresAt')) <= ${new Date().toISOString()}`
      )
    );
}
export const offerPushRouter = router({
  config: publicProcedure.query(() => ({
    enabled: configuration().enabled,
    publicKey: configuration().publicKey,
    consentVersion: OFFER_CONSENT_VERSION,
  })),
  subscribe: publicProcedure
    .input(subscriptionInput)
    .mutation(async ({ input, ctx }) => {
      requireEnabled();
      originCheck(ctx.req);
      if (!checkRateLimit(`offer-sub:${getClientIp(ctx.req)}`, 30, 3600000))
        throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
      const db = await dbRequired();
      await removeExpired();
      if ((await subscriptions()).length >= 5000)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Subscription capacity reached",
        });
      const key = `offer_subscription:${hash(input.endpoint)}`;
      const value: Subscription = {
        endpoint: input.endpoint,
        keys: input.keys,
        ownerHash: hash(input.manageToken),
        consentVersion: OFFER_CONSENT_VERSION,
        consentAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
      };
      await db.transaction(async tx => {
        const [existing] = await tx
          .select()
          .from(storeEntities)
          .where(eq(storeEntities.key, key))
          .for("update");
        if (
          existing &&
          (existing.payload as Subscription).ownerHash !== value.ownerHash
        )
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Remove the previous browser subscription before enrolling again",
          });
        if (existing)
          await tx
            .update(storeEntities)
            .set({ payload: value })
            .where(eq(storeEntities.key, key));
        else
          await tx
            .insert(storeEntities)
            .values({ key, kind: "offer_subscription", payload: value });
        await tx
          .insert(auditLogs)
          .values({
            action: "OFFER_OPT_IN",
            entityType: "offer_subscription",
            entityId: hash(input.endpoint),
            detail: JSON.stringify({
              version: OFFER_CONSENT_VERSION,
              expiresAt: value.expiresAt,
            }),
          });
      });
      return { expiresAt: value.expiresAt };
    }),
  unsubscribe: publicProcedure
    .input(z.object({ endpoint, manageToken }))
    .mutation(async ({ input, ctx }) => {
      originCheck(ctx.req);
      const db = await dbRequired();
      const key = `offer_subscription:${hash(input.endpoint)}`;
      await db.transaction(async tx => {
        const [row] = await tx
          .select()
          .from(storeEntities)
          .where(eq(storeEntities.key, key))
          .for("update");
        if (!row) return;
        if ((row.payload as Subscription).ownerHash !== hash(input.manageToken))
          throw new TRPCError({ code: "FORBIDDEN" });
        await tx.delete(storeEntities).where(eq(storeEntities.key, key));
        await tx
          .insert(auditLogs)
          .values({
            action: "OFFER_OPT_OUT",
            entityType: "offer_subscription",
            entityId: hash(input.endpoint),
            detail: "Browser subscription deleted",
          });
      });
      return { success: true };
    }),
  summary: adminProcedure.query(async () => {
    await removeExpired();
    const db = await dbRequired();
    const campaigns = await db
      .select()
      .from(storeEntities)
      .where(eq(storeEntities.kind, "offer_campaign"))
      .limit(100);
    return {
      enabled: configuration().enabled,
      subscribers: (await subscriptions()).length,
      campaigns: campaigns
        .map(r => r.payload as Campaign)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    };
  }),
  createCampaign: adminProcedure
    .input(campaignInput)
    .mutation(async ({ input, ctx }) => {
      requireEnabled();
      originCheck(ctx.req);
      const db = await dbRequired();
      const key = `offer_campaign:${input.id}`;
      const result = await db.transaction(async tx => {
        const [old] = await tx
          .select()
          .from(storeEntities)
          .where(eq(storeEntities.key, key))
          .for("update");
        if (old) return old.payload as Campaign; // Idempotent browser retry, no broadcast here.
        if (!checkRateLimit("offer-campaigns", 5, 3600000))
          throw new TRPCError({ code: "TOO_MANY_REQUESTS" });
        const campaign: Campaign = {
          ...input,
          createdAt: new Date().toISOString(),
          cursor: "",
          processing: false,
          done: false,
          accepted: 0,
          failed: 0,
          skipped: 0,
          attempted: 0,
        };
        await tx
          .insert(storeEntities)
          .values({ key, kind: "offer_campaign", payload: campaign });
        await tx
          .insert(auditLogs)
          .values({
            actorUserId: ctx.user.id,
            action: "OFFER_CAMPAIGN_CREATED",
            entityType: "offer_campaign",
            entityId: input.id,
            detail: input.title,
          });
        return campaign;
      });
      return result;
    }),
  sendBatch: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      requireEnabled();
      originCheck(ctx.req);
      const db = await dbRequired();
      const key = `offer_campaign:${input.id}`;
      const candidates = (await subscriptions()).sort((a, b) =>
        a.key.localeCompare(b.key)
      );
      const claim = await db.transaction(async tx => {
        const [row] = await tx
          .select()
          .from(storeEntities)
          .where(eq(storeEntities.key, key))
          .for("update");
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        const campaign = row.payload as Campaign;
        if (campaign.processing)
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Batch is running or outcome is unknown after interruption. Do not resend; ask technical support.",
          });
        if (campaign.done) return { campaign, batch: [] };
        const remaining = candidates.filter(
          r =>
            r.key > campaign.cursor &&
            r.value.consentAt <= campaign.createdAt &&
            r.value.expiresAt > new Date().toISOString()
        );
        const batch = remaining.slice(0, 10);
        const updated = {
          ...campaign,
          processing: batch.length > 0,
          done: remaining.length <= 10,
          cursor: batch.at(-1)?.key ?? campaign.cursor,
          attempted: campaign.attempted + batch.length,
        };
        await tx
          .update(storeEntities)
          .set({ payload: updated })
          .where(eq(storeEntities.key, key));
        return { campaign: updated, batch };
      });
      if (!claim.batch.length) return claim.campaign;
      const cfg = configuration();
      const results = await Promise.all(
        claim.batch.map(async candidate => {
          // Re-read opt-in immediately before sending, including withdrawals since claim.
          const [row] = await db
            .select()
            .from(storeEntities)
            .where(eq(storeEntities.key, candidate.key));
          const sub = row?.payload as Subscription | undefined;
          if (
            !sub ||
            sub.expiresAt <= new Date().toISOString() ||
            !validPushEndpoint(sub.endpoint)
          )
            return "skipped";
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: sub.keys },
              JSON.stringify({
                type: "offer",
                title: claim.campaign.title,
                body: claim.campaign.body,
                campaignId: input.id,
              }),
              {
                vapidDetails: {
                  subject: cfg.subject,
                  publicKey: cfg.publicKey!,
                  privateKey: cfg.privateKey,
                },
                TTL: 3600,
                timeout: 5000,
                urgency: "low",
                topic: input.id.replaceAll("-", "").slice(0, 32),
              }
            );
            return "accepted";
          } catch (error) {
            const status = (error as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410)
              await db
                .delete(storeEntities)
                .where(eq(storeEntities.key, candidate.key));
            // Do not log provider errors containing endpoints/keys; no automatic duplicate sends.
            return "failed";
          }
        })
      );
      const completed = {
        ...claim.campaign,
        processing: false,
        accepted:
          claim.campaign.accepted +
          results.filter(r => r === "accepted").length,
        failed:
          claim.campaign.failed + results.filter(r => r === "failed").length,
        skipped:
          claim.campaign.skipped + results.filter(r => r === "skipped").length,
      };
      await db
        .update(storeEntities)
        .set({ payload: completed })
        .where(eq(storeEntities.key, key));
      return completed;
    }),
});
