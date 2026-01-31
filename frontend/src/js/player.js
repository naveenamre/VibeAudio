// --- 🎵 PLAYER LOGIC MODULE (Persistent Offline Storage) ---
import { saveUserProgress } from './api.js'; 

let audio = document.getElementById('audio-element') || new Audio();
let currentBook = null;
let currentChapterIndex = 0;
let progressInterval = null;

// --- 🎧 INIT PLAYER ---
export function getAudioElement() { return audio; }
export function getCurrentState() { 
    return { 
        book: currentBook, 
        currentChapterIndex, 
        currentTime: audio.currentTime, 
        duration: audio.duration 
    }; 
}

// --- 📂 LOAD BOOK (Checking Android Storage First) ---
export async function loadBook(book, chapterIndex = 0, startTime = 0) {
    if (!book || !book.chapters || !book.chapters[chapterIndex]) return;

    if (currentBook && currentBook.bookId === book.bookId && currentChapterIndex === chapterIndex && audio.src) {
        console.log("⚠️ Already loaded. Resuming...");
        playAudioSafe();
        return;
    }

    currentBook = book;
    currentChapterIndex = chapterIndex;
    stopProgressTracker();
    audio.pause();

    const chapter = book.chapters[chapterIndex];
    const fileName = `${book.bookId}_${chapterIndex}.mp3`; // Unique Filename

    console.log(`📂 Loading: ${chapter.name}`);

    // 🔥 SMART LOAD: Check Android Storage First
    let offlinePath = "";
    if (window.AndroidInterface) {
        // Android returns "file://..." if exists, else empty
        offlinePath = window.AndroidInterface.checkFile(fileName);
    }

    if (offlinePath) {
        console.log("⚡ Playing from PERMANENT Offline Storage!", offlinePath);
        audio.src = offlinePath;
    } else {
        console.log("🌐 Playing from Network...");
        audio.src = chapter.url;
    }
    
    // Metadata Load Event
    audio.onloadedmetadata = () => {
        if (startTime > 0) audio.currentTime = startTime;
        playAudioSafe();
    };

    audio.load();

    if ('mediaSession' in navigator) {
        updateMediaSession(book, chapter);
        setupMediaHandlers();
    }
    sendToAndroid(true);
    startProgressTracker();
    updateUIState(true);
}

// --- 📥 DOWNLOAD FEATURE (Using Android Bridge) ---
export function downloadCurrentChapter(onProgress) {
    if (!currentBook || !window.AndroidInterface) return;
    const chapter = currentBook.chapters[currentChapterIndex];
    const fileName = `${currentBook.bookId}_${currentChapterIndex}.mp3`;

    console.log("📥 Requesting Native Download:", chapter.name);

    // Global Callback for Android
    window.onDownloadComplete = (success, path) => {
        if(success) {
            console.log("✅ Native Download Complete:", path);
            if(onProgress) onProgress(true);
            updateUIState(audio.paused ? false : true);
        } else {
            console.error("❌ Native Download Failed");
            if(onProgress) onProgress(false);
        }
        delete window.onDownloadComplete; // Cleanup
    };

    // Call Android
    window.AndroidInterface.downloadFile(chapter.url, fileName, "onDownloadComplete");
}

export async function isChapterDownloaded() {
    if (!currentBook || !window.AndroidInterface) return false;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}.mp3`;
    const path = window.AndroidInterface.checkFile(fileName);
    return path !== "";
}

export async function deleteChapter() {
    if (!currentBook || !window.AndroidInterface) return;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}.mp3`;
    window.AndroidInterface.deleteFile(fileName);
    console.log("🗑️ Deleted from Storage");
    updateUIState(audio.paused ? false : true);
}

// --- STANDARD FUNCTIONS (Same as before) ---
function updateMediaSession(book, chapter) {
    if (!('mediaSession' in navigator)) return;
    let imageUrl = book.coverImage || book.cover || 'public/icons/logo.png';
    try { imageUrl = new URL(imageUrl, window.location.href).href; } catch (e) {}
    navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim(),
        artist: book.author || "Vibe Audio",
        album: book.title,
        artwork: [{ src: imageUrl, sizes: '512x512', type: 'image/png' }]
    });
    navigator.mediaSession.playbackState = "none";
}

function setupMediaHandlers() {
    if (!('mediaSession' in navigator)) return;
    const actionHandlers = [
        ['play',          () => { togglePlay(); updateUIState(true); }],
        ['pause',         () => { togglePlay(); updateUIState(false); }],
        ['previoustrack', prevChapter],
        ['nexttrack',     nextChapter],
        ['seekbackward',  () => skip(-10)],
        ['seekforward',   () => skip(10)]
    ];
    for (const [action, handler] of actionHandlers) {
        try { navigator.mediaSession.setActionHandler(action, handler); } catch (e) {}
    }
}

async function playAudioSafe() {
    try {
        await audio.play();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        updateUIState(true);
        sendToAndroid(true);
    } catch (err) {
        if (err.name !== 'AbortError') { updateUIState(false); }
    }
}

export function togglePlay() {
    if (audio.paused) {
        playAudioSafe();
        return true;
    } else {
        audio.pause();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
        updateUIState(false);
        sendToAndroid(false);
        stopProgressTracker();
        if(currentBook) saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime);
        return false;
    }
}

export function skip(seconds) { audio.currentTime += seconds; }
export function seekTo(percent) { if (audio.duration) audio.currentTime = (percent / 100) * audio.duration; }
export function setPlaybackSpeed(speed) { audio.playbackRate = speed; }
export function setSleepTimer(minutes, callback) {
    if (window.sleepTimer) clearTimeout(window.sleepTimer);
    if (minutes > 0) {
        window.sleepTimer = setTimeout(() => { togglePlay(); if (callback) callback(); }, minutes * 60 * 1000);
    }
}

export function nextChapter() {
    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
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
    if (window.AndroidInterface && currentBook) {
        const chapter = currentBook.chapters[currentChapterIndex];
        let imageUrl = currentBook.coverImage || currentBook.cover || 'https://vibeaudio.pages.dev/frontend/public/icons/logo.png';
        try { imageUrl = new URL(imageUrl, window.location.href).href; } catch (e) {}
        try { window.AndroidInterface.updateMediaNotification(chapter.name, currentBook.title, imageUrl, isPlaying); } catch(e) {}
    }
}

function startProgressTracker() {
    stopProgressTracker();
    progressInterval = setInterval(() => {
        if (!audio.paused && currentBook) {
            saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime);
        }
    }, 10000);
}

function stopProgressTracker() { if (progressInterval) clearInterval(progressInterval); }

async function updateUIState(isPlaying) {
    const isDownloaded = await isChapterDownloaded();
    const event = new CustomEvent('player-state-change', { 
        detail: { 
            isPlaying: isPlaying,
            book: currentBook,
            chapter: currentBook ? currentBook.chapters[currentChapterIndex] : null,
            isDownloaded: isDownloaded
        } 
    });
    window.dispatchEvent(event);
}