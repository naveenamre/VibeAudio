const CACHE_VERSION = 'v10-smart-offline';
const STATIC_CACHE_NAME = `vibeaudio-static-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `vibeaudio-runtime-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `vibeaudio-data-${CACHE_VERSION}`;
const IMAGE_CACHE_NAME = `vibeaudio-images-${CACHE_VERSION}`;
const CACHE_NAMES = [STATIC_CACHE_NAME, RUNTIME_CACHE_NAME, DATA_CACHE_NAME, IMAGE_CACHE_NAME];
const MAX_WARM_URLS = 24;

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

function isJsonLikeRequest(request, url) {
    const accept = String(request.headers.get('accept') || '').toLowerCase();
    return url.pathname.toLowerCase().endsWith('.json')
        || accept.includes('application/json')
        || accept.includes('text/json');
}

function looksLikeImageUrl(url) {
    return /\.(png|jpe?g|webp|gif|svg|avif|ico)(?:$|\?)/i.test(url.pathname);
}

function isImageRequest(request, url) {
    return request.destination === 'image' || looksLikeImageUrl(url);
}

function isStyleScriptOrFontRequest(request) {
    return ['style', 'script', 'font'].includes(request.destination);
}

function isCacheableStaticRequest(request, url) {
    if (url.origin === self.location.origin && isStyleScriptOrFontRequest(request)) {
        return true;
    }

    if (request.destination === 'manifest') return true;
    if (url.origin !== self.location.origin && isStyleScriptOrFontRequest(request)) {
        return true;
    }

    return false;
}

function canCacheResponse(response) {
    return Boolean(response) && (response.ok || response.type === 'opaque');
}

async function getCanonicalAppShell(cache) {
    return (await cache.match('./src/pages/app.html'))
        || (await cache.match(new Request(new URL('./src/pages/app', self.location.href).href)));
}

async function putAppShellAliases(cache, response) {
    await cache.put('./src/pages/app.html', response.clone());
    await cache.put(new Request(new URL('./src/pages/app', self.location.href).href), response.clone());
}

async function warmPrecacheShell() {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));

    const appShell = await cache.match('./src/pages/app.html');
    if (appShell) {
        await putAppShellAliases(cache, appShell.clone());
    }
}

function resolveRuntimeCacheName(request, url) {
    if (isJsonLikeRequest(request, url)) return DATA_CACHE_NAME;
    if (isImageRequest(request, url)) return IMAGE_CACHE_NAME;
    if (isCacheableStaticRequest(request, url)) return RUNTIME_CACHE_NAME;
    return null;
}

async function cacheRuntimeResponse(request, url, response) {
    const cacheName = resolveRuntimeCacheName(request, url);
    if (!cacheName || !canCacheResponse(response)) return;

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
}

async function networkFirst(request, url) {
    const cacheName = resolveRuntimeCacheName(request, url);
    const cache = cacheName ? await caches.open(cacheName) : null;

    try {
        const response = await fetch(request);
        if (cache && canCacheResponse(response)) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        if (cache) {
            const cached = await cache.match(request);
            if (cached) return cached;
        }
        return Response.error();
    }
}

async function staleWhileRevalidate(request, url, event) {
    const cacheName = resolveRuntimeCacheName(request, url);
    if (!cacheName) {
        try {
            return await fetch(request);
        } catch (error) {
            return Response.error();
        }
    }

    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then(async (response) => {
            if (canCacheResponse(response)) {
                await cache.put(request, response.clone());
            }
            return response;
        })
        .catch(() => null);

    if (cached) {
        event.waitUntil(networkPromise);
        return cached;
    }

    const fresh = await networkPromise;
    return fresh || Response.error();
}

async function cacheNavigationResponse(request, response) {
    if (!canCacheResponse(response)) return;

    const cache = await caches.open(STATIC_CACHE_NAME);
    const requestUrl = new URL(request.url);
    const responseUrl = new URL(response.url || request.url);

    if (isAppShellPath(requestUrl.pathname) || isAppShellPath(responseUrl.pathname)) {
        await putAppShellAliases(cache, response.clone());
        return;
    }

    if (isLandingPath(requestUrl.pathname) || isLandingPath(responseUrl.pathname)) {
        await cache.put('./index.html', response.clone());
        return;
    }

    await cache.put(request, response.clone());
}

async function handleNavigationRequest(request) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const url = new URL(request.url);

    try {
        const response = await fetch(request);
        await cacheNavigationResponse(request, response.clone());
        return response;
    } catch (error) {
        if (isAppShellPath(url.pathname)) {
            return (await getCanonicalAppShell(cache))
                || (await cache.match('./index.html'))
                || Response.error();
        }

        return (await cache.match('./index.html'))
            || (await getCanonicalAppShell(cache))
            || Response.error();
    }
}

async function warmUrls(urls = []) {
    const uniqueUrls = Array.from(new Set(
        urls
            .map((value) => {
                try {
                    return new URL(String(value || ''), self.location.href).href;
                } catch (error) {
                    return '';
                }
            })
            .filter(Boolean)
    )).slice(0, MAX_WARM_URLS);

    await Promise.allSettled(uniqueUrls.map(async (urlValue) => {
        const url = new URL(urlValue);
        const isRemoteImage = url.origin !== self.location.origin && /\.(png|jpe?g|webp|gif|svg|avif)(?:$|\?)/i.test(url.pathname);
        const request = new Request(urlValue, {
            method: 'GET',
            mode: isRemoteImage ? 'no-cors' : 'cors'
        });
        const response = await fetch(request);

        if (!canCacheResponse(response)) return;

        if (url.origin === self.location.origin && isAppShellPath(url.pathname)) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            await putAppShellAliases(cache, response.clone());
            return;
        }

        if (url.origin === self.location.origin && isLandingPath(url.pathname)) {
            const cache = await caches.open(STATIC_CACHE_NAME);
            await cache.put('./index.html', response.clone());
            return;
        }

        await cacheRuntimeResponse(request, url, response.clone());
    }));
}

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(warmPrecacheShell());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => !CACHE_NAMES.includes(key)).map((key) => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
        event.waitUntil?.(warmUrls(data.urls));
    }
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    if (request.mode === 'navigate') {
        event.respondWith(handleNavigationRequest(request));
        return;
    }

    const url = new URL(request.url);
    const cacheName = resolveRuntimeCacheName(request, url);
    if (!cacheName) return;

    if (isJsonLikeRequest(request, url)) {
        event.respondWith(networkFirst(request, url));
        return;
    }

    event.respondWith(staleWhileRevalidate(request, url, event));
});
