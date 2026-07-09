const SW_RESET_VERSION = "20260709-1512";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(resetServiceWorker());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request));
});

async function resetServiceWorker() {
  if ("caches" in self) {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  }
  await self.clients.claim();
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(
    windowClients.map((client) => {
      const url = new URL(client.url);
      if (url.searchParams.get("sw-cleared") === SW_RESET_VERSION) return Promise.resolve();
      url.searchParams.set("sw-cleared", SW_RESET_VERSION);
      return client.navigate(url.href);
    })
  );
  await self.registration.unregister();
}
