import { fetchAllBooks, fetchUserProgress, getLocalUserProfile, syncUserProfile, saveUserProgress } from './api.js';
import { togglePlay, nextChapter, prevChapter, skip, seekTo, getCurrentState } from './player.js';
import * as LibraryUI from './ui-library.js';
import { openPlayerUI, updateUI } from './ui-player-main.js';
import { formatTime, renderSingleComment, setActiveThemeSurface } from './ui-player-helpers.js';

let allBooks = [];
let userHistory = [];
let currentViewId = 'library';
let currentCategory = 'All';
let currentSearchQuery = '';
let closeSidebarIfOpen = () => false;

const VALID_VIEWS = new Set(['library', 'history', 'about', 'profile', 'player']);

function getTimeStamp(value) {
    const stamp = Date.parse(value || 0);
    return Number.isFinite(stamp) ? stamp : 0;
}

function getProgressPercent(progress) {
    if (!progress) return 0;

    const currentTime = Number(progress.currentTime || 0);
    const totalDuration = Number(progress.totalDuration || 0);
    if (totalDuration <= 0) return currentTime > 0 ? 1 : 0;

    return Math.max(0, Math.min(100, Math.round((currentTime / totalDuration) * 100)));
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
    const sortedHistory = [...history].sort((a, b) => getTimeStamp(b.updatedAt) - getTimeStamp(a.updatedAt));
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
            const isFinished = Boolean(progress?.isFinished || progressPercent >= 92);
            const progressBoost = savedState ? 1400 + progressPercent : 0;

            return {
                ...book,
                savedState,
                progressPercent,
                lastUpdatedAt: progress?.updatedAt || null,
                historyRank: progress?.historyRank ?? Number.MAX_SAFE_INTEGER,
                isFinished,
                personalizedScore: progressBoost + preferenceScore + (isFinished ? 40 : 0),
                recommendationReason: matchingSignals[0]?.label || '',
                topReasons: matchingSignals.slice(0, 3).map((signal) => signal.label)
            };
        })
        .sort((a, b) => {
            const scoreDiff = (b.personalizedScore || 0) - (a.personalizedScore || 0);
            if (scoreDiff) return scoreDiff;

            const recencyDiff = getTimeStamp(b.lastUpdatedAt) - getTimeStamp(a.lastUpdatedAt);
            if (recencyDiff) return recencyDiff;

            return (a.catalogOrder || 0) - (b.catalogOrder || 0);
        });
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
        searchQuery: currentSearchQuery
    });
    LibraryUI.renderLibrary(getVisibleBooks(), openBookFromCollection);
}

async function refreshPersonalizedCatalog() {
    try {
        userHistory = await fetchUserProgress();
    } catch (error) {
        console.warn("Unable to refresh user history.", error);
        userHistory = [];
    }

    allBooks = enrichBooksWithHistory(allBooks, userHistory);
    renderLibrarySurfaces();
    LibraryUI.renderHistory(allBooks, openBookFromCollection, userHistory);
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
        const btn = document.querySelector('.btn-secondary');
        if (!btn) return;

        const icon = btn.querySelector('i');
        const originalText = btn.innerHTML;

        if (icon) icon.classList.add('fa-spin');
        btn.innerHTML = `<i class="fas fa-sync fa-spin"></i> Syncing...`;
        btn.disabled = true;

        await syncUserProfile();

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

    logout: async () => {
        console.log("Logging out...");
        if (window.Clerk) {
            try {
                await window.Clerk.signOut();
            } catch (error) {
                console.warn("Clerk signout issue:", error);
            }
        }

        localStorage.removeItem("vibe_user_id");
        localStorage.removeItem("vibe_user_name");
        window.location.href = "../../index.html";
    }
};

async function init() {
    console.log("VibeAudio UI starting...");
    setupImageObserver();
    setupRouting();

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "hidden") return;

        const state = getCurrentState();
        if (state.book && state.currentTime > 5) {
            console.log("App backgrounded. Saving progress...");
            saveUserProgress(state.book.bookId, state.currentChapterIndex, state.currentTime, state.duration);
        }
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

    allBooks = await fetchAllBooks();
    if (allBooks.length > 0) {
        allBooks = allBooks.sort((a, b) => {
            const numA = parseInt(String(a.bookId || '').replace(/\D/g, ''), 10) || 0;
            const numB = parseInt(String(b.bookId || '').replace(/\D/g, ''), 10) || 0;
            return numA - numB;
        }).map((book, index) => ({ ...book, catalogOrder: index }));
    }

    LibraryUI.renderCategoryFilters(allBooks);
    await refreshPersonalizedCatalog();
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

    const btnId = category === 'All' ? 'filter-all' : `filter-${category}`;
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

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            currentSearchQuery = String(event.target.value || '');
            renderLibrarySurfaces();
        });
    }

    if (postBtn) {
        postBtn.onclick = () => {
            const input = document.getElementById('comment-input');
            const text = String(input?.value || '').trim();
            if (!text) return;

            const state = getCurrentState();
            const currentTime = Math.floor(state.currentTime || 0);
            renderSingleComment({ time: currentTime, user: "You", text });

            input.value = '';
        };
    }

    if (playBtn) playBtn.onclick = window.app.togglePlay;
    if (prevBtn) prevBtn.onclick = window.app.prevChapter;
    if (nextBtn) nextBtn.onclick = window.app.nextChapter;
    if (seekBack) seekBack.onclick = () => skip(-10);
    if (seekFwd) seekFwd.onclick = () => skip(10);

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

document.addEventListener('DOMContentLoaded', init);
