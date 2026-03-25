const SERVICE_WORKER_URL = new URL('../../service-worker.js', import.meta.url);
const SERVICE_WORKER_SCOPE = new URL('../../', import.meta.url);

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
        await navigator.serviceWorker.register(SERVICE_WORKER_URL.href, { scope: SERVICE_WORKER_SCOPE.href });
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
    bindInstallButton();
    syncInstallButton();
    registerServiceWorker();
});

window.matchMedia('(display-mode: standalone)').addEventListener?.('change', () => {
    syncInstallButton();
});
