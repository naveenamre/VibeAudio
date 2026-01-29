// --- 🎵 PLAYER LOGIC MODULE (Fixed Imports & Time Resume) ---
import { saveUserProgress, fetchUserProgress } from './api.js'; // ✅ Fixed Name

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

// --- 📂 LOAD BOOK (With Time Resume) ---
// ✨ UPDATE: Added 'startTime' parameter for accurate resuming
export async function loadBook(book, chapterIndex = 0, startTime = 0) {
    if (!book || !book.chapters || !book.chapters[chapterIndex]) return;

    // Resume Logic: Agar same chapter aur same book hai, toh bas play karo
    if (currentBook && currentBook.bookId === book.bookId && currentChapterIndex === chapterIndex && audio.src) {
        console.log("⚠️ Already loaded. Resuming...");
        playAudioSafe();
        return;
    }

    currentBook = book;
    currentChapterIndex = chapterIndex;
    
    stopProgressTracker(); // Purana save loop roko
    audio.pause();

    const chapter = book.chapters[chapterIndex];
    console.log(`📂 Loading: ${chapter.name} at ${startTime}s`);

    audio.src = chapter.url;
    
    // ✨ MAGIC: Metadata load hone ka wait karo fir Seek karo
    audio.onloadedmetadata = () => {
        if (startTime > 0) {
            audio.currentTime = startTime;
        }
        playAudioSafe(); // Safe play call
    };

    // Fallback: Agar metadata event miss ho jaye
    audio.load();

    // 📱 LOCK SCREEN CONTROLS (Media Session API)
    if ('mediaSession' in navigator) {
        updateMediaSession(book, chapter);
        setupMediaHandlers();
    }

    startProgressTracker();
}

// 📱 HELPER: Media Session UI Update
function updateMediaSession(book, chapter) {
    navigator.mediaSession.metadata = new MediaMetadata({
        title: chapter.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim(),
        artist: book.author || "Vibe Audio",
        album: book.title,
        artwork: [
            { src: book.cover, sizes: '96x96', type: 'image/png' },
            { src: book.cover, sizes: '128x128', type: 'image/png' },
            { src: book.cover, sizes: '512x512', type: 'image/png' }
        ]
    });
}

function setupMediaHandlers() {
    navigator.mediaSession.setActionHandler('play', () => { togglePlay(); updateUIState(true); });
    navigator.mediaSession.setActionHandler('pause', () => { togglePlay(); updateUIState(false); });
    navigator.mediaSession.setActionHandler('previoustrack', prevChapter);
    navigator.mediaSession.setActionHandler('nexttrack', nextChapter);
    navigator.mediaSession.setActionHandler('seekbackward', () => skip(-10));
    navigator.mediaSession.setActionHandler('seekforward', () => skip(10));
}

// 🛡️ SAFE PLAY HELPER (No Red Errors)
async function playAudioSafe() {
    try {
        await audio.play();
        updateUIState(true);
    } catch (err) {
        if (err.name !== 'AbortError') {
            console.warn("⚠️ Autoplay blocked (Click Play manually):", err);
            updateUIState(false); 
        }
    }
}

// --- ⏯️ CONTROLS ---
export function togglePlay() {
    if (audio.paused) {
        playAudioSafe();
        return true;
    } else {
        audio.pause();
        updateUIState(false);
        stopProgressTracker();
        // Pause karte waqt turant save karo (Fixed function call)
        if(currentBook) saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime);
        return false;
    }
}

export function skip(seconds) {
    audio.currentTime += seconds;
}

export function seekTo(percent) {
    if (audio.duration) {
        audio.currentTime = (percent / 100) * audio.duration;
    }
}

// --- ⏭️ NAVIGATION ---
export function nextChapter() {
    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
        loadBook(currentBook, currentChapterIndex + 1, 0); // Next chapter hamesha 0 se start hoga
        updateUIState(true); 
        return true;
    }
    return false;
}

export function prevChapter() {
    if (currentChapterIndex > 0) {
        loadBook(currentBook, currentChapterIndex - 1, 0);
        updateUIState(true); 
        return true;
    }
    return false;
}

// --- 💾 PROGRESS TRACKER (Cloud Sync) ---
function startProgressTracker() {
    stopProgressTracker();
    // Har 10 second mein save karo
    progressInterval = setInterval(() => {
        if (!audio.paused && currentBook) {
            saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime);
        }
    }, 10000);
}

function stopProgressTracker() {
    if (progressInterval) clearInterval(progressInterval);
}

// --- 🔄 UI NOTIFIER Helper ---
function updateUIState(isPlaying) {
    const event = new CustomEvent('player-state-change', { 
        detail: { 
            isPlaying: isPlaying,
            book: currentBook,
            chapter: currentBook ? currentBook.chapters[currentChapterIndex] : null
        } 
    });
    window.dispatchEvent(event);
}