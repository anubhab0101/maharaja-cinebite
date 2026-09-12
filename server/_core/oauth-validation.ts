import { z } from "zod";

export const oauthCallbackSchema = z.object({
  code: z.string().min(1).max(4096),
  state: z.string().min(1).max(4096).regex(/^[A-Za-z0-9_-]+$/),
});
export const oauthStateSchema = z.object({
  nonce: z.string().regex(/^[a-f0-9]{48}$/),
  redirect: z.string().min(1).max(2048),
}).strict();
export const googleTokenSchema = z.object({
  access_token: z.string().min(1).max(8192),
});
export const googleProfileSchema = z.object({
  sub: z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/),
  email: z.string().max(320).email(),
  email_verified: z.literal(true),
  name: z.string().max(255).optional(),
});

export const GOOGLE_REQUEST_TIMEOUT_MS = 10_000;
