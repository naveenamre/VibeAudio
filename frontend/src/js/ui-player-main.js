import { fetchBookDetails, fetchUserProgress } from './api.js';
import {
    loadBook,
    getCurrentState,
    isPlaybackActive,
    skip,
    setPlaybackSpeed,
    setSleepTimer,
    isChapterDownloaded,
    downloadCurrentChapter,
    deleteChapter,
    getCurrentLang,
    toggleVocalBoost
} from './player.js';
import { renderChapterList, toggleLangUI } from './ui-player-list.js';
import { applyChameleonTheme, renderComments, showToast } from './ui-player-helpers.js';

window.addEventListener('player-state-change', (event) => {
    const { isPlaying, book, chapter } = event.detail;
    updateUI(isPlaying, book, chapter);
});

const speeds = [1, 1.25, 1.5, 2, 0.95, 0.9, 0.8];
let currentSpeedIndex = 0;
const sleepTimes = [0, 15, 30, 60];
let currentSleepIndex = 0;
let lastYouTubeHintSource = "";

function canKeepScreenAwake() {
    return Boolean(navigator.wakeLock?.request);
}

function openCurrentSourceInBrowser() {
    const sourceUrl = String(getCurrentState().sourceUrl || '').trim();
    if (!sourceUrl) {
        showToast("Source link is unavailable right now");
        return;
    }

    showToast("Opening in browser for steadier background playback");

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
    const youtubeStage = document.getElementById('youtube-player-stage');

    const hasSourceUrl = Boolean(state.book && state.sourceUrl);
    const isYouTubeSource = state.sourceType === 'youtube' && hasSourceUrl;

    if (note) {
        note.classList.toggle('hidden', !isYouTubeSource);
    }

    if (youtubeStage) {
        youtubeStage.classList.toggle('hidden', !isYouTubeSource);
    }

    if (noteText && isYouTubeSource) {
        const wakeLockHint = canKeepScreenAwake()
            ? " Screen wake lock bhi request hoga jab browser support kare."
            : "";
        noteText.innerText = `YouTube source ab hidden frame nahi, real dock me render hoga. Best results ke liye player view open rakho, app install karo, aur battery saver se bacho.${wakeLockHint}`;
    }

    if (noteButton) {
        noteButton.onclick = isYouTubeSource ? openCurrentSourceInBrowser : null;
    }

    if (miniButton) {
        miniButton.style.display = isYouTubeSource ? 'inline-flex' : 'none';
        miniButton.onclick = isYouTubeSource ? openCurrentSourceInBrowser : null;
        miniButton.title = isYouTubeSource ? "Open in browser for background playback" : "Open source in browser";
    }

    const nextHintSource = isYouTubeSource ? String(state.sourceUrl) : "";
    if (nextHintSource && nextHintSource !== lastYouTubeHintSource) {
        showToast("YouTube dock active. Is player ko visible rakhna compatibility improve karta hai.");
    }

    if (isYouTubeSource) {
        window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('resize'));
        });
    }

    lastYouTubeHintSource = nextHintSource;
}

export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');

    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    const blurBg = document.getElementById('blur-bg');
    if (blurBg) {
        blurBg.style.setProperty('--player-cover-image', `url("${partialBook.cover}")`);
    }
    applyChameleonTheme(partialBook.cover);

    const chapterListEl = document.getElementById('chapter-list');
    chapterListEl.innerHTML = `
        <div class="skeleton-loader" style="padding: 20px; text-align: center; color: var(--text-dim);">
            <i class="fas fa-spinner fa-spin"></i> Fetching Chapters from Cloudflare...
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
    renderComments(finalBook.comments || []);
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

    if (document.body.classList.contains('is-android')) {
        const dlBtn = document.getElementById('download-btn');
        if (dlBtn) {
            if (isYouTubeSource) {
                dlBtn.innerHTML = `<i class="fas fa-ban"></i>`;
                dlBtn.style.color = "";
                dlBtn.disabled = true;
                dlBtn.title = "YouTube embeds cannot be downloaded for offline use.";
                dlBtn.style.opacity = "0.55";
                dlBtn.style.cursor = "not-allowed";
                return;
            }

            dlBtn.disabled = false;
            dlBtn.title = "Download Offline";
            dlBtn.style.opacity = "";
            dlBtn.style.cursor = "";
            isChapterDownloaded().then((downloaded) => {
                dlBtn.innerHTML = downloaded ? `<i class="fas fa-check"></i>` : `<i class="fas fa-download"></i>`;
                dlBtn.style.color = downloaded ? "#00ff00" : "";
            });
        }
    }
}

function setupPlayButton(book) {
    const mainBtn = document.getElementById('main-play-btn');
    if (!mainBtn) return;

    const newBtn = mainBtn.cloneNode(true);
    mainBtn.parentNode.replaceChild(newBtn, mainBtn);

    newBtn.onclick = async () => {
        newBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading...`;
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
}

export function setupPlayerListeners() {
    const speedBtnRef = document.getElementById('speed-btn');
    if (speedBtnRef) {
        const newSpeedBtn = speedBtnRef.cloneNode(true);
        speedBtnRef.parentNode.replaceChild(newSpeedBtn, speedBtnRef);
        newSpeedBtn.onclick = () => {
            currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
            const newSpeed = speeds[currentSpeedIndex];
            const appliedSpeed = setPlaybackSpeed(newSpeed);
            newSpeedBtn.innerText = `${appliedSpeed}x`;
            showToast(`Speed: ${appliedSpeed}x`);
        };
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
        const newBoostBtn = boostBtn.cloneNode(true);
        boostBtn.parentNode.replaceChild(newBoostBtn, boostBtn);
        newBoostBtn.onclick = () => {
            if (getCurrentState().sourceType === 'youtube') {
                showToast("Vocal boost is not available for YouTube links");
                return;
            }

            const isBoosting = newBoostBtn.classList.toggle('active');
            const applied = toggleVocalBoost(isBoosting);

            if (!applied) {
                newBoostBtn.classList.remove('active');
                showToast("Vocal boost is not available for this source");
                return;
            }

            if (isBoosting) {
                newBoostBtn.style.color = "#ff4b1f";
                newBoostBtn.style.boxShadow = "0 0 15px rgba(255, 75, 31, 0.5)";
                showToast("Vocal boost active");
            } else {
                newBoostBtn.style.color = "";
                newBoostBtn.style.boxShadow = "";
                showToast("Normal sound");
            }
        };
    }

    const sleepBtn = document.getElementById('sleep-timer-btn');
    if (sleepBtn) {
        const newSleepBtn = sleepBtn.cloneNode(true);
        sleepBtn.parentNode.replaceChild(newSleepBtn, sleepBtn);
        newSleepBtn.onclick = () => {
            currentSleepIndex = (currentSleepIndex + 1) % sleepTimes.length;
            const minutes = sleepTimes[currentSleepIndex];

            setSleepTimer(minutes, () => {
                updateUI(false);
                newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                newSleepBtn.style.color = "";
                currentSleepIndex = 0;
            });

            if (minutes > 0) {
                newSleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold">${minutes}m</span>`;
                newSleepBtn.style.color = "var(--secondary)";
                showToast(`Sleep: ${minutes}m`);
            } else {
                newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                newSleepBtn.style.color = "";
                showToast("Sleep: Off");
            }
        };
    }

    if (document.body.classList.contains('is-android')) {
        const dlBtn = document.getElementById('download-btn');
        if (dlBtn) {
            dlBtn.style.display = "flex";
            const newDlBtn = dlBtn.cloneNode(true);
            dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);

            newDlBtn.onclick = async () => {
                if (getCurrentState().sourceType === 'youtube') {
                    showToast("YouTube sources cannot be downloaded offline");
                    return;
                }

                const downloaded = await isChapterDownloaded();
                if (downloaded) {
                    await deleteChapter();
                    newDlBtn.innerHTML = `<i class="fas fa-download"></i>`;
                    newDlBtn.style.color = "";
                    showToast("Removed from downloads");
                    return;
                }

                newDlBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
                await downloadCurrentChapter((success) => {
                    if (success) {
                        newDlBtn.innerHTML = `<i class="fas fa-check"></i>`;
                        newDlBtn.style.color = "#00ff00";
                        showToast("Downloaded for offline use");
                    } else {
                        newDlBtn.innerHTML = `<i class="fas fa-exclamation-triangle"></i>`;
                        newDlBtn.style.color = "";
                        showToast("Download failed");
                    }
                });
            };
        }
    }
}
