const CACHE_NAME = "smart-study-v1.1.16";
const APP_SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "app/styles.css?v=20260708-2013",
  "app/main.js?v=20260708-2013",
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
  const isLearningPackageRequest =
    url.pathname.endsWith("/data/latest-learning-package.json") || url.pathname.endsWith("/data/english-5a-demo.json");
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
