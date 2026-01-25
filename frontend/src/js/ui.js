// --- 🖥️ UI CONTROLLER ---
import { fetchAllBooks } from './api.js';
import * as Player from './player.js';

// Global App Object for HTML interactions
window.app = {
    switchView: (viewId) => switchView(viewId),
    goBack: () => goBack(),
    playBook: (bookId) => initBookPlay(bookId)
};

let allBooks = [];

// --- INIT ---
async function init() {
    console.log("🚀 VibeAudio Cloud Starting...");
    
    // Load Books
    allBooks = await fetchAllBooks();
    renderLibrary(allBooks);
    
    // Setup Global Listeners
    setupPlayerListeners();
}

// --- 🔄 NAVIGATION (SPA Logic) ---
function switchView(viewId) {
    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active-tab'));

    // Show selected view
    document.getElementById(`view-${viewId}`).classList.remove('hidden');
    
    // Update Tab
    const navBtn = document.getElementById(`nav-${viewId}`);
    if(navBtn) navBtn.classList.add('active-tab');
}

function goBack() {
    switchView('library');
}

// --- 📚 LIBRARY RENDER ---
function renderLibrary(books) {
    const grid = document.getElementById('book-grid');
    grid.innerHTML = ''; // Clear loading spinner

    books.forEach(book => {
        const card = document.createElement('div');
        card.className = 'book-card fade-in';
        card.innerHTML = `
            <img src="${book.cover}" loading="lazy" alt="${book.title}">
            <h3>${book.title}</h3>
            <p>${book.author}</p>
        `;
        // Pass entire book object via closure
        card.onclick = () => openPlayerPage(book);
        grid.appendChild(card);
    });
}

// --- 🎵 PLAYER UI ---
function openPlayerPage(book) {
    switchView('player');
    
    // Update Big Player UI
    document.getElementById('detail-cover').src = book.cover;
    document.getElementById('detail-title').innerText = book.title;
    document.getElementById('detail-author').innerText = book.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${book.cover}')`;
    document.getElementById('total-chapters').innerText = `${book.chapters.length} Chapters`;

    // Render Chapters
    const list = document.getElementById('chapter-list');
    list.innerHTML = '';
    
    book.chapters.forEach((chap, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${idx + 1}. ${chap.name}</span> <i class="fas fa-play"></i>`;
        li.onclick = () => {
            Player.loadBook(book, idx);
            updatePlayerState(true);
        };
        list.appendChild(li);
    });

    // Auto-play first chapter if not playing
    document.getElementById('main-play-btn').onclick = () => {
        Player.loadBook(book, 0);
        updatePlayerState(true);
    };
}

// --- 🎛️ CONTROLS ---
function setupPlayerListeners() {
    const playBtn = document.getElementById('play-btn');
    const progressBar = document.getElementById('progress-bar');
    const audio = Player.getAudioElement();

    // Toggle Play
    playBtn.onclick = () => {
        const isPlaying = Player.togglePlay();
        updatePlayerState(isPlaying);
    };

    // Seek
    progressBar.addEventListener('input', (e) => {
        Player.seekTo(e.target.value);
    });

    // Time Update Loop
    audio.ontimeupdate = () => {
        const state = Player.getCurrentState();
        if (state.duration) {
            const percent = (state.currentTime / state.duration) * 100;
            progressBar.value = percent;
            document.getElementById('current-time').innerText = formatTime(state.currentTime);
            document.getElementById('total-duration').innerText = formatTime(state.duration);
        }
    };
    
    // Auto Next Chapter
    audio.onended = () => {
        // Logic for next chapter can be added here
        updatePlayerState(false);
    };
}

function updatePlayerState(isPlaying) {
    const btnIcon = document.getElementById('play-btn').querySelector('i');
    
    if (isPlaying) {
        btnIcon.classList.remove('fa-play');
        btnIcon.classList.add('fa-pause');
        document.getElementById('mini-player').classList.remove('hidden');
        
        // Update Mini Player Info
        const state = Player.getCurrentState();
        if(state.book) {
            document.getElementById('mini-cover').src = state.book.cover;
            document.getElementById('mini-title').innerText = state.book.title;
            document.getElementById('mini-chapter').innerText = state.chapter.name;
        }
    } else {
        btnIcon.classList.remove('fa-pause');
        btnIcon.classList.add('fa-play');
    }
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

// Start App
init();