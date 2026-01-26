// --- 🖥️ UI CONTROLLER (Sorted Books & Cleaned) ---
import { fetchAllBooks, fetchUserProfile, loginUser, fetchUserProgress } from './api.js'; 
import * as Player from './player.js';

let allBooks = []; // 📚 Global variable (Master Copy)

window.app = {
    switchView: (id) => switchView(id),
    goBack: () => switchView('library'),
    seekToComment: (time) => seekToComment(time),
    filterLibrary: (category) => filterLibrary(category)
};

async function init() {
    setupAuth();

    console.log("🚀 VibeAudio UI Starting...");
    
    // 1. Load Books
    allBooks = await fetchAllBooks(); 
    
    // ✨ SORTING FIX: Books ko ID ke hisab se sort karo (Numerical Order)
    if(allBooks.length > 0) {
        allBooks.sort((a, b) => {
            // "book_4" -> 4, "book_10" -> 10
            const numA = parseInt(a.bookId.replace(/\D/g, '')) || 0; 
            const numB = parseInt(b.bookId.replace(/\D/g, '')) || 0;
            return numA - numB;
        });
    }

    // ✨ Filters aur Library render
    renderCategoryFilters(allBooks);
    renderLibrary(allBooks);
    
    // 2. Load History
    renderHistory();
    
    setupListeners();

    // 3. User Name Update (Background me)
    fetchUserProfile().then(user => {
        const userNameDisplay = document.getElementById('user-name-display');
        if(userNameDisplay && user.name) {
            userNameDisplay.innerText = user.name;
        }
    });
}

// --- 🏷️ DYNAMIC FILTER LOGIC ---
function renderCategoryFilters(books) {
    const container = document.getElementById('category-filters');
    if(!container) return;

    // 1. Saare moods collect karo (Unique only)
    const allMoods = new Set();
    books.forEach(book => {
        if(book.moods) {
            book.moods.forEach(mood => allMoods.add(mood));
        }
    });

    // 2. HTML banao (Pehle "All" button)
    let html = `<button class="filter-btn active" onclick="app.filterLibrary('All')" id="filter-all">All Books</button>`;

    // 3. Baaki moods ke buttons add karo
    allMoods.forEach(mood => {
        html += `<button class="filter-btn" onclick="app.filterLibrary('${mood}')" id="filter-${mood}">${mood}</button>`;
    });

    container.innerHTML = html;
}

function filterLibrary(category) {
    // 1. Buttons ki styling update karo
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    
    const btnId = category === 'All' ? 'filter-all' : `filter-${category}`;
    const activeBtn = document.getElementById(btnId);
    if(activeBtn) activeBtn.classList.add('active');

    // 2. Books Filter karo
    if (category === 'All') {
        renderLibrary(allBooks); // Sab dikhao
    } else {
        const filtered = allBooks.filter(book => 
            book.moods && book.moods.includes(category)
        );
        renderLibrary(filtered);
    }

    // GSAP Animation
    if(window.gsap) gsap.fromTo(".book-card", {y: 10, opacity: 0}, {y: 0, opacity: 1, stagger: 0.05, duration: 0.3});
}


// --- 📜 HISTORY LOGIC ---
async function renderHistory() {
    const grid = document.getElementById('history-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Loading History...</div>';
    const historyData = await fetchUserProgress();
    
    if (!historyData || historyData.length === 0) {
        grid.innerHTML = '<p class="empty-msg">No history yet. Start vibing!</p>';
        return;
    }

    grid.innerHTML = ''; 

    historyData.forEach(progress => {
        const book = allBooks.find(b => b.bookId == progress.bookId); 
        if (book) {
            const percent = Math.min(100, Math.floor((progress.currentTime / progress.totalDuration) * 100)) || 0;
            const card = document.createElement('div');
            card.className = 'book-card history-card';
            card.innerHTML = `
                <div class="history-cover-wrapper">
                    <img src="${book.cover}">
                    <div class="progress-overlay">
                        <div class="progress-bar-fill" style="width: ${percent}%"></div>
                    </div>
                </div>
                <div class="history-info">
                    <h3>${book.title}</h3>
                    <p class="percent-text">${percent}% Completed</p>
                </div>
            `;
            card.onclick = () => openPlayer(book);
            grid.appendChild(card);
        }
    });
}

// --- 🔒 AUTH LOGIC ---
function setupAuth() {
    const loginOverlay = document.getElementById('login-overlay');
    const loginBtn = document.getElementById('login-btn');
    const nameInput = document.getElementById('user-name');
    const codeInput = document.getElementById('access-code');
    const loginMsg = document.getElementById('login-msg');
    const userNameDisplay = document.getElementById('user-name-display');

    const storedUser = localStorage.getItem('vibe_user');
    if (storedUser) {
        if(loginOverlay) loginOverlay.style.display = 'none';
        const user = JSON.parse(storedUser);
        if(userNameDisplay) userNameDisplay.innerText = user.name;
    }

    if (loginBtn) {
        loginBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const code = codeInput.value.trim();
            if (!name || !code) return;

            loginBtn.innerText = "Verifying...";
            loginBtn.disabled = true;

            const result = await loginUser(code, name);
            if (result.success) {
                localStorage.setItem('vibe_user', JSON.stringify({ userId: result.userId, name: result.name }));
                setTimeout(() => location.reload(), 1000);
            } else {
                if(loginMsg) {
                    loginMsg.style.color = "#ff4444";
                    loginMsg.innerText = result.error;
                }
                loginBtn.innerText = "Let's Vibe 🎧";
                loginBtn.disabled = false;
            }
        };
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

    if (id === 'history') renderHistory();
}

// --- LIBRARY RENDER ---
function renderLibrary(books) {
    const grid = document.getElementById('book-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if(!books.length) { grid.innerHTML = '<p>No books found for this vibe.</p>'; return; }

    books.forEach(book => {
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
}

// --- PLAYER ---
function openPlayer(book) {
    switchView('player');
    document.getElementById('detail-cover').src = book.cover;
    document.getElementById('detail-title').innerText = book.title;
    document.getElementById('detail-author').innerText = book.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${book.cover}')`;
    document.getElementById('total-chapters').innerText = `${book.chapters.length} Chapters`;

    const list = document.getElementById('chapter-list');
    list.innerHTML = '';
    
    book.chapters.forEach((chap, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${idx+1}. ${chap.name}</span> <i class="fas fa-play"></i>`;
        li.onclick = () => { Player.loadBook(book, idx); updateUI(true); };
        list.appendChild(li);
    });

    renderComments(book.comments || []);

    const postBtn = document.getElementById('post-comment-btn');
    if(postBtn) {
        postBtn.onclick = () => {
            const input = document.getElementById('comment-input');
            const text = input.value;
            if(!text) return;

            const state = Player.getCurrentState();
            const currentTime = Math.floor(state.currentTime || 0);
            const newComment = { time: currentTime, user: "You", text: text };
            renderSingleComment(newComment); // Local update
            input.value = ''; 
            const commentList = document.getElementById('comments-list');
            commentList.scrollTop = commentList.scrollHeight;
        };
    }
    const mainBtn = document.getElementById('main-play-btn');
    if(mainBtn) mainBtn.onclick = () => { Player.loadBook(book, 0); updateUI(true); };
}

// --- COMMENTS ---
function renderComments(comments) {
    const list = document.getElementById('comments-list');
    if(list) {
        list.innerHTML = '';
        comments.forEach(c => renderSingleComment(c));
    }
}
function renderSingleComment(c) {
    const list = document.getElementById('comments-list');
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
        <div class="comment-time" onclick="window.app.seekToComment(${c.time})">${formatTime(c.time)}</div>
        <div><span class="comment-user">${c.user}</span><p>${c.text}</p></div>`;
    list.appendChild(div);
}
function seekToComment(time) {
    const audio = Player.getAudioElement();
    if(audio.duration) {
        Player.seekTo((time / audio.duration) * 100);
        Player.togglePlay();
    }
}

// --- CONTROLS ---
function setupListeners() {
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const seekBack = document.getElementById('seek-back-btn');
    const seekFwd = document.getElementById('seek-fwd-btn');
    const progress = document.getElementById('progress-bar');
    const audio = Player.getAudioElement();

    // SEARCH LOGIC
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filteredBooks = allBooks.filter(book => 
                book.title.toLowerCase().includes(query) || 
                book.author.toLowerCase().includes(query) ||
                (book.moods && book.moods.some(m => m.toLowerCase().includes(query)))
            );
            renderLibrary(filteredBooks);
        });
    }

    if(playBtn) playBtn.onclick = () => {
        const isPlaying = Player.togglePlay();
        updateUI(isPlaying);
        if(window.gsap) gsap.fromTo(playBtn, {scale:0.8}, {scale:1, duration:0.3, ease:"elastic.out"});
    };
    if (prevBtn) prevBtn.onclick = () => { if(Player.prevChapter()) updateUI(true); };
    if (nextBtn) nextBtn.onclick = () => { if(Player.nextChapter()) updateUI(true); };
    if(seekBack) seekBack.onclick = () => Player.skip(-10);
    if(seekFwd) seekFwd.onclick = () => Player.skip(10);
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
function formatTime(s) {
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60);
    return `${m}:${sec<10?'0'+sec:sec}`;
}

init();