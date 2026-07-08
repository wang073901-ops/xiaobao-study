const CACHE_NAME = "smart-study-v1.1.22";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "app/styles.css?v=20260708-2144",
  "app/main.js?v=20260708-2144",
  "assets/app-icon.svg",
  "data/latest-learning-package.json",
  "data/english-5a-demo.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isNavigationRequest =
    event.request.mode === "navigate" || event.request.destination === "document" || url.pathname.endsWith("/index.html");
  const isLearningPackageRequest =
    url.pathname.endsWith("/data/latest-learning-package.json") || url.pathname.endsWith("/data/english-5a-demo.json");
  const isAppShellAsset =
    url.pathname.endsWith("/app/main.js") ||
    url.pathname.endsWith("/app/styles.css") ||
    url.pathname.endsWith("/app-version.json") ||
    url.pathname.endsWith("/sw.js");

  if (isNavigationRequest || isAppShellAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("index.html")))
    );
    return;
  }

  if (isLearningPackageRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("index.html"));
    })
  );
});
