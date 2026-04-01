import { STORAGE_KEYS } from './config.js';
import { getCurrentUserId } from './user-data.js';

const DB_NAME = 'vibeaudio-offline-v1';
const DB_VERSION = 1;

const STORE_NAMES = {
    books: 'offline_books',
    chapters: 'offline_chapters',
    jobs: 'offline_jobs',
    settings: 'offline_settings',
    stats: 'offline_storage_stats'
};

export const OFFLINE_STATES = {
    notDownloaded: 'not_downloaded',
    queued: 'queued',
    downloading: 'downloading',
    downloaded: 'downloaded',
    failed: 'failed',
    updateAvailable: 'update_available'
};

const JOB_RETRY_DELAYS_MS = [10_000, 25_000, 60_000];
const DOWNLOADABLE_AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.oga', '.opus', '.flac'];

let dbPromise = null;
let queuePromise = null;
let activeDownloadController = null;

function getActiveUserId() {
    return localStorage.getItem(STORAGE_KEYS.userId) || getCurrentUserId() || 'guest';
}

function normalizeLang(lang = 'hi') {
    return String(lang || 'hi').toLowerCase() === 'en' ? 'en' : 'hi';
}

function bookRecordId(userId, bookId, lang) {
    return `${userId}::${String(bookId)}::${normalizeLang(lang)}`;
}

function chapterRecordId(userId, bookId, lang, chapterIndex) {
    return `${bookRecordId(userId, bookId, lang)}::${Number(chapterIndex)}`;
}

function jobRecordId(userId, bookId, lang, chapterIndex) {
    return `job::${chapterRecordId(userId, bookId, lang, chapterIndex)}`;
}

function getTimeValue(value) {
    const stamp = Date.parse(value || 0);
    return Number.isFinite(stamp) ? stamp : 0;
}

function toSafeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function isYouTubeUrl(url) {
    if (!url) return false;

    try {
        const parsed = new URL(url, window.location.href);
        const host = parsed.hostname.replace(/^www\./, '');
        return host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com';
    } catch (error) {
        return /(?:youtube\.com|youtu\.be)/i.test(String(url));
    }
}

function normalizeSourceFingerprint(chapter = {}) {
    if (chapter.versionTag) return `tag:${String(chapter.versionTag)}`;
    if (chapter.checksum) return `checksum:${String(chapter.checksum)}`;

    const url = String(chapter.url || '').trim();
    if (!url) return 'missing-url';

    try {
        const parsed = new URL(url, window.location.href);
        return `${parsed.origin}${parsed.pathname}`;
    } catch (error) {
        return url.split('?')[0].split('#')[0];
    }
}

function buildChapterMeta(chapter = {}, chapterIndex = 0) {
    return {
        chapterIndex: Math.max(0, Number(chapterIndex) || 0),
        name: String(chapter.name || `Part ${Number(chapterIndex) + 1}`),
        section: String(chapter.section || ''),
        url: String(chapter.url || ''),
        downloadable: chapter.downloadable !== false,
        mimeType: chapter.mimeType ? String(chapter.mimeType) : '',
        sizeBytes: toSafeNumber(chapter.sizeBytes, 0),
        versionTag: chapter.versionTag ? String(chapter.versionTag) : '',
        checksum: chapter.checksum ? String(chapter.checksum) : '',
        sourceFingerprint: normalizeSourceFingerprint(chapter)
    };
}

function sanitizeChapterSnapshot(chapter = {}, chapterIndex = 0) {
    return {
        name: String(chapter.name || `Part ${Number(chapterIndex) + 1}`),
        section: String(chapter.section || ''),
        url: String(chapter.url || ''),
        downloadable: chapter.downloadable !== false,
        mimeType: chapter.mimeType ? String(chapter.mimeType) : '',
        sizeBytes: toSafeNumber(chapter.sizeBytes, 0),
        versionTag: chapter.versionTag ? String(chapter.versionTag) : '',
        checksum: chapter.checksum ? String(chapter.checksum) : ''
    };
}

function sanitizeBookSnapshot(book = {}) {
    const chapters = Array.isArray(book.chapters) ? book.chapters : [];
    const chaptersEn = Array.isArray(book.chapters_en) ? book.chapters_en : [];

    return {
        bookId: String(book.bookId || ''),
        title: String(book.title || 'Untitled'),
        author: String(book.author || 'Unknown author'),
        cover: String(book.cover || book.coverImage || ''),
        description: String(book.description || ''),
        genre: String(book.genre || ''),
        moods: Array.isArray(book.moods) ? book.moods.map((value) => String(value)) : [],
        totalChapters: Number(book.totalChapters || chapters.length || chaptersEn.length || 0),
        dataPath: String(book.dataPath || ''),
        chapters: chapters.map((chapter, index) => sanitizeChapterSnapshot(chapter, index)),
        chapters_en: chaptersEn.map((chapter, index) => sanitizeChapterSnapshot(chapter, index))
    };
}

function getActiveChaptersForLanguage(book, lang) {
    const normalizedLang = normalizeLang(lang);
    if (normalizedLang === 'en' && Array.isArray(book?.chapters_en) && book.chapters_en.length) {
        return book.chapters_en;
    }

    return Array.isArray(book?.chapters) ? book.chapters : [];
}

function getChapterForLanguage(book, lang, chapterIndex) {
    const chapters = getActiveChaptersForLanguage(book, lang);
    return chapters[Number(chapterIndex) || 0] || null;
}

function isBrowserOfflineSupported() {
    return typeof indexedDB !== 'undefined';
}

function supportsOpfs() {
    return Boolean(navigator.storage?.getDirectory);
}

function canDownloadChapter(chapter) {
    if (!chapter?.url) {
        return {
            downloadable: false,
            reason: 'Source link is missing'
        };
    }

    if (chapter.downloadable === false) {
        return {
            downloadable: false,
            reason: 'This chapter is marked streaming-only'
        };
    }

    if (isYouTubeUrl(chapter.url)) {
        return {
            downloadable: false,
            reason: 'YouTube sources stay streaming-only in browser'
        };
    }

    try {
        const parsed = new URL(chapter.url, window.location.href);
        if (DOWNLOADABLE_AUDIO_EXTENSIONS.some((extension) => parsed.pathname.toLowerCase().endsWith(extension))) {
            return { downloadable: true, reason: '' };
        }
    } catch (error) {
        if (DOWNLOADABLE_AUDIO_EXTENSIONS.some((extension) => String(chapter.url).toLowerCase().includes(extension))) {
            return { downloadable: true, reason: '' };
        }
    }

    return {
        downloadable: true,
        reason: ''
    };
}

function emitOfflineChange(type, detail = {}) {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('offline-shelf-change', {
        detail: {
            type,
            userId: getActiveUserId(),
            ...detail
        }
    }));
}

function openDatabase() {
    if (!isBrowserOfflineSupported()) {
        return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
    }

    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error || new Error('Unable to open offline database.'));
        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(STORE_NAMES.books)) {
                const store = db.createObjectStore(STORE_NAMES.books, { keyPath: 'id' });
                store.createIndex('by_user', 'userId');
                store.createIndex('by_user_book', ['userId', 'bookId']);
            }

            if (!db.objectStoreNames.contains(STORE_NAMES.chapters)) {
                const store = db.createObjectStore(STORE_NAMES.chapters, { keyPath: 'id' });
                store.createIndex('by_user', 'userId');
                store.createIndex('by_user_book', ['userId', 'bookId']);
                store.createIndex('by_user_book_lang', ['userId', 'bookId', 'lang']);
                store.createIndex('by_user_status', ['userId', 'status']);
            }

            if (!db.objectStoreNames.contains(STORE_NAMES.jobs)) {
                const store = db.createObjectStore(STORE_NAMES.jobs, { keyPath: 'id' });
                store.createIndex('by_user', 'userId');
                store.createIndex('by_user_status', ['userId', 'status']);
                store.createIndex('by_user_next_attempt', ['userId', 'nextAttemptAt']);
            }

            if (!db.objectStoreNames.contains(STORE_NAMES.settings)) {
                db.createObjectStore(STORE_NAMES.settings, { keyPath: 'id' });
            }

            if (!db.objectStoreNames.contains(STORE_NAMES.stats)) {
                const store = db.createObjectStore(STORE_NAMES.stats, { keyPath: 'id' });
                store.createIndex('by_user', 'userId');
            }
        };

        request.onsuccess = () => resolve(request.result);
    });

    return dbPromise;
}

async function withStore(storeName, mode, callback) {
    const db = await openDatabase();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;

        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error(`Transaction failed for ${storeName}.`));
        transaction.onabort = () => reject(transaction.error || new Error(`Transaction aborted for ${storeName}.`));

        Promise.resolve(callback(store, transaction))
            .then((value) => {
                result = value;
            })
            .catch((error) => {
                try {
                    transaction.abort();
                } catch (abortError) {
                    console.warn('Unable to abort transaction cleanly.', abortError);
                }
                reject(error);
            });
    });
}

function requestToPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
}

async function getRecord(storeName, id) {
    return withStore(storeName, 'readonly', async (store) => requestToPromise(store.get(id)));
}

async function putRecord(storeName, value) {
    return withStore(storeName, 'readwrite', async (store) => requestToPromise(store.put(value)));
}

async function deleteRecord(storeName, id) {
    return withStore(storeName, 'readwrite', async (store) => requestToPromise(store.delete(id)));
}

async function getAllRecords(storeName, indexName = '', query = null) {
    return withStore(storeName, 'readonly', async (store) => {
        const source = indexName ? store.index(indexName) : store;
        return requestToPromise(source.getAll(query));
    });
}

async function getStorageRoot() {
    if (!supportsOpfs()) return null;
    return navigator.storage.getDirectory();
}

function buildOpfsPath(userId, bookId, lang, chapterIndex) {
    return ['offline-audio', userId, String(bookId), normalizeLang(lang), `${Number(chapterIndex)}.bin`];
}

async function ensureOpfsDirectory(pathSegments) {
    let current = await getStorageRoot();
    if (!current) return null;

    for (const segment of pathSegments) {
        current = await current.getDirectoryHandle(segment, { create: true });
    }

    return current;
}

async function writeBlobToOpfs(pathSegments, blob) {
    const directoryPath = pathSegments.slice(0, -1);
    const fileName = pathSegments[pathSegments.length - 1];
    const directory = await ensureOpfsDirectory(directoryPath);
    if (!directory) return null;

    const fileHandle = await directory.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(blob);
    await writable.close();

    return pathSegments.join('/');
}

async function deleteBlobFromOpfs(path) {
    if (!path || !supportsOpfs()) return false;

    const segments = String(path).split('/').filter(Boolean);
    const fileName = segments.pop();
    let directory = await getStorageRoot();
    if (!directory || !fileName) return false;

    for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment, { create: false });
    }

    await directory.removeEntry(fileName);
    return true;
}

async function readBlobFromOpfs(path) {
    if (!path || !supportsOpfs()) return null;

    const segments = String(path).split('/').filter(Boolean);
    const fileName = segments.pop();
    let directory = await getStorageRoot();
    if (!directory || !fileName) return null;

    for (const segment of segments) {
        directory = await directory.getDirectoryHandle(segment, { create: false });
    }

    const fileHandle = await directory.getFileHandle(fileName, { create: false });
    return fileHandle.getFile();
}

async function updateStorageStats(userId = getActiveUserId()) {
    const chapters = (await getAllRecords(STORE_NAMES.chapters, 'by_user', IDBKeyRange.only(userId)))
        .filter((record) => record.status === OFFLINE_STATES.downloaded || record.status === OFFLINE_STATES.updateAvailable);
    const jobs = await getAllRecords(STORE_NAMES.jobs, 'by_user', IDBKeyRange.only(userId));
    const uniqueBooks = new Set(chapters.map((record) => String(record.bookId)));

    let usage = 0;
    let quota = 0;
    if (navigator.storage?.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            usage = toSafeNumber(estimate?.usage, 0);
            quota = toSafeNumber(estimate?.quota, 0);
        } catch (error) {
            console.warn('Browser storage estimate unavailable.', error);
        }
    }

    const downloadedBytes = chapters.reduce((sum, record) => sum + Math.max(0, toSafeNumber(record.sizeBytes, 0)), 0);
    const stats = {
        id: `stats::${userId}`,
        userId,
        downloadedBytes,
        downloadedChapters: chapters.length,
        downloadedBooks: uniqueBooks.size,
        pendingJobs: jobs.filter((job) => job.status === OFFLINE_STATES.queued || job.status === OFFLINE_STATES.downloading).length,
        failedJobs: jobs.filter((job) => job.status === OFFLINE_STATES.failed).length,
        browserUsageBytes: usage,
        browserQuotaBytes: quota,
        storageMode: supportsOpfs() ? 'opfs' : 'indexeddb_blob',
        updatedAt: new Date().toISOString()
    };

    await putRecord(STORE_NAMES.stats, stats);
    return stats;
}

async function probeRemoteAudio(chapter) {
    if (!navigator.onLine || !chapter?.url || isYouTubeUrl(chapter.url)) {
        return {
            mimeType: chapter?.mimeType ? String(chapter.mimeType) : '',
            sizeBytes: toSafeNumber(chapter?.sizeBytes, 0)
        };
    }

    try {
        const response = await fetch(chapter.url, { method: 'HEAD' });
        if (!response.ok) throw new Error(`HEAD request failed with ${response.status}`);

        return {
            mimeType: String(response.headers.get('content-type') || chapter.mimeType || ''),
            sizeBytes: toSafeNumber(response.headers.get('content-length') || chapter.sizeBytes, 0)
        };
    } catch (error) {
        return {
            mimeType: chapter?.mimeType ? String(chapter.mimeType) : '',
            sizeBytes: toSafeNumber(chapter?.sizeBytes, 0)
        };
    }
}

async function ensureBookRecord(book, lang) {
    const userId = getActiveUserId();
    const normalizedLang = normalizeLang(lang);
    const id = bookRecordId(userId, book.bookId, normalizedLang);
    const existing = await getRecord(STORE_NAMES.books, id);
    const now = new Date().toISOString();

    const baseRecord = {
        id,
        userId,
        bookId: String(book.bookId),
        lang: normalizedLang,
        title: String(book.title || 'Untitled'),
        author: String(book.author || 'Unknown author'),
        cover: String(book.cover || book.coverImage || ''),
        description: String(book.description || ''),
        genre: String(book.genre || ''),
        moods: Array.isArray(book.moods) ? book.moods.map((value) => String(value)) : [],
        dataPath: String(book.dataPath || ''),
        totalChapters: Number(book.totalChapters || getActiveChaptersForLanguage(book, normalizedLang).length || 0),
        bookSnapshot: sanitizeBookSnapshot(book),
        updatedAt: now,
        createdAt: existing?.createdAt || now
    };

    const nextRecord = {
        ...existing,
        ...baseRecord
    };

    await putRecord(STORE_NAMES.books, nextRecord);
    return nextRecord;
}

async function upsertChapterRecord(book, chapter, lang, chapterIndex, overrides = {}) {
    const userId = getActiveUserId();
    const normalizedLang = normalizeLang(lang);
    const id = chapterRecordId(userId, book.bookId, normalizedLang, chapterIndex);
    const existing = await getRecord(STORE_NAMES.chapters, id);
    const probedMeta = overrides.skipProbe ? {
        mimeType: chapter.mimeType ? String(chapter.mimeType) : '',
        sizeBytes: toSafeNumber(chapter.sizeBytes, 0)
    } : await probeRemoteAudio(chapter);
    const baseMeta = buildChapterMeta(chapter, chapterIndex);
    const now = new Date().toISOString();

    const nextRecord = {
        ...existing,
        id,
        userId,
        bookId: String(book.bookId),
        lang: normalizedLang,
        title: String(book.title || 'Untitled'),
        author: String(book.author || 'Unknown author'),
        cover: String(book.cover || book.coverImage || ''),
        chapterIndex: Number(chapterIndex),
        chapterName: baseMeta.name,
        section: baseMeta.section,
        originalUrl: baseMeta.url,
        downloadable: baseMeta.downloadable,
        mimeType: probedMeta.mimeType || baseMeta.mimeType || existing?.mimeType || '',
        sizeBytes: probedMeta.sizeBytes || baseMeta.sizeBytes || existing?.sizeBytes || 0,
        versionTag: baseMeta.versionTag,
        checksum: baseMeta.checksum,
        sourceFingerprint: baseMeta.sourceFingerprint,
        status: overrides.status || existing?.status || OFFLINE_STATES.notDownloaded,
        storageType: overrides.storageType || existing?.storageType || '',
        opfsPath: overrides.opfsPath === undefined ? existing?.opfsPath || '' : overrides.opfsPath,
        fallbackBlob: overrides.fallbackBlob === undefined ? existing?.fallbackBlob || null : overrides.fallbackBlob,
        downloadedAt: overrides.downloadedAt === undefined ? existing?.downloadedAt || null : overrides.downloadedAt,
        validatedAt: overrides.validatedAt === undefined ? existing?.validatedAt || null : overrides.validatedAt,
        progressBytes: toSafeNumber(overrides.progressBytes, existing?.progressBytes || 0),
        progressPercent: toSafeNumber(overrides.progressPercent, existing?.progressPercent || 0),
        errorReason: overrides.errorReason === undefined ? existing?.errorReason || '' : overrides.errorReason,
        lastTouchedAt: now,
        createdAt: existing?.createdAt || now
    };

    await putRecord(STORE_NAMES.chapters, nextRecord);
    return nextRecord;
}

async function upsertJobRecord(book, lang, chapterIndex, status = OFFLINE_STATES.queued, overrides = {}) {
    const userId = getActiveUserId();
    const normalizedLang = normalizeLang(lang);
    const id = jobRecordId(userId, book.bookId, normalizedLang, chapterIndex);
    const existing = await getRecord(STORE_NAMES.jobs, id);
    const now = new Date().toISOString();

    const nextRecord = {
        ...existing,
        id,
        userId,
        bookId: String(book.bookId),
        lang: normalizedLang,
        chapterIndex: Number(chapterIndex),
        status,
        retries: toSafeNumber(overrides.retries, existing?.retries || 0),
        nextAttemptAt: overrides.nextAttemptAt || existing?.nextAttemptAt || now,
        priority: toSafeNumber(overrides.priority, existing?.priority || Date.now()),
        queuedAt: existing?.queuedAt || now,
        updatedAt: now,
        errorReason: overrides.errorReason === undefined ? existing?.errorReason || '' : overrides.errorReason
    };

    await putRecord(STORE_NAMES.jobs, nextRecord);
    return nextRecord;
}

function getBookDownloadOrder(book, lang, startingChapterIndex = 0) {
    const chapters = getActiveChaptersForLanguage(book, lang);
    const total = chapters.length;
    const safeStart = Math.max(0, Math.min(total - 1, Number(startingChapterIndex) || 0));
    const ordered = [];

    if (!total) return ordered;

    const pushIndex = (value) => {
        if (value < 0 || value >= total || ordered.includes(value)) return;
        ordered.push(value);
    };

    pushIndex(safeStart);
    pushIndex(safeStart + 1);
    pushIndex(safeStart + 2);

    for (let index = 0; index < total; index += 1) {
        pushIndex(index);
    }

    return ordered;
}

function mergeBookSummary(existing, record) {
    if (!existing) {
        return {
            bookId: String(record.bookId),
            title: String(record.title || 'Untitled'),
            author: String(record.author || 'Unknown author'),
            cover: String(record.cover || ''),
            languages: new Set([record.lang]),
            totalDownloadedChapters: 0,
            totalSizeBytes: 0,
            totalChapters: 0,
            statusCounts: {
                downloaded: 0,
                queued: 0,
                downloading: 0,
                failed: 0,
                updateAvailable: 0
            },
            lastValidatedAt: null,
            latestActivityAt: null,
            bookSnapshot: null,
            bookRecords: []
        };
    }

    return existing;
}

function finalizeBookSummary(summary) {
    const counts = summary.statusCounts;
    let overallStatus = OFFLINE_STATES.notDownloaded;

    if (counts.downloading > 0) {
        overallStatus = OFFLINE_STATES.downloading;
    } else if (counts.queued > 0) {
        overallStatus = OFFLINE_STATES.queued;
    } else if (counts.failed > 0 && counts.downloaded === 0) {
        overallStatus = OFFLINE_STATES.failed;
    } else if (counts.updateAvailable > 0) {
        overallStatus = OFFLINE_STATES.updateAvailable;
    } else if (counts.downloaded > 0) {
        overallStatus = OFFLINE_STATES.downloaded;
    }

    return {
        ...summary,
        languages: Array.from(summary.languages).sort(),
        overallStatus
    };
}

async function listBookRecordsForUser(userId = getActiveUserId()) {
    return getAllRecords(STORE_NAMES.books, 'by_user', IDBKeyRange.only(userId));
}

async function listChapterRecordsForUser(userId = getActiveUserId()) {
    return getAllRecords(STORE_NAMES.chapters, 'by_user', IDBKeyRange.only(userId));
}

async function getNextRunnableJob(userId = getActiveUserId()) {
    const jobs = await getAllRecords(STORE_NAMES.jobs, 'by_user', IDBKeyRange.only(userId));
    const now = Date.now();

    return jobs
        .filter((job) => [OFFLINE_STATES.queued, OFFLINE_STATES.failed, OFFLINE_STATES.downloading].includes(job.status))
        .filter((job) => job.status !== OFFLINE_STATES.downloading || !activeDownloadController)
        .filter((job) => getTimeValue(job.nextAttemptAt) <= now)
        .sort((left, right) => {
            const leftPriority = toSafeNumber(left.priority, Number.MAX_SAFE_INTEGER);
            const rightPriority = toSafeNumber(right.priority, Number.MAX_SAFE_INTEGER);
            if (leftPriority !== rightPriority) return leftPriority - rightPriority;
            return getTimeValue(left.queuedAt) - getTimeValue(right.queuedAt);
        })[0] || null;
}

async function downloadJob(job) {
    const userId = getActiveUserId();
    const chapterId = chapterRecordId(userId, job.bookId, job.lang, job.chapterIndex);
    const chapterRecord = await getRecord(STORE_NAMES.chapters, chapterId);
    const bookRecord = await getRecord(STORE_NAMES.books, bookRecordId(userId, job.bookId, job.lang));

    if (!chapterRecord || !bookRecord) {
        await deleteRecord(STORE_NAMES.jobs, job.id);
        return;
    }

    const eligibility = canDownloadChapter({ url: chapterRecord.originalUrl, downloadable: chapterRecord.downloadable });
    if (!eligibility.downloadable) {
        await putRecord(STORE_NAMES.chapters, {
            ...chapterRecord,
            status: OFFLINE_STATES.failed,
            errorReason: eligibility.reason,
            lastTouchedAt: new Date().toISOString()
        });
        await putRecord(STORE_NAMES.jobs, {
            ...job,
            status: OFFLINE_STATES.failed,
            errorReason: eligibility.reason,
            updatedAt: new Date().toISOString(),
            nextAttemptAt: new Date(Date.now() + JOB_RETRY_DELAYS_MS[JOB_RETRY_DELAYS_MS.length - 1]).toISOString()
        });
        emitOfflineChange('job-failed', { bookId: job.bookId, lang: job.lang, chapterIndex: job.chapterIndex });
        return;
    }

    activeDownloadController = new AbortController();

    await putRecord(STORE_NAMES.jobs, {
        ...job,
        status: OFFLINE_STATES.downloading,
        updatedAt: new Date().toISOString(),
        errorReason: ''
    });

    await putRecord(STORE_NAMES.chapters, {
        ...chapterRecord,
        status: OFFLINE_STATES.downloading,
        progressBytes: 0,
        progressPercent: 0,
        errorReason: '',
        lastTouchedAt: new Date().toISOString()
    });

    emitOfflineChange('job-started', { bookId: job.bookId, lang: job.lang, chapterIndex: job.chapterIndex });

    try {
        const response = await fetch(chapterRecord.originalUrl, {
            signal: activeDownloadController.signal
        });

        if (!response.ok) {
            throw new Error(`Download failed with status ${response.status}`);
        }

        const totalBytes = toSafeNumber(response.headers.get('content-length') || chapterRecord.sizeBytes, 0);
        const mimeType = String(response.headers.get('content-type') || chapterRecord.mimeType || 'audio/mpeg');
        let blob;

        if (response.body?.getReader) {
            const reader = response.body.getReader();
            const chunks = [];
            let loadedBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                loadedBytes += value.byteLength;

                const progressPercent = totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
                await putRecord(STORE_NAMES.chapters, {
                    ...chapterRecord,
                    status: OFFLINE_STATES.downloading,
                    progressBytes: loadedBytes,
                    progressPercent,
                    sizeBytes: totalBytes || loadedBytes,
                    mimeType,
                    lastTouchedAt: new Date().toISOString()
                });

                emitOfflineChange('job-progress', {
                    bookId: job.bookId,
                    lang: job.lang,
                    chapterIndex: job.chapterIndex,
                    progressBytes: loadedBytes,
                    totalBytes,
                    progressPercent
                });
            }

            blob = new Blob(chunks, { type: mimeType });
        } else {
            blob = await response.blob();
        }

        if (!blob || blob.size <= 0) {
            throw new Error('Downloaded audio was empty.');
        }

        const prefersOpfs = supportsOpfs();
        let storageType = prefersOpfs ? 'opfs' : 'indexeddb_blob';
        let opfsPath = '';
        let fallbackBlob = null;

        if (prefersOpfs) {
            const path = buildOpfsPath(userId, job.bookId, job.lang, job.chapterIndex);
            opfsPath = await writeBlobToOpfs(path, blob);
            if (!opfsPath) {
                storageType = 'indexeddb_blob';
                fallbackBlob = blob;
            }
        } else {
            fallbackBlob = blob;
        }

        const completedChapter = {
            ...chapterRecord,
            status: OFFLINE_STATES.downloaded,
            storageType,
            opfsPath,
            fallbackBlob,
            sizeBytes: blob.size,
            mimeType,
            downloadedAt: new Date().toISOString(),
            validatedAt: new Date().toISOString(),
            progressBytes: blob.size,
            progressPercent: 100,
            errorReason: '',
            lastTouchedAt: new Date().toISOString()
        };

        await putRecord(STORE_NAMES.chapters, completedChapter);
        await deleteRecord(STORE_NAMES.jobs, job.id);
        await updateStorageStats();
        emitOfflineChange('job-complete', {
            bookId: job.bookId,
            lang: job.lang,
            chapterIndex: job.chapterIndex
        });
    } catch (error) {
        const retryIndex = Math.min(toSafeNumber(job.retries, 0), JOB_RETRY_DELAYS_MS.length - 1);
        const willRetry = navigator.onLine && error?.name !== 'AbortError';
        const nextDelay = JOB_RETRY_DELAYS_MS[retryIndex];
        const nextStatus = willRetry ? OFFLINE_STATES.failed : OFFLINE_STATES.queued;

        let errorReason = 'Download failed';
        if (!navigator.onLine) {
            errorReason = 'Browser is offline';
        } else if (error?.name === 'AbortError') {
            errorReason = 'Download cancelled';
        } else if (error?.name === 'QuotaExceededError' || String(error?.message).includes('quota')) {
            errorReason = 'Not enough storage space';
        } else if (error instanceof TypeError) { // Often indicates network/CORS issue
            errorReason = 'Network error or access denied';
        } else if (error?.message) {
            errorReason = error.message;
        }

        await putRecord(STORE_NAMES.chapters, {
            ...chapterRecord,
            status: nextStatus,
            errorReason,
            progressPercent: 0,
            lastTouchedAt: new Date().toISOString()
        });
        await putRecord(STORE_NAMES.jobs, {
            ...job,
            status: nextStatus,
            retries: willRetry ? toSafeNumber(job.retries, 0) + 1 : toSafeNumber(job.retries, 0),
            errorReason,
            updatedAt: new Date().toISOString(),
            nextAttemptAt: new Date(Date.now() + nextDelay).toISOString()
        });
        emitOfflineChange('job-failed', {
            bookId: job.bookId,
            lang: job.lang,
            chapterIndex: job.chapterIndex,
            reason: errorReason
        });
    } finally {
        activeDownloadController = null;
        await updateStorageStats();
    }
}

function bindOfflineLifecycle() {
    if (typeof window === 'undefined' || window.__vibeOfflineShelfBound) return;
    window.__vibeOfflineShelfBound = true;

    window.addEventListener('online', () => {
        resumePendingDownloads();
    });

    window.addEventListener('offline', () => {
        if (activeDownloadController) {
            activeDownloadController.abort();
        }
        emitOfflineChange('connection-offline');
    });
}

export async function getOfflineSupportState() {
    bindOfflineLifecycle();
    const stats = await updateStorageStats();
    return {
        supported: isBrowserOfflineSupported(),
        storageMode: stats.storageMode,
        prefersOpfs: supportsOpfs(),
        isOnline: navigator.onLine,
        quotaBytes: stats.browserQuotaBytes,
        usageBytes: stats.browserUsageBytes
    };
}

export async function getOfflineStorageStats() {
    bindOfflineLifecycle();
    const stats = await updateStorageStats();
    return {
        ...stats,
        availableBytes: Math.max(0, toSafeNumber(stats.browserQuotaBytes, 0) - toSafeNumber(stats.browserUsageBytes, 0))
    };
}

export async function getOfflineBook(bookId, lang = null) {
    const summaries = await listOfflineBooks();
    const normalizedBookId = String(bookId);

    if (lang) {
        return summaries.find((summary) => summary.bookId === normalizedBookId && summary.languages.includes(normalizeLang(lang))) || null;
    }

    return summaries.find((summary) => summary.bookId === normalizedBookId) || null;
}

export async function getOfflineChapter(bookId, lang, chapterIndex) {
    const userId = getActiveUserId();
    return getRecord(STORE_NAMES.chapters, chapterRecordId(userId, bookId, lang, chapterIndex));
}

export async function listOfflineBooks() {
    const userId = getActiveUserId();
    const [bookRecords, chapterRecords] = await Promise.all([
        listBookRecordsForUser(userId),
        listChapterRecordsForUser(userId)
    ]);

    const grouped = new Map();

    chapterRecords.forEach((chapterRecord) => {
        const key = String(chapterRecord.bookId);
        const summary = mergeBookSummary(grouped.get(key), chapterRecord);
        const contributesBytes = chapterRecord.status === OFFLINE_STATES.downloaded || chapterRecord.status === OFFLINE_STATES.updateAvailable;
        summary.languages.add(chapterRecord.lang);
        summary.totalDownloadedChapters += contributesBytes ? 1 : 0;
        summary.totalSizeBytes += contributesBytes ? Math.max(0, toSafeNumber(chapterRecord.sizeBytes, 0)) : 0;
        summary.latestActivityAt = getTimeValue(chapterRecord.lastTouchedAt) > getTimeValue(summary.latestActivityAt)
            ? chapterRecord.lastTouchedAt
            : summary.latestActivityAt;
        summary.lastValidatedAt = getTimeValue(chapterRecord.validatedAt) > getTimeValue(summary.lastValidatedAt)
            ? chapterRecord.validatedAt
            : summary.lastValidatedAt;

        if (chapterRecord.status === OFFLINE_STATES.downloaded) summary.statusCounts.downloaded += 1;
        if (chapterRecord.status === OFFLINE_STATES.queued) summary.statusCounts.queued += 1;
        if (chapterRecord.status === OFFLINE_STATES.downloading) summary.statusCounts.downloading += 1;
        if (chapterRecord.status === OFFLINE_STATES.failed) summary.statusCounts.failed += 1;
        if (chapterRecord.status === OFFLINE_STATES.updateAvailable) summary.statusCounts.updateAvailable += 1;

        grouped.set(key, summary);
    });

    bookRecords.forEach((bookRecord) => {
        const key = String(bookRecord.bookId);
        const summary = grouped.get(key) || mergeBookSummary(null, bookRecord);
        summary.languages.add(bookRecord.lang);
        summary.totalChapters = Math.max(summary.totalChapters, toSafeNumber(bookRecord.totalChapters, 0));
        summary.bookSnapshot = summary.bookSnapshot || bookRecord.bookSnapshot || null;
        summary.bookRecords.push(bookRecord);
        summary.latestActivityAt = getTimeValue(bookRecord.updatedAt) > getTimeValue(summary.latestActivityAt)
            ? bookRecord.updatedAt
            : summary.latestActivityAt;
        grouped.set(key, summary);
    });

    return Array.from(grouped.values())
        .map(finalizeBookSummary)
        .sort((left, right) => getTimeValue(right.latestActivityAt) - getTimeValue(left.latestActivityAt));
}

export async function getOfflineChapterStatus(bookId, lang, chapterIndex, chapter = null) {
    const record = await getOfflineChapter(bookId, lang, chapterIndex);
    if (!record) {
        const eligibility = canDownloadChapter(chapter || {});
        return {
            status: eligibility.downloadable ? OFFLINE_STATES.notDownloaded : 'not_available',
            downloadable: eligibility.downloadable,
            reason: eligibility.reason,
            record: null
        };
    }

    const nextFingerprint = chapter ? normalizeSourceFingerprint(chapter) : record.sourceFingerprint;
    const downloadedState = record.status === OFFLINE_STATES.downloaded || record.status === OFFLINE_STATES.updateAvailable;
    const needsUpdate = downloadedState && nextFingerprint !== record.sourceFingerprint;

    if (needsUpdate && record.status !== OFFLINE_STATES.updateAvailable) {
        const nextRecord = {
            ...record,
            status: OFFLINE_STATES.updateAvailable,
            errorReason: ''
        };
        await putRecord(STORE_NAMES.chapters, nextRecord);
        return {
            status: OFFLINE_STATES.updateAvailable,
            downloadable: true,
            reason: '',
            record: nextRecord
        };
    }

    return {
        status: record.status,
        downloadable: Boolean(record.downloadable),
        reason: record.errorReason || '',
        record
    };
}

export async function queueChapterDownload(book, chapter, lang, options = {}) {
    bindOfflineLifecycle();

    if (!book?.bookId || !chapter?.url) {
        return {
            queued: false,
            reason: 'Book chapter data is incomplete'
        };
    }

    const normalizedLang = normalizeLang(lang);
    const eligibility = canDownloadChapter(chapter);
    if (!eligibility.downloadable) {
        const chapterIndex = Number(options.chapterIndex || 0);
        await ensureBookRecord(book, normalizedLang);
        await upsertChapterRecord(book, chapter, normalizedLang, chapterIndex, {
            status: OFFLINE_STATES.failed,
            errorReason: eligibility.reason
        });
        emitOfflineChange('chapter-not-downloadable', {
            bookId: book.bookId,
            lang: normalizedLang,
            chapterIndex
        });
        return {
            queued: false,
            reason: eligibility.reason
        };
    }

    const chapterIndex = Number(options.chapterIndex || 0);
    await ensureBookRecord(book, normalizedLang);
    const existingState = await getOfflineChapterStatus(book.bookId, normalizedLang, chapterIndex, chapter);
    if (existingState.record && [OFFLINE_STATES.downloaded, OFFLINE_STATES.downloading, OFFLINE_STATES.queued].includes(existingState.status)) {
        return {
            queued: true,
            record: existingState.record
        };
    }

    const currentRecord = await upsertChapterRecord(book, chapter, normalizedLang, chapterIndex, {
        status: OFFLINE_STATES.queued,
        errorReason: '',
        progressBytes: 0,
        progressPercent: 0,
        skipProbe: false
    });
    await upsertJobRecord(book, normalizedLang, chapterIndex, OFFLINE_STATES.queued, {
        priority: Number(options.priority || Date.now())
    });
    await updateStorageStats();
    emitOfflineChange('chapter-queued', {
        bookId: book.bookId,
        lang: normalizedLang,
        chapterIndex,
        record: currentRecord
    });
    void resumePendingDownloads();

    return {
        queued: true,
        record: currentRecord
    };
}

export async function queueBookDownload(book, lang, startingChapterIndex = 0) {
    bindOfflineLifecycle();

    const chapters = getActiveChaptersForLanguage(book, lang);
    if (!chapters.length) {
        return {
            queued: false,
            queuedCount: 0,
            reason: 'No chapters are available for this language'
        };
    }

    const downloadOrder = getBookDownloadOrder(book, lang, startingChapterIndex);
    let queuedCount = 0;
    const basePriority = Date.now();

    for (const [offset, chapterIndex] of downloadOrder.entries()) {
        const chapter = chapters[chapterIndex];
        const result = await queueChapterDownload(book, chapter, lang, {
            chapterIndex,
            priority: basePriority + offset
        });

        if (result.queued) {
            queuedCount += 1;
        }
    }

    await updateStorageStats();
    emitOfflineChange('book-queued', {
        bookId: book.bookId,
        lang: normalizeLang(lang),
        queuedCount
    });

    return {
        queued: queuedCount > 0,
        queuedCount
    };
}

export async function removeOfflineChapter(bookId, lang, chapterIndex) {
    const userId = getActiveUserId();
    const chapterId = chapterRecordId(userId, bookId, lang, chapterIndex);
    const jobId = jobRecordId(userId, bookId, lang, chapterIndex);
    const record = await getRecord(STORE_NAMES.chapters, chapterId);

    if (!record) return false;

    if (record.storageType === 'opfs' && record.opfsPath) {
        try {
            await deleteBlobFromOpfs(record.opfsPath);
        } catch (error) {
            console.warn('Unable to remove offline OPFS file.', error);
        }
    }

    await deleteRecord(STORE_NAMES.chapters, chapterId);
    await deleteRecord(STORE_NAMES.jobs, jobId);
    await updateStorageStats();
    emitOfflineChange('chapter-removed', { bookId, lang: normalizeLang(lang), chapterIndex });
    return true;
}

export async function removeOfflineBook(bookId, lang = null) {
    const userId = getActiveUserId();
    const normalizedLang = lang ? normalizeLang(lang) : null;
    const chapters = await listChapterRecordsForUser(userId);
    const toRemove = chapters.filter((record) => String(record.bookId) === String(bookId) && (!normalizedLang || record.lang === normalizedLang));

    await Promise.all(toRemove.map((record) => removeOfflineChapter(record.bookId, record.lang, record.chapterIndex)));

    const bookRecords = await listBookRecordsForUser(userId);
    const matchingBooks = bookRecords.filter((record) => String(record.bookId) === String(bookId) && (!normalizedLang || record.lang === normalizedLang));
    await Promise.all(matchingBooks.map((record) => deleteRecord(STORE_NAMES.books, record.id)));

    await updateStorageStats();
    emitOfflineChange('book-removed', { bookId, lang: normalizedLang });
    return true;
}

export async function clearAllOfflineDownloads() {
    const userId = getActiveUserId();
    const [bookRecords, chapterRecords, jobRecords] = await Promise.all([
        listBookRecordsForUser(userId),
        listChapterRecordsForUser(userId),
        getAllRecords(STORE_NAMES.jobs, 'by_user', IDBKeyRange.only(userId))
    ]);

    await Promise.all(chapterRecords.map((record) => removeOfflineChapter(record.bookId, record.lang, record.chapterIndex)));
    await Promise.all(bookRecords.map((record) => deleteRecord(STORE_NAMES.books, record.id)));
    await Promise.all(jobRecords.map((record) => deleteRecord(STORE_NAMES.jobs, record.id)));
    await updateStorageStats();
    emitOfflineChange('all-cleared', { userId });
    return true;
}

export async function resolveOfflinePlaybackSource(book, chapterIndex, lang) {
    const chapter = getChapterForLanguage(book, lang, chapterIndex);
    if (!chapter) return null;

    const status = await getOfflineChapterStatus(book.bookId, lang, chapterIndex, chapter);
    const record = status.record;
    if (!record || ![OFFLINE_STATES.downloaded, OFFLINE_STATES.updateAvailable].includes(record.status)) {
        return null;
    }

    try {
        let blob = null;

        if (record.storageType === 'opfs' && record.opfsPath) {
            blob = await readBlobFromOpfs(record.opfsPath);
        } else if (record.storageType === 'indexeddb_blob' && record.fallbackBlob) {
            blob = record.fallbackBlob;
        }

        if (!blob || toSafeNumber(blob.size, 0) <= 0) {
            throw new Error('Stored offline audio is unavailable');
        }

        const objectUrl = URL.createObjectURL(blob);
        await putRecord(STORE_NAMES.chapters, {
            ...record,
            validatedAt: new Date().toISOString(),
            errorReason: '',
            lastTouchedAt: new Date().toISOString()
        });

        return {
            source: 'offline',
            storageType: record.storageType,
            url: objectUrl,
            revoke: () => URL.revokeObjectURL(objectUrl),
            record
        };
    } catch (error) {
        console.warn('Offline audio validation failed. Falling back to stream.', error);
        await removeOfflineChapter(book.bookId, lang, chapterIndex);
        emitOfflineChange('chapter-invalidated', {
            bookId: book.bookId,
            lang: normalizeLang(lang),
            chapterIndex
        });
        return null;
    }
}

export async function resumePendingDownloads() {
    bindOfflineLifecycle();

    if (!isBrowserOfflineSupported()) return false;
    if (queuePromise) return queuePromise;

    queuePromise = (async () => {
        if (!navigator.onLine) {
            emitOfflineChange('resume-blocked-offline');
            return false;
        }

        while (navigator.onLine) {
            const nextJob = await getNextRunnableJob();
            if (!nextJob) break;
            await downloadJob(nextJob);
        }

        await updateStorageStats();
        emitOfflineChange('queue-drained');
        return true;
    })().finally(() => {
        queuePromise = null;
    });

    return queuePromise;
}

export function buildOfflineBookFromSummary(summary) {
    if (!summary?.bookSnapshot) return null;
    return {
        ...summary.bookSnapshot,
        cover: summary.bookSnapshot.cover,
        bookId: summary.bookSnapshot.bookId || summary.bookId
    };
}

void getOfflineSupportState().catch(() => {});
