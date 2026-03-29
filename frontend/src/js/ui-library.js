import { fetchUserProgress } from './api.js';
import { applyHistoryTheme, applyLibraryTheme } from './ui-player-helpers.js';
import {
    compareProgressByRecency,
    getProgressPercent,
    getProgressTimestampValue,
    isBookFinishedProgress
} from './progress-model.js';

function escapeHTML(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function normalizeCategoryKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'all';
}

export function getCategoryButtonId(category) {
    return `filter-${normalizeCategoryKey(category)}`;
}

function getDisplayProgressPercent(progressOrBook) {
    if (!progressOrBook) return 0;

    if (typeof progressOrBook.progressPercent === 'number') {
        return Math.max(0, Math.min(100, Math.round(progressOrBook.progressPercent)));
    }

    return getProgressPercent(progressOrBook);
}

function getSavedState(book) {
    if (!book?.savedState) return null;

    return {
        chapterIndex: Number(book.savedState.chapterIndex || 0),
        currentTime: Number(book.savedState.currentTime || 0)
    };
}

function getResumeText(book) {
    const savedState = getSavedState(book);
    if (!savedState) return "";

    if (book.isFinished) return "Listened recently";
    return `Resume from Part ${savedState.chapterIndex + 1}`;
}

function getOpenPayload(book) {
    const savedState = getSavedState(book);
    return savedState ? { ...book, savedState } : { ...book };
}

function getOfflineBadgeCopy(book) {
    const summary = book?.offlineSummary;
    if (!summary) return '';

    if (summary.overallStatus === 'downloading') return 'Saving offline';
    if (summary.overallStatus === 'queued') return 'Queued offline';
    if (summary.overallStatus === 'update_available') return 'Needs update';
    if (summary.overallStatus === 'failed') return 'Retry offline';
    if (summary.totalDownloadedChapters > 0) return `${summary.totalDownloadedChapters} offline`;
    return '';
}

function createLibraryCard(book, openPlayerCallback, placeholder) {
    const moodHTML = (book.moods || []).map((mood) => `<span class="mood-tag">${escapeHTML(mood)}</span>`).join('');
    const genreHTML = book.genre ? `<span class="mood-tag genre-accent">${escapeHTML(book.genre)}</span>` : '';
    const progressPercent = getDisplayProgressPercent(book);
    const savedState = getSavedState(book);
    const progressHTML = savedState ? `
        <div class="card-progress-block">
            <div class="card-progress-track">
                <div class="card-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <p class="card-progress-text">${escapeHTML(getResumeText(book))} - ${progressPercent}% done</p>
        </div>` : '';
    const offlineBadgeCopy = getOfflineBadgeCopy(book);
    const offlineBadge = offlineBadgeCopy ? `
        <div class="card-offline-badge" data-status="${escapeHTML(book.offlineSummary?.overallStatus || '')}">
            ${escapeHTML(offlineBadgeCopy)}
        </div>` : '';
    const activityBadge = savedState ? `
        <div class="card-activity-badge ${book.isFinished ? 'finished' : 'continue'}">
            ${book.isFinished ? 'Finished' : `Part ${savedState.chapterIndex + 1}`}
        </div>` : '';

    const card = document.createElement('div');
    card.className = `book-card ${savedState ? 'has-progress' : ''} ${book.isFinished ? 'is-finished' : ''}`;
    card.tabIndex = 0;
    card.innerHTML = `
        <div class="img-container">
            <img class="lazy-img" src="${placeholder}" data-src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}">
            <div class="book-badge">${book.totalChapters || 0} Parts</div>
            ${activityBadge}
            ${offlineBadge}
        </div>
        <div class="card-content">
            <h3>${escapeHTML(book.title)}</h3>
            <p>${escapeHTML(book.author)}</p>
            <div class="mood-tags">${genreHTML}${moodHTML}</div>
            ${progressHTML}
        </div>`;

    card.onclick = () => openPlayerCallback(getOpenPayload(book));
    card.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPlayerCallback(getOpenPayload(book));
        }
    };

    return card;
}

function formatUpdatedText(updatedAt) {
    const deltaMs = Date.now() - getProgressTimestampValue({ lastInteractionAt: updatedAt });
    if (!deltaMs || deltaMs < 0) return "Recently";

    const hours = Math.floor(deltaMs / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return "Earlier";
}

function createHistoryCard(book, progress, openPlayerCallback) {
    const percent = getDisplayProgressPercent(progress);
    const chapterNumber = Number(progress.chapterIndex || 0) + 1;
    const finished = isBookFinishedProgress(progress);

    const card = document.createElement('div');
    card.className = 'history-card';
    card.tabIndex = 0;
    card.innerHTML = `
        <div class="history-layout">
            <img src="${escapeHTML(book.cover)}" loading="lazy" class="history-cover">
            <div class="history-info">
                <h3>${escapeHTML(book.title)}</h3>
                <div class="chapter-badge">
                    <i class="fas fa-bookmark"></i>
                    <span>${finished ? 'Finished recently' : `Resume from Part ${chapterNumber}`}</span>
                </div>
                <div class="progress-container">
                    <div class="mini-progress-track">
                        <div class="mini-progress-fill" style="width: ${percent}%"></div>
                    </div>
                    <span class="progress-text">${percent}% done - ${formatUpdatedText(progress.lastInteractionAt)}</span>
                </div>
            </div>
            <div class="history-play-btn"><i class="fas fa-play"></i></div>
        </div>`;

    card.onclick = () => {
        openPlayerCallback({
            ...book,
            savedState: {
                chapterIndex: Number(progress.chapterIndex || 0),
                currentTime: Number(progress.currentTime || 0)
            }
        });
    };
    card.onkeydown = (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        card.click();
    };

    return card;
}

export function renderCategoryFilters(allBooks) {
    const container = document.getElementById('category-filters');
    if (!container) return;

    const moods = new Set(['All']);
    allBooks.forEach((book) => {
        if (book.genre) moods.add(book.genre);
        if (book.moods) book.moods.forEach((m) => moods.add(m));
    });

    container.innerHTML = Array.from(moods).map((mood) => `
        <button class="filter-btn ${mood === 'All' ? 'active' : ''}" 
                id="${getCategoryButtonId(mood)}"
                data-category="${escapeHTML(mood)}"
                type="button">
            ${escapeHTML(mood)}
        </button>
    `).join('');
}

export function renderLibrarySpotlight(books, openPlayerCallback, options = {}) {
    const container = document.getElementById('library-personalized');
    if (!container) return;

    const activeCategory = options.activeCategory || 'All';
    const searchQuery = String(options.searchQuery || '').trim();
    const historyBooks = books
        .filter((book) => book.savedState && !book.isFinished)
        .sort((a, b) => getProgressTimestampValue({ lastInteractionAt: b.lastInteractionAt })
            - getProgressTimestampValue({ lastInteractionAt: a.lastInteractionAt }));

    const lastOpenedState = options.lastOpenedState || null;
    const lastOpenedBook = lastOpenedState?.bookId
        ? historyBooks.find((book) => String(book.bookId) === String(lastOpenedState.bookId))
        : null;
    const continueBook = lastOpenedBook || historyBooks[0];
    const preferredTags = Array.from(new Set(
        historyBooks.flatMap((book) => book.topReasons || [])
    )).slice(0, 3);

    const recommendations = books
        .filter((book) => (!continueBook || String(book.bookId) !== String(continueBook.bookId)))
        .filter((book) => !book.savedState)
        .filter((book) => !book.isFinished)
        .sort((a, b) => {
            const scoreDiff = (b.personalizedScore || 0) - (a.personalizedScore || 0);
            if (scoreDiff) return scoreDiff;
            return (a.catalogOrder || 0) - (b.catalogOrder || 0);
        })
        .slice(0, 4);

    if (searchQuery || activeCategory !== 'All' || historyBooks.length === 0 || (!continueBook && recommendations.length === 0)) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }

    const continueProgress = continueBook ? getDisplayProgressPercent(continueBook) : 0;
    const syncStatus = options.syncStatus?.status || '';
    const syncBadge = syncStatus === 'offline'
        ? 'Saved Offline'
        : syncStatus === 'pending'
            ? 'Sync Pending'
            : 'Cloud Synced';
    const reasonText = preferredTags.length ? `Because you keep listening to ${preferredTags.join(', ')}` : "More stories matching your listening vibe";

    container.classList.remove('hidden');
    container.innerHTML = `
        ${continueBook ? `
            <div class="continue-spotlight">
                <div class="continue-copy">
                    <span class="personalized-kicker">Continue Listening</span>
                    <span class="spotlight-sync-pill" data-status="${escapeHTML(syncStatus)}">${escapeHTML(syncBadge)}</span>
                    <h3>${escapeHTML(continueBook.title)}</h3>
                    <p>${escapeHTML(continueBook.author)}</p>
                    <div class="spotlight-progress-track">
                        <div class="spotlight-progress-fill" style="width: ${continueProgress}%"></div>
                    </div>
                    <span class="spotlight-progress-text">${getResumeText(continueBook)} - ${continueProgress}% done</span>
                    <button class="action-btn personalized-action" data-continue-book="${continueBook.bookId}">
                        <i class="fas fa-play"></i> Resume Book
                    </button>
                </div>
                <img src="${escapeHTML(continueBook.cover)}" alt="${escapeHTML(continueBook.title)}" class="continue-cover">
            </div>` : ''}
        ${recommendations.length ? `
            <div class="library-discovery-panel">
                <div class="discovery-header">
                    <div>
                        <span class="personalized-kicker">Picked For You</span>
                        <h3>${escapeHTML(reasonText)}</h3>
                    </div>
                </div>
                <div class="discovery-grid">
                    ${recommendations.map((book) => `
                        <button class="discovery-card" data-book-id="${book.bookId}">
                            <img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}">
                            <div class="discovery-info">
                                <strong>${escapeHTML(book.title)}</strong>
                                <span>${escapeHTML(book.recommendationReason || book.genre || 'Fresh pick for you')}</span>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>` : ''}`;

    const continueBtn = container.querySelector('[data-continue-book]');
    if (continueBtn && continueBook) {
        continueBtn.onclick = () => openPlayerCallback(getOpenPayload(continueBook));
    }

    container.querySelectorAll('[data-book-id]').forEach((button) => {
        button.onclick = () => {
            const book = books.find((item) => String(item.bookId) === String(button.dataset.bookId));
            if (book) openPlayerCallback(getOpenPayload(book));
        };
    });
}

export function renderLibrary(books, openPlayerCallback) {
    const grid = document.getElementById('book-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!books.length) {
        grid.innerHTML = '<div class="empty-state"><p>Iss vibe ki koi book nahi mili. Try another filter. </p></div>';
        return;
    }

    applyLibraryTheme(null, true);

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    books.forEach((book) => {
        const card = createLibraryCard(book, openPlayerCallback, placeholder);
        grid.appendChild(card);

        const img = card.querySelector('img');
        if (window.imageObserver) window.imageObserver.observe(img);
    });

    if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
        window.VanillaTilt.init(document.querySelectorAll("#book-grid .book-card"), {
            max: 12, speed: 400, glare: true, "max-glare": 0.2, scale: 1.05
        });
    }
}

export function renderOfflineShelf(books, openPlayerCallback) {
    const grid = document.getElementById('offline-grid');
    if (!grid) return;

    grid.innerHTML = '';
    if (!books.length) {
        grid.innerHTML = '<div class="empty-state"><p>No offline books yet. Save a direct-audio title from the player to build your browser shelf.</p></div>';
        return;
    }

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    books.forEach((book) => {
        const card = createLibraryCard(book, openPlayerCallback, placeholder);
        grid.appendChild(card);

        const img = card.querySelector('img');
        if (window.imageObserver) window.imageObserver.observe(img);
    });
}

export async function renderHistory(allBooks, openPlayerCallback, historyData = null) {
    const grid = document.getElementById('history-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="shimmer-loader"><i class="fas fa-spinner fa-spin"></i> Fetching your history...</div>';

    try {
        const history = Array.isArray(historyData) ? historyData : await fetchUserProgress();
        const sortedHistory = [...history].sort(compareProgressByRecency);

        if (!sortedHistory.length) {
            grid.innerHTML = '<p class="empty-msg">Abhi tak kuch nahi suna? Start listening! </p>';
            return;
        }

        grid.innerHTML = '';
        sortedHistory.forEach((progress) => {
            const book = allBooks.find((item) => String(item.bookId) === String(progress.bookId));
            if (!book) return;

            grid.appendChild(createHistoryCard(book, progress, openPlayerCallback));
        });

        applyHistoryTheme(null, document.body?.dataset.themeSurface === 'history');
    } catch (error) {
        console.error("History Render Error:", error);
        grid.innerHTML = '<p class="empty-msg" style="color:#ff4b1f">History load nahi ho paayi.</p>';
    }
}
