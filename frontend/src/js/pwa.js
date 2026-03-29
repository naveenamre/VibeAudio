const SERVICE_WORKER_URL = new URL('../../service-worker.js', import.meta.url);
const SERVICE_WORKER_SCOPE = new URL('../../', import.meta.url);
const OFFLINE_READY_KEY = 'vibe_offline_shell_ready';
const SHELL_WARMUP_URLS = [
    './',
    './index.html',
    './app.webmanifest',
    './src/pages/app.html'
];

let deferredInstallPrompt = null;

function isStandaloneMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isLikelyMobileDevice() {
    return /android|iphone|ipad|ipod/i.test(navigator.userAgent) || window.matchMedia('(max-width: 920px)').matches;
}

function showPwaToast(message) {
    if (!document.body) return;

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.left = '50%';
    toast.style.bottom = '22px';
    toast.style.transform = 'translateX(-50%)';
    toast.style.padding = '12px 16px';
    toast.style.borderRadius = '14px';
    toast.style.background = 'rgba(8, 12, 24, 0.94)';
    toast.style.color = '#f4f8ff';
    toast.style.border = '1px solid rgba(255,255,255,0.12)';
    toast.style.boxShadow = '0 18px 38px rgba(0,0,0,0.35)';
    toast.style.zIndex = '4000';
    toast.style.fontSize = '0.9rem';
    document.body.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 2800);
}

function readOfflineReadyState() {
    try {
        const raw = localStorage.getItem(OFFLINE_READY_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Unable to read offline readiness state.', error);
        return null;
    }
}

function markOfflineReady(source = 'service-worker') {
    const payload = {
        ready: true,
        source,
        updatedAt: new Date().toISOString()
    };

    try {
        localStorage.setItem(OFFLINE_READY_KEY, JSON.stringify(payload));
    } catch (error) {
        console.warn('Unable to persist offline readiness state.', error);
    }

    window.dispatchEvent(new CustomEvent('vibe-pwa-ready', { detail: payload }));
    return payload;
}

function uniqueAbsoluteUrls(urls = []) {
    return Array.from(new Set(
        urls
            .map((value) => {
                try {
                    return new URL(String(value || ''), window.location.href).href;
                } catch (error) {
                    return '';
                }
            })
            .filter(Boolean)
    ));
}

async function getServiceWorkerTarget() {
    if (!('serviceWorker' in navigator)) return null;

    try {
        const registration = await navigator.serviceWorker.ready;
        return registration?.active || registration?.waiting || navigator.serviceWorker.controller || null;
    } catch (error) {
        console.warn('Service worker is not ready yet.', error);
        return navigator.serviceWorker.controller || null;
    }
}

async function sendServiceWorkerMessage(message) {
    const target = await getServiceWorkerTarget();
    if (!target) return false;

    target.postMessage(message);
    return true;
}

async function primeOfflineResources(urls = []) {
    const normalizedUrls = uniqueAbsoluteUrls([...SHELL_WARMUP_URLS, ...urls]);
    if (!normalizedUrls.length) return false;

    const sent = await sendServiceWorkerMessage({
        type: 'CACHE_URLS',
        urls: normalizedUrls
    });

    if (sent) {
        markOfflineReady('cache-message');
    }

    return sent;
}

function isOfflineShellLikelyReady() {
    if (navigator.serviceWorker?.controller) return true;
    return Boolean(readOfflineReadyState()?.ready);
}

async function requestPersistentStorage() {
    if (!navigator.storage?.persisted || !navigator.storage?.persist) return false;

    try {
        const alreadyPersisted = await navigator.storage.persisted();
        if (alreadyPersisted) {
            markOfflineReady('persistent-storage');
            return true;
        }

        const granted = await navigator.storage.persist();
        if (granted) {
            showPwaToast('Offline shelf storage is now less likely to get cleared by the browser.');
        }
        return granted;
    } catch (error) {
        console.warn('Persistent storage request failed.', error);
        return false;
    }
}

function exposePwaBridge() {
    window.VibePWA = {
        primeOfflineResources,
        isOfflineShellLikelyReady,
        requestPersistentStorage
    };
}

function syncInstallButton() {
    const installBtn = document.getElementById('install-app-btn');
    const standalone = isStandaloneMode();
    document.body?.classList.toggle('is-standalone-app', standalone);

    if (!installBtn) return;

    const shouldShow = !standalone && (Boolean(deferredInstallPrompt) || isLikelyMobileDevice());
    installBtn.hidden = !shouldShow;
    installBtn.classList.toggle('hidden', !shouldShow);

    if (!shouldShow) return;

    installBtn.disabled = false;
    installBtn.innerHTML = '<i class="fas fa-mobile-screen-button"></i> Install App';
    installBtn.title = deferredInstallPrompt
        ? 'Install VibeAudio on your phone'
        : 'Use browser menu and add this app to home screen';
}

async function handleInstallClick() {
    if (isStandaloneMode()) return;

    if (!deferredInstallPrompt) {
        showPwaToast('Browser menu kholo aur "Add to Home Screen" ya "Install App" use karo.');
        return;
    }

    deferredInstallPrompt.prompt();
    try {
        await deferredInstallPrompt.userChoice;
    } catch (error) {
        console.warn('Install prompt was dismissed.', error);
    }

    deferredInstallPrompt = null;
    syncInstallButton();
}

function bindInstallButton() {
    const installBtn = document.getElementById('install-app-btn');
    if (!installBtn || installBtn.dataset.pwaBound === 'true') return;

    installBtn.dataset.pwaBound = 'true';
    installBtn.addEventListener('click', handleInstallClick);
}

async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/i.test(window.location.protocol)) return;

    try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL.href, { scope: SERVICE_WORKER_SCOPE.href });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            markOfflineReady('controller');
        });

        await navigator.serviceWorker.ready;
        markOfflineReady('registration');
        await primeOfflineResources();

        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        await requestPersistentStorage();
    } catch (error) {
        console.warn('Service worker registration failed.', error);
    }
}

window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    bindInstallButton();
    syncInstallButton();
});

window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncInstallButton();
    showPwaToast('VibeAudio installed. Ab app browser ke bahar bhi jaldi khul jayegi.');
});

window.addEventListener('DOMContentLoaded', () => {
    exposePwaBridge();
    bindInstallButton();
    syncInstallButton();
    registerServiceWorker();
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
    syncInstallButton();
});
