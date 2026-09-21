let registration: Promise<ServiceWorkerRegistration | null> | undefined;
export function registerPwa() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext)
    return Promise.resolve(null);
  registration ??= navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .catch(() => null);
  return registration;
}
