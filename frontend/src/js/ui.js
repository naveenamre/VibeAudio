// --- 🖥️ UI CONTROLLER (With Streaks & Comments) ---
import { fetchAllBooks, fetchUserProfile } from './api.js';
import * as Player from './player.js';

window.app = {
    switchView: (id) => switchView(id),
    goBack: () => switchView('library'),
    closeStreak: () => closeStreakPopup()
};

async function init() {
    console.log("🚀 VibeAudio UI Starting...");
    
    // 1. Check Streak (Popup Logic)
    const user = await fetchUserProfile();
    if(user.streak > 0) {
        showStreakPopup(user.streak);
    }

    // 2. Load Books
    const books = await fetchAllBooks();
    renderLibrary(books);
    setupListeners();
}

// --- 🔥 STREAK LOGIC ---
function showStreakPopup(days) {
    const popup = document.getElementById('streak-popup');
    popup.classList.remove('hidden');
    // GSAP Entrance
    if(window.gsap) {
        gsap.fromTo(".fire-anim", {scale: 0}, {scale: 1.2, duration: 0.8, ease: "elastic.out"});
        gsap.fromTo("#streak-popup h2", {y: 20, opacity: 0}, {y: 0, opacity: 1, delay: 0.3});
    }
}

function closeStreakPopup() {
    const popup = document.getElementById('streak-popup');
    if(window.gsap) {
        gsap.to(popup, {opacity: 0, duration: 0.3, onComplete: () => popup.classList.add('hidden')});
    } else {
        popup.classList.add('hidden');
    }
}

// --- NAVIGATION ---
function switchView(id) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-tabs button').forEach(el => el.classList.remove('active-tab'));
    
    const view = document.getElementById(`view-${id}`);
    if (view) {
        view.classList.remove('hidden');
        if(window.gsap) gsap.fromTo(view, {opacity:0, y:10}, {opacity:1, y:0, duration:0.3});
    }
    
    const btn = document.getElementById(`nav-${id}`);
    if(btn) btn.classList.add('active-tab');
}

// --- LIBRARY (With Moods) ---
function renderLibrary(books) {
    const grid = document.getElementById('book-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if(!books.length) { grid.innerHTML = '<p>No books found.</p>'; return; }

    books.forEach(book => {
        // Mood HTML generator
        const moodHTML = book.moods ? 
            `<div class="mood-tags">${book.moods.map(m => `<span class="mood-tag">${m}</span>`).join('')}</div>` : '';

        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `
            <img src="${book.cover}">
            <h3>${book.title}</h3>
            <p>${book.author}</p>
            ${moodHTML} `;
        card.onclick = () => openPlayer(book);
        grid.appendChild(card);
    });

    if(window.gsap) gsap.fromTo(".book-card", {opacity:0, y:20}, {opacity:1, y:0, stagger:0.1});
}

// --- PLAYER (With Comments) ---
function openPlayer(book) {
    switchView('player');
    
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
        li.style.opacity = "1"; 
        li.innerHTML = `<span>${idx+1}. ${chap.name}</span> <i class="fas fa-play"></i>`;
        li.onclick = () => { Player.loadBook(book, idx); updateUI(true); };
        list.appendChild(li);
    });

    // Render Comments
    renderComments(book.comments || []);

    // Setup Add Comment Button (Closure to access current book)
    document.getElementById('post-comment-btn').onclick = () => {
        const input = document.getElementById('comment-input');
        const text = input.value;
        if(!text) return;

        const state = Player.getCurrentState();
        const currentTime = Math.floor(state.currentTime || 0);
        
        // Add fake comment locally
        const newComment = { time: currentTime, user: "You", text: text };
        renderSingleComment(newComment);
        
        input.value = ''; // Clear input
        
        // Scroll to bottom
        const commentList = document.getElementById('comments-list');
        commentList.scrollTop = commentList.scrollHeight;
    };

    const mainBtn = document.getElementById('main-play-btn');
    if(mainBtn) mainBtn.onclick = () => { Player.loadBook(book, 0); updateUI(true); };
}

// --- 💬 COMMENTS LOGIC ---
function renderComments(comments) {
    const list = document.getElementById('comments-list');
    list.innerHTML = '';
    comments.forEach(c => renderSingleComment(c));
}

function renderSingleComment(c) {
    const list = document.getElementById('comments-list');
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
        <div class="comment-time" onclick="window.app.seekToComment(${c.time})">
            ${formatTime(c.time)}
        </div>
        <div>
            <span class="comment-user">${c.user}</span>
            <p>${c.text}</p>
        </div>
    `;
    list.appendChild(div);
}

// Global function to seek when comment time is clicked
window.app.seekToComment = (time) => {
    Player.seekTo((time / Player.getAudioElement().duration) * 100);
    Player.togglePlay(); // Ensure play
};


// --- 🎛️ CONTROLS ---
function setupListeners() {
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const seekBack = document.getElementById('seek-back-btn');
    const seekFwd = document.getElementById('seek-fwd-btn');
    const progress = document.getElementById('progress-bar');
    const audio = Player.getAudioElement();

    if(playBtn) playBtn.onclick = () => {
        const isPlaying = Player.togglePlay();
        updateUI(isPlaying);
        if(window.gsap) gsap.fromTo(playBtn, {scale:0.8}, {scale:1, duration:0.3, ease:"elastic.out"});
    };

    if (prevBtn) prevBtn.onclick = () => {
        if(Player.prevChapter()) {
            updateUI(true);
            if(window.gsap) gsap.fromTo(prevBtn, {x:5}, {x:0, duration:0.2});
        }
    };

    if (nextBtn) nextBtn.onclick = () => {
        if(Player.nextChapter()) {
            updateUI(true);
            if(window.gsap) gsap.fromTo(nextBtn, {x:-5}, {x:0, duration:0.2});
        }
    };

    if(seekBack) seekBack.onclick = () => { Player.skip(-10); animateRotate(seekBack, -45); };
    if(seekFwd) seekFwd.onclick = () => { Player.skip(10); animateRotate(seekFwd, 45); };

    if(progress) progress.addEventListener('input', (e) => Player.seekTo(e.target.value));

    audio.ontimeupdate = () => {
        const state = Player.getCurrentState();
        if (state.duration && progress) {
            const pct = (state.currentTime / state.duration) * 100;
            progress.value = pct;
            progress.style.background = `linear-gradient(to right, var(--secondary) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`;
            
            document.getElementById('current-time').innerText = formatTime(state.currentTime);
            document.getElementById('total-duration').innerText = formatTime(state.duration);
        }
    };

    audio.onended = () => {
        if(Player.nextChapter()) updateUI(true);
        else updateUI(false);
    };
}

// --- HELPERS ---
function updateUI(isPlaying) {
    const playBtn = document.getElementById('play-btn');
    if(!playBtn) return;
    
    const icon = playBtn.querySelector('i');
    if(isPlaying) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
        document.getElementById('mini-player').classList.remove('hidden');
        
        const state = Player.getCurrentState();
        if(state.book) {
            document.getElementById('mini-cover').src = state.book.cover;
            document.getElementById('mini-title').innerText = state.book.title;
            document.getElementById('mini-chapter').innerText = state.chapter.name;
        }
    } else {
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
    }
}

function animateRotate(el, deg) {
    if(window.gsap) gsap.fromTo(el, {rotate:0}, {rotate:deg, duration:0.2, yoyo:true, repeat:1});
}

function formatTime(s) {
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60);
    return `${m}:${sec<10?'0'+sec:sec}`;
}

init();