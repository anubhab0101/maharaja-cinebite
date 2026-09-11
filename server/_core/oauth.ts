import crypto from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { listStaff } from "../cinebites-store";
import { normalizeStaffRole, StaffRole } from "@shared/cinebites";

const GOOGLE_STATE_COOKIE = "g_oauth_state";

function getPublicBaseUrl(req: Request): string {
  if (ENV.publicAppUrl && !ENV.publicAppUrl.includes("localhost")) {
    return ENV.publicAppUrl.replace(/\/+$/, "");
  }
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "http";
  const host = (req.headers["x-forwarded-host"] as string) || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

export function registerOAuthRoutes(app: Express) {
  /**
   * Initiate Google OAuth 2.0 Login
   * Generates secure cryptographic CSRF nonce and redirects to Google
   */
  app.get("/api/auth/google", (req: Request, res: Response) => {
    if (!ENV.googleClientId) {
      res.status(500).send("Google Client ID is not configured on the server.");
      return;
    }

    const redirectTarget = typeof req.query.redirect === "string" && req.query.redirect.startsWith("/")
      ? req.query.redirect
      : "/admin";

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
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    const errorParam = typeof req.query.error === "string" ? req.query.error : null;

    if (errorParam) {
      res.redirect(302, `/login?error=${encodeURIComponent(errorParam)}`);
      return;
    }

    if (!code || !state) {
      res.status(400).redirect("/login?error=missing_code_or_state");
      return;
    }

    // 1. Validate CSRF state nonce
    let decodedState: { nonce?: string; redirect?: string } = {};
    try {
      decodedState = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    } catch {
      res.status(403).redirect("/login?error=invalid_state_format");
      return;
    }

    const cookieHeader = req.headers.cookie ?? "";
    const parsedCookies = parseCookieHeader(cookieHeader);
    const expectedNonce = parsedCookies[GOOGLE_STATE_COOKIE];

    if (!decodedState.nonce || !expectedNonce || decodedState.nonce !== expectedNonce) {
      res.status(403).redirect("/login?error=csrf_validation_failed");
      return;
    }

    // Clear the state cookie
    res.clearCookie(GOOGLE_STATE_COOKIE, { path: "/", sameSite: "lax" });

    try {
      const redirectUri = `${getPublicBaseUrl(req)}/api/auth/google/callback`;

      // 2. Exchange authorization code for Google access token
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
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
        const errText = await tokenResp.text().catch(() => "");
        console.error("[Google OAuth] Token exchange failed:", tokenResp.status, errText);
        res.status(502).redirect("/login?error=token_exchange_failed");
        return;
      }

      const tokenData = (await tokenResp.json()) as { access_token?: string; id_token?: string };
      if (!tokenData.access_token) {
        res.status(502).redirect("/login?error=missing_access_token");
        return;
      }

      // 3. Fetch verified user profile from Google
      const userResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResp.ok) {
        res.status(502).redirect("/login?error=userinfo_fetch_failed");
        return;
      }

      const userInfo = (await userResp.json()) as {
        sub: string;
        email?: string;
        name?: string;
        picture?: string;
        email_verified?: boolean;
      };

      if (!userInfo.sub || !userInfo.email) {
        res.status(400).redirect("/login?error=missing_user_email");
        return;
      }

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
        const staffList = listStaff();
        const staffMatch = staffList.find((s) => s.email.toLowerCase() === email);
        if (staffMatch) {
          role = normalizeStaffRole(staffMatch.role);
          isAuthorized = true;
        }
      }

      // If not authorized as cinema staff, reject and redirect with clear error
      if (!isAuthorized) {
        console.warn(`[Auth Guard] Unauthorized Google sign-in attempt by: ${email}`);
        res.redirect(302, `/login?error=unauthorized_account&email=${encodeURIComponent(email)}`);
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
      }).catch((e) => console.warn("[Auth] DB upsert warning:", e));

      // 6. Mint secure signed JWT session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name: userInfo.name || email.split("@")[0],
        email,
        role,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      // Redirect user to destination (/admin or /kitchen)
      const destination = decodedState.redirect && decodedState.redirect.startsWith("/")
        ? decodedState.redirect
        : role === "KITCHEN"
        ? "/kitchen"
        : "/admin";

      res.redirect(302, destination);
    } catch (err) {
      console.error("[Google OAuth] Unexpected error:", err);
      res.status(500).redirect("/login?error=internal_auth_error");
    }
  });

  /**
   * Fast dev auto-login (available in local development mode ONLY, strictly locked to 127.0.0.1)
   */
  app.get("/api/auth/dev-login", async (req: Request, res: Response) => {
    // 1. Hard block if in production
    if (ENV.isProduction || process.env.NODE_ENV === "production") {
      res.status(404).send("Not Found");
      return;
    }

    // 2. Hard block if requested from external IP (only allow loopback/localhost)
    const forwarded = req.headers["x-forwarded-for"];
    const clientIp = (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress) || "";
    const isLoopback = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "::ffff:127.0.0.1" || clientIp === "localhost";

    if (!isLoopback) {
      console.warn(`[Security Alert] Blocked non-local dev-login attempt from IP: ${clientIp}`);
      res.status(404).send("Not Found");
      return;
    }

    const targetRole = (req.query.role as string) || "OWNER_ADMIN";
    const openId = `google-owner-${ENV.ownerEmail}`;
    const name = "Anubhab Mohapatra";
    const email = ENV.ownerEmail;

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
      expiresInMs: ONE_YEAR_MS,
    });

    const cookieOptions = getSessionCookieOptions(req);
    res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

    const destination = req.query.redirect && String(req.query.redirect).startsWith("/")
      ? String(req.query.redirect)
      : targetRole === "KITCHEN"
      ? "/kitchen"
      : "/admin";

    res.redirect(302, destination);
  });
}
