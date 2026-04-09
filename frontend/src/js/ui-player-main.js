import { fetchBookDetails, fetchUserProgress } from './api.js';
import {
    loadBook,
    getCurrentState,
    isPlaybackActive,
    skip,
    setPlaybackSpeed,
    setSleepTimer,
    getCurrentChapterOfflineState,
    downloadCurrentChapter,
    deleteChapter,
    getCurrentLang,
    queueCurrentBookForOffline,
    removeCurrentBookOffline,
    toggleVocalBoost
} from './player.js';
import { getOfflineBook, OFFLINE_STATES } from './offline-shelf.js';
import { renderChapterList, toggleLangUI } from './ui-player-list.js';
import { applyChameleonTheme, renderComments, showToast } from './ui-player-helpers.js';
import { STORAGE_KEYS } from './config.js';
import { addBookmark, getBookmarks, getPersistentComments, removeBookmark } from './user-data.js';

window.addEventListener('player-state-change', (event) => {
    const { isPlaying, book, chapter } = event.detail;
    updateUI(isPlaying, book, chapter);
});

let offlineUiRefreshQueued = false;

window.addEventListener('offline-shelf-change', () => {
    if (offlineUiRefreshQueued) return;
    offlineUiRefreshQueued = true;

    requestAnimationFrame(() => {
        offlineUiRefreshQueued = false;
        const state = getCurrentState();
        updateUI(state.isPlaying, state.book);
    });
});

const speeds = [1, 1.25, 1.5, 2, 0.95, 0.9, 0.8];
let currentSpeedIndex = Math.max(0, speeds.indexOf(Number(localStorage.getItem(STORAGE_KEYS.playbackSpeed) || 1)));
const sleepTimes = [0, 15, 30, 60];
let currentSleepIndex = 0;
let lastYouTubeHintSource = "";

function warmActiveBookOffline(book) {
    const bridge = window.VibePWA;
    if (!bridge?.primeOfflineResources || !book) return;

    const urls = [book.dataPath, book.cover]
        .map((value) => {
            try {
                return new URL(String(value || ''), window.location.href).href;
            } catch (error) {
                return '';
            }
        })
        .filter(Boolean);

    if (!urls.length) return;
    void bridge.primeOfflineResources(urls);
}

function formatStorageSize(bytes) {
    const safeBytes = Math.max(0, Number(bytes || 0));
    if (!safeBytes) return '0 MB';
    if (safeBytes >= 1024 ** 3) return `${(safeBytes / (1024 ** 3)).toFixed(1)} GB`;
    return `${Math.max(0.1, safeBytes / (1024 ** 2)).toFixed(safeBytes >= 1024 ** 2 ? 1 : 0)} MB`;
}

function formatRelativeLabel(value) {
    const stamp = Date.parse(value || 0);
    if (!Number.isFinite(stamp)) return 'recently';

    const delta = Date.now() - stamp;
    if (delta < 60 * 1000) return 'just now';

    const minutes = Math.floor(delta / (60 * 1000));
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function setButtonLoading(button, label) {
    if (!button) return;
    button.disabled = true;
    button.dataset.previousHtml = button.innerHTML;
    button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label}`;
}

function resetButtonLoading(button) {
    if (!button) return;
    if (button.dataset.previousHtml) {
        button.innerHTML = button.dataset.previousHtml;
        delete button.dataset.previousHtml;
    }
    button.disabled = false;
}

function buildBookSummary(book) {
    if (!book) return 'Pick a story and VibeAudio will keep your place across every listening session.';
    if (book.description) return String(book.description);

    const moods = Array.isArray(book.moods) && book.moods.length ? book.moods.slice(0, 3).join(', ') : '';
    const genreLine = book.genre ? `${book.genre} listening` : 'immersive listening';
    const moodLine = moods ? ` tuned for ${moods}` : '';
    return `${genreLine} by ${book.author || 'a curated voice'}${moodLine}. Jump in, pause anywhere, and come back exactly where you left off.`;
}

function renderDetailMeta(book) {
    const container = document.getElementById('detail-pills');
    if (!container) return;

    container.innerHTML = '';
    const pills = [
        `${Number(book.totalChapters || book.chapters?.length || 0)} parts`,
        book.genre || '',
        ...(Array.isArray(book.moods) ? book.moods.slice(0, 3) : []),
        book.chapters_en?.length ? 'Hindi + English' : 'Single language'
    ].filter(Boolean);

    pills.forEach((label) => {
        const pill = document.createElement('span');
        pill.className = 'detail-pill';
        pill.textContent = String(label);
        container.appendChild(pill);
    });
}

function renderBookmarks(book) {
    const list = document.getElementById('bookmark-list');
    if (!list || !book) return;

    const bookmarks = getBookmarks(book.bookId);
    list.innerHTML = '';

    if (!bookmarks.length) {
        const empty = document.createElement('p');
        empty.className = 'bookmark-empty';
        empty.textContent = 'Save key moments here so you can jump back to them later.';
        list.appendChild(empty);
        return;
    }

    bookmarks.forEach((bookmark) => {
        const row = document.createElement('div');
        row.className = 'bookmark-item';

        const jumpButton = document.createElement('button');
        jumpButton.type = 'button';
        jumpButton.className = 'bookmark-jump';
        jumpButton.addEventListener('click', () => window.app.seekToComment(bookmark.time));

        const title = document.createElement('strong');
        title.textContent = bookmark.label || `Saved moment at ${bookmark.chapterName}`;
        const meta = document.createElement('span');
        meta.textContent = `${bookmark.chapterName} - ${Math.floor(Number(bookmark.time || 0) / 60)}:${Math.floor(Number(bookmark.time || 0) % 60).toString().padStart(2, '0')}`;
        jumpButton.appendChild(title);
        jumpButton.appendChild(meta);

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className = 'bookmark-remove';
        removeButton.textContent = 'Remove';
        removeButton.addEventListener('click', (event) => {
            event.stopPropagation();
            removeBookmark(book.bookId, bookmark.id);
            renderBookmarks(book);
            showToast('Saved moment removed');
        });

        row.appendChild(jumpButton);
        row.appendChild(removeButton);
        list.appendChild(row);
    });
}

function saveCurrentBookmark() {
    const state = getCurrentState();
    if (!state.book) {
        showToast('Start a story before saving a moment');
        return;
    }

    const chapter = state.book.activeChapters?.[state.currentChapterIndex];
    addBookmark(state.book, {
        chapterIndex: state.currentChapterIndex,
        chapterName: chapter?.name || `Part ${state.currentChapterIndex + 1}`,
        time: state.currentTime,
        label: `${chapter?.name || 'Current part'} - ${Math.floor(Number(state.currentTime || 0) / 60)}:${Math.floor(Number(state.currentTime || 0) % 60).toString().padStart(2, '0')}`
    });

    renderBookmarks(state.book);
    showToast('Moment saved to bookmarks');
}

function canKeepScreenAwake() {
    return Boolean(navigator.wakeLock?.request);
}

function openCurrentSourceInBrowser() {
    const sourceUrl = String(getCurrentState().sourceUrl || '').trim();
    if (!sourceUrl) {
        showToast("Source link is unavailable right now.");
        return;
    }

    showToast("Opening the source in your browser.");

    const openedWindow = window.open(sourceUrl, '_blank');
    if (openedWindow) {
        openedWindow.opener = null;
    } else {
        window.location.href = sourceUrl;
    }
}

function syncSourceSupportUI(state) {
    const note = document.getElementById('source-support-note');
    const noteText = document.getElementById('source-support-text');
    const noteButton = document.getElementById('source-support-open-btn');
    const miniButton = document.getElementById('open-source-btn');

    const hasSourceUrl = Boolean(state.book && state.sourceUrl);
    const isYouTubeSource = state.sourceType === 'youtube' && hasSourceUrl;

    if (note) {
        note.classList.toggle('hidden', !isYouTubeSource);
    }

    if (noteText && isYouTubeSource) {
        const wakeLockHint = canKeepScreenAwake()
            ? " VibeAudio may also request a wake lock to keep playback steadier while the tab stays active."
            : "";
        noteText.innerText = `This source is running in audio-only mode with the video hidden.${wakeLockHint} If playback stops in your browser, open the original source directly.`;
    } else if (noteText) {
        noteText.innerText = "";
    }

    if (noteButton) {
        noteButton.onclick = isYouTubeSource ? openCurrentSourceInBrowser : null;
    }

    if (miniButton) {
        miniButton.style.display = isYouTubeSource ? 'inline-flex' : 'none';
        miniButton.onclick = isYouTubeSource ? openCurrentSourceInBrowser : null;
        miniButton.title = isYouTubeSource ? "Open source in browser if playback stops" : "Open source in browser";
    }

    const nextHintSource = isYouTubeSource ? String(state.sourceUrl) : "";
    if (nextHintSource && nextHintSource !== lastYouTubeHintSource) {
        showToast("YouTube audio mode active.");
    }

    lastYouTubeHintSource = nextHintSource;
}

async function syncOfflineExperienceUI(book, chapter, state) {
    const chapterButton = document.getElementById('download-btn');
    const bookButton = document.getElementById('download-book-btn');
    const removeBookButton = document.getElementById('remove-offline-book-btn');
    const statusChip = document.getElementById('player-offline-status-chip');
    const statusSummary = document.getElementById('player-offline-summary');
    const statusMeta = document.getElementById('player-offline-meta');

    if (!chapterButton || !statusChip || !statusSummary || !statusMeta) return;

    const isYouTubeSource = state.sourceType === 'youtube';
    const offlineState = await getCurrentChapterOfflineState();
    const offlineBook = book ? await getOfflineBook(book.bookId, getCurrentLang()) : null;
    const savedCount = Number(offlineBook?.totalDownloadedChapters || 0);
    const queueCount = Number(offlineBook?.statusCounts?.queued || 0) + Number(offlineBook?.statusCounts?.downloading || 0);
    const totalParts = Number(offlineBook?.totalChapters || book?.totalChapters || book?.activeChapters?.length || book?.chapters?.length || 0);
    const sizeLabel = formatStorageSize(offlineBook?.totalSizeBytes || 0);
    const validatedLabel = offlineBook?.lastValidatedAt ? formatRelativeLabel(offlineBook.lastValidatedAt) : 'not validated yet';

    chapterButton.style.display = 'inline-flex';
    chapterButton.disabled = false;
    chapterButton.style.opacity = '';
    chapterButton.style.cursor = '';
    chapterButton.style.color = '';

    statusChip.dataset.state = offlineState.status;

    if (isYouTubeSource || offlineState.status === 'not_available') {
        chapterButton.innerHTML = `<i class="fas fa-ban"></i>`;
        chapterButton.disabled = true;
        chapterButton.title = offlineState.reason || 'This chapter is not available for offline use.';
        chapterButton.style.opacity = '0.55';
        chapterButton.style.cursor = 'not-allowed';

        statusChip.textContent = 'Streaming Only';
        statusSummary.textContent = 'YouTube-backed chapters stay streaming-only in browser. Playback still works, but VibeAudio will not save this source offline.';
        statusMeta.textContent = 'Direct audio sources can be saved inside your browser for offline playback.';
        if (bookButton) bookButton.disabled = true;
        if (removeBookButton) removeBookButton.disabled = savedCount === 0 && queueCount === 0;
        return;
    }

    if (offlineState.status === OFFLINE_STATES.downloaded) {
        chapterButton.innerHTML = `<i class="fas fa-check"></i>`;
        chapterButton.title = 'Remove this offline chapter';
        chapterButton.style.color = '#77d28c';
    } else if (offlineState.status === OFFLINE_STATES.updateAvailable) {
        chapterButton.innerHTML = `<i class="fas fa-rotate"></i>`;
        chapterButton.title = 'Refresh this offline chapter';
        chapterButton.style.color = '#ffd37b';
    } else if (offlineState.status === OFFLINE_STATES.downloading) {
        const progressPercent = Math.max(0, Math.round(Number(offlineState.record?.progressPercent || 0)));
        chapterButton.innerHTML = `<span>${progressPercent || 0}%</span>`;
        chapterButton.title = 'Chapter download in progress';
        chapterButton.disabled = true;
    } else if (offlineState.status === OFFLINE_STATES.queued) {
        chapterButton.innerHTML = `<i class="fas fa-list-check"></i>`;
        chapterButton.title = 'Chapter is queued for download';
        chapterButton.disabled = true;
    } else if (offlineState.status === OFFLINE_STATES.failed) {
        chapterButton.innerHTML = `<i class="fas fa-exclamation-triangle"></i>`;
        chapterButton.title = offlineState.reason || 'Retry offline download';
    } else {
        chapterButton.innerHTML = `<i class="fas fa-download"></i>`;
        chapterButton.title = 'Save this chapter for offline use';
    }

    if (state.playbackOrigin === 'offline') {
        statusChip.textContent = 'Playing Offline';
        statusSummary.textContent = 'This chapter is already saved inside your browser. VibeAudio is using the local copy automatically.';
    } else if (offlineState.status === OFFLINE_STATES.downloaded) {
        statusChip.textContent = 'Available Offline';
        statusSummary.textContent = 'This chapter is saved locally. VibeAudio will prefer the browser copy when you play it again or go offline.';
    } else if (offlineState.status === OFFLINE_STATES.updateAvailable) {
        statusChip.textContent = 'Needs Update';
        statusSummary.textContent = 'A saved copy exists, but the source metadata changed. Refresh once to keep the offline file current.';
    } else if (offlineState.status === OFFLINE_STATES.downloading) {
        const progressPercent = Math.max(0, Math.round(Number(offlineState.record?.progressPercent || 0)));
        statusChip.textContent = 'Downloading';
        statusSummary.textContent = progressPercent > 0
            ? `Saving this chapter inside your browser. ${progressPercent}% complete.`
            : 'Saving this chapter inside your browser right now.';
    } else if (offlineState.status === OFFLINE_STATES.queued) {
        statusChip.textContent = 'Queued';
        statusSummary.textContent = 'This chapter is already in your offline queue and will continue when the browser stays online.';
    } else if (offlineState.status === OFFLINE_STATES.failed) {
        statusChip.textContent = 'Retry Needed';
        statusSummary.textContent = offlineState.reason || 'The last offline download attempt failed. Tap the chapter button to retry.';
    } else {
        statusChip.textContent = 'Ready for Offline';
        statusSummary.textContent = 'Save this chapter or the full book inside your browser so listening stays comfortable even without network.';
    }

    const metaParts = [];
    if (savedCount > 0 && totalParts > 0) metaParts.push(`${savedCount}/${totalParts} parts saved`);
    if (queueCount > 0) metaParts.push(`${queueCount} in queue`);
    if (offlineBook?.totalSizeBytes > 0) metaParts.push(sizeLabel);
    metaParts.push(`Validated ${validatedLabel}`);
    statusMeta.textContent = metaParts.join(' - ');

    if (bookButton) {
        bookButton.disabled = false;
        bookButton.innerHTML = queueCount > 0
            ? `<i class="fas fa-list-check"></i> Queue running`
            : `<i class="fas fa-cloud-arrow-down"></i> Download Book`;
    }

    if (removeBookButton) {
        removeBookButton.disabled = savedCount === 0 && queueCount === 0;
    }
}

export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');

    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    const summaryEl = document.getElementById('detail-summary');
    if (summaryEl) summaryEl.textContent = buildBookSummary(partialBook);
    const blurBg = document.getElementById('blur-bg');
    if (blurBg) {
        blurBg.style.setProperty('--player-cover-image', `url("${partialBook.cover}")`);
    }
    applyChameleonTheme(partialBook.cover);

    const chapterListEl = document.getElementById('chapter-list');
    chapterListEl.innerHTML = `
        <div class="skeleton-loader" style="padding: 20px; text-align: center; color: var(--theme-text-dim);">
            <i class="fas fa-spinner fa-spin"></i> Fetching chapters...
        </div>`;

    let finalBook = partialBook;

    if (!finalBook.chapters || finalBook.chapters.length === 0) {
        try {
            const fullBookDetails = await fetchBookDetails(partialBook.dataPath);
            if (!fullBookDetails) {
                chapterListEl.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Failed to load book data. Check connection!</p>`;
                return;
            }

            finalBook = { ...partialBook, ...fullBookDetails };
            if (!finalBook.chapters && finalBook.chapters_en) {
                finalBook.chapters = finalBook.chapters_en;
            }

            const index = allBooks.findIndex((book) => book.bookId === partialBook.bookId);
            if (index !== -1) allBooks[index] = finalBook;
        } catch (error) {
            console.error("Failed to hydrate book details:", error);
            chapterListEl.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Failed to load book data. Check connection!</p>`;
            return;
        }
    }

    if (summaryEl) summaryEl.textContent = buildBookSummary(finalBook);
    renderDetailMeta(finalBook);
    warmActiveBookOffline(finalBook);

    const langContainer = document.getElementById('lang-toggle-container');
    if (finalBook.chapters_en && finalBook.chapters_en.length > 0) {
        langContainer.innerHTML = `
            <div class="lang-switch">
                <button class="lang-btn ${getCurrentLang() === 'hi' ? 'active' : ''}" id="btn-hi">HINDI</button>
                <button class="lang-btn ${getCurrentLang() === 'en' ? 'active' : ''}" id="btn-en">ENG</button>
            </div>`;
        langContainer.classList.remove('hidden');
        document.getElementById('btn-hi').onclick = () => toggleLangUI('hi', finalBook);
        document.getElementById('btn-en').onclick = () => toggleLangUI('en', finalBook);
    } else {
        langContainer.classList.add('hidden');
        langContainer.innerHTML = '';
    }

    renderChapterList(finalBook);
    renderComments(getPersistentComments(finalBook.bookId, finalBook.comments || []));
    renderBookmarks(finalBook);
    setupPlayButton(finalBook);
    setupPlayerListeners();

    if (finalBook.savedState) {
        loadBook(finalBook, finalBook.savedState.chapterIndex, finalBook.savedState.currentTime);
        updateUI(isPlaybackActive(), finalBook);
        return;
    }

    const state = getCurrentState();
    if (state.book && state.book.bookId === finalBook.bookId) {
        updateUI(isPlaybackActive(), finalBook);
        return;
    }

    fetchUserProgress()
        .then((history) => {
            const saved = history.find((item) => item.bookId == finalBook.bookId);
            if (saved) loadBook(finalBook, saved.chapterIndex, saved.currentTime);
            else loadBook(finalBook, 0);

            updateUI(isPlaybackActive(), finalBook);
        })
        .catch((error) => {
            console.warn("Falling back to default chapter load.", error);
            loadBook(finalBook, 0);
            updateUI(isPlaybackActive(), finalBook);
        });
}

export function updateUI(isPlaying, book = null, chapter = null) {
    const playBtn = document.getElementById('play-btn');
    const mainPlayBtn = document.getElementById('main-play-btn');
    const miniPlayer = document.getElementById('mini-player');

    if (playBtn) playBtn.innerHTML = isPlaying ? `<i class="fas fa-pause"></i>` : `<i class="fas fa-play"></i>`;
    if (mainPlayBtn) mainPlayBtn.innerHTML = isPlaying ? `<i class="fas fa-pause"></i> Pause` : `<i class="fas fa-play"></i> Resume`;

    const state = getCurrentState();
    if (book && !chapter && state.book && state.book.bookId === book.bookId) {
        chapter = state.book.activeChapters
            ? state.book.activeChapters[state.currentChapterIndex]
            : book.chapters[state.currentChapterIndex];
    }

    if (book && chapter && miniPlayer) {
        miniPlayer.classList.remove('hidden');
        document.getElementById('mini-cover').src = book.cover;
        document.getElementById('mini-title').innerText = book.title;
        document.getElementById('mini-chapter').innerText = chapter.name
            .replace(/^Chapter\s+\d+[:\s-]*/i, '')
            .replace(/^\d+[\.\s]+/, '')
            .trim();
    }

    syncSourceSupportUI(state);

    if (!state.book) return;

    const isYouTubeSource = state.sourceType === 'youtube';
    const boostBtn = document.getElementById('vocal-boost-btn');
    if (boostBtn) {
        boostBtn.disabled = isYouTubeSource;
        boostBtn.title = isYouTubeSource ? "Vocal boost is only available for direct audio sources." : "Vocal Clarity Booster";

        if (isYouTubeSource) {
            boostBtn.classList.remove('active');
            boostBtn.style.color = "";
            boostBtn.style.boxShadow = "";
            boostBtn.style.opacity = "0.55";
            boostBtn.style.cursor = "not-allowed";
        } else {
            boostBtn.style.opacity = "";
            boostBtn.style.cursor = "";
        }
    }

    document.querySelectorAll('#chapter-list .chapter-item').forEach((li, idx) => {
        const status = li.querySelector('.chapter-status');
        if (idx === state.currentChapterIndex) {
            li.classList.add('active');
            if (status) status.innerHTML = `<i class="fas fa-chart-bar"></i>`;
            return;
        }

        li.classList.remove('active');
        if (status) status.innerHTML = `<i class="fas fa-play" style="font-size: 0.8rem;"></i>`;
    });

    void syncOfflineExperienceUI(book || state.book, chapter || state.book?.activeChapters?.[state.currentChapterIndex], state);
}

// Store handlers to remove them before re-binding, preventing memory leaks.
const playerEventHandlers = {};

function setupPlayButton(book) {
    const mainBtn = document.getElementById('main-play-btn');
    if (!mainBtn) return;

    if (playerEventHandlers.mainPlay) {
        mainBtn.removeEventListener('click', playerEventHandlers.mainPlay);
    }

    playerEventHandlers.mainPlay = async () => {
        mainBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading...`;
        try {
            const history = await fetchUserProgress();
            const saved = history.find((item) => item.bookId == book.bookId);
            loadBook(book, saved ? saved.chapterIndex : 0, saved ? saved.currentTime : 0);
            updateUI(isPlaybackActive(), book);
        } catch (error) {
            console.warn("Falling back to chapter 1 play start.", error);
            loadBook(book, 0);
            updateUI(isPlaybackActive(), book);
        }
    };
    mainBtn.addEventListener('click', playerEventHandlers.mainPlay);
}

let playerListenersBound = false;

export function setupPlayerListeners() {
    if (playerListenersBound) return;
    playerListenersBound = true;

    const speedBtnRef = document.getElementById('speed-btn');
    if (speedBtnRef) {
        const initialSpeed = speeds[currentSpeedIndex] || 1;
        speedBtnRef.innerText = `${initialSpeed}x`;
        speedBtnRef.addEventListener('click', () => {
            currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
            const newSpeed = speeds[currentSpeedIndex];
            const appliedSpeed = setPlaybackSpeed(newSpeed);
            speedBtnRef.innerText = `${appliedSpeed}x`;
            showToast(`Speed: ${appliedSpeed}x`);
        });
    }

    let boostBtn = document.getElementById('vocal-boost-btn');
    if (!boostBtn) {
        boostBtn = document.createElement('button');
        boostBtn.id = 'vocal-boost-btn';
        boostBtn.title = "Vocal Clarity Booster";
        boostBtn.innerHTML = '<i class="fas fa-microphone-alt"></i>';
        const currentSpeedBtn = document.getElementById('speed-btn');
        if (currentSpeedBtn && currentSpeedBtn.parentNode) {
            currentSpeedBtn.parentNode.insertBefore(boostBtn, currentSpeedBtn);
        }
    }

    if (boostBtn && boostBtn.parentNode) {
        boostBtn.addEventListener('click', () => {
            if (getCurrentState().sourceType === 'youtube') {
                showToast("Vocal boost is not available for YouTube links");
                return;
            }

            const isBoosting = boostBtn.classList.toggle('active');
            const applied = toggleVocalBoost(isBoosting);

            if (!applied) {
                boostBtn.classList.remove('active');
                showToast("Vocal boost is not available for this source");
                return;
            }

            if (isBoosting) {
                boostBtn.style.color = "#ff4b1f";
                boostBtn.style.boxShadow = "0 0 15px rgba(255, 75, 31, 0.5)";
                showToast("Vocal boost active");
            } else {
                boostBtn.style.color = "";
                boostBtn.style.boxShadow = "";
                showToast("Normal sound");
            }
        });
    }

    const sleepBtn = document.getElementById('sleep-timer-btn');
    if (sleepBtn) {
        sleepBtn.addEventListener('click', () => {
            currentSleepIndex = (currentSleepIndex + 1) % sleepTimes.length;
            const minutes = sleepTimes[currentSleepIndex];

            setSleepTimer(minutes, () => {
                updateUI(false);
                sleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                sleepBtn.style.color = "";
                currentSleepIndex = 0;
            });

            if (minutes > 0) {
                sleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold">${minutes}m</span>`;
                sleepBtn.style.color = "var(--secondary)";
                showToast(`Sleep: ${minutes}m`);
            } else {
                sleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                sleepBtn.style.color = "";
                showToast("Sleep: Off");
            }
        });
    }

    ['bookmark-btn', 'bookmark-current-btn'].forEach((buttonId) => {
        const bookmarkBtn = document.getElementById(buttonId);
        if (!bookmarkBtn || !bookmarkBtn.parentNode) return;

        bookmarkBtn.addEventListener('click', saveCurrentBookmark);
    });

    const dlBtn = document.getElementById('download-btn');
    if (dlBtn) {
        dlBtn.style.display = "inline-flex";

        dlBtn.addEventListener('click', async () => {
            const offlineState = await getCurrentChapterOfflineState();
            const state = getCurrentState();

            if (state.sourceType === 'youtube' || offlineState.status === 'not_available') {
                showToast(offlineState.reason || "This source cannot be downloaded in browser");
                return;
            }

            if (offlineState.status === OFFLINE_STATES.downloaded) {
                await deleteChapter();
                renderChapterList(state.book);
                updateUI(state.isPlaying, state.book);
                showToast("Chapter removed from offline shelf");
                return;
            }

            if (offlineState.status === OFFLINE_STATES.queued || offlineState.status === OFFLINE_STATES.downloading) {
                showToast("This chapter is already in your offline queue");
                return;
            }

            setButtonLoading(dlBtn, 'Saving');
            const result = await downloadCurrentChapter();
            resetButtonLoading(dlBtn);
            renderChapterList(state.book);
            updateUI(state.isPlaying, state.book);

            if (result?.queued) {
                showToast(window.AndroidInterface ? "Downloading for offline use" : "Chapter added to your offline queue");
            } else {
                showToast(result?.reason || "Offline download could not start");
            }
        });
    }

    const downloadBookBtn = document.getElementById('download-book-btn');
    if (downloadBookBtn && downloadBookBtn.parentNode) {
        downloadBookBtn.addEventListener('click', async () => {
            const state = getCurrentState();
            if (!state.book) return;

            setButtonLoading(downloadBookBtn, 'Queueing');
            const result = await queueCurrentBookForOffline();
            resetButtonLoading(downloadBookBtn);
            renderChapterList(state.book);
            updateUI(state.isPlaying, state.book);

            if (result?.queuedCount > 0) {
                showToast(`${result.queuedCount} parts added to your offline queue`);
            } else {
                showToast(result?.reason || "Book download queue could not start");
            }
        });
    }

    const removeBookBtn = document.getElementById('remove-offline-book-btn');
    if (removeBookBtn && removeBookBtn.parentNode) {
        removeBookBtn.addEventListener('click', async () => {
            const state = getCurrentState();
            if (!state.book) return;

            setButtonLoading(removeBookBtn, 'Removing');
            await removeCurrentBookOffline();
            resetButtonLoading(removeBookBtn);
            renderChapterList(state.book);
            updateUI(state.isPlaying, state.book);
            showToast("Offline copies cleared for this book");
        });
    }
}
