
importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js"
);

if (self.workbox) {
  console.log("Workbox działa poprawnie!");

  const { registerRoute } = workbox.routing;
  const { CacheFirst, NetworkFirst, StaleWhileRevalidate } =
    workbox.strategies;
  const { ExpirationPlugin } = workbox.expiration;

  // Rozszerzenia plików wideo, których nie zapisujemy w cache.
  const VIDEO_EXTENSIONS =
    /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv|mpeg|mpg|m3u8|mpd)$/i;

  // 1. Cache plików aplikacji (App Shell).
  workbox.precaching.precacheAndRoute([
    { url: "index.html", revision: "1.2" },
    { url: "logo.png", revision: "1.0" }
  ]);

  // Playlista — zawsze najpierw sieć, cache tylko jako zapas offline.
  registerRoute(
    ({ url }) => /playlist\.json$/i.test(url.pathname),
    new NetworkFirst({
      cacheName: "signage-playlist",
      networkTimeoutSeconds: 3
    })
  );

  // 2. Strony HTML — najpierw sieć, potem cache.
  registerRoute(
    ({ request }) => request.mode === "navigate",
    new NetworkFirst({
      cacheName: "signage-html",
      networkTimeoutSeconds: 3
    })
  );

  // 3. Obrazy — Cache First.
  registerRoute(
    ({ request, url }) =>
      request.destination === "image" &&
      url.origin === self.location.origin &&
      !VIDEO_EXTENSIONS.test(url.pathname),
    new CacheFirst({
      cacheName: "signage-images",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60
        })
      ]
    })
  );

  // 4. Pozostałe zasoby lokalne: CSS, JS, czcionki i inne pliki.
  // Pliki wideo są wykluczone.
  registerRoute(
    ({ request, url }) =>
      request.method === "GET" &&
      url.origin === self.location.origin &&
      request.mode !== "navigate" &&
      request.destination !== "video" &&
      !VIDEO_EXTENSIONS.test(url.pathname) &&
      !/playlist\.json$/i.test(url.pathname),
    new StaleWhileRevalidate({
      cacheName: "signage-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 30 * 24 * 60 * 60
        })
      ]
    })
  );

} else {
  console.error("Workbox nie mógł się załadować.");
}
