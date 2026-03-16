/**
 * CableTrayRoute Service Worker
 *
 * Strategy:
 *  - Shell assets (CSS, fonts, icons) are cached on install for instant loads.
 *  - JS bundles use stale-while-revalidate for fast loads with background updates.
 *  - HTML navigation requests use network-first so users always get fresh pages
 *    when online, falling back to the offline page when the network is gone.
 *  - API requests bypass the cache entirely.
 */

const CACHE_NAME = 'ctr-shell-v2';
const RUNTIME_CACHE = 'ctr-runtime-v1';

// Core shell assets to pre-cache on install.
const PRECACHE_URLS = [
  '/offline.html',
  '/style.css',
  '/icons/favicon.svg',
  '/icons/route.svg',
  '/icons/cable.svg',
  '/icons/raceway.svg',
  '/icons/ductbank.svg',
  '/icons/tray.svg',
  '/icons/conduit.svg',
  '/icons/oneline.svg',
  '/icons/og-preview.svg',
];

// Install: cache shell assets.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// Activate: remove old cache versions.
self.addEventListener('activate', event => {
  const allowedCaches = [CACHE_NAME, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => !allowedCaches.includes(k)).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for shell assets,
// stale-while-revalidate for JS bundles, bypass for API.
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept API or cross-origin requests.
  if (url.pathname.startsWith('/api/') || url.origin !== self.location.origin) {
    return;
  }

  // Navigation requests: network-first, fall back to /offline.html.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // Shell assets: cache-first.
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then(cached => cached || fetch(request))
    );
    return;
  }

  // JS bundles in dist/: stale-while-revalidate
  if (url.pathname.startsWith('/dist/') && url.pathname.endsWith('.js')) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(cache =>
        cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(response => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
    return;
  }
});
