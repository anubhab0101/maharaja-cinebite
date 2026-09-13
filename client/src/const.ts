import { OAUTH_STATE_COOKIE, encodeOAuthState } from "@shared/const";

export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Start the Manus OAuth login. Call this from an event handler or effect at the
// moment you want to navigate, e.g. `onClick={() => startLogin()}`.
//
// It has SIDE EFFECTS — it mints a one-time nonce, writes the __Host- state
// cookie, and navigates immediately — so the cookie nonce always matches the
// `state` it sends. Do NOT call it during render (no `href={startLogin()}` /
// `loginUrl={...}`): each call overwrites the cookie, so a stray render-phase
// call would desync it from an in-flight login and the callback would reject it
// with "invalid oauth state". It returns void by design, so there is no URL to
// stash across renders.
// Start the CineBites staff login flow by navigating to the login page.
export const startLogin = (redirect?: string) => {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname;
  const target = redirect || (currentPath && currentPath !== "/login" ? currentPath : "/maharaja");
  window.location.href = `/login?redirect=${encodeURIComponent(target)}`;
};
