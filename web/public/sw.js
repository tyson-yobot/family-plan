// Minimal service worker. It exists so the worksheet can be installed to a home
// screen and open full screen.
//
// It deliberately caches only the app shell assets, never a worksheet page and
// never an API response. Worksheet answers are private and a cached page would
// leave someone's answers readable on a shared phone after they had finished.
const CACHE = 'family-plan-shell-v2';
const SHELL = ['/manifest.json', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(caches.match(event.request).then((hit) => hit ?? fetch(event.request)));
});
