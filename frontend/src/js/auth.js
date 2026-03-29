import { APP_CONFIG, STORAGE_KEYS } from './config.js';

let clerkBootPromise = null;

function getClerkScript() {
    return document.querySelector('script[data-vibe-clerk="true"]');
}

function getExpectedClerkScriptUrl() {
    return String(APP_CONFIG.clerkScriptUrl || '').trim();
}

function resetClerkBootstrapState() {
    clerkBootPromise = null;
}

function loadClerkScript() {
    const expectedScriptUrl = getExpectedClerkScriptUrl();
    if (!expectedScriptUrl) {
        return Promise.reject(new Error('Clerk frontend API URL is unavailable.'));
    }

    const existing = getClerkScript();
    if (existing) {
        const existingSrc = String(existing.src || '').trim();
        if (existingSrc && existingSrc !== expectedScriptUrl) {
            existing.remove();
            resetClerkBootstrapState();
            if (window.Clerk) {
                try {
                    delete window.Clerk;
                } catch (error) {
                    window.Clerk = undefined;
                }
            }
            return loadClerkScript();
        }

        return new Promise((resolve, reject) => {
            if (window.Clerk) {
                resolve(window.Clerk);
                return;
            }

            existing.addEventListener('load', () => resolve(window.Clerk), { once: true });
            existing.addEventListener('error', () => reject(new Error('Clerk script failed to load.')), { once: true });
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.type = 'text/javascript';
        script.dataset.vibeClerk = 'true';
        script.dataset.clerkPublishableKey = APP_CONFIG.clerkPublishableKey;
        script.src = expectedScriptUrl;
        script.onload = () => resolve(window.Clerk);
        script.onerror = () => reject(new Error('Clerk script failed to load.'));
        document.head.appendChild(script);
    });
}

export async function initClerk() {
    if (clerkBootPromise) return clerkBootPromise;

    clerkBootPromise = (async () => {
        await loadClerkScript();
        if (!window.Clerk) {
            throw new Error('Clerk SDK is unavailable.');
        }

        await window.Clerk.load();
        return window.Clerk;
    })().catch((error) => {
        resetClerkBootstrapState();
        throw error;
    });

    return clerkBootPromise;
}

export async function getSignedInUser() {
    const clerk = await initClerk();
    return clerk.user || null;
}

export async function ensureSignedInOrRedirect(redirectUrl) {
    const user = await getSignedInUser();
    if (user) {
        persistUserProfile(user);
        return user;
    }

    window.location.replace(redirectUrl);
    return null;
}

export async function mountSignIn(container, options = {}) {
    const clerk = await initClerk();
    try {
        clerk.mountSignIn(container, options);
    } catch (error) {
        if (/Ui components/i.test(String(error?.message || ''))) {
            resetClerkBootstrapState();
            const staleScript = getClerkScript();
            if (staleScript) staleScript.remove();
            if (window.Clerk) {
                try {
                    delete window.Clerk;
                } catch (deleteError) {
                    window.Clerk = undefined;
                }
            }

            const freshClerk = await initClerk();
            freshClerk.mountSignIn(container, options);
            return freshClerk;
        }

        throw error;
    }
    return clerk;
}

export async function signOutCurrentUser() {
    const clerk = await initClerk();
    await clerk.signOut();
}

export function persistUserProfile(user) {
    if (!user) return;
    localStorage.setItem(STORAGE_KEYS.userId, user.id);
    localStorage.setItem(STORAGE_KEYS.userName, user.firstName || user.fullName || 'Vibe Listener');
}
