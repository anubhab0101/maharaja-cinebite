import crypto from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { listStaff } from "../cinebites-store";
import { normalizeStaffRole, StaffRole } from "@shared/cinebites";
import { isLocalDevLoginAllowed, safeRedirect } from "./security";
import { oauthCallbackSchema, oauthStateSchema, googleTokenSchema, googleProfileSchema, GOOGLE_REQUEST_TIMEOUT_MS } from "./oauth-validation";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

const GOOGLE_STATE_COOKIE = "g_oauth_state";

function getPublicBaseUrl(_req: Request): string {
  return new URL(ENV.publicAppUrl).origin;
}

export function registerOAuthRoutes(app: Express) {
  app.use("/api/auth", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });
  const failLogin = (res: Response) => res.redirect(302, "/login?error=sign_in_failed");
  /**
   * Initiate Google OAuth 2.0 Login
   * Generates secure cryptographic CSRF nonce and redirects to Google
   */
  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      failLogin(res);
      return;
    }

    const redirectTarget = typeof req.query.redirect === "string" && req.query.redirect.length <= 2048
      ? safeRedirect(req.query.redirect) : "/maharaja";

    const nonce = crypto.randomBytes(24).toString("hex");
    const statePayload = JSON.stringify({ nonce, redirect: redirectTarget });
    const encodedState = Buffer.from(statePayload, "utf8").toString("base64url");

    // Store nonce in HttpOnly CSRF cookie
    const isProd = process.env.NODE_ENV === "production";
    res.cookie(GOOGLE_STATE_COOKIE, nonce, {
      path: "/",
      httpOnly: true,
      secure: isProd || req.secure || req.headers["x-forwarded-proto"] === "https",
      sameSite: "lax",
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const redirectUri = `${getPublicBaseUrl(req)}/api/auth/google/callback`;
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", ENV.googleClientId);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("state", encodedState);
    googleAuthUrl.searchParams.set("prompt", "select_account");

    res.redirect(302, googleAuthUrl.toString());
  });

  /**
   * Google OAuth 2.0 Callback Handler
   * Validates CSRF nonce, exchanges code for Google tokens, checks authorization, and mints session
   */
  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const callback = oauthCallbackSchema.safeParse(req.query);
    if (req.query.error !== undefined || !callback.success) {
      failLogin(res);
      return;
    }
    const { code, state } = callback.data;

    // 1. Validate CSRF state nonce
    let decodedState: { nonce?: string; redirect?: string } = {};
    try {
      decodedState = oauthStateSchema.parse(JSON.parse(Buffer.from(state, "base64url").toString("utf8")));
    } catch {
      failLogin(res);
      return;
    }

    const cookieHeader = req.headers.cookie ?? "";
    const parsedCookies = parseCookieHeader(cookieHeader);
    const expectedNonce = parsedCookies[GOOGLE_STATE_COOKIE];

    if (!decodedState.nonce || !expectedNonce || decodedState.nonce !== expectedNonce) {
      failLogin(res);
      return;
    }

    // Clear the state cookie
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/", sameSite: "lax" });

    try {
      const redirectUri = `${getPublicBaseUrl(req)}/api/auth/google/callback`;

      // 2. Exchange authorization code for Google access token
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: ENV.googleClientId,
          client_secret: ENV.googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResp.ok) {
        console.error("[Google OAuth] Token exchange failed:", tokenResp.status);
        failLogin(res);
        return;
      }

      const tokenData = googleTokenSchema.parse(await tokenResp.json());

      // 3. Fetch verified user profile from Google
      const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        signal: AbortSignal.timeout(GOOGLE_REQUEST_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResp.ok) {
        failLogin(res);
        return;
      }

      const userInfo = googleProfileSchema.parse(await userResp.json());

      const email = userInfo.email.toLowerCase().trim();
      const openId = `google-${userInfo.sub}`;

      // 4. Strict Authorization Check
      // Is this email in the admin emails list, owner email, or invited staff directory?
      let role: StaffRole = "READ_ONLY";
      let isAuthorized = false;

      if (email === ENV.ownerEmail || ENV.adminEmails.includes(email)) {
        role = "OWNER_ADMIN";
        isAuthorized = true;
      } else {
        const staffList = await listStaff();
        const staffMatch = staffList.find((s) => s.email.toLowerCase() === email);
        if (staffMatch && staffMatch.status !== "SUSPENDED") {
          role = normalizeStaffRole(staffMatch.role);
          isAuthorized = true;
        }
      }

      // If not authorized as cinema staff, reject and redirect with clear error
      if (!isAuthorized) {
        console.warn("[Auth Guard] Google sign-in rejected: account not authorized");
        failLogin(res);
        return;
      }

      // 5. Upsert user in database and memory
      await db.upsertUser({
        openId,
        name: userInfo.name || email.split("@")[0],
        email,
        loginMethod: "google",
        role,
        lastSignedIn: new Date(),
      });

      // 6. Mint secure signed JWT session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name: userInfo.name || email.split("@")[0],
        email,
        role,
        expiresInMs: SESSION_DURATION_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });

      // Redirect user to destination (/maharaja or /rasoi)
      const destination = safeRedirect(decodedState.redirect, role === "KITCHEN" ? "/rasoi" : "/maharaja");

      res.redirect(302, destination);
    } catch {
      // Provider responses, validation errors and network exceptions may contain personal data/tokens.
      console.error("[Google OAuth] Sign-in failed: provider, validation or persistence error");
      failLogin(res);
    }
  });

  /**
   * Fast dev auto-login (available in local development mode ONLY, strictly locked to 127.0.0.1)
   */
  app.get("/api/auth/dev-login", async (req: Request, res: Response) => {
    // 1. Hard block if in production
    if (!isLocalDevLoginAllowed(req)) {
      res.status(404).send("Not Found");
      return;
    }

    // 2. Hard block if requested from external IP (only allow loopback/localhost)
    const clientIp = req.socket.remoteAddress || "";
    const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1" || clientIp === "localhost";

    if (!isLoopback) {
      console.warn(`[Security Alert] Blocked non-local dev-login attempt from IP: ${clientIp}`);
      res.status(404).send("Not Found");
      return;
    }

    const targetRole = normalizeStaffRole(req.query.role || "OWNER_ADMIN");
    const openId = `dev-${targetRole}`;
    const name = "Local Developer";
    const email = `dev-${targetRole.toLowerCase()}@localhost.invalid`;

    await db.upsertUser({
      openId,
      name,
      email,
      loginMethod: "dev_mock",
      role: targetRole,
      lastSignedIn: new Date(),
    }).catch(() => {});

    const sessionToken = await sdk.createSessionToken(openId, {
      name,
      email,
      role: targetRole,
      expiresInMs: SESSION_DURATION_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: SESSION_DURATION_MS });

    const destination = safeRedirect(req.query.redirect, targetRole === "KITCHEN" ? "/rasoi" : "/maharaja");

    res.redirect(302, destination);
  });
}
