/** Remove only obsolete preview credentials/profile data, never customer orders. */
export function clearLegacyPreviewStorage() {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      for (const key of ["manus-runtime-user-info", "manus-cookie"]) window[name].removeItem(key);
    } catch { /* Storage may be blocked by browser settings. */ }
  }
}
