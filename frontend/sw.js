const CACHE_NAME = "vibe-audio-v2"; // ⚠️ IMPORTANT: Jab bhi naya code dalna, isko v3, v4 karna!
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
    self.skipWaiting(); // 🔥 TRICK: Turant install ho ja, wait mat kar
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
    self.clients.claim(); // 🔥 TRICK: Turant control le le page ka
});

// 3. Fetch Event
self.addEventListener("fetch", (event) => {
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                // Agar net chal raha hai, to naya data le aur cache update kar
                return caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, networkResponse.clone());
                    return networkResponse;
                });
            })
            .catch(() => {
                // Agar net nahi hai, to cache se dikha
                return caches.match(event.request);
            })
    );
});