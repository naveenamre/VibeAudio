// --- 🎧 PLAYER LOGIC (With Cloud Resume & Memory) ---
import { saveUserProgress, fetchUserProgress } from './api.js'; // ✨ Imported fetchUserProgress

const audio = document.getElementById('audio-element') || new Audio();
let currentBook = null;
let currentChapterIndex = 0;
let saveInterval = null; // ⏱️ Timer for auto-save

// --- 📥 LOAD & PLAY (Smart Resume) ---
export async function loadBook(book, index = 0) {
    stopProgressLoop(); // Purana timer roko

    currentBook = book;
    currentChapterIndex = index;

    console.log("☁️ Checking for saved progress...");
    
    // 1. Cloud se pucho: "Bhai is book ka koi save data hai?"
    // (Note: Hum user_123 hardcode kar rahe hain abhi ke liye)
    const allProgress = await fetchUserProgress("user_123");
    
    // 2. Find progress for THIS book
    // Note: bookId ko string me convert karke compare kar rahe hain safety ke liye
    const savedData = allProgress.find(p => p.bookId == book.bookId);

    if (savedData) {
        console.log(`🔥 Found Save: Chapter ${savedData.chapterIndex} @ ${savedData.currentTime}s`);
        
        // Agar saved chapter alag hai user ke selected index se, to saved wala use karo
        // (Sirf tab jab user ne specific chapter click nahi kiya ho, par abhi simple rakhte hain)
        if (index === 0 && savedData.chapterIndex > 0) {
             currentChapterIndex = parseInt(savedData.chapterIndex);
        }
        
        // Resume from saved time
        playChapter(currentChapterIndex, savedData.currentTime);
    } else {
        console.log("✨ No save found, starting fresh.");
        playChapter(currentChapterIndex, 0); // Start from 0
    }
}

function playChapter(index, startTime = 0) { // ✨ startTime parameter added
    if (!currentBook || !currentBook.chapters[index]) return;

    const chapter = currentBook.chapters[index];
    
    // Audio Source Set karo
    audio.src = chapter.url;
    
    // Metadata set karna (Lock Screen Controls)
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: chapter.name,
            artist: currentBook.author,
            album: currentBook.title,
            artwork: [{ src: currentBook.cover, sizes: '512x512', type: 'image/jpeg' }]
        });
        
        navigator.mediaSession.setActionHandler('play', () => togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => prevChapter());
        navigator.mediaSession.setActionHandler('nexttrack', () => nextChapter());
    }

    // ✨ Magic: Audio load hone ka wait karo fir seek karo
    // Agar hum turant currentTime set karte hain, to kabhi kabhi fail ho jata hai
    audio.onloadedmetadata = () => {
        if (startTime > 0) {
            audio.currentTime = startTime;
        }
        
        audio.play()
            .then(() => startProgressLoop()) // ▶️ Play hote hi tracking shuru
            .catch(e => console.error("Autoplay blocked:", e));
    };
    
    // Fallback: Agar metadata event miss ho jaye to play karne ki koshish karo
    setTimeout(() => {
        if(audio.paused) audio.play().catch(()=> {});
    }, 1000);
}

// --- ⏯️ CONTROLS ---
export function togglePlay() {
    if (audio.paused) {
        audio.play();
        startProgressLoop(); // 🟢 Start Auto-Save
        return true; // Is Playing
    } else {
        audio.pause();
        stopProgressLoop();  // 🔴 Stop Timer
        triggerSave();       // 💾 Pause karte hi Save karo
        return false; // Is Paused
    }
}

export function seekTo(pct) {
    if (audio.duration) {
        audio.currentTime = (pct / 100) * audio.duration;
    }
}

export function skip(seconds) {
    audio.currentTime += seconds;
    triggerSave(); // Skip karne par bhi save kar lo
}

export function prevChapter() {
    if (currentChapterIndex > 0) {
        currentChapterIndex--;
        playChapter(currentChapterIndex, 0); // Next/Prev humesha 0 se start hoga
        return true;
    }
    return false;
}

export function nextChapter() {
    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
        currentChapterIndex++;
        playChapter(currentChapterIndex, 0);
        return true;
    }
    return false;
}

// --- ℹ️ GETTERS ---
export function getAudioElement() {
    return audio;
}

export function getCurrentState() {
    return {
        book: currentBook,
        chapter: currentBook ? currentBook.chapters[currentChapterIndex] : null,
        currentTime: audio.currentTime,
        duration: audio.duration,
        isPlaying: !audio.paused
    };
}

// --- 💾 CLOUD SAVE LOGIC ---

function triggerSave() {
    if (currentBook && audio.duration > 0) {
        saveUserProgress(
            currentBook.bookId, 
            currentChapterIndex, 
            audio.currentTime, 
            audio.duration
        );
    }
}

// 🔁 Auto-Save Loop (Har 15 sec)
function startProgressLoop() {
    stopProgressLoop(); // Safety check
    saveInterval = setInterval(() => {
        if (!audio.paused && currentBook) {
            triggerSave();
            console.log("⏳ Auto-saving progress...");
        }
    }, 15000); // 15 Seconds
}

function stopProgressLoop() {
    if (saveInterval) {
        clearInterval(saveInterval);
        saveInterval = null;
    }
}