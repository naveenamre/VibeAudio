// --- 🎧 AUDIO ENGINE ---

const audio = document.getElementById('audio-element');
let isPlaying = false;
let currentBook = null;
let currentChapterIndex = 0;

// Visualizer Context
let audioContext, analyser, dataArray, canvas, ctx;

// --- CORE FUNCTIONS ---

export function loadBook(book, index = 0) {
    currentBook = book;
    playChapter(index);
}

export function playChapter(index) {
    if (!currentBook || !currentBook.chapters[index]) return;

    currentChapterIndex = index;
    const chapter = currentBook.chapters[index];
    
    // Secure URL handling
    audio.src = chapter.url;
    audio.crossOrigin = "anonymous"; // Important for Visualizer

    // Visualizer Init (User interaction ke baad hi chalta hai)
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
    if (!audio.src) return false;
    
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

export function getAudioElement() {
    return audio;
}

export function getCurrentState() {
    return {
        book: currentBook,
        chapter: currentBook ? currentBook.chapters[currentChapterIndex] : null,
        isPlaying,
        currentTime: audio.currentTime,
        duration: audio.duration
    };
}

// --- 🎨 VISUALIZER LOGIC (Mirrored) ---
function initVisualizer() {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        analyser.fftSize = 64; 
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        canvas = document.getElementById('visualizer');
        if(canvas) {
            ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            animateVisualizer();
        }
    } catch(e) {
        console.warn("Visualizer Init Failed (Click first):", e);
    }
}

function animateVisualizer() {
    requestAnimationFrame(animateVisualizer);
    if (!isPlaying) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }
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
        
        // Mirrored Effect
        ctx.fillRect(x, canvas.height / 2 - barHeight / 2, barWidth, barHeight);
        
        x += barWidth + 5;
    }
}

// --- 📱 MOBILE NOTIFICATIONS ---
function updateMediaSession(chapter) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: chapter.name,
            artist: currentBook.author,
            artwork: [{ src: currentBook.cover, sizes: '512x512', type: 'image/jpg' }]
        });
        navigator.mediaSession.setActionHandler('play', togglePlay);
        navigator.mediaSession.setActionHandler('pause', togglePlay);
    }
}