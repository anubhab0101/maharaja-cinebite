const KEY = "cinebite-checkout-attempt-v1";
export function clearCheckoutAttempt() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage is optional. */ }
}
// A hash avoids persisting customer names/phones in the recovery record.
export async function checkoutAttempt(fingerprint: string): Promise<{ fingerprint: string; key: string }> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint));
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved?.hash === hash && typeof saved.key === "string" && /^[0-9a-f-]{36}$/i.test(saved.key) && Number.isFinite(saved.at) && Date.now() - saved.at < 86400000) return { fingerprint, key: saved.key };
  } catch { /* Fall back to a fresh in-memory attempt. */ }
  const key = crypto.randomUUID();
  try { sessionStorage.setItem(KEY, JSON.stringify({ hash, key, at: Date.now() })); } catch { /* Storage is optional. */ }
  return { fingerprint, key };
}
