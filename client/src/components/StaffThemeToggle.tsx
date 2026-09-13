import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type StaffTheme = "light" | "dark";
const key = "cinebite-staff-theme";
const eventName = "cinebite-staff-theme-change";
let fallback: StaffTheme = "light";
function read(): StaffTheme {
  try {
    const saved = localStorage.getItem(key);
    return saved === "dark" || saved === "light" ? saved : fallback;
  } catch { return fallback; }
}
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(eventName, listener);
  return () => { window.removeEventListener("storage", listener); window.removeEventListener(eventName, listener); };
}
export function useStaffTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as const);
  function toggle() {
    fallback = read() === "light" ? "dark" : "light";
    try { localStorage.setItem(key, fallback); } catch { /* Still works when storage is disabled. */ }
    window.dispatchEvent(new Event(eventName));
  }
  return { theme, toggle, className: theme === "light" ? "staff-light" : "staff-dark" };
}
export default function StaffThemeToggle({ theme, toggle }: { theme: StaffTheme; toggle: () => void }) {
  return <button type="button" className="staff-icon-button print:hidden" onClick={toggle} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} aria-pressed={theme === "dark"}>
    {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
    {theme === "light" ? "Dark mode" : "Light mode"}
  </button>;
}
