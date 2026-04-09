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

function getBookAccentLabel(book) {
    if (book?.savedState && !book?.isFinished) {
        return 'Continue listening';
    }

    if (book?.isFinished) {
        return 'Finished';
    }

    if (book?.genre) {
        return String(book.genre);
    }

    if (Array.isArray(book?.moods) && book.moods.length) {
        return String(book.moods[0]);
    }

    return 'Featured pick';
}

function createLibraryCard(book, openPlayerCallback, placeholder) {
    const accentLabel = getBookAccentLabel(book);
    const progressPercent = getDisplayProgressPercent(book);
    const savedState = getSavedState(book);
    const progressHTML = savedState ? `
        <div class="card-progress-block">
            <div class="card-progress-track">
                <div class="card-progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <p class="card-progress-text">${escapeHTML(getResumeText(book))} - ${progressPercent}% complete</p>
        </div>` : '';
    const offlineBadgeCopy = getOfflineBadgeCopy(book);
    const offlineBadge = offlineBadgeCopy ? `
        <div class="card-offline-badge" data-status="${escapeHTML(book.offlineSummary?.overallStatus || '')}">
            ${escapeHTML(offlineBadgeCopy)}
        </div>` : '';
    const activityBadge = savedState || book.isFinished ? `
        <div class="card-activity-badge ${book.isFinished ? 'finished' : 'continue'}">
            ${book.isFinished ? 'Finished' : `Part ${(savedState?.chapterIndex || 0) + 1}`}
        </div>` : '';
    const utilityLine = savedState
        ? `${escapeHTML(book.author)}`
        : `${escapeHTML(book.author)} - ${Number(book.totalChapters || 0)} parts`;

    const card = document.createElement('div');
    card.className = `book-card ${savedState ? 'has-progress' : ''} ${book.isFinished ? 'is-finished' : ''}`;
    card.tabIndex = 0;
    card.innerHTML = `
        <div class="book-card-media">
            <img class="lazy-img" src="${placeholder}" data-src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}">
            <div class="book-badge">${book.totalChapters || 0} Parts</div>
            ${activityBadge}
            ${offlineBadge}
        </div>
        <div class="card-content">
            <span class="card-kicker">${escapeHTML(accentLabel)}</span>
            <h3>${escapeHTML(book.title)}</h3>
            <p class="card-author">${utilityLine}</p>
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

    const counts = new Map([['All', Number.MAX_SAFE_INTEGER]]);
    allBooks.forEach((book) => {
        if (book.genre) counts.set(book.genre, (counts.get(book.genre) || 0) + 2);
        if (book.moods) {
            book.moods.forEach((mood) => counts.set(mood, (counts.get(mood) || 0) + 1));
        }
    });

    const orderedCategories = Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([label]) => label)
        .slice(0, 9);

    container.innerHTML = orderedCategories.map((mood) => `
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
    const reasonText = preferredTags.length ? `Because you return to ${preferredTags.join(', ')}` : "More stories aligned with your listening taste";

    container.classList.remove('hidden');
    container.innerHTML = `
        <div class="discovery-stage">
        ${continueBook ? `
            <div class="continue-spotlight premium-stage">
                <div class="continue-copy">
                    <span class="personalized-kicker">Continue listening</span>
                    <span class="spotlight-sync-pill" data-status="${escapeHTML(syncStatus)}">${escapeHTML(syncBadge)}</span>
                    <h3>${escapeHTML(continueBook.title)}</h3>
                    <p class="continue-byline">${escapeHTML(continueBook.author)}</p>
                    <div class="spotlight-progress-track">
                        <div class="spotlight-progress-fill" style="width: ${continueProgress}%"></div>
                    </div>
                    <span class="spotlight-progress-text">${getResumeText(continueBook)} - ${continueProgress}% complete</span>
                    <button class="action-btn personalized-action" data-continue-book="${continueBook.bookId}">
                        <i class="fas fa-play"></i> Resume story
                    </button>
                </div>
                <img src="${escapeHTML(continueBook.cover)}" alt="${escapeHTML(continueBook.title)}" class="continue-cover">
            </div>` : ''}
        ${recommendations.length ? `
            <div class="library-discovery-panel premium-stage">
                <div class="discovery-header">
                    <div>
                        <span class="personalized-kicker">Picked for you</span>
                        <h3>${escapeHTML(reasonText)}</h3>
                    </div>
                </div>
                <div class="discovery-grid">
                    ${recommendations.map((book) => `
                        <button class="discovery-card" data-book-id="${book.bookId}">
                            <img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)}">
                            <div class="discovery-info">
                                <strong>${escapeHTML(book.title)}</strong>
                                <span>${escapeHTML(book.recommendationReason || book.genre || 'Fresh shelf pick')}</span>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>` : ''}
        </div>`;

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

    if (!books.length) {
        grid.innerHTML = '<div class="empty-state"><p>No titles matched this lane. Try a broader mood, genre, or author.</p></div>';
        return;
    }

    applyLibraryTheme(null, true);

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    grid.innerHTML = `
        <section class="catalog-stage">
            <div class="catalog-head">
                <div>
                    <span class="catalog-kicker">Browse the shelf</span>
                    <h3>Curated picks, ready to open</h3>
                </div>
            </div>
            <div class="catalog-grid"></div>
        </section>
    `;

    const catalogGrid = grid.querySelector('.catalog-grid');
    if (!catalogGrid) return;

    books.forEach((book) => {
        const card = createLibraryCard(book, openPlayerCallback, placeholder);
        catalogGrid.appendChild(card);

        const img = card.querySelector('img');
        if (window.imageObserver) window.imageObserver.observe(img);
    });

    if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
        window.VanillaTilt.init(document.querySelectorAll("#book-grid .book-card"), {
            max: 5, speed: 300, glare: false, scale: 1.01
        });
    }
}

export function renderRecentSearches(searches = []) {
    const libraryView = document.getElementById('view-library');
    const filterContainer = document.getElementById('category-filters');
    if (!libraryView || !filterContainer) return;

    let panel = document.getElementById('recent-searches-panel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'recent-searches-panel';
        filterContainer.insertAdjacentElement('afterend', panel);
    }

    const items = Array.isArray(searches) ? searches.filter(Boolean) : [];
    if (!items.length) {
        panel.innerHTML = '';
        panel.classList.add('hidden');
        return;
    }

    panel.classList.remove('hidden');
    panel.innerHTML = `
        <div class="recent-searches-header">
            <span>Recent searches</span>
            <button class="clear-recent-btn" type="button" data-clear-recent="true">Clear</button>
        </div>
        <div class="recent-searches-tags">
            ${items.map((query) => `
                <button class="recent-search-tag" type="button" data-query="${escapeHTML(query)}">${escapeHTML(query)}</button>
            `).join('')}
        </div>
    `;
}

export function renderOfflineShelf(books, openPlayerCallback) {
    const grid = document.getElementById('offline-grid');
    if (!grid) return;

    if (!books.length) {
        grid.innerHTML = '<div class="empty-state"><p>No offline stories yet. Save a direct-audio title from the player to build your browser shelf.</p></div>';
        return;
    }

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    grid.innerHTML = '<div class="catalog-grid offline-catalog-grid"></div>';
    const catalogGrid = grid.querySelector('.catalog-grid');
    if (!catalogGrid) return;

    books.forEach((book) => {
        const card = createLibraryCard(book, openPlayerCallback, placeholder);
        catalogGrid.appendChild(card);

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
            grid.innerHTML = '<p class="empty-msg">No recent listening yet. Start one standout story and it will stay here.</p>';
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
