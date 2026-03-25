import { saveUserProgress } from './api.js';

console.log("Player Module Loading...");

const audio = document.getElementById('audio-element') || new Audio();
audio.crossOrigin = "anonymous";

let currentBook = null;
let currentChapterIndex = 0;
let progressInterval = null;
let stallPauseTimeout = null;

const STALL_AUTO_PAUSE_MS = 4000;
const PROGRESS_TICK_MS = 1000;
const PROGRESS_SAVE_EVERY_TICKS = 5;

let currentLang = localStorage.getItem('vibe_pref_lang') || 'hi';

let audioCtx;
let source;
let vocalPeakingFilter;
let bassCutFilter;
let trebleBoostFilter;
let compressor;

let currentSourceType = 'audio';
let ytPlayer = null;
let ytPlayerPromise = null;
let ytApiPromise = null;
let wakeLockSentinel = null;
let wakeLockLifecycleBound = false;
let youtubeViewportBound = false;
let youtubeResizeObserver = null;

audio.addEventListener('ended', () => {
    if (currentSourceType === 'youtube') return;

    console.log("Chapter ended. Moving to the next one...");
    clearStallPauseTimeout();
    stopProgressTracker();
    if (!nextChapter()) {
        handlePausedState(true);
    }
});

audio.addEventListener('waiting', () => {
    if (currentSourceType === 'youtube') return;

    console.log("Audio buffering...");
    scheduleAutoPauseForStall();
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
});

audio.addEventListener('stalled', () => {
    if (currentSourceType !== 'youtube') scheduleAutoPauseForStall();
});
audio.addEventListener('canplay', clearStallPauseTimeout);
audio.addEventListener('playing', () => {
    if (currentSourceType !== 'youtube') {
        clearStallPauseTimeout();
        startProgressTracker();
        updateUIState(true);
        sendToAndroid(true);
        releasePlaybackWakeLock();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
    }
});
audio.addEventListener('pause', () => {
    if (currentSourceType !== 'youtube' && currentBook) {
        handlePausedState(true);
    }
});
audio.addEventListener('seeking', () => {
    clearStallPauseTimeout();
    dispatchPlayerTimeUpdate();
});
audio.addEventListener('seeked', dispatchPlayerTimeUpdate);
audio.addEventListener('loadedmetadata', dispatchPlayerTimeUpdate);
audio.addEventListener('timeupdate', dispatchPlayerTimeUpdate);

bindWakeLockLifecycle();

function clearStallPauseTimeout() {
    if (stallPauseTimeout) {
        clearTimeout(stallPauseTimeout);
        stallPauseTimeout = null;
    }
}

function canUseScreenWakeLock() {
    return Boolean(navigator.wakeLock?.request);
}

async function requestPlaybackWakeLock() {
    if (!canUseScreenWakeLock() || document.visibilityState !== 'visible') return false;
    if (wakeLockSentinel) return true;

    try {
        wakeLockSentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinel.addEventListener('release', () => {
            wakeLockSentinel = null;
        });
        return true;
    } catch (error) {
        console.warn("Screen wake lock request failed.", error);
        wakeLockSentinel = null;
        return false;
    }
}

async function releasePlaybackWakeLock() {
    if (!wakeLockSentinel) return false;

    try {
        await wakeLockSentinel.release();
    } catch (error) {
        console.warn("Screen wake lock release failed.", error);
    } finally {
        wakeLockSentinel = null;
    }

    return true;
}

function bindWakeLockLifecycle() {
    if (wakeLockLifecycleBound) return;
    wakeLockLifecycleBound = true;

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (currentSourceType === 'youtube' && isPlaybackActive()) {
                requestPlaybackWakeLock();
            }
            return;
        }

        releasePlaybackWakeLock();
    });

    window.addEventListener('pagehide', () => {
        releasePlaybackWakeLock();
    });
}

function getCurrentPlaybackValues() {
    if (currentSourceType === 'youtube' && ytPlayer && window.YT?.PlayerState) {
        let currentTime = 0;
        let duration = 0;

        try {
            currentTime = Number(ytPlayer.getCurrentTime?.() || 0);
            duration = Number(ytPlayer.getDuration?.() || 0);
        } catch (error) {
            console.warn("Unable to read YouTube playback state.", error);
        }

        return { currentTime, duration };
    }

    return {
        currentTime: Number(audio.currentTime || 0),
        duration: Number(audio.duration || 0)
    };
}

function getCurrentChapter() {
    if (!currentBook?.activeChapters) return null;
    return currentBook.activeChapters[currentChapterIndex] || null;
}

function getCurrentSourceUrl() {
    return getCurrentChapter()?.url || "";
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

function extractYouTubeVideoId(url) {
    if (!url) return null;

    try {
        const parsed = new URL(url, window.location.href);
        const host = parsed.hostname.replace(/^www\./, '');

        if (host === 'youtu.be') {
            const id = parsed.pathname.replace(/^\//, '').split('/')[0];
            return id || null;
        }

        if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
            if (parsed.pathname === '/watch') {
                return parsed.searchParams.get('v');
            }

            const segments = parsed.pathname.split('/').filter(Boolean);
            if (segments[0] === 'embed' || segments[0] === 'shorts' || segments[0] === 'live') {
                return segments[1] || null;
            }
        }
    } catch (error) {
        const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/);
        return match ? match[1] : null;
    }

    return null;
}

function loadYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-vibe-youtube-api]');
        const previousReady = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            if (typeof previousReady === 'function') previousReady();
            resolve(window.YT);
        };

        if (!existing) {
            const script = document.createElement('script');
            script.src = "https://www.youtube.com/iframe_api";
            script.async = true;
            script.dataset.vibeYoutubeApi = "true";
            script.onerror = () => reject(new Error("YouTube API failed to load."));
            document.head.appendChild(script);
        }
    });

    return ytApiPromise;
}

function getYouTubeHost() {
    return document.getElementById('yt-player-shell') || document.body;
}

function syncYouTubePlayerViewport() {
    const host = getYouTubeHost();
    const container = document.getElementById('yt-ninja-container');
    if (!host || !container) return;

    const hostRect = host.getBoundingClientRect();
    const width = Math.max(200, Math.round(hostRect.width || host.clientWidth || 356));
    const height = Math.max(200, Math.round(hostRect.height || host.clientHeight || 200));

    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    container.style.maxWidth = '100%';
    container.style.maxHeight = '100%';

    if (ytPlayer?.setSize) {
        try {
            ytPlayer.setSize(width, height);
        } catch (error) {
            console.warn("Unable to sync YouTube viewport.", error);
        }
    }
}

function bindYouTubeViewportLifecycle() {
    if (youtubeViewportBound) return;
    youtubeViewportBound = true;

    window.addEventListener('resize', () => {
        if (currentSourceType === 'youtube') {
            syncYouTubePlayerViewport();
        }
    });

    const host = getYouTubeHost();
    if ('ResizeObserver' in window && host) {
        youtubeResizeObserver = new ResizeObserver(() => {
            if (currentSourceType === 'youtube') {
                syncYouTubePlayerViewport();
            }
        });
        youtubeResizeObserver.observe(host);
    }
}

function ensureYouTubeContainer() {
    let container = document.getElementById('yt-ninja-container');
    const host = getYouTubeHost();
    if (container) {
        if (container.parentElement !== host) {
            host.appendChild(container);
        }
        bindYouTubeViewportLifecycle();
        requestAnimationFrame(syncYouTubePlayerViewport);
        return container;
    }

    container = document.createElement('div');
    container.id = 'yt-ninja-container';
    container.style.position = 'relative';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.minWidth = '200px';
    container.style.minHeight = '200px';
    host.appendChild(container);
    bindYouTubeViewportLifecycle();
    requestAnimationFrame(syncYouTubePlayerViewport);

    return container;
}

function applyYouTubeIframePreferences(player) {
    const iframe = player?.getIframe?.();
    if (!iframe) return;

    iframe.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
    iframe.setAttribute('tabindex', '-1');
    iframe.setAttribute('referrerpolicy', 'origin');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('title', 'VibeAudio YouTube player');
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
}

async function ensureYouTubePlayer() {
    if (ytPlayer) return ytPlayer;
    if (ytPlayerPromise) return ytPlayerPromise;

    ytPlayerPromise = (async () => {
        await loadYouTubeApi();
        const container = ensureYouTubeContainer();

        return await new Promise((resolve) => {
            ytPlayer = new window.YT.Player(container, {
                height: '200',
                width: '356',
                playerVars: {
                    autoplay: 1,
                    playsinline: 1,
                    controls: 0,
                    disablekb: 1,
                    fs: 1,
                    rel: 0,
                    modestbranding: 1,
                    origin: window.location.origin,
                    widget_referrer: window.location.href
                },
                events: {
                    onReady: () => {
                        applyYouTubeIframePreferences(ytPlayer);
                        bindYouTubeViewportLifecycle();
                        requestAnimationFrame(syncYouTubePlayerViewport);
                        resolve(ytPlayer);
                    },
                    onStateChange: handleYouTubeStateChange,
                    onError: (event) => {
                        console.warn("YouTube playback error.", event?.data);
                        handlePausedState(true);
                    }
                }
            });
        });
    })();

    return ytPlayerPromise;
}

function handleYouTubeStateChange(event) {
    if (currentSourceType !== 'youtube' || !window.YT?.PlayerState) return;

    clearStallPauseTimeout();
    dispatchPlayerTimeUpdate();

    switch (event.data) {
        case window.YT.PlayerState.PLAYING:
            startProgressTracker();
            updateUIState(true);
            sendToAndroid(true);
            requestPlaybackWakeLock();
            requestAnimationFrame(syncYouTubePlayerViewport);
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
            break;
        case window.YT.PlayerState.PAUSED:
            handlePausedState(true);
            break;
        case window.YT.PlayerState.BUFFERING:
            scheduleAutoPauseForStall();
            break;
        case window.YT.PlayerState.ENDED:
            stopProgressTracker();
            if (!nextChapter()) {
                handlePausedState(true);
            }
            break;
        default:
            break;
    }
}

function handlePausedState(saveProgress = true) {
    clearStallPauseTimeout();
    stopProgressTracker();
    releasePlaybackWakeLock();

    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
    updateUIState(false);
    sendToAndroid(false);

    if (saveProgress && currentBook) {
        const { currentTime, duration } = getCurrentPlaybackValues();
        saveUserProgress(currentBook.bookId, currentChapterIndex, currentTime, duration);
    }
}

function scheduleAutoPauseForStall() {
    clearStallPauseTimeout();
    if (!isPlaybackActive()) return;

    stallPauseTimeout = setTimeout(() => {
        stallPauseTimeout = null;

        if (!isPlaybackActive()) return;

        console.warn("Playback stalled. Waiting for manual play.");

        if (currentSourceType === 'youtube' && ytPlayer?.pauseVideo) {
            ytPlayer.pauseVideo();
        } else {
            if (audio.readyState >= 3) return;
            audio.pause();
        }

        handlePausedState(true);
    }, STALL_AUTO_PAUSE_MS);
}

function initAudioContext() {
    if (currentSourceType === 'youtube') return;
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
    if (currentSourceType === 'youtube') return false;

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

export function isPlaybackActive() {
    if (currentSourceType === 'youtube' && ytPlayer && window.YT?.PlayerState) {
        const state = ytPlayer.getPlayerState();
        return state === window.YT.PlayerState.PLAYING || state === window.YT.PlayerState.BUFFERING;
    }

    return Boolean(audio.src) && !audio.paused;
}

export function getCurrentState() {
    const { currentTime, duration } = getCurrentPlaybackValues();

    return {
        book: currentBook,
        currentChapterIndex,
        currentTime,
        duration,
        lang: currentLang,
        sourceType: currentSourceType,
        sourceUrl: getCurrentSourceUrl(),
        isPlaying: isPlaybackActive()
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

function stopCurrentPlayback() {
    releasePlaybackWakeLock();
    audio.pause();
    audio.onloadedmetadata = null;

    if (ytPlayer?.pauseVideo) {
        try {
            ytPlayer.pauseVideo();
        } catch (error) {
            console.warn("Unable to pause YouTube player.", error);
        }
    }
}

async function loadYouTubeChapter(videoId, startTime = 0) {
    currentSourceType = 'youtube';
    audio.removeAttribute('src');
    audio.load();

    const player = await ensureYouTubePlayer();
    requestAnimationFrame(syncYouTubePlayerViewport);

    player.loadVideoById({
        videoId,
        startSeconds: Math.max(0, Number(startTime) || 0)
    });
}

function loadAudioChapter(url, startTime = 0) {
    currentSourceType = 'audio';
    audio.crossOrigin = "anonymous";
    audio.src = url;
    audio.onloadedmetadata = () => {
        if (startTime > 0) {
            audio.currentTime = startTime;
        }
        playAudioSafe();
    };
    audio.load();
}

export async function loadBook(book, chapterIndex = 0, startTime = 0) {
    if (!book) return;

    if (!book.activeChapters) {
        book.activeChapters = currentLang === 'en' && book.chapters_en ? book.chapters_en : book.chapters;
    }

    if (!book.activeChapters || !book.activeChapters[chapterIndex]) return;

    if (currentBook && currentBook.bookId === book.bookId && currentChapterIndex === chapterIndex) {
        const isSameLang = (currentLang === 'en' && book.activeChapters === book.chapters_en) ||
            (currentLang === 'hi' && book.activeChapters === book.chapters);

        if (isSameLang && getCurrentSourceUrl()) {
            console.log("Chapter already loaded. Resuming...");
            if (!isPlaybackActive()) togglePlay();
            return;
        }
    }

    stopProgressTracker();
    clearStallPauseTimeout();
    stopCurrentPlayback();

    currentBook = book;
    currentChapterIndex = chapterIndex;

    const chapter = currentBook.activeChapters[chapterIndex];
    const fileName = `${book.bookId}_${chapterIndex}_${currentLang}.mp3`;
    currentSourceType = isYouTubeUrl(chapter.url) ? 'youtube' : 'audio';

    console.log(`Loading ${chapter.name} (${currentLang.toUpperCase()})`);

    if ('mediaSession' in navigator) {
        updateMediaSession(book, chapter);
        setupMediaHandlers();
    }

    sendToAndroid(false);
    updateUIState(false);
    dispatchPlayerTimeUpdate();

    try {
        if (isYouTubeUrl(chapter.url)) {
            const videoId = extractYouTubeVideoId(chapter.url);
            if (!videoId) {
                throw new Error("Unsupported YouTube URL.");
            }

            await loadYouTubeChapter(videoId, startTime);
            return;
        }

        let offlinePath = "";
        if (window.AndroidInterface) {
            offlinePath = window.AndroidInterface.checkFile(fileName);
        }

        if (offlinePath) {
            audio.src = offlinePath;
            audio.removeAttribute('crossorigin');
            audio.onloadedmetadata = () => {
                if (startTime > 0) {
                    audio.currentTime = startTime;
                }
                playAudioSafe();
            };
            audio.load();
            currentSourceType = 'audio';
            return;
        }

        loadAudioChapter(chapter.url, startTime);
    } catch (error) {
        console.error("Failed to load chapter source.", error);
        currentSourceType = 'audio';
        updateUIState(false);
    }
}

export function downloadCurrentChapter(onProgress) {
    if (!currentBook || !window.AndroidInterface || currentSourceType === 'youtube') {
        if (onProgress) onProgress(false);
        return;
    }

    const chapter = currentBook.activeChapters[currentChapterIndex];
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;

    window.onDownloadComplete = (success) => {
        if (onProgress) onProgress(Boolean(success));
        updateUIState(isPlaybackActive());
        delete window.onDownloadComplete;
    };

    window.AndroidInterface.downloadFile(chapter.url, fileName, "onDownloadComplete");
}

export async function isChapterDownloaded() {
    if (!currentBook || !window.AndroidInterface || currentSourceType === 'youtube') return false;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;
    return window.AndroidInterface.checkFile(fileName) !== "";
}

export async function deleteChapter() {
    if (!currentBook || !window.AndroidInterface || currentSourceType === 'youtube') return;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;
    window.AndroidInterface.deleteFile(fileName);
    updateUIState(isPlaybackActive());
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
            if (!isPlaybackActive()) togglePlay();
            else updateUIState(true);
        }],
        ['pause', () => {
            if (isPlaybackActive()) {
                togglePlay();
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
        return true;
    } catch (error) {
        if (error.name !== 'AbortError') {
            updateUIState(false);
        }
        return false;
    }
}

export function togglePlay() {
    if (currentSourceType === 'youtube') {
        if (!ytPlayer || !window.YT?.PlayerState) return false;

        const playerState = ytPlayer.getPlayerState();
        if (playerState === window.YT.PlayerState.PLAYING || playerState === window.YT.PlayerState.BUFFERING) {
            ytPlayer.pauseVideo();
            return false;
        }

        ytPlayer.playVideo();
        return true;
    }

    if (audio.paused) {
        playAudioSafe();
        return true;
    }

    audio.pause();
    return false;
}

export function skip(seconds) {
    if (currentSourceType === 'youtube') {
        if (!ytPlayer) return;
        const nextTime = Math.max(0, (ytPlayer.getCurrentTime?.() || 0) + seconds);
        ytPlayer.seekTo(nextTime, true);
        dispatchPlayerTimeUpdate();
        return;
    }

    audio.currentTime += seconds;
    dispatchPlayerTimeUpdate();
}

export function seekTo(percent) {
    if (currentSourceType === 'youtube') {
        if (!ytPlayer) return;
        const duration = Number(ytPlayer.getDuration?.() || 0);
        if (duration) {
            ytPlayer.seekTo((percent / 100) * duration, true);
            dispatchPlayerTimeUpdate();
        }
        return;
    }

    if (audio.duration) {
        audio.currentTime = (percent / 100) * audio.duration;
        dispatchPlayerTimeUpdate();
    }
}

export function setPlaybackSpeed(speed) {
    if (currentSourceType === 'youtube') {
        if (!ytPlayer) return 1;
        const availableRates = ytPlayer.getAvailablePlaybackRates?.() || [];
        const targetRate = availableRates.includes(speed) ? speed : (availableRates.includes(1) ? 1 : availableRates[0]);

        if (targetRate) {
            ytPlayer.setPlaybackRate(targetRate);
        }

        return ytPlayer.getPlaybackRate?.() || targetRate || 1;
    }

    audio.playbackRate = speed;
    return audio.playbackRate;
}

export function setSleepTimer(minutes, callback) {
    if (window.sleepTimer) clearTimeout(window.sleepTimer);

    if (minutes > 0) {
        window.sleepTimer = setTimeout(() => {
            if (isPlaybackActive()) {
                togglePlay();
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

function dispatchPlayerTimeUpdate() {
    window.dispatchEvent(new CustomEvent('player-time-update', {
        detail: getCurrentState()
    }));
}

function startProgressTracker() {
    stopProgressTracker();

    let tickCount = 0;
    progressInterval = setInterval(() => {
        const state = getCurrentState();

        dispatchPlayerTimeUpdate();

        if (!state.book || !state.isPlaying || state.currentTime <= 0) return;

        tickCount += 1;
        if (tickCount % PROGRESS_SAVE_EVERY_TICKS === 0) {
            saveUserProgress(state.book.bookId, state.currentChapterIndex, state.currentTime, state.duration);
        }
    }, PROGRESS_TICK_MS);
}

function stopProgressTracker() {
    if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
    }
}

async function updateUIState(isPlaying) {
    const isDownloaded = await isChapterDownloaded();
    const state = getCurrentState();
    const event = new CustomEvent('player-state-change', {
        detail: {
            isPlaying,
            book: currentBook,
            chapter: currentBook ? currentBook.activeChapters[currentChapterIndex] : null,
            isDownloaded,
            sourceType: state.sourceType
        }
    });

    window.dispatchEvent(event);
}
