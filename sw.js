/**
 * CableTrayRoute Service Worker
 *
 * Strategy:
 *  - Shell assets (CSS, fonts, icons) are cached on install for instant loads.
 *  - HTML navigation requests use network-first so users always get fresh pages
 *    when online, falling back to the offline page when the network is gone.
 *  - API requests bypass the cache entirely.
 */

const CACHE_NAME = 'ctr-shell-v2';

// Core shell assets to pre-cache on install.
// Includes all icons referenced by navigation.js so the sidebar renders correctly offline.
const PRECACHE_URLS = [
  '/offline.html',
  '/style.css',
  '/icons/favicon.svg',
  // Workflow section icons
  '/icons/route.svg',
  '/icons/cable.svg',
  '/icons/raceway.svg',
  '/icons/ductbank.svg',
  '/icons/tray.svg',
  '/icons/conduit.svg',
  '/icons/oneline.svg',
  '/icons/equipment.svg',
  '/icons/load.svg',
  '/icons/panel.svg',
  // Studies section icons
  '/icons/Motor.svg',
  '/icons/Load.svg',
  '/icons/components/Breaker.svg',
  '/icons/components/TextBox.svg',
  // Toolbar icons used in navigation and settings
  '/icons/toolbar/validate.svg',
  '/icons/toolbar/grid.svg',
  '/icons/toolbar/grid-size.svg',
  '/icons/toolbar/copy.svg',
  '/icons/toolbar/connect.svg',
  '/icons/toolbar/dimension.svg',
  '/icons/toolbar/export.svg',
  '/icons/toolbar/import.svg',
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
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: network-first for navigation, cache-first for shell assets, bypass for API.
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
});
