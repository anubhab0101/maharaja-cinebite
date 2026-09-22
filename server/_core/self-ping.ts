// Best-effort only: a suspended process cannot run this timer or wake itself.
export const SELF_PING_INTERVAL_MS = 60_000;

export function startSelfPing(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production" || env.RENDER !== "true" || !env.RENDER_EXTERNAL_URL) return () => {};
  let url: URL;
  try {
    url = new URL(env.RENDER_EXTERNAL_URL);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".onrender.com") || url.username || url.password || url.port) throw new Error();
    url = new URL("/health", url.origin);
  } catch {
    console.warn("Internal self-ping disabled: invalid Render service URL.");
    return () => {};
  }
  let pending: AbortController | undefined;
  const timer = setInterval(async () => {
    if (pending) return;
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    timeout.unref();
    try {
      url.searchParams.set("selfPing", String(Date.now()));
      const response = await fetch(url, { redirect: "error", cache: "no-store", signal: controller.signal });
      const body = await response.json();
      if (!response.ok || body.ok !== true || body.service !== "cinebites") throw new Error();
    } catch {
      console.warn("Internal self-ping failed; next check in 60 seconds.");
    } finally {
      clearTimeout(timeout);
      pending = undefined;
    }
  }, SELF_PING_INTERVAL_MS);
  timer.unref();
  console.info("Internal Render self-ping enabled: every 60 seconds (best-effort).");
  return () => { clearInterval(timer); pending?.abort(); };
}
