import { saveUserProgress } from './api.js';

console.log("Player Module Loading...");

const audio = document.getElementById('audio-element') || new Audio();
audio.crossOrigin = "anonymous";

let currentBook = null;
let currentChapterIndex = 0;
let progressInterval = null;
let stallPauseTimeout = null;

const STALL_AUTO_PAUSE_MS = 4000;

let currentLang = localStorage.getItem('vibe_pref_lang') || 'hi';

let audioCtx;
let source;
let vocalPeakingFilter;
let bassCutFilter;
let trebleBoostFilter;
let compressor;

audio.addEventListener('ended', () => {
    console.log("Chapter ended. Moving to the next one...");
    clearStallPauseTimeout();
    if (!nextChapter()) {
        handlePausedState(true);
    }
});

audio.addEventListener('waiting', () => {
    console.log("Audio buffering...");
    scheduleAutoPauseForStall();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});

audio.addEventListener('stalled', scheduleAutoPauseForStall);
audio.addEventListener('canplay', clearStallPauseTimeout);
audio.addEventListener('playing', clearStallPauseTimeout);
audio.addEventListener('seeking', clearStallPauseTimeout);

function clearStallPauseTimeout() {
    if (stallPauseTimeout) {
        clearTimeout(stallPauseTimeout);
        stallPauseTimeout = null;
    }
}

function handlePausedState(saveProgress = true) {
    clearStallPauseTimeout();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
    updateUIState(false);
    sendToAndroid(false);
    stopProgressTracker();

    if (saveProgress && currentBook) {
        saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime, audio.duration);
    }
}

function scheduleAutoPauseForStall() {
    clearStallPauseTimeout();
    if (audio.paused) return;

    stallPauseTimeout = setTimeout(() => {
        stallPauseTimeout = null;

        if (audio.paused || audio.readyState >= 3) return;

        console.warn("Audio stalled. Waiting for manual play.");
        audio.pause();
        handlePausedState(true);
    }, STALL_AUTO_PAUSE_MS);
}

function initAudioContext() {
    if (audioCtx) return;

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;

    audioCtx = new AudioContextCtor();

    if (!source) {
        source = audioCtx.createMediaElementSource(audio);
    }

    bassCutFilter = audioCtx.createBiquadFilter();
    bassCutFilter.type = "highpass";
    bassCutFilter.frequency.value = 0;
    bassCutFilter.Q.value = 0.7;

    vocalPeakingFilter = audioCtx.createBiquadFilter();
    vocalPeakingFilter.type = "peaking";
    vocalPeakingFilter.frequency.value = 2500;
    vocalPeakingFilter.Q.value = 1.0;
    vocalPeakingFilter.gain.value = 0;

    trebleBoostFilter = audioCtx.createBiquadFilter();
    trebleBoostFilter.type = "highshelf";
    trebleBoostFilter.frequency.value = 5000;
    trebleBoostFilter.gain.value = 0;

    compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -50;
    compressor.knee.value = 40;
    compressor.ratio.value = 1;
    compressor.attack.value = 0;
    compressor.release.value = 0.25;

    source.connect(bassCutFilter);
    bassCutFilter.connect(vocalPeakingFilter);
    vocalPeakingFilter.connect(trebleBoostFilter);
    trebleBoostFilter.connect(compressor);
    compressor.connect(audioCtx.destination);
}

export function toggleVocalBoost(enable) {
    initAudioContext();
    if (!audioCtx) return false;

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const t = audioCtx.currentTime;

    if (enable) {
        bassCutFilter.frequency.setTargetAtTime(150, t, 0.2);
        vocalPeakingFilter.gain.setTargetAtTime(8, t, 0.2);
        trebleBoostFilter.gain.setTargetAtTime(6, t, 0.2);

        compressor.threshold.setTargetAtTime(-24, t, 0.2);
        compressor.ratio.setTargetAtTime(12, t, 0.2);
        compressor.attack.setTargetAtTime(0.003, t, 0.2);
    } else {
        bassCutFilter.frequency.setTargetAtTime(0, t, 0.2);
        vocalPeakingFilter.gain.setTargetAtTime(0, t, 0.2);
        trebleBoostFilter.gain.setTargetAtTime(0, t, 0.2);

        compressor.threshold.setTargetAtTime(-50, t, 0.2);
        compressor.ratio.setTargetAtTime(1, t, 0.2);
    }

    return enable;
}

export function getAudioElement() {
    return audio;
}

export function getCurrentLang() {
    return currentLang;
}

export function getCurrentState() {
    return {
        book: currentBook,
        currentChapterIndex,
        currentTime: audio.currentTime,
        duration: audio.duration,
        lang: currentLang
    };
}

export function setLanguage(lang) {
    if (!currentBook) return;
    if (lang === 'en' && !currentBook.chapters_en) return;

    currentLang = lang;
    localStorage.setItem('vibe_pref_lang', lang);
    currentBook.activeChapters = lang === 'en' ? currentBook.chapters_en : currentBook.chapters;

    console.log(`Language switched to ${lang.toUpperCase()}`);
    loadBook(currentBook, currentChapterIndex, 0);
}

export async function loadBook(book, chapterIndex = 0, startTime = 0) {
    if (!book) return;

    if (!book.activeChapters) {
        book.activeChapters = currentLang === 'en' && book.chapters_en ? book.chapters_en : book.chapters;
    }

    if (!book.activeChapters || !book.activeChapters[chapterIndex]) return;

    if (currentBook && currentBook.bookId === book.bookId && currentChapterIndex === chapterIndex && audio.src) {
        const isSameLang = (currentLang === 'en' && book.activeChapters === book.chapters_en) ||
            (currentLang === 'hi' && book.activeChapters === book.chapters);

        if (isSameLang) {
            console.log("Chapter already loaded. Resuming...");
            if (audio.paused) playAudioSafe();
            return;
        }
    }

    currentBook = book;
    currentChapterIndex = chapterIndex;

    stopProgressTracker();
    clearStallPauseTimeout();
    audio.pause();

    const chapter = currentBook.activeChapters[chapterIndex];
    const fileName = `${book.bookId}_${chapterIndex}_${currentLang}.mp3`;

    console.log(`Loading ${chapter.name} (${currentLang.toUpperCase()})`);

    let offlinePath = "";
    if (window.AndroidInterface) {
        offlinePath = window.AndroidInterface.checkFile(fileName);
    }

    if (offlinePath) {
        audio.src = offlinePath;
        audio.removeAttribute('crossorigin');
    } else {
        audio.crossOrigin = "anonymous";
        audio.src = chapter.url;
    }

    audio.onloadedmetadata = () => {
        if (startTime > 0) {
            audio.currentTime = startTime;
        }
        playAudioSafe();
    };

    audio.load();

    if ('mediaSession' in navigator) {
        updateMediaSession(book, chapter);
        setupMediaHandlers();
    }

    sendToAndroid(false);
    updateUIState(false);
}

export function downloadCurrentChapter(onProgress) {
    if (!currentBook || !window.AndroidInterface) return;

    const chapter = currentBook.activeChapters[currentChapterIndex];
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;

    window.onDownloadComplete = (success) => {
        if (onProgress) onProgress(Boolean(success));
        updateUIState(!audio.paused);
        delete window.onDownloadComplete;
    };

    window.AndroidInterface.downloadFile(chapter.url, fileName, "onDownloadComplete");
}

export async function isChapterDownloaded() {
    if (!currentBook || !window.AndroidInterface) return false;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;
    return window.AndroidInterface.checkFile(fileName) !== "";
}

export async function deleteChapter() {
    if (!currentBook || !window.AndroidInterface) return;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;
    window.AndroidInterface.deleteFile(fileName);
    updateUIState(!audio.paused);
}

function updateMediaSession(book, chapter) {
    if (!('mediaSession' in navigator)) return;

    let imageUrl = book.coverImage || book.cover || 'public/icons/logo.png';
    try {
        imageUrl = new URL(imageUrl, window.location.href).href;
    } catch (error) {
        console.warn("Media artwork URL fallback used.", error);
    }

    navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').trim(),
        artist: book.author || "Vibe Audio",
        album: book.title,
        artwork: [{ src: imageUrl, sizes: '512x512', type: 'image/png' }]
    });
}

function setupMediaHandlers() {
    if (!('mediaSession' in navigator)) return;

    const actionHandlers = [
        ['play', () => {
            if (audio.paused) playAudioSafe();
            else updateUIState(true);
        }],
        ['pause', () => {
            if (!audio.paused) {
                audio.pause();
                handlePausedState(true);
            } else {
                updateUIState(false);
            }
        }],
        ['previoustrack', prevChapter],
        ['nexttrack', nextChapter],
        ['seekbackward', () => skip(-10)],
        ['seekforward', () => skip(10)]
    ];

    for (const [action, handler] of actionHandlers) {
        try {
            navigator.mediaSession.setActionHandler(action, handler);
        } catch (error) {
            console.warn(`Media action '${action}' is not supported.`, error);
        }
    }
}

async function playAudioSafe() {
    try {
        await audio.play();
        clearStallPauseTimeout();
        startProgressTracker();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        updateUIState(true);
        sendToAndroid(true);
    } catch (error) {
        if (error.name !== 'AbortError') {
            updateUIState(false);
        }
    }
}

export function togglePlay() {
    if (audio.paused) {
        playAudioSafe();
        return true;
    }

    audio.pause();
    handlePausedState(true);
    return false;
}

export function skip(seconds) {
    audio.currentTime += seconds;
}

export function seekTo(percent) {
    if (audio.duration) {
        audio.currentTime = (percent / 100) * audio.duration;
    }
}

export function setPlaybackSpeed(speed) {
    audio.playbackRate = speed;
}

export function setSleepTimer(minutes, callback) {
    if (window.sleepTimer) clearTimeout(window.sleepTimer);

    if (minutes > 0) {
        window.sleepTimer = setTimeout(() => {
            if (!audio.paused) {
                audio.pause();
                handlePausedState(true);
            }
            if (callback) callback();
        }, minutes * 60 * 1000);
    }
}

export function nextChapter() {
    if (currentBook && currentChapterIndex < currentBook.activeChapters.length - 1) {
        loadBook(currentBook, currentChapterIndex + 1, 0);
        return true;
    }
    return false;
}

export function prevChapter() {
    if (currentChapterIndex > 0) {
        loadBook(currentBook, currentChapterIndex - 1, 0);
        return true;
    }
    return false;
}

function sendToAndroid(isPlaying) {
    if (!window.AndroidInterface || !currentBook) return;

    const chapter = currentBook.activeChapters[currentChapterIndex];
    let imageUrl = currentBook.coverImage || currentBook.cover || 'https://vibeaudio.pages.dev/frontend/public/icons/logo.png';

    try {
        imageUrl = new URL(imageUrl, window.location.href).href;
    } catch (error) {
        console.warn("Android notification artwork URL fallback used.", error);
    }

    try {
        window.AndroidInterface.updateMediaNotification(chapter.name, currentBook.title, imageUrl, isPlaying);
    } catch (error) {
        console.warn("Android media notification update failed.", error);
    }
}

function startProgressTracker() {
    stopProgressTracker();
    progressInterval = setInterval(() => {
        if (!audio.paused && currentBook) {
            saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime, audio.duration);
        }
    }, 5000);
}

function stopProgressTracker() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

async function updateUIState(isPlaying) {
    const isDownloaded = await isChapterDownloaded();
    const event = new CustomEvent('player-state-change', {
        detail: {
            isPlaying,
            book: currentBook,
            chapter: currentBook ? currentBook.activeChapters[currentChapterIndex] : null,
            isDownloaded
        }
    });

    window.dispatchEvent(event);
}
