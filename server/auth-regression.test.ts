import { describe, expect, it, vi, afterEach } from "vitest";
import { SignJWT } from "jose";
import { sdk } from "./_core/sdk";
import { COOKIE_NAME } from "@shared/const";

const mocks = vi.hoisted(() => ({ user: { id: 1, openId: "google-123", name: "Staff", email: "staff@example.test", loginMethod: "google", role: "ADMIN" }, role: "KITCHEN" as string, members: true }));
vi.mock("./_core/env", () => ({ ENV: { cookieSecret: "test-secret-with-at-least-thirty-two-characters", appId: "cinebites", ownerEmail: "owner@example.test", adminEmails: [], oAuthServerUrl: "", isProduction: false } }));
vi.mock("./db", () => ({ getUserByOpenId: vi.fn(async () => mocks.user), upsertUser: vi.fn(async () => undefined) }));
vi.mock("./cinebites-store", () => ({ listStaff: () => mocks.members ? [{ email: "staff@example.test", role: mocks.role, status: "ACTIVE" }] : [] }));
afterEach(() => { mocks.members = true; mocks.role = "KITCHEN"; });

describe("session permissions", () => {
  it("uses current directory role instead of stale JWT or user role", async () => {
    const token = await sdk.createSessionToken("google-123", { role: "ADMIN" });
    const req = { headers: { cookie: `${COOKIE_NAME}=${token}` } } as any;
    expect((await sdk.authenticateRequest(req)).role).toBe("KITCHEN");
    mocks.role = "READ_ONLY";
    expect((await sdk.authenticateRequest(req)).role).toBe("READ_ONLY");
  });
  it("rejects a formerly invited user removed from the directory", async () => {
    const token = await sdk.createSessionToken("google-123", { role: "ADMIN" });
    mocks.members = false;
    await expect(sdk.authenticateRequest({ headers: { cookie: `${COOKIE_NAME}=${token}` } } as any)).rejects.toThrow("revoked");
  });
  it("rejects a token signed for another application", async () => {
    const token = await sdk.signSession({ openId: "google-123", appId: "other-app", name: "Staff" });
    expect(await sdk.verifySession(token)).toBeNull();
  });
  it("rejects old one-year sessions without an issued-at timestamp", async () => {
    const key = new TextEncoder().encode("test-secret-with-at-least-thirty-two-characters");
    const token = await new SignJWT({ openId: "google-123", appId: "cinebites" }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1y").sign(key);
    expect(await sdk.verifySession(token)).toBeNull();
  });
});
