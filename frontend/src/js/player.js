// --- 🎧 AUDIO ENGINE (Complete & Crash Proof) ---

const audio = document.getElementById('audio-element');
let isPlaying = false;
let currentBook = null;
let currentChapterIndex = 0;

// Visualizer Variables (Global taaki crash na ho)
let audioContext = null;
let analyser = null;
let dataArray = null;
let canvas = null;
let ctx = null;
let source = null; // Important: Source ek hi baar banna chahiye

// --- 🔊 SFX GENERATOR (Bina External File ke Sounds) ---
const SFX = {
    ctx: null,

    init: () => {
        if (!SFX.ctx) {
            SFX.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    
    playTone: (freq, type, duration) => {
        SFX.init();
        if (SFX.ctx.state === 'suspended') SFX.ctx.resume();
        
        const osc = SFX.ctx.createOscillator();
        const gain = SFX.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, SFX.ctx.currentTime);
        gain.gain.setValueAtTime(0.1, SFX.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, SFX.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(SFX.ctx.destination);
        osc.start();
        osc.stop(SFX.ctx.currentTime + duration);
    },

    tap: () => SFX.playTone(600, 'sine', 0.1),       // Play/Pause Sound
    tick: () => SFX.playTone(800, 'triangle', 0.05), // Skip Sound
    swoosh: () => {                                  // Chapter Change Sound
        SFX.playTone(200, 'sine', 0.3);
        SFX.playTone(400, 'triangle', 0.2);
    }
};

// --- 🎛️ CORE FUNCTIONS ---

export function loadBook(book, index = 0) {
    currentBook = book;
    SFX.swoosh(); // 🔊 Sound Effect
    playChapter(index);
}

export function playChapter(index) {
    if (!currentBook || !currentBook.chapters[index]) return;

    currentChapterIndex = index;
    const chapter = currentBook.chapters[index];
    
    // 1. CrossOrigin set karna zaroori hai Visualizer ke liye
    audio.crossOrigin = "anonymous"; 
    audio.src = chapter.url;

    // 2. AudioContext Init (User interaction ke baad hi allowed hota hai)
    if (!audioContext) initVisualizer();

    audio.play()
        .then(() => {
            isPlaying = true;
            updateMediaSession(chapter);
        })
        .catch(err => console.error("Playback Error:", err));
        
    return { isPlaying, chapter };
}

export function togglePlay() {
    SFX.tap(); // 🔊 Sound Effect

    if (!audio.src) return false;
    
    // Resume context if suspended (Browser policy fix)
    if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
    }
    
    if (audio.paused) {
        audio.play();
        isPlaying = true;
    } else {
        audio.pause();
        isPlaying = false;
    }
    return isPlaying;
}

export function seekTo(percent) {
    if (audio.duration) {
        audio.currentTime = (percent / 100) * audio.duration;
    }
}

// 🔥 10s Skip Logic
export function skip(seconds) {
    if (audio.duration) {
        SFX.tick(); // 🔊 Sound Effect
        audio.currentTime += seconds;
    }
}

// 🔥 Next Chapter Logic
export function nextChapter() {
    if (currentBook && currentChapterIndex < currentBook.chapters.length - 1) {
        loadBook(currentBook, currentChapterIndex + 1);
        return true;
    }
}

// 🔥 Prev Chapter Logic
export function prevChapter() {
    if (currentBook && currentChapterIndex > 0) {
        loadBook(currentBook, currentChapterIndex - 1);
        return true;
    }
}

export function getAudioElement() { return audio; }

export function getCurrentState() {
    return {
        book: currentBook,
        chapter: currentBook ? currentBook.chapters[currentChapterIndex] : null,
        isPlaying,
        currentTime: audio.currentTime,
        duration: audio.duration
    };
}

// --- 🎨 VISUALIZER LOGIC (Safe & Crash Proof) ---
function initVisualizer() {
    try {
        if(audioContext) return; // Agar pehle se bana hai toh wapas mat banao

        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        
        // 🔥 CRITICAL FIX: Source ek hi baar create hona chahiye
        if (!source) {
            source = audioContext.createMediaElementSource(audio);
            source.connect(analyser);
            analyser.connect(audioContext.destination);
        }
        
        analyser.fftSize = 64; 
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        canvas = document.getElementById('visualizer');
        if(canvas) {
            ctx = canvas.getContext('2d');
            animateVisualizer();
        }
    } catch(e) {
        console.warn("Visualizer Init Warning (Ignore if audio plays):", e);
    }
}

function animateVisualizer() {
    requestAnimationFrame(animateVisualizer);
    
    if (!canvas || !ctx) return;

    // Resize Canvas agar chhota bada ho raha ho
    if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }

    if (!isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
    
    if(analyser) {
        analyser.getByteFrequencyData(dataArray);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / dataArray.length) * 0.8;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
            let barHeight = dataArray[i] / 1.5;
            
            // Neon Gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            gradient.addColorStop(0, '#1fddff');
            gradient.addColorStop(1, '#ff4b1f');
            ctx.fillStyle = gradient;

            // Draw Bar (Mirrored effect hataya hai simple look ke liye)
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 5;
        }
    }
}

// Mobile Lock Screen Controls
function updateMediaSession(chapter) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: chapter.name,
            artist: currentBook.author,
            artwork: [{ src: currentBook.cover, sizes: '512x512', type: 'image/jpg' }]
        });
        navigator.mediaSession.setActionHandler('play', togglePlay);
        navigator.mediaSession.setActionHandler('pause', togglePlay);
        navigator.mediaSession.setActionHandler('previoustrack', prevChapter);
        navigator.mediaSession.setActionHandler('nexttrack', nextChapter);
    }
}