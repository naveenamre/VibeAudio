import { APP_CONFIG, STORAGE_KEYS } from './config.js';

let clerkBootPromise = null;

function getClerkScript() {
    return document.querySelector('script[data-vibe-clerk="true"]');
}

function loadClerkScript() {
    const existing = getClerkScript();
    if (existing) {
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
        script.dataset.vibeClerk = 'true';
        script.dataset.clerkPublishableKey = APP_CONFIG.clerkPublishableKey;
        script.src = APP_CONFIG.clerkScriptUrl;
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
    })();

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
    clerk.mountSignIn(container, options);
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
