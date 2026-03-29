import { STORAGE_KEYS, SYNC_STATES } from './config.js';
import {
    compareProgressFreshness,
    getProgressTimestamp,
    getProgressTimestampValue,
    isBookFinishedProgress,
    normalizeProgressEntry
} from './progress-model.js';

const COMMENTS_KEY_PREFIX = 'vibe_comments';
const BOOKMARKS_KEY_PREFIX = 'vibe_bookmarks';

function readJson(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return parsed ?? fallback;
    } catch (error) {
        console.warn(`Unable to parse local storage key: ${key}`, error);
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function toSafeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

export function getCurrentUserId() {
    return localStorage.getItem(STORAGE_KEYS.userId) || 'guest';
}

export function getCurrentUserName() {
    return localStorage.getItem(STORAGE_KEYS.userName) || 'Vibe Listener';
}

function getScopedCommentsKey() {
    return `${COMMENTS_KEY_PREFIX}:${getCurrentUserId()}`;
}

function getScopedBookmarksKey() {
    return `${BOOKMARKS_KEY_PREFIX}:${getCurrentUserId()}`;
}

function getScopedRecentSearchesKey() {
    return `${STORAGE_KEYS.recentSearches}:${getCurrentUserId()}`;
}

function getCommentsState() {
    return readJson(getScopedCommentsKey(), {});
}

function saveCommentsState(state) {
    writeJson(getScopedCommentsKey(), state);
}

function getBookmarksState() {
    return readJson(getScopedBookmarksKey(), {});
}

function saveBookmarksState(state) {
    writeJson(getScopedBookmarksKey(), state);
}

function sortByCreatedAt(items = []) {
    return [...items].sort((a, b) => {
        const left = Date.parse(a.createdAt || 0) || 0;
        const right = Date.parse(b.createdAt || 0) || 0;
        return left - right;
    });
}

export function getPersistentComments(bookId, seedComments = []) {
    const state = getCommentsState();
    const localComments = Array.isArray(state[String(bookId)]) ? state[String(bookId)] : [];
    const seeded = Array.isArray(seedComments)
        ? seedComments.map((comment, index) => ({
            id: comment.id || `seed-${bookId}-${index}`,
            time: Number(comment.time || 0),
            user: String(comment.user || 'Community'),
            text: String(comment.text || ''),
            createdAt: comment.createdAt || comment.updatedAt || new Date(0).toISOString(),
            source: 'seed'
        }))
        : [];

    const merged = [...seeded, ...localComments];
    return sortByCreatedAt(merged);
}

export function addPersistentComment(bookId, payload) {
    const state = getCommentsState();
    const key = String(bookId);
    const comments = Array.isArray(state[key]) ? state[key] : [];
    const nextComment = {
        id: `comment-${Date.now()}`,
        time: Number(payload.time || 0),
        user: String(payload.user || getCurrentUserName()),
        text: String(payload.text || '').trim(),
        createdAt: new Date().toISOString(),
        source: 'local'
    };

    comments.push(nextComment);
    state[key] = comments;
    saveCommentsState(state);
    return nextComment;
}

export function getBookmarks(bookId) {
    const state = getBookmarksState();
    return sortByCreatedAt(Array.isArray(state[String(bookId)]) ? state[String(bookId)] : []).reverse();
}

export function getAllBookmarks() {
    const state = getBookmarksState();
    return Object.values(state)
        .flatMap((value) => Array.isArray(value) ? value : [])
        .sort((a, b) => (Date.parse(b.createdAt || 0) || 0) - (Date.parse(a.createdAt || 0) || 0));
}

export function addBookmark(book, payload) {
    const state = getBookmarksState();
    const key = String(book.bookId);
    const bookmarks = Array.isArray(state[key]) ? state[key] : [];
    const nextBookmark = {
        id: `bookmark-${Date.now()}`,
        bookId: key,
        title: String(book.title || 'Untitled'),
        cover: String(book.cover || ''),
        chapterIndex: Number(payload.chapterIndex || 0),
        chapterName: String(payload.chapterName || `Part ${Number(payload.chapterIndex || 0) + 1}`),
        time: Number(payload.time || 0),
        label: String(payload.label || `Saved at ${formatBookmarkTime(payload.time || 0)}`),
        createdAt: new Date().toISOString()
    };

    bookmarks.unshift(nextBookmark);
    state[key] = bookmarks.slice(0, 20);
    saveBookmarksState(state);
    return nextBookmark;
}

export function removeBookmark(bookId, bookmarkId) {
    const state = getBookmarksState();
    const key = String(bookId);
    const bookmarks = Array.isArray(state[key]) ? state[key] : [];
    state[key] = bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
    saveBookmarksState(state);
}

function formatBookmarkTime(seconds) {
    const safeSeconds = Math.max(0, Number(seconds || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const remaining = Math.floor(safeSeconds % 60);
    return `${minutes}:${remaining.toString().padStart(2, '0')}`;
}

export function buildProfileSnapshot(history, books) {
    const latestProgressByBook = new Map();
    const safeHistory = Array.isArray(history) ? history : [];

    safeHistory.forEach((entry) => {
        const key = String(entry.bookId);
        const existing = latestProgressByBook.get(key);
        if (!existing || compareProgressFreshness(entry, existing) >= 0) {
            latestProgressByBook.set(key, entry);
        }
    });

    const uniqueHistory = Array.from(latestProgressByBook.values());
    const finishedBooks = uniqueHistory.filter((entry) => isBookFinishedProgress(entry)).length;
    const activeBooks = Math.max(0, uniqueHistory.length - finishedBooks);
    const totalSeconds = uniqueHistory.reduce((sum, entry) => sum + Math.max(0, Number(entry.currentTime || 0)), 0);
    const totalHours = totalSeconds / 3600;
    const bookmarkCount = getAllBookmarks().length;

    const genreCount = new Map();
    uniqueHistory.forEach((entry) => {
        const book = (books || []).find((item) => String(item.bookId) === String(entry.bookId));
        const genre = String(book?.genre || '').trim();
        if (!genre) return;
        genreCount.set(genre, (genreCount.get(genre) || 0) + 1);
    });

    const topGenre = Array.from(genreCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Story-driven picks';

    let summary = 'Your shelf is ready for deeper listening sessions.';
    if (finishedBooks > 0) {
        summary = `You have already finished ${finishedBooks} ${finishedBooks === 1 ? 'book' : 'books'} and built a strong listening habit.`;
    } else if (uniqueHistory.length > 0) {
        summary = `You are currently juggling ${uniqueHistory.length} active stories across your shelf.`;
    }

    return {
        finishedBooks,
        activeBooks,
        totalHours,
        bookmarkCount,
        topGenre,
        summary
    };
}

function buildSessionPayload(stateLike, overrides = {}) {
    const rawBookId = stateLike?.book?.bookId ?? stateLike?.bookId ?? overrides.bookId;
    if (!rawBookId) return null;

    const lastInteractionAt = overrides.lastInteractionAt
        || stateLike?.lastInteractionAt
        || stateLike?.updatedAt
        || new Date().toISOString();

    return {
        userId: getCurrentUserId(),
        bookId: String(rawBookId),
        chapterIndex: Math.max(0, toSafeNumber(stateLike?.currentChapterIndex ?? stateLike?.chapterIndex ?? overrides.chapterIndex, 0)),
        currentTime: Math.max(0, toSafeNumber(stateLike?.currentTime ?? overrides.currentTime, 0)),
        lang: String(stateLike?.lang || overrides.lang || 'hi'),
        lastInteractionAt
    };
}

export function setLastOpenedBook(stateLike, overrides = {}) {
    const payload = buildSessionPayload(stateLike, overrides);
    if (!payload) return null;

    const nextPayload = {
        ...payload,
        lastOpenedAt: overrides.lastOpenedAt || payload.lastInteractionAt
    };

    writeJson(STORAGE_KEYS.lastOpenedBook, nextPayload);
    return nextPayload;
}

export function getLastOpenedBook() {
    const payload = readJson(STORAGE_KEYS.lastOpenedBook, null);
    if (!payload) return null;
    if (payload.userId && payload.userId !== getCurrentUserId()) return null;

    return {
        ...payload,
        lastInteractionAt: payload.lastInteractionAt || payload.updatedAt || payload.lastOpenedAt || null,
        lastOpenedAt: payload.lastOpenedAt || payload.lastInteractionAt || payload.updatedAt || null
    };
}

export function setLastPlayerSession(stateLike, overrides = {}) {
    const payload = buildSessionPayload(stateLike, overrides);
    if (!payload) return null;

    writeJson(STORAGE_KEYS.lastPlayerSession, payload);
    setLastOpenedBook(payload, {
        lastInteractionAt: payload.lastInteractionAt,
        lastOpenedAt: overrides.lastOpenedAt || payload.lastInteractionAt
    });

    return payload;
}

export function getLastPlayerSession() {
    const payload = readJson(STORAGE_KEYS.lastPlayerSession, null);
    if (!payload) return null;
    if (payload.userId && payload.userId !== getCurrentUserId()) return null;

    return {
        ...payload,
        lastInteractionAt: payload.lastInteractionAt || payload.updatedAt || payload.lastOpenedAt || null
    };
}

export function getRecentSearches() {
    const searches = readJson(getScopedRecentSearchesKey(), []);
    return Array.isArray(searches) ? searches : [];
}

export function pushRecentSearch(query) {
    const value = String(query || '').trim();
    if (value.length < 2) return getRecentSearches();

    const existing = getRecentSearches().filter((item) => item.toLowerCase() !== value.toLowerCase());
    const next = [value, ...existing].slice(0, 8);
    writeJson(getScopedRecentSearchesKey(), next);
    return next;
}

export function getCatalogSnapshot() {
    const payload = readJson(STORAGE_KEYS.catalogSnapshot, null);
    const books = Array.isArray(payload?.books) ? payload.books : [];
    return {
        books,
        updatedAt: payload?.updatedAt || null
    };
}

export function setCatalogSnapshot(books) {
    const payload = {
        updatedAt: new Date().toISOString(),
        books: Array.isArray(books) ? books : []
    };

    writeJson(STORAGE_KEYS.catalogSnapshot, payload);
    return payload;
}

export function getPendingProgressQueue() {
    const queue = readJson(STORAGE_KEYS.progressQueue, {});
    return queue && typeof queue === 'object' ? queue : {};
}

function buildPendingQueueKey(userId, bookId) {
    const safeUserId = String(userId || getCurrentUserId() || '').trim();
    return `${safeUserId}:${String(bookId || '').trim()}`;
}

export function getPendingProgressEntries() {
    const activeUserId = getCurrentUserId();
    return Object.values(getPendingProgressQueue())
        .map((entry) => normalizeProgressEntry(entry, { source: 'pending' }))
        .filter((entry) => !entry?.userId || entry.userId === activeUserId)
        .filter(Boolean)
        .sort((a, b) => getProgressTimestampValue(b) - getProgressTimestampValue(a));
}

export function replacePendingProgressQueue(queue) {
    writeJson(STORAGE_KEYS.progressQueue, queue && typeof queue === 'object' ? queue : {});
    return getPendingProgressQueue();
}

export function upsertPendingProgress(progress) {
    const normalized = normalizeProgressEntry(progress, { source: 'pending' });
    if (!normalized) return getPendingProgressQueue();

    const queue = getPendingProgressQueue();
    queue[buildPendingQueueKey(normalized.userId, normalized.bookId)] = normalized;
    replacePendingProgressQueue(queue);
    return queue;
}

export function removePendingProgress(bookId) {
    const queue = getPendingProgressQueue();
    delete queue[String(bookId)];
    delete queue[buildPendingQueueKey(getCurrentUserId(), bookId)];

    Object.keys(queue).forEach((key) => {
        const value = normalizeProgressEntry(queue[key], { source: 'pending' });
        if (value && String(value.bookId) === String(bookId) && value.userId === getCurrentUserId()) {
            delete queue[key];
        }
    });

    replacePendingProgressQueue(queue);
    return queue;
}

function emitSyncStatus(status) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('sync-status-change', { detail: status }));
}

export function getSyncStatus() {
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    const fallbackStatus = isOffline ? SYNC_STATES.offline : SYNC_STATES.synced;
    const payload = readJson(STORAGE_KEYS.syncStatus, null);
    const pendingCount = getPendingProgressEntries().length;

    if (!payload) {
        return {
            status: isOffline ? SYNC_STATES.offline : (pendingCount > 0 ? SYNC_STATES.pending : fallbackStatus),
            updatedAt: null,
            lastSuccessfulSyncAt: null,
            pendingCount
        };
    }

    return {
        status: isOffline
            ? SYNC_STATES.offline
            : (pendingCount > 0
                ? SYNC_STATES.pending
                : (Object.values(SYNC_STATES).includes(payload.status) ? payload.status : fallbackStatus)),
        updatedAt: payload.updatedAt || null,
        lastSuccessfulSyncAt: payload.lastSuccessfulSyncAt || null,
        pendingCount,
        reason: payload.reason || ''
    };
}

export function setSyncStatus(status, meta = {}) {
    const current = getSyncStatus();
    const next = {
        ...current,
        ...meta,
        status,
        updatedAt: meta.updatedAt || new Date().toISOString(),
        pendingCount: typeof meta.pendingCount === 'number' ? meta.pendingCount : current.pendingCount
    };

    if (status === SYNC_STATES.synced) {
        next.lastSuccessfulSyncAt = meta.lastSuccessfulSyncAt || next.updatedAt;
    }

    writeJson(STORAGE_KEYS.syncStatus, next);
    emitSyncStatus(next);
    return next;
}

export function getLastSyncTimestamp() {
    const status = getSyncStatus();
    return getProgressTimestamp({ lastInteractionAt: status.lastSuccessfulSyncAt || status.updatedAt });
}
