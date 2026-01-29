const CACHE_NAME = 'vibe-static-v9'; // Version bumped
const AUDIO_CACHE = 'vibe-audio-cache-v2';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  '../src/css/base.css',       // Try relative path
  '../src/css/components.css',
  '../src/css/player.css',
  '../src/js/ui.js',
  '../src/js/api.js',
  '../src/js/player.js',
  '../src/js/ui-player.js',
  '../src/js/ui-library.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/vanilla-tilt/1.7.0/vanilla-tilt.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/color-thief/2.3.2/color-thief.umd.js'
];

// 1. Install Event (Safe Cache)
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Vibe Audio: Caching App Shell');
      // Promise.all use kiya taki ek fail hone par sab fail na ho
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => {
            console.warn(`⚠️ Failed to cache: ${url} (Ignore if path is wrong)`);
          });
        })
      );
    })
  );
});

// 2. Activate Event (Cleanup)
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

// 3. Fetch Event (Smart Audio & Shell)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Stop bad requests
  if (url.href.includes("lambda-url") || url.href.includes("/api/") || event.request.method === "POST") return;

  // Audio Strategy (Cache First, Ignore Partial 206)
  if (/\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(url.pathname)) {
    event.respondWith(
      caches.open(AUDIO_CACHE).then(cache => {
        return cache.match(event.request).then(cachedResponse => {
          if (cachedResponse) return cachedResponse;
          return fetch(event.request).then(networkResponse => {
            if (networkResponse.status === 200) { // Only cache full files
               cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          });
        });
      })
    );
    return;
  }

  // App Shell Strategy
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
           const clone = networkResponse.clone();
           caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match('./index.html'));
      return cachedResponse || fetchPromise;
    })
  );
});