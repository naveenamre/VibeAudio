import { APP_CONFIG, CATALOG_URL, STORAGE_KEYS, SYNC_STATES } from './config.js';
import {
    buildProgressStorageKey,
    compareProgressFreshness,
    normalizeProgressEntry
} from './progress-model.js';
import {
    getCatalogSnapshot,
    getPendingProgressEntries,
    removePendingProgress,
    setCatalogSnapshot,
    setSyncStatus,
    upsertPendingProgress
} from './user-data.js';

const bookCache = new Map();
let progressCache = null;
let progressCacheStamp = 0;
let syncLifecycleBound = false;

const PROGRESS_CACHE_TTL_MS = 20 * 1000;
const BOOK_DETAIL_CACHE_PREFIX = 'vibe_book_detail:';

function getUserId() {
    return localStorage.getItem(STORAGE_KEYS.userId);
}

export function invalidateProgressCache() {
    progressCache = null;
    progressCacheStamp = 0;
}

export async function syncUserProfile() {
    const userId = getUserId();
    const name = localStorage.getItem(STORAGE_KEYS.userName) || 'Vibe User';
    if (!userId) return;

    try {
        await fetch(APP_CONFIG.syncUserUrl, {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, name, action: 'sync' })
        });
    } catch (error) {
        console.warn('Profile sync skipped.', error);
    }
}

function getBookDetailStorageKey(dataPath) {
    return `${BOOK_DETAIL_CACHE_PREFIX}${encodeURIComponent(String(dataPath || ''))}`;
}

function readCachedBookDetail(dataPath) {
    if (!dataPath) return null;

    try {
        const raw = localStorage.getItem(getBookDetailStorageKey(dataPath));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        console.warn('Skipping invalid cached book detail.', error);
        return null;
    }
}

function writeCachedBookDetail(dataPath, data) {
    if (!dataPath || !data) return;
    localStorage.setItem(getBookDetailStorageKey(dataPath), JSON.stringify(data));
}

function bindSyncLifecycle() {
    if (syncLifecycleBound || typeof window === 'undefined') return;
    syncLifecycleBound = true;

    window.addEventListener('online', () => {
        flushPendingProgressQueue();
    });

    window.addEventListener('offline', () => {
        setSyncStatus(SYNC_STATES.offline, {
            pendingCount: getPendingProgressEntries().length,
            reason: 'offline'
        });
    });
}

function getLocalProgressEntries() {
    const activeUserId = getUserId();
    const localData = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key?.startsWith('vibe_progress_')) continue;

        try {
            const value = JSON.parse(localStorage.getItem(key));
            const normalized = normalizeProgressEntry(value, { source: 'local' });
            if (!normalized) continue;
            if (normalized.userId && activeUserId && normalized.userId !== activeUserId) continue;
            localData.push(normalized);
        } catch (error) {
            console.warn(`Skipping invalid progress entry for key: ${key}`, error);
        }
    }

    return localData;
}

function writeLocalProgressEntry(payload) {
    const normalized = normalizeProgressEntry(payload, { source: 'local' });
    if (!normalized?.bookId) return null;
    localStorage.setItem(buildProgressStorageKey(normalized.bookId, normalized.userId), JSON.stringify(normalized));
    invalidateProgressCache();
    return normalized;
}

async function postProgressPayload(payload) {
    const response = await fetch(APP_CONFIG.progressUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Progress save failed with status ${response.status}`);
    }
}

export async function fetchAllBooks(options = {}) {
    const snapshot = getCatalogSnapshot();
    const forceRefresh = Boolean(options.forceRefresh);
    const preferSnapshot = Boolean(options.preferSnapshot);

    if (preferSnapshot && snapshot.books.length) {
        return snapshot.books;
    }

    try {
        const response = await fetch(CATALOG_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Catalog load failed.');
        const data = await response.json();
        if (Array.isArray(data) && data.length) {
            setCatalogSnapshot(data);
            return data;
        }
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Catalog Error:', error);
        if (!forceRefresh && snapshot.books.length) {
            return snapshot.books;
        }
        return snapshot.books;
    }
}

export async function fetchBookDetails(dataPath) {
    if (!dataPath) return null;
    if (bookCache.has(dataPath)) return bookCache.get(dataPath);

    try {
        const response = await fetch(dataPath, { cache: 'no-cache' });
        if (!response.ok) throw new Error('Book detail fetch failed.');
        const data = await response.json();
        bookCache.set(dataPath, data);
        writeCachedBookDetail(dataPath, data);
        return data;
    } catch (error) {
        console.error('Detail Fetch Error:', error);
        const cached = readCachedBookDetail(dataPath);
        if (cached) {
            bookCache.set(dataPath, cached);
            return cached;
        }
        return null;
    }
}

export async function saveUserProgress(bookId, chapterIndex, currentTime, totalDuration, options = {}) {
    bindSyncLifecycle();

    const userId = getUserId();
    if (!userId) return null;

    const safeChapterIndex = Number(chapterIndex);
    const safeCurrentTime = Number(currentTime);
    const safeTotalDuration = Number(totalDuration);
    const lastInteractionAt = options.lastInteractionAt || new Date().toISOString();
    const totalChapters = Number.isFinite(Number(options.totalChapters)) ? Number(options.totalChapters) : undefined;

    const normalizedPayload = normalizeProgressEntry({
        userId,
        bookId: String(bookId),
        chapterIndex: Number.isFinite(safeChapterIndex) ? safeChapterIndex : 0,
        currentTime: Number.isFinite(safeCurrentTime) ? safeCurrentTime : 0,
        totalDuration: Number.isFinite(safeTotalDuration) ? safeTotalDuration : 0,
        totalChapters,
        lastInteractionAt,
        bookFinished: typeof options.bookFinished === 'boolean' ? options.bookFinished : undefined,
        currentChapterFinished: typeof options.currentChapterFinished === 'boolean' ? options.currentChapterFinished : undefined
    }, { source: 'local' });

    if (!normalizedPayload) return null;

    writeLocalProgressEntry(normalizedPayload);

    const shouldSendToServer = options.allowServer !== false
        && (
            Boolean(options.forceServer)
            || normalizedPayload.currentTime >= 5
            || normalizedPayload.bookFinished
            || Boolean(options.queueSync)
        );

    if (!shouldSendToServer) {
        return normalizedPayload;
    }

    if (!navigator.onLine) {
        upsertPendingProgress(normalizedPayload);
        setSyncStatus(SYNC_STATES.offline, {
            pendingCount: getPendingProgressEntries().length,
            reason: 'offline'
        });
        return normalizedPayload;
    }

    try {
        await postProgressPayload(normalizedPayload);
        removePendingProgress(normalizedPayload.bookId);
        setSyncStatus(SYNC_STATES.synced, {
            pendingCount: getPendingProgressEntries().length,
            lastSuccessfulSyncAt: normalizedPayload.lastInteractionAt,
            reason: ''
        });
    } catch (error) {
        upsertPendingProgress(normalizedPayload);
        setSyncStatus(SYNC_STATES.pending, {
            pendingCount: getPendingProgressEntries().length,
            reason: 'save-failed'
        });
        console.warn('Cloud progress save failed. Local state retained.', error);
    }

    return normalizedPayload;
}

export async function flushPendingProgressQueue() {
    bindSyncLifecycle();

    const userId = getUserId();
    if (!userId) return false;

    const pendingEntries = getPendingProgressEntries();
    if (!pendingEntries.length) {
        setSyncStatus(navigator.onLine ? SYNC_STATES.synced : SYNC_STATES.offline, {
            pendingCount: 0,
            reason: navigator.onLine ? '' : 'offline'
        });
        return true;
    }

    if (!navigator.onLine) {
        setSyncStatus(SYNC_STATES.offline, {
            pendingCount: pendingEntries.length,
            reason: 'offline'
        });
        return false;
    }

    setSyncStatus(SYNC_STATES.pending, {
        pendingCount: pendingEntries.length,
        reason: 'queue-flush'
    });

    for (const entry of pendingEntries) {
        try {
            await postProgressPayload({
                ...entry,
                userId
            });
            removePendingProgress(entry.bookId);
        } catch (error) {
            console.warn(`Unable to flush pending progress for ${entry.bookId}.`, error);
        }
    }

    const remainingEntries = getPendingProgressEntries();
    setSyncStatus(remainingEntries.length ? SYNC_STATES.pending : SYNC_STATES.synced, {
        pendingCount: remainingEntries.length,
        lastSuccessfulSyncAt: remainingEntries.length ? null : new Date().toISOString(),
        reason: remainingEntries.length ? 'queue-still-pending' : ''
    });

    return remainingEntries.length === 0;
}

export async function fetchUserProgress(options = {}) {
    bindSyncLifecycle();

    const userId = getUserId();
    if (!userId) return [];

    const forceRefresh = Boolean(options.forceRefresh);
    const now = Date.now();
    if (!forceRefresh && progressCache && (now - progressCacheStamp) < PROGRESS_CACHE_TTL_MS) {
        return progressCache;
    }

    let cloudData = [];
    const localData = getLocalProgressEntries();

    if (navigator.onLine) {
        await flushPendingProgressQueue();

        try {
            const response = await fetch(`${APP_CONFIG.getProgressUrl}?userId=${encodeURIComponent(userId)}`);
            if (!response.ok) {
                throw new Error(`History fetch failed with status ${response.status}`);
            }
            const data = await response.json();
            const rawCloudData = Array.isArray(data?.progress) ? data.progress : (Array.isArray(data) ? data : []);
            cloudData = rawCloudData
                .map((item) => normalizeProgressEntry(item, { source: 'cloud' }))
                .filter(Boolean);
            setSyncStatus(getPendingProgressEntries().length ? SYNC_STATES.pending : SYNC_STATES.synced, {
                pendingCount: getPendingProgressEntries().length,
                lastSuccessfulSyncAt: new Date().toISOString(),
                reason: ''
            });
        } catch (error) {
            setSyncStatus(getPendingProgressEntries().length ? SYNC_STATES.pending : SYNC_STATES.offline, {
                pendingCount: getPendingProgressEntries().length,
                reason: 'history-fetch-failed'
            });
            console.warn('Cloud history fetch failed. Using local progress only.', error);
        }
    } else {
        setSyncStatus(SYNC_STATES.offline, {
            pendingCount: getPendingProgressEntries().length,
            reason: 'offline'
        });
    }

    const merged = new Map();
    cloudData.forEach((item) => merged.set(String(item.bookId), item));
    localData.forEach((localItem) => {
        const key = String(localItem.bookId);
        const cloudItem = merged.get(key);
        if (!cloudItem || compareProgressFreshness(localItem, cloudItem) >= 0) {
            merged.set(key, localItem);
        }
    });

    progressCache = Array.from(merged.values()).sort((left, right) => compareProgressFreshness(right, left));
    progressCacheStamp = now;
    return progressCache;
}

export function getLocalUserProfile() {
    return {
        id: localStorage.getItem(STORAGE_KEYS.userId),
        name: localStorage.getItem(STORAGE_KEYS.userName) || 'Vibe User'
    };
}
