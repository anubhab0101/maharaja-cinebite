// Deliberately cache only public offline assets, never API responses, staff
// pages, customer details, QR tokens, checkout responses or third-party scripts.
const CACHE = "cinebite-offline-v2";
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
self.addEventListener("push", event => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (
    payload?.type !== "offer" ||
    typeof payload.title !== "string" ||
    typeof payload.body !== "string"
  )
    return;
  event.waitUntil(
    self.registration.showNotification(payload.title.slice(0, 60), {
      body: payload.body.slice(0, 180),
      icon: "/logo.png",
      tag: `offer-${String(payload.campaignId).slice(0, 36)}`,
      data: { kind: "offer" },
    })
  );
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(async clients => {
        if (event.notification.data?.kind === "offer") {
          const customer = clients.find(
            client => new URL(client.url).pathname === "/"
          );
          if (customer) {
            await customer.navigate("/#offers");
            return customer.focus();
          }
          return self.clients.openWindow("/#offers");
        }
        const staff = clients.find(client =>
          ["/rasoi", "/maharaja"].includes(new URL(client.url).pathname)
        );
        if (staff) return staff.focus();
        return self.clients.openWindow("/rasoi");
      })
  );
});
