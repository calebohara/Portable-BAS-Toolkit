const CACHE_VERSION = 'bau-suite-v5';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Max entries in dynamic cache to prevent unbounded growth
const DYNAMIC_CACHE_LIMIT = 50;

// Core app shell — cache on install
const APP_SHELL = [
  '/',
  '/projects',
  '/search',
  '/offline',
  '/settings',
  '/network-diagram',
  '/ping',
  '/manifest.json',
];

// Static assets to cache on first request
const STATIC_EXTENSIONS = [
  '.js', '.css', '.woff2', '.woff', '.ttf', '.png', '.svg', '.ico', '.json',
];

// ─── Install ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Helpers ──────────────────────────────────────────────────

/** Only cache responses that are safe to cache */
function isCacheableResponse(response) {
  // Never cache opaque responses (type === 'opaque') — they could be errors
  if (response.type === 'opaque') return false;
  // Only cache successful responses
  if (!response.ok) return false;
  // Never cache responses with Set-Cookie or auth-related headers
  if (response.headers.has('set-cookie')) return false;
  return true;
}

/** Trim dynamic cache to prevent unbounded growth */
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    // Remove oldest entries (FIFO)
    const excess = keys.slice(0, keys.length - maxItems);
    await Promise.all(excess.map((key) => cache.delete(key)));
  }
}

// ─── Fetch ────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip non-GET — never cache POST/PUT/DELETE
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!request.url.startsWith('http')) return;

  const url = new URL(request.url);

  // Only handle same-origin requests — never intercept cross-origin
  if (url.origin !== self.location.origin) return;

  // Navigation requests — network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static assets — cache first, then network
  const isStatic = STATIC_EXTENSIONS.some((ext) => url.pathname.endsWith(ext));
  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (isCacheableResponse(response)) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Dynamic requests — network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (isCacheableResponse(response)) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, clone);
            trimCache(DYNAMIC_CACHE, DYNAMIC_CACHE_LIMIT);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
