import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  offerPushRouter,
  validPushEndpoint,
  subscriptionInput,
  OFFER_CONSENT_VERSION,
} from "./offer-push";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({ database: vi.fn(), send: vi.fn() }));
vi.mock("./durable-store", () => ({ database: mocks.database }));
vi.mock("web-push", () => ({ default: { sendNotification: mocks.send } }));
const endpoint = "https://fcm.googleapis.com/fcm/send/test-subscription";
const input = {
  endpoint,
  keys: { p256dh: "A".repeat(87), auth: "A".repeat(22) },
  manageToken: "a".repeat(64),
  consent: true as const,
  consentVersion: OFFER_CONSENT_VERSION,
};
const id = "05b217bb-3115-4a33-9e5a-3a368012a599";
const campaign = {
  id,
  title: "Test offer",
  body: "Synthetic message only",
  cursor: "",
  createdAt: "2026-09-21T10:00:00Z",
  processing: false,
  done: false,
  attempted: 0,
  accepted: 0,
  failed: 0,
  skipped: 0,
};
const sub = {
  ...input,
  ownerHash: "hash",
  consentAt: "2026-09-20T10:00:00Z",
  expiresAt: "2099-01-01T00:00:00Z",
};
const caller = (role?: string, origin = "https://cinema.example") =>
  offerPushRouter.createCaller({
    req: { headers: { origin }, ip: "offer-tests" },
    res: {},
    user: role ? { id: 1, role } : null,
  } as TrpcContext);
function fakeDb(selectResults: unknown[][]) {
  const writes: unknown[] = [];
  const deletes = vi.fn(() => ({ where: async () => {} }));
  const db: any = {
    select: () => {
      const result = selectResults.shift() ?? [];
      const chain: any = {
        from: () => chain,
        where: () => chain,
        limit: () => Promise.resolve(result),
        for: () => Promise.resolve(result),
        then: (resolve: any, reject: any) =>
          Promise.resolve(result).then(resolve, reject),
      };
      return chain;
    },
    update: () => ({
      set: (value: unknown) => {
        writes.push(value);
        return { where: async () => {} };
      },
    }),
    delete: deletes,
  };
  db.transaction = (work: any) => work(db);
  mocks.database.mockResolvedValue(db);
  return { writes, deletes };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("PUBLIC_APP_URL", "https://cinema.example");
  vi.stubEnv("OFFERS_PUSH_ENABLED", "true");
  vi.stubEnv("OFFERS_NOTICE_APPROVED", "true");
  vi.stubEnv("WEB_PUSH_PUBLIC_KEY", "A".repeat(87));
  vi.stubEnv("WEB_PUSH_PRIVATE_KEY", "B".repeat(43));
  vi.stubEnv("WEB_PUSH_SUBJECT", "mailto:test@example.invalid");
  mocks.send.mockResolvedValue({ statusCode: 201 });
});
afterEach(() => vi.unstubAllEnvs());
describe("offer push safety", () => {
  it.each([
    "http://fcm.googleapis.com/fcm/send/x",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.test/fcm/send/x",
    "https://user:secret@fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com:8443/fcm/send/x",
    "https://fcm.googleapis.com/other",
  ])("rejects unsafe endpoint %s", url =>
    expect(validPushEndpoint(url)).toBe(false)
  );
  it("accepts only supported provider endpoint shapes", () => {
    expect(validPushEndpoint(endpoint)).toBe(true);
    expect(
      validPushEndpoint(
        "https://updates.push.services.mozilla.com/wpush/v2/token"
      )
    ).toBe(true);
  });
  it("requires explicit consent and current notice version", () => {
    expect(subscriptionInput.safeParse(input).success).toBe(true);
    expect(
      subscriptionInput.safeParse({ ...input, consent: false }).success
    ).toBe(false);
    expect(
      subscriptionInput.safeParse({ ...input, consentVersion: "old" }).success
    ).toBe(false);
  });
  it("never exposes private keys and stays disabled pending notice approval", async () => {
    vi.stubEnv("OFFERS_NOTICE_APPROVED", "false");
    expect(await caller().config()).toEqual({
      enabled: false,
      publicKey: null,
      consentVersion: OFFER_CONSENT_VERSION,
    });
    await expect(caller().subscribe(input)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(mocks.database).not.toHaveBeenCalled();
  });
  it.each([undefined, "KITCHEN", "CASHIER", "MANAGER", "READ_ONLY"])(
    "blocks broadcasts for %s",
    async role => {
      await expect(caller(role).sendBatch({ id })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(mocks.send).not.toHaveBeenCalled();
    }
  );
  it("blocks cross-origin enrollment and sending", async () => {
    await expect(
      caller(undefined, "https://evil.example").subscribe(input)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      caller("ADMIN", "https://evil.example").sendBatch({ id })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("does not resend an in-flight/unknown or completed campaign", async () => {
    for (const change of [{ processing: true }, { done: true }]) {
      fakeDb([[], [{ payload: { ...campaign, ...change } }]]);
      if ("processing" in change)
        await expect(caller("ADMIN").sendBatch({ id })).rejects.toMatchObject({
          code: "CONFLICT",
        });
      else expect((await caller("ADMIN").sendBatch({ id })).done).toBe(true);
    }
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("skips an opt-out between batch claim and sending", async () => {
    fakeDb([
      [{ key: "offer_subscription:a", payload: sub }],
      [{ payload: campaign }],
      [],
    ]);
    expect((await caller("ADMIN").sendBatch({ id })).skipped).toBe(1);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("counts provider acceptance, without claiming customer delivery", async () => {
    fakeDb([
      [{ key: "offer_subscription:a", payload: sub }],
      [{ payload: campaign }],
      [{ payload: sub }],
    ]);
    expect((await caller("ADMIN").sendBatch({ id })).accepted).toBe(1);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(JSON.parse(mocks.send.mock.calls[0][1])).toEqual({
      type: "offer",
      title: campaign.title,
      body: campaign.body,
      campaignId: id,
    });
  });
  it("removes provider-expired subscriptions without retrying", async () => {
    const db = fakeDb([
      [{ key: "offer_subscription:a", payload: sub }],
      [{ payload: campaign }],
      [{ payload: sub }],
    ]);
    mocks.send.mockRejectedValue({ statusCode: 410 });
    expect((await caller("ADMIN").sendBatch({ id })).failed).toBe(1);
    expect(db.deletes).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledOnce();
  });
});
