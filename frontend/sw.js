const CACHE_NAME = "vibe-audio-v3"; // ⚠️ Version Updated to v3
const ASSETS_TO_CACHE = [
    "./",
    "./src/pages/index.html",
    "./src/css/style.css",
    "./src/js/ui.js",
    "./src/js/player.js",
    "./src/js/api.js",
    "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
    "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap",
    "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"
];

// 1. Install Event
self.addEventListener("install", (event) => {
    self.skipWaiting(); // 🔥 Turant install ho ja
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// 2. Activate Event (Purana Cache Delete)
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) return caches.delete(key);
                })
            );
        })
    );
    self.clients.claim(); // Turant control le le page ka
});

// 3. Fetch Event (The FIX 🛠️)
self.addEventListener("fetch", (event) => {
    
    // 🛑 STOP: In requests ko Cache mat karo
    if (
        event.request.url.includes("lambda-url") || // AWS API Calls
        event.request.method === "POST" ||          // Data Saving
        event.request.url.startsWith("chrome-extension") || // Browser Junk
        event.request.url.includes("socket")        // Live Server Sockets
    ) {
        return; // Direct network pe jane do, Service Worker beech me nahi aayega
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // ✅ Check: Kya response valid hai? (206 Partial Content ya Error ko cache mat karo)
                if (
                    !networkResponse || 
                    networkResponse.status !== 200 || 
                    networkResponse.type !== 'basic'
                ) {
                    return networkResponse;
                }

                // Agar sab sahi hai, to Cache update karo
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });

                return networkResponse;
            })
            .catch(() => {
                // Agar net nahi hai, to Cache se uthao
                return caches.match(event.request);
            })
    );
});