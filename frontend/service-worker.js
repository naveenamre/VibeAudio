const CACHE_NAME = 'vibeaudio-shell-v8-offline-route-guard';
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

function normalizePathname(value) {
    const pathname = String(value || '/').replace(/\/+$/, '');
    return pathname || '/';
}

function isAppShellPath(pathname) {
    const normalized = normalizePathname(pathname);
    return normalized.endsWith('/src/pages/app') || normalized.endsWith('/src/pages/app.html');
}

function isLandingPath(pathname) {
    const normalized = normalizePathname(pathname);
    return normalized === '/' || normalized.endsWith('/index.html');
}

async function getCanonicalAppShell(cache) {
    return (await cache.match('./src/pages/app.html'))
        || (await cache.match(new Request(new URL('./src/pages/app', self.location.href).href)));
}

self.addEventListener('install', (event) => {
    self.skipWaiting();

    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));

        const appShell = await cache.match('./src/pages/app.html');
        if (appShell) {
            await cache.put(new Request(new URL('./src/pages/app', self.location.href).href), appShell.clone());
        }
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
            const cache = await caches.open(CACHE_NAME);
            const isAppNavigation = isAppShellPath(url.pathname);
            const cachedAppShell = isAppNavigation ? await getCanonicalAppShell(cache) : null;

            if (cachedAppShell) {
                return cachedAppShell;
            }

            try {
                const fresh = await fetch(request);

                const responsePath = normalizePathname(new URL(fresh.url || request.url).pathname);
                if (isAppNavigation) {
                    if (isAppShellPath(responsePath)) {
                        await cache.put('./src/pages/app.html', fresh.clone());
                        await cache.put(new Request(new URL('./src/pages/app', self.location.href).href), fresh.clone());
                    }
                } else if (isLandingPath(url.pathname)) {
                    await cache.put('./index.html', fresh.clone());
                } else {
                    await cache.put(request, fresh.clone());
                }

                return fresh;
            } catch (error) {
                if (isAppNavigation) {
                    return (await getCanonicalAppShell(cache))
                        || (await cache.match('./index.html'))
                        || Response.error();
                }

                return (await cache.match(request))
                    || (await cache.match('./index.html'))
                    || (await getCanonicalAppShell(cache))
                    || Response.error();
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
