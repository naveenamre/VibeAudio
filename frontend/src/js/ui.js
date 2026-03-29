import {
    fetchAllBooks,
    fetchUserProgress,
    flushPendingProgressQueue,
    getLocalUserProfile,
    invalidateProgressCache,
    syncUserProfile,
    saveUserProgress
} from './api.js';
import {
    buildOfflineBookFromSummary,
    clearAllOfflineDownloads,
    getOfflineStorageStats,
    listOfflineBooks,
    resumePendingDownloads
} from './offline-shelf.js';
import { togglePlay, nextChapter, prevChapter, skip, seekTo, getCurrentState } from './player.js';
import * as LibraryUI from './ui-library.js';
import { openPlayerUI, updateUI } from './ui-player-main.js';
import { STORAGE_KEYS, SYNC_STATES } from './config.js';
import { formatTime, renderSingleComment, setActiveThemeSurface } from './ui-player-helpers.js';
import { signOutCurrentUser } from './auth.js';
import {
    addPersistentComment,
    buildProfileSnapshot,
    getCatalogSnapshot,
    getCurrentUserName,
    getLastOpenedBook,
    getLastPlayerSession,
    getSyncStatus,
    pushRecentSearch
} from './user-data.js';
import {
    compareProgressByRecency,
    getProgressPercent,
    getProgressTimestampValue,
    isBookFinishedProgress
} from './progress-model.js';

let allBooks = [];
let userHistory = [];
let offlineShelfSummaries = [];
let offlineStorageStats = null;
let currentViewId = 'library';
let currentCategory = 'All';
let currentSearchQuery = '';
let closeSidebarIfOpen = () => false;
let hasInitialized = false;
let offlineRefreshQueued = false;

const VALID_VIEWS = new Set(['library', 'history', 'offline', 'about', 'profile', 'player']);

function getTimeStamp(value) {
    const stamp = Date.parse(value || 0);
    return Number.isFinite(stamp) ? stamp : 0;
}

function sortCatalogBooks(books) {
    return (Array.isArray(books) ? books : [])
        .slice()
        .sort((a, b) => {
            const numA = parseInt(String(a.bookId || '').replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(String(b.bookId || '').replace(/\D/g, ''), 10) || 0;
            return numA - numB;
        })
        .map((book, index) => ({ ...book, catalogOrder: index }));
}

function formatRelativeTime(value) {
    const stamp = getTimeStamp(value);
    if (!stamp) return 'recently';

    const deltaMs = Date.now() - stamp;
    if (deltaMs < 60 * 1000) return 'just now';

    const minutes = Math.floor(deltaMs / (60 * 1000));
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function renderSyncState(status = getSyncStatus()) {
    const banners = [
        document.getElementById('library-sync-banner'),
        document.getElementById('history-sync-banner')
    ].filter(Boolean);
    const profileNote = document.getElementById('profile-sync-note');
    const pendingCount = Number(status.pendingCount || 0);

    let message = 'Shelf synced. Your browser can reopen the last touched story quickly.';
    if (status.status === SYNC_STATES.offline) {
        message = pendingCount > 0
            ? `Offline mode active. ${pendingCount} listening update${pendingCount === 1 ? '' : 's'} waiting to sync, but your saved shelf is still available.`
            : 'Offline mode active. Showing your saved shelf from this device.';
    } else if (status.status === SYNC_STATES.pending) {
        message = pendingCount > 0
            ? `${pendingCount} listening update${pendingCount === 1 ? '' : 's'} waiting to sync. Continue listening is using fresher local device data.`
            : 'Device state is newer than cloud and will sync shortly.';
    } else if (status.lastSuccessfulSyncAt) {
        message = `Synced ${formatRelativeTime(status.lastSuccessfulSyncAt)}. Continue listening follows your latest unfinished book.`;
    }

    banners.forEach((banner) => {
        banner.classList.remove('hidden');
        banner.dataset.status = status.status;
        banner.textContent = message;
    });

    if (profileNote) {
        profileNote.dataset.status = status.status;
        profileNote.textContent = message;
    }
}

function getBookSignals(book) {
    const signals = [];

    if (book.genre) {
        signals.push({ key: String(book.genre).toLowerCase(), label: String(book.genre), weight: 1.8 });
    }

    (book.moods || []).forEach((mood) => {
        signals.push({ key: String(mood).toLowerCase(), label: String(mood), weight: 1.1 });
    });

    return signals;
}

function enrichBooksWithHistory(books, history) {
    const sortedHistory = [...history].sort(compareProgressByRecency);
    const historyByBook = new Map();

    sortedHistory.forEach((entry, index) => {
        const key = String(entry.bookId);
        if (!historyByBook.has(key)) {
            historyByBook.set(key, { ...entry, historyRank: index });
        }
    });

    const tasteProfile = new Map();
    books.forEach((book) => {
        const progress = historyByBook.get(String(book.bookId));
        if (!progress) return;

        const progressPercent = getProgressPercent(progress);
        const recencyWeight = Math.max(0.6, 1.7 - (progress.historyRank * 0.14));
        const depthWeight = 1 + (progressPercent / 100);
        const baseWeight = recencyWeight + depthWeight;

        getBookSignals(book).forEach((signal) => {
            tasteProfile.set(signal.key, (tasteProfile.get(signal.key) || 0) + (baseWeight * signal.weight));
        });
    });

    return books
        .map((book) => {
            const progress = historyByBook.get(String(book.bookId));
            const progressPercent = getProgressPercent(progress);
            const savedState = progress ? {
                chapterIndex: Number(progress.chapterIndex || 0),
                currentTime: Number(progress.currentTime || 0)
            } : null;
            const matchingSignals = getBookSignals(book)
                .filter((signal) => tasteProfile.has(signal.key))
                .sort((a, b) => (tasteProfile.get(b.key) || 0) - (tasteProfile.get(a.key) || 0));
            const preferenceScore = matchingSignals.reduce((sum, signal) => sum + (tasteProfile.get(signal.key) || 0), 0);
            const isFinished = isBookFinishedProgress(progress);
            const progressBoost = savedState && !isFinished ? 1600 + progressPercent : 0;
            const hasRecommendationMatch = preferenceScore > 0;

            return {
                ...book,
                savedState,
                progressPercent,
                lastInteractionAt: progress?.lastInteractionAt || null,
                historyRank: progress?.historyRank ?? Number.MAX_SAFE_INTEGER,
                isFinished,
                personalizedScore: progressBoost + preferenceScore + (isFinished ? 40 : 0),
                rankingBucket: savedState && !isFinished
                    ? 0
                    : hasRecommendationMatch && !savedState
                        ? 1
                        : !savedState
                            ? 2
                            : 3,
                recommendationReason: matchingSignals[0]?.label || '',
                topReasons: matchingSignals.slice(0, 3).map((signal) => signal.label)
            };
        })
        .sort((a, b) => {
            const bucketDiff = (a.rankingBucket || 0) - (b.rankingBucket || 0);
            if (bucketDiff) return bucketDiff;

            if (a.rankingBucket === 0 && b.rankingBucket === 0) {
                const recencyDiff = getProgressTimestampValue({ lastInteractionAt: b.lastInteractionAt })
                    - getProgressTimestampValue({ lastInteractionAt: a.lastInteractionAt });
                if (recencyDiff) return recencyDiff;
            }

            const scoreDiff = (b.personalizedScore || 0) - (a.personalizedScore || 0);
            if (scoreDiff) return scoreDiff;

            const recencyDiff = getProgressTimestampValue({ lastInteractionAt: b.lastInteractionAt })
                - getProgressTimestampValue({ lastInteractionAt: a.lastInteractionAt });
            if (recencyDiff) return recencyDiff;

            return (a.catalogOrder || 0) - (b.catalogOrder || 0);
        });
}

function applyOfflineSummariesToBooks(books, summaries = offlineShelfSummaries) {
    const summaryMap = new Map((Array.isArray(summaries) ? summaries : []).map((summary) => [String(summary.bookId), summary]));

    return (Array.isArray(books) ? books : []).map((book) => {
        const offlineSummary = summaryMap.get(String(book.bookId)) || null;
        return {
            ...book,
            offlineSummary,
            isOfflineAvailable: Boolean(offlineSummary?.totalDownloadedChapters)
        };
    });
}

function buildOfflineRenderableBooks() {
    const catalogMap = new Map(allBooks.map((book) => [String(book.bookId), book]));

    return offlineShelfSummaries.map((summary) => {
        const catalogBook = catalogMap.get(String(summary.bookId));
        const offlineBook = buildOfflineBookFromSummary(summary);
        return applyOfflineSummariesToBooks([
            catalogBook
                ? { ...catalogBook, ...offlineBook }
                : {
                    ...(offlineBook || {}),
                    bookId: summary.bookId,
                    title: summary.title,
                    author: summary.author,
                    cover: summary.cover,
                    totalChapters: summary.totalChapters
                }
        ], [summary])[0];
    });
}

function toAbsoluteUrl(value) {
    try {
        return new URL(String(value || ''), window.location.href).href;
    } catch (error) {
        return '';
    }
}

function warmOfflineCatalog(books = allBooks) {
    const bridge = window.VibePWA;
    if (!bridge?.primeOfflineResources) return;

    const prioritizedBooks = [];
    const seenBookIds = new Set();
    const pushBook = (book) => {
        if (!book?.bookId) return;
        const key = String(book.bookId);
        if (seenBookIds.has(key)) return;
        seenBookIds.add(key);
        prioritizedBooks.push(book);
    };

    const lastSession = getLastPlayerSession() || getLastOpenedBook();
    if (lastSession?.bookId) {
        pushBook((books || []).find((book) => String(book.bookId) === String(lastSession.bookId)));
    }

    buildOfflineRenderableBooks().slice(0, 6).forEach(pushBook);
    (Array.isArray(books) ? books : []).slice(0, 10).forEach(pushBook);

    const urls = [
        '../../index.html',
        '../../app.webmanifest',
        '../pages/app.html',
        ...prioritizedBooks.flatMap((book) => [book?.dataPath, book?.cover])
    ]
        .map(toAbsoluteUrl)
        .filter(Boolean);

    void bridge.primeOfflineResources(urls);
}

function matchesBookFilters(book) {
    const query = currentSearchQuery.trim().toLowerCase();
    if (query) {
        const title = String(book.title || '').toLowerCase();
        const author = String(book.author || '').toLowerCase();
        if (!title.includes(query) && !author.includes(query)) {
            return false;
        }
    }

    if (currentCategory === 'All') return true;
    return book.genre === currentCategory || Boolean(book.moods?.includes(currentCategory));
}

function getVisibleBooks() {
    return allBooks.filter(matchesBookFilters);
}

function openBookFromCollection(book) {
    openPlayerUI(book, allBooks, switchView);
}

function renderLibrarySurfaces() {
    LibraryUI.renderLibrarySpotlight(allBooks, openBookFromCollection, {
        activeCategory: currentCategory,
        searchQuery: currentSearchQuery,
        lastOpenedState: getLastOpenedBook(),
        syncStatus: getSyncStatus()
    });
    LibraryUI.renderLibrary(getVisibleBooks(), openBookFromCollection);
    renderLibraryInsights();
}

function queueOfflineShelfRefresh() {
    if (offlineRefreshQueued) return;
    offlineRefreshQueued = true;

    window.setTimeout(async () => {
        offlineRefreshQueued = false;
        await refreshOfflineShelfState();
        renderLibrarySurfaces();
    }, 180);
}

async function refreshOfflineShelfState() {
    try {
        const [summaries, stats] = await Promise.all([
            listOfflineBooks(),
            getOfflineStorageStats()
        ]);

        offlineShelfSummaries = Array.isArray(summaries) ? summaries : [];
        offlineStorageStats = stats;
        allBooks = applyOfflineSummariesToBooks(allBooks, offlineShelfSummaries);
        warmOfflineCatalog(allBooks);
    } catch (error) {
        console.warn("Unable to refresh offline shelf state.", error);
        offlineShelfSummaries = [];
        offlineStorageStats = null;
    }

    renderOfflineView();
    renderProfileStoragePanel();
}

async function refreshPersonalizedCatalog() {
    try {
        userHistory = await fetchUserProgress();
    } catch (error) {
        console.warn("Unable to refresh user history.", error);
        userHistory = [];
    }

    allBooks = applyOfflineSummariesToBooks(enrichBooksWithHistory(allBooks, userHistory), offlineShelfSummaries);
    renderLibrarySurfaces();
    LibraryUI.renderHistory(allBooks, openBookFromCollection, userHistory);
    renderProfileSnapshot();
    renderSyncState();
}

function renderLibraryInsights() {
    const subtitle = document.getElementById('library-subtitle');
    const insights = document.getElementById('library-insights');
    const visibleBooks = getVisibleBooks();

    if (subtitle) {
        if (currentSearchQuery.trim()) {
            subtitle.textContent = `${visibleBooks.length} matching stories for "${currentSearchQuery.trim()}"`;
        } else if (currentCategory !== 'All') {
            subtitle.textContent = `${visibleBooks.length} stories in ${currentCategory}`;
        } else {
            subtitle.textContent = `${allBooks.length} stories, tailored to your recent listening patterns.`;
        }
    }

    if (!insights) return;

    const totalCategories = new Set(
        allBooks.flatMap((book) => [book.genre, ...(Array.isArray(book.moods) ? book.moods : [])]).filter(Boolean)
    ).size;
    const activeResumes = userHistory.filter((entry) => !isBookFinishedProgress(entry)).length;

    insights.innerHTML = `
        <article class="insight-card">
            <strong>${visibleBooks.length}</strong>
            <span>Visible right now</span>
        </article>
        <article class="insight-card">
            <strong>${activeResumes}</strong>
            <span>Stories to resume</span>
        </article>
        <article class="insight-card">
            <strong>${totalCategories}</strong>
            <span>Moods and genres</span>
        </article>
    `;
}

function renderProfileSnapshot() {
    const snapshot = buildProfileSnapshot(userHistory, allBooks);

    const finishedEl = document.getElementById('profile-stat-finished');
    const hoursEl = document.getElementById('profile-stat-hours');
    const activeEl = document.getElementById('profile-stat-active');
    const bookmarksEl = document.getElementById('profile-stat-bookmarks');
    const summaryEl = document.getElementById('profile-summary-copy');
    const genreEl = document.getElementById('profile-top-genre');

    if (finishedEl) finishedEl.innerText = String(snapshot.finishedBooks);
    if (hoursEl) hoursEl.innerText = `${snapshot.totalHours.toFixed(snapshot.totalHours >= 10 ? 0 : 1)}h`;
    if (activeEl) activeEl.innerText = String(snapshot.activeBooks);
    if (bookmarksEl) bookmarksEl.innerText = String(snapshot.bookmarkCount);
    if (summaryEl) summaryEl.innerText = snapshot.summary;
    if (genreEl) genreEl.innerText = `Top lane: ${snapshot.topGenre}`;

    renderProfileStoragePanel();
}

function renderProfileStoragePanel() {
    const usedEl = document.getElementById('offline-storage-used');
    const quotaEl = document.getElementById('offline-storage-quota');
    const booksEl = document.getElementById('offline-storage-books');
    const chaptersEl = document.getElementById('offline-storage-chapters');
    const modeEl = document.getElementById('offline-storage-mode');
    const clearBtn = document.getElementById('clear-offline-downloads-btn');

    if (!usedEl || !quotaEl || !booksEl || !chaptersEl || !modeEl) return;

    const usedBytes = Number(offlineStorageStats?.downloadedBytes || 0);
    const quotaBytes = Number(offlineStorageStats?.browserQuotaBytes || 0);
    const formatSize = (value) => {
        if (!value) return '0 MB';
        if (value >= 1024 ** 3) return `${(value / (1024 ** 3)).toFixed(1)} GB`;
        return `${Math.max(0.1, value / (1024 ** 2)).toFixed(value >= 1024 ** 2 ? 1 : 0)} MB`;
    };

    usedEl.innerText = formatSize(usedBytes);
    quotaEl.innerText = quotaBytes ? formatSize(quotaBytes) : 'Browser managed';
    booksEl.innerText = String(offlineStorageStats?.downloadedBooks || 0);
    chaptersEl.innerText = String(offlineStorageStats?.downloadedChapters || 0);
    modeEl.innerText = offlineStorageStats?.storageMode === 'opfs' ? 'OPFS preferred' : 'IndexedDB fallback';

    if (clearBtn) {
        clearBtn.disabled = !(offlineStorageStats?.downloadedBooks || offlineStorageStats?.pendingJobs);
    }
}

function renderOfflineView() {
    const subtitle = document.getElementById('offline-subtitle');
    const stats = document.getElementById('offline-insights');
    const offlineBooks = buildOfflineRenderableBooks();

    if (subtitle) {
        if (!offlineBooks.length) {
            subtitle.textContent = 'Save direct-audio books from the player and they will appear here for offline browser listening.';
        } else {
            subtitle.textContent = `${offlineBooks.length} saved ${offlineBooks.length === 1 ? 'book' : 'books'} ready from this browser shelf.`;
        }
    }

    if (stats) {
        stats.innerHTML = `
            <article class="insight-card">
                <strong>${offlineStorageStats?.downloadedBooks || 0}</strong>
                <span>Books saved locally</span>
            </article>
            <article class="insight-card">
                <strong>${offlineStorageStats?.downloadedChapters || 0}</strong>
                <span>Chapters available offline</span>
            </article>
            <article class="insight-card">
                <strong>${offlineStorageStats?.pendingJobs || 0}</strong>
                <span>Queued right now</span>
            </article>
        `;
    }

    LibraryUI.renderOfflineShelf(offlineBooks, openBookFromCollection);
}

function restorePlayerSessionIfNeeded() {
    if (currentViewId !== 'player') return;

    const session = getLastPlayerSession() || getLastOpenedBook();
    if (!session?.bookId) {
        switchView('library', false);
        return;
    }

    const book = allBooks.find((item) => String(item.bookId) === String(session.bookId));
    const fallbackOfflineBook = buildOfflineRenderableBooks().find((item) => String(item.bookId) === String(session.bookId));
    const resolvedBook = book || fallbackOfflineBook;

    if (!resolvedBook) {
        switchView('library', false);
        return;
    }

    openPlayerUI({
        ...resolvedBook,
        savedState: {
            chapterIndex: Number(session.chapterIndex || 0),
            currentTime: Number(session.currentTime || 0)
        }
    }, allBooks, (viewId) => switchView(viewId, false));
}

window.app = {
    switchView: (id) => switchView(id),
    goBack: () => goBackInApp(),
    filterLibrary: (category) => filterLibraryLogic(category),

    togglePlay: () => {
        const isPlaying = togglePlay();
        updateUI(isPlaying);
    },

    nextChapter: () => {
        if (nextChapter()) updateUI(false);
    },

    prevChapter: () => {
        if (prevChapter()) updateUI(false);
    },

    seekToComment: (time) => {
        const state = getCurrentState();
        if (!state.duration) return;

        seekTo((time / state.duration) * 100);
        if (!state.isPlaying) {
            const isPlaying = togglePlay();
            updateUI(isPlaying);
        }
    },

    syncData: async () => {
        const btn = document.getElementById('sync-profile-btn') || document.querySelector('.btn-secondary');
        if (!btn) return;

        if (!navigator.onLine) {
            showToast("Offline mode active. We'll sync again when the browser reconnects.");
            renderSyncState();
            return;
        }

        const icon = btn.querySelector('i');
        const originalText = btn.innerHTML;

        if (icon) icon.classList.add('fa-spin');
        btn.innerHTML = `<i class="fas fa-sync fa-spin"></i> Syncing...`;
        btn.disabled = true;

        await syncUserProfile();
        await flushPendingProgressQueue();
        invalidateProgressCache();
        await refreshPersonalizedCatalog();

        if (icon) icon.classList.remove('fa-spin');
        btn.innerHTML = `<i class="fas fa-check"></i> Synced!`;
        btn.style.borderColor = "#00ff00";
        btn.style.color = "#00ff00";
        showToast("Data synced with cloud.");

        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.borderColor = "";
            btn.style.color = "";
        }, 3000);
    },

    clearOfflineDownloads: async () => {
        await clearAllOfflineDownloads();
        await refreshOfflineShelfState();
        renderLibrarySurfaces();
        showToast("Offline shelf cleared from this browser");
    },

    logout: async () => {
        console.log("Logging out...");
        try {
            await signOutCurrentUser();
        } catch (error) {
            console.warn("Clerk signout issue:", error);
        }

        localStorage.removeItem("vibe_user_id");
        localStorage.removeItem("vibe_user_name");
        localStorage.removeItem(STORAGE_KEYS.lastPlayerSession);
        localStorage.removeItem(STORAGE_KEYS.lastOpenedBook);
        window.location.href = "../../index.html";
    }
};

async function init() {
    if (hasInitialized) return;
    hasInitialized = true;

    console.log("VibeAudio UI starting...");
    setupImageObserver();
    setupRouting();
    renderSyncState();
    await refreshOfflineShelfState();

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") return;

        const state = getCurrentState();
        if (state.book && state.currentTime > 5) {
            console.log("App backgrounded. Saving progress...");
            saveUserProgress(
                state.book.bookId,
                state.currentChapterIndex,
                state.currentTime,
                state.duration,
                {
                    totalChapters: state.book.activeChapters?.length || state.book.chapters?.length || 0
                }
            );
        }
    });

    window.addEventListener('sync-status-change', (event) => {
        renderSyncState(event.detail);
    });
    window.addEventListener('offline-shelf-change', () => {
        queueOfflineShelfRefresh();
    });
    window.addEventListener('online', async () => {
        await resumePendingDownloads();
        await flushPendingProgressQueue();
        invalidateProgressCache();
        const freshBooks = await fetchAllBooks({ forceRefresh: true });
        if (freshBooks.length > 0) {
            allBooks = sortCatalogBooks(freshBooks);
            LibraryUI.renderCategoryFilters(allBooks);
        }
        await refreshPersonalizedCatalog();
    });
    window.addEventListener('offline', () => {
        renderSyncState();
    });

    const user = getLocalUserProfile();
    if (user.name) {
        const nameDisplay = document.getElementById('user-name-display');
        const avatar = document.getElementById('profile-avatar');
        if (nameDisplay) nameDisplay.innerText = user.name;
        if (avatar) {
            avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ff4b1f&color=fff&bold=true`;
        }
    }

    syncUserProfile();

    const cachedCatalog = getCatalogSnapshot();
    if (cachedCatalog.books.length > 0) {
        allBooks = sortCatalogBooks(cachedCatalog.books);
        allBooks = applyOfflineSummariesToBooks(allBooks, offlineShelfSummaries);
        warmOfflineCatalog(allBooks);
        LibraryUI.renderCategoryFilters(allBooks);
        await refreshPersonalizedCatalog();
        restorePlayerSessionIfNeeded();
    }

    const freshBooks = await fetchAllBooks({ forceRefresh: true });
    allBooks = sortCatalogBooks(freshBooks);
    allBooks = applyOfflineSummariesToBooks(allBooks, offlineShelfSummaries);
    warmOfflineCatalog(allBooks);

    LibraryUI.renderCategoryFilters(allBooks);
    await refreshPersonalizedCatalog();
    restorePlayerSessionIfNeeded();
    setupListeners();
}

function normalizeViewId(id) {
    return VALID_VIEWS.has(id) ? id : 'library';
}

function setupRouting() {
    const syncViewFromLocation = (event) => {
        const nextView = normalizeViewId(event?.state?.view || window.location.hash.replace(/^#/, ''));
        switchView(nextView, false);
    };

    window.addEventListener('popstate', syncViewFromLocation);
    window.addEventListener('hashchange', syncViewFromLocation);

    const initialView = normalizeViewId(window.location.hash.replace(/^#/, ''));
    history.replaceState({ view: initialView }, null, `#${initialView}`);
    switchView(initialView, false);
}

function goBackInApp() {
    if (closeSidebarIfOpen()) return;

    if (currentViewId !== 'library') {
        const activeHash = window.location.hash || `#${currentViewId}`;

        if (activeHash !== '#library') {
            const viewBeforeBack = currentViewId;
            window.history.back();

            window.setTimeout(() => {
                if (currentViewId === viewBeforeBack) {
                    switchView('library', false);
                }
            }, 150);
        } else {
            switchView('library', false);
        }

        return;
    }

    window.history.back();
}

function switchView(id, pushHistory = true) {
    const nextView = normalizeViewId(id);

    if (pushHistory) {
        if (currentViewId === nextView && history.state?.view === nextView) {
            history.replaceState({ view: nextView }, null, `#${nextView}`);
        } else {
            history.pushState({ view: nextView }, null, `#${nextView}`);
        }
    } else if (window.location.hash !== `#${nextView}` || history.state?.view !== nextView) {
        history.replaceState({ view: nextView }, null, `#${nextView}`);
    }

    currentViewId = nextView;
    setActiveThemeSurface(nextView === 'history' || nextView === 'player' ? nextView : 'library');

    document.querySelectorAll('.view-section').forEach((el) => el.classList.add('hidden'));
    const view = document.getElementById(`view-${nextView}`);
    if (view) {
        view.classList.remove('hidden');
        if (window.gsap) {
            gsap.fromTo(view, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3 });
        }
    }

    document.querySelectorAll('.sidebar-nav button').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.sidebar-nav button[onclick*="'${nextView}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    document.body.classList.toggle('player-mode', nextView === 'player');

    if (nextView === 'history') {
        refreshPersonalizedCatalog();
    }

    if (nextView === 'offline') {
        renderOfflineView();
    }

    if (nextView === 'profile') {
        renderProfileSnapshot();
    }

    if (nextView === 'library') {
        document.body.style.background = "";
        const playBtn = document.getElementById('play-btn');
        if (playBtn) playBtn.style.boxShadow = 'none';
        refreshPersonalizedCatalog();
    }
}

function filterLibraryLogic(category) {
    currentCategory = category;
    document.querySelectorAll('.filter-btn').forEach((btn) => btn.classList.remove('active'));

    const btnId = LibraryUI.getCategoryButtonId(category);
    const activeBtn = document.getElementById(btnId);
    if (activeBtn) activeBtn.classList.add('active');

    renderLibrarySurfaces();
}

function setupListeners() {
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const seekBack = document.getElementById('seek-back-btn');
    const seekFwd = document.getElementById('seek-fwd-btn');
    const progress = document.getElementById('progress-bar');
    const postBtn = document.getElementById('post-comment-btn');
    const searchInput = document.getElementById('search-input');

    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');
    const syncBtn = document.getElementById('sync-profile-btn');
    const clearOfflineBtn = document.getElementById('clear-offline-downloads-btn');
    const filterContainer = document.getElementById('category-filters');

    const toggleSidebar = (show) => {
        if (!sidebar || !overlay) return false;

        if (show) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            overlay.classList.remove('hidden');
            return true;
        }

        const wasOpen = sidebar.classList.contains('active') || overlay.classList.contains('active');
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
        window.setTimeout(() => overlay.classList.add('hidden'), 300);
        return wasOpen;
    };

    closeSidebarIfOpen = () => toggleSidebar(false);

    if (menuBtn) menuBtn.onclick = () => toggleSidebar(true);
    if (closeBtn) closeBtn.onclick = () => toggleSidebar(false);
    if (overlay) overlay.onclick = () => toggleSidebar(false);

    document.querySelectorAll('.sidebar-nav button').forEach((btn) => {
        btn.addEventListener('click', () => toggleSidebar(false));
    });

    if (filterContainer) {
        filterContainer.addEventListener('click', (event) => {
            const target = event.target.closest('[data-category]');
            if (!target) return;
            filterLibraryLogic(String(target.dataset.category || 'All'));
        });
    }

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            currentSearchQuery = String(event.target.value || '');
            renderLibrarySurfaces();
        });
        searchInput.addEventListener('change', (event) => {
            pushRecentSearch(String(event.target.value || ''));
        });
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                pushRecentSearch(String(event.target.value || ''));
            }
        });
    }

    if (postBtn) {
        postBtn.onclick = () => {
            const input = document.getElementById('comment-input');
            const text = String(input?.value || '').trim();
            if (!text) return;

            const state = getCurrentState();
            if (!state.book) return;
            const currentTime = Math.floor(state.currentTime || 0);
            const savedComment = addPersistentComment(state.book.bookId, {
                time: currentTime,
                user: getCurrentUserName(),
                text
            });
            renderSingleComment(savedComment);

            input.value = '';
            showToast('Comment saved on this device');
        };
    }

    if (playBtn) playBtn.onclick = window.app.togglePlay;
    if (prevBtn) prevBtn.onclick = window.app.prevChapter;
    if (nextBtn) nextBtn.onclick = window.app.nextChapter;
    if (seekBack) seekBack.onclick = () => skip(-10);
    if (seekFwd) seekFwd.onclick = () => skip(10);
    if (syncBtn) syncBtn.onclick = window.app.syncData;
    if (clearOfflineBtn) clearOfflineBtn.onclick = window.app.clearOfflineDownloads;

    if (progress) {
        progress.addEventListener('input', (event) => {
            const pct = Number(event.target.value || 0);
            seekTo(pct);
            progress.style.backgroundSize = `${pct}% 100%`;
        });
    }

    const syncProgressUI = (state = getCurrentState()) => {
        if (!progress || !state.duration) return;

        const pct = (state.currentTime / state.duration) * 100;
        progress.value = pct;
        progress.style.backgroundSize = `${pct}% 100%`;

        const currentTimeEl = document.getElementById('current-time');
        const durationEl = document.getElementById('total-duration');
        if (currentTimeEl) currentTimeEl.innerText = formatTime(state.currentTime);
        if (durationEl) durationEl.innerText = formatTime(state.duration);
    };

    window.addEventListener('player-time-update', (event) => syncProgressUI(event.detail));
    window.addEventListener('player-state-change', () => {
        const state = getCurrentState();
        if (!state.duration) {
            if (progress) {
                progress.value = 0;
                progress.style.backgroundSize = `0% 100%`;
            }

            const currentTimeEl = document.getElementById('current-time');
            const durationEl = document.getElementById('total-duration');
            if (currentTimeEl) currentTimeEl.innerText = "00:00";
            if (durationEl) durationEl.innerText = "00:00";
            return;
        }

        syncProgressUI(state);
    });
}

function setupImageObserver() {
    window.imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const img = entry.target;
            img.src = img.dataset.src;
            img.onload = () => img.classList.add('visible');
            observer.unobserve(img);
        });
    }, { rootMargin: "100px 0px", threshold: 0.01 });
}

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

const style = document.createElement('style');
style.textContent = `
    .lazy-img { opacity: 0; transition: opacity 0.6s ease-in-out; }
    .lazy-img.visible { opacity: 1; }
    .skeleton-loader {
        height: 45px; margin: 10px 0; border-radius: 8px;
        background: rgba(255,255,255,0.05);
        background-image: linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.2) 60%, rgba(255,255,255,0) 100%);
        background-size: 200% 100%;
        animation: skeleton 2s infinite linear;
    }
    @keyframes skeleton { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
`;
document.head.appendChild(style);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
