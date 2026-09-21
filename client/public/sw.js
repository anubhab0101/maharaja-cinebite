// Deliberately cache only public offline assets, never API responses, staff
// pages, customer details, QR tokens, checkout responses or third-party scripts.
const CACHE = "cinebite-offline-v1";
self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(["/offline.html", "/offline.css"]))
  );
});
self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("cinebite-offline-") && key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() => caches.match("/offline.html"))
    );
  } else if (url.pathname === "/offline.css") {
    event.respondWith(
      caches
        .match("/offline.css")
        .then(response => response || fetch(event.request))
    );
  }
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async clients => {
        const staff = clients.find(client =>
          ["/rasoi", "/maharaja"].includes(new URL(client.url).pathname)
        );
        if (staff) return staff.focus();
        return self.clients.openWindow("/rasoi");
      })
  );
});
