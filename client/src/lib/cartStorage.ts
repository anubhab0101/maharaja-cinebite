const KEY = "cinebite-cart-v1";
type Line = { id: string; quantity: number };
export function readCart(): Line[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!value || !Number.isFinite(value.savedAt) || Date.now() - value.savedAt > 24 * 60 * 60 * 1000 || !Array.isArray(value.lines)) return [];
    return value.lines.slice(0, 30).filter((line: Line) =>
      typeof line?.id === "string" && line.id.length <= 100 && Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= 20);
  } catch { return []; }
}
export function saveCart(lines: Line[]) {
  try {
    if (!lines.length) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), lines: lines.map(({ id, quantity }) => ({ id, quantity })) }));
  } catch { /* Browsing still works when storage is unavailable. */ }
}
