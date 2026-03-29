const CACHE_NAME = 'vibeaudio-shell-v7-offline-entry';
const PRECACHE_URLS = [
    './',
    './index.html',
    './app.webmanifest',
    './src/pages/app.html',
    './src/css/base.css',
    './src/css/components.css',
    './src/css/landing.css',
    './src/css/player.css',
    './src/js/api.js',
    './src/js/app-entry.js',
    './src/js/auth.js',
    './src/js/config.js',
    './src/js/landing.js',
    './src/js/offline-shelf.js',
    './src/js/player.js',
    './src/js/progress-model.js',
    './src/js/pwa.js',
    './src/js/ui.js',
    './src/js/ui-library.js',
    './src/js/ui-player-helpers.js',
    './src/js/ui-player-list.js',
    './src/js/ui-player-main.js',
    './src/js/user-data.js',
    './src/icons/favicon.png',
    './public/icons/logo.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();

    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const fresh = await fetch(request);
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, fresh.clone());
                return fresh;
            } catch (error) {
                return (await caches.match(request))
                    || (await caches.match('./src/pages/app.html'))
                    || (await caches.match('./index.html'));
            }
        })());
        return;
    }

    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
            const fresh = await fetch(request);
            if (fresh.ok && ['style', 'script', 'image', 'font'].includes(request.destination)) {
                const cache = await caches.open(CACHE_NAME);
                cache.put(request, fresh.clone());
            }
            return fresh;
        } catch (error) {
            return cached || Response.error();
        }
    })());
});
