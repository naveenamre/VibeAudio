const CACHE_NAME = 'vibe-static-v5'; // ⚠️ Version Updated (v5)
const AUDIO_CACHE = 'vibe-audio-cache-v2'; // 🎵 Audio Box Updated

const ASSETS_TO_CACHE = [
  '/',
  '/frontend/public/index.html',
  '/frontend/src/css/base.css',
  '/frontend/src/css/components.css',
  '/frontend/src/css/player.css',
  '/frontend/src/js/ui.js',
  '/frontend/src/js/api.js',
  '/frontend/src/js/player.js',
  '/frontend/src/js/ui-player.js',
  '/frontend/src/js/ui-library.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.7.0/vanilla-tilt.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.2/color-thief.umd.js'
];

// 1. Install Event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Vibe Audio: Caching App Shell');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== AUDIO_CACHE) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Event (Universal Audio Logic 🧠)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 🛑 STOP: Bad Requests
  if (
    url.href.includes("lambda-url") || 
    event.request.method === "POST" || 
    url.protocol.startsWith('chrome-extension') || 
    url.href.includes("socket")
  ) {
    return; 
  }

  // 🎵 AUDIO STRATEGY (Supports ALL formats)
  // Regex check: mp3, wav, m4a, ogg, aac, flac (Case insensitive)
  if (/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // 🏠 APP SHELL STRATEGY
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});