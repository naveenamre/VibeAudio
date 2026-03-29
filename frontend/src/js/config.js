function decodeClerkPublishableKeyFrontendApiUrl(publishableKey) {
    const key = String(publishableKey || '').trim();
    const encodedPart = key.split('_').slice(2).join('_');
    if (!encodedPart || typeof window === 'undefined' || typeof window.atob !== 'function') return '';

    try {
        const normalized = encodedPart.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const decoded = window.atob(padded).replace(/\$/g, '').trim();
        if (!decoded) return '';
        return decoded.startsWith('http') ? decoded : `https://${decoded}`;
    } catch (error) {
        console.warn('Unable to decode Clerk frontend API URL from publishable key.', error);
        return '';
    }
}

const clerkPublishableKey = 'pk_test_cXVhbGl0eS1oYXJlLTk5LmNsZXJrLmFjY291bnRzLmRldiQ';
const clerkFrontendApiUrl = decodeClerkPublishableKeyFrontendApiUrl(clerkPublishableKey);

export const APP_CONFIG = {
    appName: 'VibeAudio',
    catalogBaseUrl: 'https://vibeaudio-db.pages.dev',
    progressUrl: 'https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/',
    getProgressUrl: 'https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/',
    syncUserUrl: 'https://aj7bwk3d72tzj5n2r43lusryg40tosik.lambda-url.ap-south-1.on.aws/',
    clerkPublishableKey,
    clerkFrontendApiUrl,
    clerkScriptUrl: clerkFrontendApiUrl
        ? `${clerkFrontendApiUrl}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`
        : ''
};

export const STORAGE_KEYS = {
    userId: 'vibe_user_id',
    userName: 'vibe_user_name',
    preferredLanguage: 'vibe_pref_lang',
    playbackSpeed: 'vibe_playback_speed',
    recentSearches: 'vibe_recent_searches',
    lastPlayerSession: 'vibe_last_player_session',
    lastOpenedBook: 'vibe_last_opened_book',
    syncStatus: 'vibe_sync_status',
    progressQueue: 'vibe_progress_queue',
    catalogSnapshot: 'vibe_catalog_snapshot'
};

export const SYNC_STATES = {
    synced: 'synced',
    pending: 'pending',
    offline: 'offline'
};

export const CATALOG_URL = `${APP_CONFIG.catalogBaseUrl}/catalog.json`;
