// --- 🎵 PLAYER LOGIC MODULE (Persistent Language & Offline Storage) ---
import { saveUserProgress } from './api.js'; 

console.log("💿 Player Module Loading...");

let audio = document.getElementById('audio-element') || new Audio();
// Enable CORS for external links
audio.crossOrigin = "anonymous"; 

let currentBook = null;
let currentChapterIndex = 0;
let progressInterval = null;

// 🔥 Load saved language or default to Hindi
let currentLang = localStorage.getItem('vibe_pref_lang') || 'hi'; 

// --- 🎛️ AUDIO CONTEXT (God Mode: EQ + Compressor) ---
let audioCtx;
let source;
let vocalPeakingFilter; // Mid
let bassCutFilter;      // Low
let trebleBoostFilter;  // High
let compressor;         // 🔥 The Volume Leveler

function initAudioContext() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        
        if (!source) {
             source = audioCtx.createMediaElementSource(audio);
        }
        
        // 1. FILTERS (EQ)
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

        // 2. 🔥 DYNAMIC COMPRESSOR (Auto Volume Balancer)
        compressor = audioCtx.createDynamicsCompressor();
        // Default Settings (Transparent - No Effect yet)
        compressor.threshold.value = -50;  
        compressor.knee.value = 40;
        compressor.ratio.value = 1; // 1 means NO compression initially
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        // CHAIN: Source -> Bass -> Mid -> Treble -> Compressor -> Speakers
        source.connect(bassCutFilter);
        bassCutFilter.connect(vocalPeakingFilter);
        vocalPeakingFilter.connect(trebleBoostFilter);
        trebleBoostFilter.connect(compressor); // ✅ Added to chain
        compressor.connect(audioCtx.destination);
    }
}

export function toggleVocalBoost(enable) {
    initAudioContext(); 

    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const t = audioCtx.currentTime;

    if (enable) {
        console.log("🗣️ Vocal Boost: GOD MODE (EQ + Compression)");
        
        // 1. EQ Settings (Clarity)
        bassCutFilter.frequency.setTargetAtTime(150, t, 0.2);
        vocalPeakingFilter.gain.setTargetAtTime(8, t, 0.2); 
        trebleBoostFilter.gain.setTargetAtTime(6, t, 0.2); 

        // 2. 🔥 Compressor Settings (Broadcast Voice)
        // Ratio 12:1 means heavy compression (Radio style voice)
        compressor.threshold.setTargetAtTime(-24, t, 0.2); // Start compressing earlier
        compressor.ratio.setTargetAtTime(12, t, 0.2);      // Squeeze the loud sounds
        compressor.attack.setTargetAtTime(0.003, t, 0.2);  // Fast reaction to shouts

    } else {
        console.log("🗣️ Vocal Boost: OFF");
        
        // Reset EQ
        bassCutFilter.frequency.setTargetAtTime(0, t, 0.2);
        vocalPeakingFilter.gain.setTargetAtTime(0, t, 0.2);
        trebleBoostFilter.gain.setTargetAtTime(0, t, 0.2);

        // Reset Compressor
        compressor.threshold.setTargetAtTime(-50, t, 0.2);
        compressor.ratio.setTargetAtTime(1, t, 0.2); // Stop compressing
    }
    
    return enable;
}

// --- 🎧 HELPERS ---
export function getAudioElement() { return audio; }
export function getCurrentLang() { return currentLang; } 

export function getCurrentState() { 
    return { 
        book: currentBook, 
        currentChapterIndex, 
        currentTime: audio.currentTime, 
        duration: audio.duration,
        lang: currentLang 
    }; 
}

// --- 🔄 LANGUAGE TOGGLE LOGIC ---
export function setLanguage(lang) {
    if (!currentBook) return;
    
    // Safety check
    if (lang === 'en' && !currentBook.chapters_en) {
        console.warn("English version not available");
        return;
    }

    currentLang = lang;
    
    // Save preference
    localStorage.setItem('vibe_pref_lang', lang);

    // Swap Arrays
    if (lang === 'en') {
        currentBook.activeChapters = currentBook.chapters_en;
    } else {
        currentBook.activeChapters = currentBook.chapters; // Default Hindi
    }

    console.log(`🗣️ Language Switched to: ${lang.toUpperCase()}`);
    loadBook(currentBook, currentChapterIndex, 0);
}

// --- 📂 LOAD BOOK ---
export async function loadBook(book, chapterIndex = 0, startTime = 0) {
    if (!book) return;

    // Initialize Active Chapters based on Saved Language
    if (!book.activeChapters) {
        if (currentLang === 'en' && book.chapters_en) {
            book.activeChapters = book.chapters_en;
        } else {
            book.activeChapters = book.chapters; 
        }
    }

    if (!book.activeChapters || !book.activeChapters[chapterIndex]) return;

    // Resume Logic
    if (currentBook && currentBook.bookId === book.bookId && currentChapterIndex === chapterIndex && audio.src) {
        const isSameLang = (currentLang === 'en' && book.activeChapters === book.chapters_en) || 
                           (currentLang === 'hi' && book.activeChapters === book.chapters);
        
        if (isSameLang) {
            console.log("⚠️ Already loaded. Resuming...");
            if(audio.paused) playAudioSafe();
            return;
        }
    }

    currentBook = book;
    currentChapterIndex = chapterIndex;
    
    stopProgressTracker();
    audio.pause();

    const chapter = currentBook.activeChapters[chapterIndex];
    // Unique filename with Lang
    const fileName = `${book.bookId}_${chapterIndex}_${currentLang}.mp3`; 

    console.log(`📂 Loading (${currentLang.toUpperCase()}): ${chapter.name}`);

    // Check Offline Source
    let offlinePath = "";
    if (window.AndroidInterface) {
        offlinePath = window.AndroidInterface.checkFile(fileName);
    }

    if (offlinePath) {
        console.log("⚡ Source: Offline Storage");
        audio.src = offlinePath;
        audio.removeAttribute('crossorigin'); 
    } else {
        console.log("🌐 Source: Network");
        audio.crossOrigin = "anonymous";
        audio.src = chapter.url;
    }
    
    // Unified Seek Logic
    audio.onloadedmetadata = null;
    audio.onloadedmetadata = () => {
        if (startTime > 0) {
            console.log(`⏩ Seeking to ${startTime}s`);
            audio.currentTime = startTime;
        }
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

// --- 📥 DOWNLOAD FEATURE ---
export function downloadCurrentChapter(onProgress) {
    if (!currentBook || !window.AndroidInterface) return;
    const chapter = currentBook.activeChapters[currentChapterIndex];
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;

    window.onDownloadComplete = (success, path) => {
        if(success) {
            if(onProgress) onProgress(true);
            updateUIState(audio.paused ? false : true);
        } else {
            if(onProgress) onProgress(false);
        }
        delete window.onDownloadComplete; 
    };
    window.AndroidInterface.downloadFile(chapter.url, fileName, "onDownloadComplete");
}

export async function isChapterDownloaded() {
    if (!currentBook || !window.AndroidInterface) return false;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;
    const path = window.AndroidInterface.checkFile(fileName);
    return path !== "";
}

export async function deleteChapter() {
    if (!currentBook || !window.AndroidInterface) return;
    const fileName = `${currentBook.bookId}_${currentChapterIndex}_${currentLang}.mp3`;
    window.AndroidInterface.deleteFile(fileName);
    updateUIState(audio.paused ? false : true);
}

// --- STANDARD FUNCTIONS ---
function updateMediaSession(book, chapter) {
    if (!('mediaSession' in navigator)) return;
    let imageUrl = book.coverImage || book.cover || 'public/icons/logo.png';
    try { imageUrl = new URL(imageUrl, window.location.href).href; } catch (e) {}
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
        ['play', () => { togglePlay(); updateUIState(true); }],
        ['pause', () => { togglePlay(); updateUIState(false); }],
        ['previoustrack', prevChapter],
        ['nexttrack', nextChapter],
        ['seekbackward', () => skip(-10)],
        ['seekforward', () => skip(10)]
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
        if (err.name !== 'AbortError') updateUIState(false);
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
        if(currentBook) saveUserProgress(currentBook.bookId, currentChapterIndex, audio.currentTime, audio.duration);
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
    if (window.AndroidInterface && currentBook) {
        const chapter = currentBook.activeChapters[currentChapterIndex];
        let imageUrl = currentBook.coverImage || currentBook.cover || 'https://vibeaudio.pages.dev/frontend/public/icons/logo.png';
        try { imageUrl = new URL(imageUrl, window.location.href).href; } catch (e) {}
        try { window.AndroidInterface.updateMediaNotification(chapter.name, currentBook.title, imageUrl, isPlaying); } catch(e) {}
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

function stopProgressTracker() { if (progressInterval) clearInterval(progressInterval); }

async function updateUIState(isPlaying) {
    const isDownloaded = await isChapterDownloaded();
    const event = new CustomEvent('player-state-change', { 
        detail: { 
            isPlaying: isPlaying,
            book: currentBook,
            chapter: currentBook ? currentBook.activeChapters[currentChapterIndex] : null,
            isDownloaded: isDownloaded
        } 
    });
    window.dispatchEvent(event);
}

function formatTime(s) {
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60);
    return `${m}:${sec<10?'0'+sec:sec}`;
}