// --- 🖥️ UI CONTROLLER (App-Ready: Back Button, Native Controls & Features) ---
import { fetchAllBooks, getLocalUserProfile, syncUserProfile } from './api.js'; 
import * as Player from './player.js';

// Import New Modules
import * as LibraryUI from './ui-library.js';
import * as PlayerUI from './ui-player.js';

let allBooks = []; // 📚 Global Master Copy

// --- 🌏 GLOBAL APP OBJECT ---
window.app = {
    // Basic Nav
    switchView: (id) => switchView(id),
    goBack: () => window.history.back(), 
    filterLibrary: (category) => filterLibraryLogic(category),
    
    // Player Controls (For Android Bridge) 🔥
    togglePlay: () => {
        const isPlaying = Player.togglePlay();
        PlayerUI.updateUI(isPlaying);
    },
    nextChapter: () => {
        if(Player.nextChapter()) PlayerUI.updateUI(true);
    },
    prevChapter: () => {
        if(Player.prevChapter()) PlayerUI.updateUI(true);
    },
    
    // Seek
    seekToComment: (time) => {
        const audio = Player.getAudioElement();
        if(audio.duration) { Player.seekTo((time/audio.duration)*100); Player.togglePlay(); }
    },

    // Sync
    syncData: async () => {
        const btn = document.querySelector('.btn-secondary'); 
        if(!btn) return;
        const icon = btn.querySelector('i');
        const originalText = btn.innerHTML;
        if(icon) icon.classList.add('fa-spin');
        btn.innerHTML = `<i class="fas fa-sync fa-spin"></i> Syncing...`;
        btn.disabled = true;
        await syncUserProfile();
        if(icon) icon.classList.remove('fa-spin');
        btn.innerHTML = `<i class="fas fa-check"></i> Synced!`;
        btn.style.borderColor = "#00ff00";
        btn.style.color = "#00ff00";
        showToast("☁️ Data synced with Cloud!");
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.borderColor = "";
            btn.style.color = "";
        }, 3000);
    },

    // Logout
    logout: async () => {
        console.log("👋 Logging out...");
        if (window.Clerk) {
            try { await window.Clerk.signOut(); } catch (e) { console.warn("Clerk signout issue:", e); }
        }
        localStorage.removeItem("vibe_user_id");
        localStorage.removeItem("vibe_user_name");
        window.location.href = "../../index.html";
    }
};

// --- 🚀 INIT ---
async function init() {
    console.log("🚀 VibeAudio UI Starting...");
    setupImageObserver(); 

    // Android Back Button Logic
    window.addEventListener('popstate', (event) => {
        if (event.state && event.state.view) {
            switchView(event.state.view, false);
        } else {
            switchView('library', false);
        }
    });
    history.replaceState({ view: 'library' }, null, "#library");

    // Load User
    const user = getLocalUserProfile();
    if (user.name) {
        const nameDisplay = document.getElementById('user-name-display');
        const avatar = document.getElementById('profile-avatar');
        if(nameDisplay) nameDisplay.innerText = user.name;
        if(avatar) avatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=ff4b1f&color=fff&bold=true`;
    }

    syncUserProfile();

    // Load Books
    allBooks = await fetchAllBooks(); 
    if(allBooks.length > 0) {
        allBooks.sort((a, b) => {
            const numA = parseInt(a.bookId.replace(/\D/g, '')) || 0; 
            const numB = parseInt(b.bookId.replace(/\D/g, '')) || 0;
            return numA - numB;
        });
    }

    // Render UI
    LibraryUI.renderCategoryFilters(allBooks);
    LibraryUI.renderLibrary(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
    LibraryUI.renderHistory(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));
    
    setupListeners();
}

// --- 🧭 NAVIGATION ---
function switchView(id, pushHistory = true) {
    if (pushHistory) history.pushState({ view: id }, null, `#${id}`);

    document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
    const view = document.getElementById(`view-${id}`);
    if (view) {
        view.classList.remove('hidden');
        if(window.gsap) gsap.fromTo(view, {opacity:0, y:10}, {opacity:1, y:0, duration:0.3});
    }

    document.querySelectorAll('.sidebar-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.sidebar-nav button[onclick*="'${id}'"]`);
    if(activeBtn) activeBtn.classList.add('active');

    if (id === 'player') {
        document.body.classList.add('player-mode');
    } else {
        document.body.classList.remove('player-mode');
    }

    if (id === 'history') LibraryUI.renderHistory(allBooks, (book) => PlayerUI.openPlayerUI(book, allBooks, switchView));

    if (id === 'library') {
        document.documentElement.style.setProperty('--primary', '#ff4b1f');
        document.body.style.background = ""; 
        const playBtn = document.getElementById('play-btn');
        if(playBtn) playBtn.style.boxShadow = 'none';
    }
}

// --- 🔍 FILTER ---
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

// --- 🎮 LISTENERS ---
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
    
    // Sidebar
    const menuBtn = document.getElementById('menu-btn');
    const closeBtn = document.getElementById('close-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebar = document.getElementById('sidebar');

    function toggleSidebar(show) {
        if(!sidebar || !overlay) return;
        if (show) {
            sidebar.classList.add('active');
            overlay.classList.add('active');
            overlay.classList.remove('hidden');
        } else {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        }
    }

    if(menuBtn) menuBtn.onclick = () => toggleSidebar(true);
    if(closeBtn) closeBtn.onclick = () => toggleSidebar(false);
    if(overlay) overlay.onclick = () => toggleSidebar(false);
    document.querySelectorAll('.sidebar-nav button').forEach(btn => {
        btn.addEventListener('click', () => toggleSidebar(false));
    });

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

    // Comment
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

    // Player Buttons (Use global functions)
    if(playBtn) playBtn.onclick = window.app.togglePlay;
    if (prevBtn) prevBtn.onclick = window.app.prevChapter;
    if (nextBtn) nextBtn.onclick = window.app.nextChapter;
    if(seekBack) seekBack.onclick = () => Player.skip(-10);
    if(seekFwd) seekFwd.onclick = () => Player.skip(10);
    
    // Progress
    if(progress) {
        progress.addEventListener('input', (e) => {
            const pct = e.target.value;
            Player.seekTo(pct);
            progress.style.backgroundSize = `${pct}% 100%`; 
        });
    }

    audio.ontimeupdate = () => {
        const state = Player.getCurrentState();
        if (state.duration && progress) {
            const pct = (state.currentTime / state.duration) * 100;
            progress.value = pct;
            progress.style.backgroundSize = `${pct}% 100%`;
            document.getElementById('current-time').innerText = PlayerUI.formatTime(state.currentTime);
            document.getElementById('total-duration').innerText = PlayerUI.formatTime(state.duration);
        }
    };
    audio.onended = () => {
        if(Player.nextChapter()) PlayerUI.updateUI(true);
        else PlayerUI.updateUI(false);
    };

    // Speed & Sleep
    const speedBtn = document.getElementById('speed-btn');
    if (speedBtn) {
        speedBtn.onclick = () => {
            const currentSpeed = parseFloat(speedBtn.innerText.replace('x', ''));
            const speeds = [1, 1.25, 1.5, 2];
            let nextIndex = speeds.indexOf(currentSpeed) + 1;
            if (nextIndex >= speeds.length) nextIndex = 0;
            const nextSpeed = speeds[nextIndex];
            Player.setPlaybackSpeed(nextSpeed);
            speedBtn.innerText = `${nextSpeed}x`;
            showToast(`🚀 Speed: ${nextSpeed}x`);
        };
    }

    const sleepBtn = document.getElementById('sleep-timer-btn');
    if (sleepBtn) {
        sleepBtn.onclick = () => {
            let currentMode = parseInt(sleepBtn.dataset.mode || "0");
            const modes = [0, 15, 30, 60];
            let nextIndex = modes.indexOf(currentMode) + 1;
            if (nextIndex >= modes.length) nextIndex = 0;
            const nextMode = modes[nextIndex];
            Player.setSleepTimer(nextMode, () => showToast("🌙 Sleep Timer ended"));
            sleepBtn.dataset.mode = nextMode;
            if (nextMode === 0) {
                sleepBtn.innerHTML = '<i class="fas fa-moon"></i>';
                sleepBtn.style.color = "";
                showToast("🌙 Sleep Timer OFF");
            } else {
                sleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold;">${nextMode}m</span>`;
                sleepBtn.style.color = "#1fddff";
                showToast(`🌙 Sleep Timer set for ${nextMode} mins`);
            }
        };
    }
}

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

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

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

document.addEventListener('DOMContentLoaded', init);