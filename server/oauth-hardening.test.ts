import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { registerOAuthRoutes } from "./_core/oauth";
import { googleProfileSchema, oauthCallbackSchema, oauthStateSchema } from "./_core/oauth-validation";
import { upsertUser } from "./db";
import { sdk } from "./_core/sdk";

vi.mock("./_core/env", () => ({ ENV: { publicAppUrl: "https://cinema.test", googleClientId: "test", googleClientSecret: "test", ownerEmail: "owner@example.com", adminEmails: [] } }));
vi.mock("./db", () => ({ upsertUser: vi.fn() }));
vi.mock("./cinebites-store", () => ({ listStaff: vi.fn(async () => []) }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn(async () => "signed-test-session") } }));

const nonce = "a".repeat(48);
const state = Buffer.from(JSON.stringify({ nonce, redirect: "/maharaja" })).toString("base64url");
let routes: Record<string, Function>;
let response: any;
let provider: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  routes = {};
  registerOAuthRoutes({ use: vi.fn(), get: (path: string, fn: Function) => { routes[path] = fn; } } as any);
  response = { redirect: vi.fn(), cookie: vi.fn(), clearCookie: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn() };
  provider = vi.fn();
  vi.stubGlobal("fetch", provider);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function callback(query: unknown = { code: "test-code", state }, cookie = `g_oauth_state=${nonce}`) {
  await routes["/api/auth/google/callback"]({ query, headers: { cookie }, protocol: "https" }, response);
}
function profile(email = "owner@example.com") {
  provider.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "test-token" }) });
  provider.mockResolvedValueOnce({ ok: true, json: async () => ({ sub: "123", email, email_verified: true }) });
}

describe("Google login hardening", () => {
  it("bounds callback input and requires strict state and verified provider fields", () => {
    expect(oauthCallbackSchema.safeParse({ code: "x".repeat(4097), state }).success).toBe(false);
    expect(oauthCallbackSchema.safeParse({ code: ["a", "b"], state }).success).toBe(false);
    expect(oauthStateSchema.safeParse({ nonce: "short", redirect: "/maharaja" }).success).toBe(false);
    expect(googleProfileSchema.safeParse({ sub: "123", email: "bad", email_verified: true }).success).toBe(false);
    expect(googleProfileSchema.safeParse({ sub: "123", email: "a@example.com", email_verified: "true" }).success).toBe(false);
  });
  it.each([{ error: "attacker-controlled-details" }, { code: "x", state: "bad" }, { code: ["x"], state }])("rejects invalid callbacks without contacting Google", async query => {
    await callback(query);
    expect(response.redirect).toHaveBeenCalledWith(302, "/login?error=sign_in_failed");
    expect(provider).not.toHaveBeenCalled();
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
  });
  it("rejects mismatched CSRF state", async () => {
    await callback(undefined, "g_oauth_state=wrong");
    expect(provider).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(302, "/login?error=sign_in_failed");
  });
  it("does not put rejected emails in URLs or logs", async () => {
    profile("outsider@example.com");
    await callback();
    expect(response.redirect).toHaveBeenCalledWith(302, "/login?error=sign_in_failed");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain("outsider@example.com");
    expect(upsertUser).not.toHaveBeenCalled();
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
  });
  it("fails safely when a provider request times out", async () => {
    provider.mockRejectedValue(new DOMException("private provider detail", "TimeoutError"));
    await callback();
    expect(response.redirect).toHaveBeenCalledWith(302, "/login?error=sign_in_failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private provider detail");
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
  });
  it("rejects malformed profile data without creating a session", async () => {
    provider.mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: "test" }) });
    provider.mockResolvedValueOnce({ ok: true, json: async () => ({ sub: {}, email: "owner@example.com", email_verified: true }) });
    await callback();
    expect(sdk.createSessionToken).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(302, "/login?error=sign_in_failed");
  });
  it("still signs in an approved account and applies timeouts to both requests", async () => {
    profile();
    await callback();
    expect(upsertUser).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@example.com", role: "OWNER_ADMIN" }));
    expect(sdk.createSessionToken).toHaveBeenCalledOnce();
    expect(response.redirect).toHaveBeenCalledWith(302, "/maharaja");
    for (const call of provider.mock.calls) expect(call[1].signal).toBeInstanceOf(AbortSignal);
  });
  it("public login contains neither dev controls nor raw error interpolation", () => {
    const source = readFileSync(new URL("../client/src/pages/Login.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("/api/auth/dev-login");
    expect(source).not.toContain("@gmail.com");
    expect(source).not.toContain("${errorParam}");
    expect(source).not.toContain("Google Console");
  });
});
