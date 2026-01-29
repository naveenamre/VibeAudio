// --- 🖥️ UI CONTROLLER (Main Hub) ---
import { fetchAllBooks, fetchUserProfile, loginUser } from './api.js'; 
import * as Player from './player.js';

// Import New Modules
import * as LibraryUI from './ui-library.js';
import * as PlayerUI from './ui-player.js';

let allBooks = []; // 📚 Global Master Copy

// --- 🌏 GLOBAL APP OBJECT ---
window.app = {
    switchView: (id) => switchView(id),
    goBack: () => switchView('library'),
    filterLibrary: (category) => filterLibraryLogic(category),
    
    // Player functions pass-through
    seekToComment: (time) => {
        const audio = Player.getAudioElement();
        if(audio.duration) { Player.seekTo((time/audio.duration)*100); Player.togglePlay(); }
    },

    // 🔄 SYNC DATA (Fake Animation for User Satisfaction)
    syncData: async () => {
        const btn = document.querySelector('.btn-secondary'); 
        if(!btn) return;
        
        const icon = btn.querySelector('i');
        const originalText = btn.innerHTML;
        
        // 1. Animation Start
        if(icon) icon.classList.add('fa-spin');
        btn.innerHTML = `<i class="fas fa-sync fa-spin"></i> Syncing...`;
        btn.disabled = true;

        // 2. Fake Delay (Feel lene ke liye)
        await new Promise(r => setTimeout(r, 1500));

        // 3. Success Feedback
        if(icon) icon.classList.remove('fa-spin');
        btn.innerHTML = `<i class="fas fa-check"></i> Synced!`;
        btn.style.borderColor = "#00ff00";
        btn.style.color = "#00ff00";
        
        showToast("☁️ Data synced with Cloud!");

        // 4. Reset after 3s
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.borderColor = "";
            btn.style.color = "";
        }, 3000);
    }
};

// --- 🚀 INIT ---
async function init() {
    setupAuth();
    console.log("🚀 VibeAudio UI Starting...");
    setupImageObserver(); // Watchman start

    // 1. Load Data
    allBooks = await fetchAllBooks(); 
    
    // Sort
    if(allBooks.length > 0) {
        allBooks.sort((a, b) => {
            const numA = parseInt(a.bookId.replace(/\D/g, '')) || 0; 
            const numB = parseInt(b.bookId.replace(/\D/g, '')) || 0;
            return numA - numB;
        });
    }

    // 2. Render Library & Filters (using Module)
    LibraryUI.renderCategoryFilters(allBooks);
    LibraryUI.renderLibrary(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
    
    // 3. Render History
    LibraryUI.renderHistory(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
    
    setupListeners();
    updateUserName();
}

// --- 🧭 NAVIGATION ---
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

    // 👇 NEW: Player Mode Trigger (For Mobile Cleanup)
    if (id === 'player') {
        document.body.classList.add('player-mode');
    } else {
        document.body.classList.remove('player-mode');
    }

    // History tab refresh logic
    if (id === 'history') LibraryUI.renderHistory(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));

    // 🦎 RESET THEME: Agar Library me wapas aaye toh default color wapas lao
    if (id === 'library') {
        document.documentElement.style.setProperty('--primary', '#ff4b1f');
        document.body.style.background = ""; 
        const playBtn = document.getElementById('play-btn');
        if(playBtn) playBtn.style.boxShadow = 'none';
    }
}

// --- 🔍 FILTER LOGIC ---
function filterLibraryLogic(category) {
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const btnId = category === 'All' ? 'filter-all' : `filter-${category}`;
    const activeBtn = document.getElementById(btnId);
    if(activeBtn) activeBtn.classList.add('active');

    if (category === 'All') {
        LibraryUI.renderLibrary(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
    } else {
        const filtered = allBooks.filter(book => book.moods && book.moods.includes(category));
        LibraryUI.renderLibrary(filtered, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
    }
}

// --- 🎮 CONTROLS & LISTENERS ---
function setupListeners() {
    const playBtn = document.getElementById('play-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const seekBack = document.getElementById('seek-back-btn');
    const seekFwd = document.getElementById('seek-fwd-btn');
    const progress = document.getElementById('progress-bar');
    const audio = Player.getAudioElement();
    const postBtn = document.getElementById('post-comment-btn');
    const searchInput = document.getElementById('search-input');
    
    // Sync Button Listener
    const syncBtn = document.querySelector('.btn-secondary');
    if (syncBtn) {
        syncBtn.onclick = () => window.app.syncData();
    }

    // Search
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allBooks.filter(book => 
                book.title.toLowerCase().includes(query) || 
                book.author.toLowerCase().includes(query)
            );
            LibraryUI.renderLibrary(filtered, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
        });
    }

    // Comment Post
    if(postBtn) {
        postBtn.onclick = () => {
            const input = document.getElementById('comment-input');
            const text = input.value;
            if(!text) return;
            const state = Player.getCurrentState();
            const currentTime = Math.floor(state.currentTime || 0);
            const newComment = { time: currentTime, user: "You", text: text };
            PlayerUI.renderSingleComment(newComment); 
            input.value = ''; 
        };
    }

    // Player Controls
    if(playBtn) playBtn.onclick = () => {
        const isPlaying = Player.togglePlay();
        PlayerUI.updateUI(isPlaying);
    };
    if (prevBtn) prevBtn.onclick = () => { if(Player.prevChapter()) PlayerUI.updateUI(true); };
    if (nextBtn) nextBtn.onclick = () => { if(Player.nextChapter()) PlayerUI.updateUI(true); };
    if(seekBack) seekBack.onclick = () => Player.skip(-10);
    if(seekFwd) seekFwd.onclick = () => Player.skip(10);
    
    // 🔥 PROGRESS BAR DRAG (Update Color Instantly)
    if(progress) {
        progress.addEventListener('input', (e) => {
            const pct = e.target.value;
            Player.seekTo(pct);
            progress.style.backgroundSize = `${pct}% 100%`; // Slider Color Fill
        });
    }

    // Audio Events
    audio.ontimeupdate = () => {
        const state = Player.getCurrentState();
        if (state.duration && progress) {
            const pct = (state.currentTime / state.duration) * 100;
            
            // 1. Value Update
            progress.value = pct;
            
            // 2. 🔥 Color Fill Logic (Important for Ultimate Slider)
            progress.style.backgroundSize = `${pct}% 100%`;

            // 3. Time Text
            document.getElementById('current-time').innerText = PlayerUI.formatTime(state.currentTime);
            document.getElementById('total-duration').innerText = PlayerUI.formatTime(state.duration);
        }
    };
    audio.onended = () => {
        if(Player.nextChapter()) PlayerUI.updateUI(true);
        else PlayerUI.updateUI(false);
    };
}

// --- 🕵️‍♂️ IMAGE WATCHMAN ---
function setupImageObserver() {
    window.imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.onload = () => img.classList.add('visible');
                observer.unobserve(img);
            }
        });
    }, { rootMargin: "100px 0px", threshold: 0.01 });
}

// --- 🔒 AUTH & USER ---
function setupAuth() {
    const loginOverlay = document.getElementById('login-overlay');
    const loginBtn = document.getElementById('login-btn');
    const nameInput = document.getElementById('user-name');
    const codeInput = document.getElementById('access-code');
    const loginMsg = document.getElementById('login-msg');
    const userNameDisplay = document.getElementById('user-name-display');

    // 1. Check Previous Login
    const storedUser = localStorage.getItem('vibe_user');
    if (storedUser) {
        if(loginOverlay) loginOverlay.style.display = 'none';
        try {
            const user = JSON.parse(storedUser);
            if(userNameDisplay) userNameDisplay.innerText = user.name;
        } catch(e) { console.error("Parse Error", e); }
    }

    // 2. Button Logic
    if (loginBtn) {
        loginBtn.onclick = async () => {
            const name = nameInput.value.trim();
            const code = codeInput.value.trim();

            if (!name || !code) {
                if(loginMsg) {
                    loginMsg.innerText = "Please enter both Name & Code! 🤨";
                    loginMsg.style.color = "#ff4444";
                }
                return;
            }

            // Feedback
            const originalText = loginBtn.innerText;
            loginBtn.innerText = "Verifying...";
            loginBtn.disabled = true;

            // API Call
            const result = await loginUser(code, name);
            
            if (result.success) {
                // Success
                localStorage.setItem('vibe_user', JSON.stringify({ 
                    userId: result.userId, 
                    name: result.name 
                }));
                
                if(loginMsg) {
                    loginMsg.innerText = "Access Granted! 🚀";
                    loginMsg.style.color = "#00ff00";
                }
                setTimeout(() => location.reload(), 1000);

            } else {
                // Fail
                if(loginMsg) {
                    loginMsg.style.color = "#ff4444";
                    loginMsg.innerText = result.error || "Wrong Code!";
                }
                loginBtn.innerText = originalText;
                loginBtn.disabled = false;
            }
        };
    }
}

function updateUserName() {
    fetchUserProfile().then(user => {
        const d = document.getElementById('user-name-display');
        if(d && user.name) d.innerText = user.name;
    });
}

// --- 🍞 HELPER: TOAST MSG ---
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- 🎨 STYLES ---
const style = document.createElement('style');
style.textContent = `
    .lazy-img { opacity: 0; transition: opacity 0.6s ease-in-out; }
    .lazy-img.visible { opacity: 1; }
    .skeleton-loader { 
        height: 45px; margin: 10px 0; border-radius: 8px;
        background: rgba(255,255,255,0.05);
        background-image: linear-gradient(90deg, rgba(255,255,255,0) 0, rgba(255,255,255,0.1) 20%, rgba(255,255,255,0.2) 60%, rgba(255,255,255,0) 100%);
        background-size: 200% 100%;
        animation: skeleton 2s infinite linear;
    }
    @keyframes skeleton { 0% {background-position: -200% 0;} 100% {background-position: 200% 0;} }
`;
document.head.appendChild(style);

init();