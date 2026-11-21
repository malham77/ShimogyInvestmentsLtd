/* SHIMOGY Investment Group Ltd — Service Worker (Offline App Shell + Real-Time Push & Loan Alerts) */
'use strict';

var CACHE_VERSION = 'shimogy-pwa-v1';
var SHELL_ASSETS = [
  './',
  './index.html',
  './investments.html',
  './cycles.html',
  './savings.html',
  './loans.html',
  './updates.html',
  './about.html',
  './dashboard.html',
  './css/style.css',
  './js/firebase-bridge.js',
  './js/supabase-bridge.js',
  './js/standalone-db.js',
  './js/site.js',
  './js/pwa.js',
  './js/dashboard.js',
  './js/chart.umd.min.js',
  './manifest.webmanifest',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './pwa-maskable-512x512.png',
  './apple-touch-icon.png',
  './assets/aistudio/logo2_be71428a.jpg'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return Promise.allSettled(
        SHELL_ASSETS.map(function (asset) {
          return cache.add(new Request(asset, { cache: 'reload' })).catch(function () {
            return null;
          });
        })
      );
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) {
          return k !== CACHE_VERSION;
        }).map(function (k) {
          return caches.delete(k);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (!req || req.method !== 'GET') return;

  var url;
  try {
    url = new URL(req.url);
  } catch (_e) {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept or cache cross-origin Supabase/Firebase auth & API traffic
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache private member/admin API responses
  if (url.pathname.indexOf('/api/member/') === 0 || url.pathname.indexOf('/api/admin/') === 0 || url.pathname.indexOf('/api/pwa/') === 0) {
    return;
  }

  // Public site-data feed: network-first with cached fallback when offline
  if (url.pathname === '/api/site-data') {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var clone = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put('./api/site-data-cache', clone).catch(function () {});
          });
        }
        return res;
      }).catch(function () {
        return caches.match('./api/site-data-cache').then(function (cached) {
          return cached || new Response(JSON.stringify({ settings: {}, heroSlides: [], testimonials: [], plans: [], publicCycles: [], updates: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        });
      })
    );
    return;
  }

  // Navigation requests (HTML pages): network-first, falling back to cache
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') !== -1) {
    event.respondWith(
      fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return res;
      }).catch(function () {
        return caches.match(req).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Static assets (CSS, JS, images, manifest): stale-while-revalidate
  event.respondWith(
    caches.match(req).then(function (cached) {
      var networkPromise = fetch(req).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (cache) {
            cache.put(req, copy).catch(function () {});
          });
        }
        return res;
      }).catch(function () {
        return cached;
      });
      return cached || networkPromise;
    })
  );
});

self.addEventListener('push', function (event) {
  var payload = {
    title: 'SHIMOGY Investment Group',
    body: 'You have a new SHIMOGY update or account reminder.',
    url: './dashboard.html',
    tag: 'shimogy-push',
    icon: './pwa-192x192.png',
    badge: './pwa-192x192.png'
  };

  if (event.data) {
    try {
      var parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        payload = Object.assign(payload, parsed);
      }
    } catch (_e) {
      try {
        var txt = event.data.text();
        if (txt) payload.body = txt;
      } catch (_err) {}
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: payload.icon || './pwa-192x192.png',
      badge: payload.badge || './pwa-192x192.png',
      tag: payload.tag || 'shimogy-push',
      renotify: true,
      vibrate: [180, 90, 180],
      data: { url: payload.url || './index.html' }
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var rawUrl = (event.notification && event.notification.data && event.notification.data.url) || './index.html';
  var targetUrl;
  try {
    targetUrl = new URL(rawUrl, self.registration.scope || self.location.origin).href;
  } catch (_e) {
    targetUrl = self.registration.scope || '/';
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      for (var j = 0; j < clientList.length; j++) {
        var c = clientList[j];
        if ('navigate' in c && 'focus' in c) {
          return c.navigate(targetUrl).then(function (focused) {
            return focused ? focused.focus() : undefined;
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
