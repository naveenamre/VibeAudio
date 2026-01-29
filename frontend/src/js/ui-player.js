// --- 🎧 UI PLAYER MODULE (Updated with Speed, Sleep & Clean Audible Vibe) ---
import { fetchBookDetails } from './api.js';
import * as Player from './player.js';

// --- ⏱️ GLOBAL STATE (Speed & Sleep) ---
let sleepTimer = null;
const speeds = [1, 1.25, 1.5, 2, 0.8]; // Speed Cycle
let currentSpeedIndex = 0;
const sleepTimes = [0, 15, 30, 60]; // Minutes (0 = Off)
let currentSleepIndex = 0;

// --- OPEN PLAYER (Logic moved here) ---
export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');

    // 1. UI Update
    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${partialBook.cover}')`;
    
    // 🦎 CHAMELEON MAGIC: Rang Badlo!
    applyChameleonTheme(partialBook.cover);

    const list = document.getElementById('chapter-list');
    list.innerHTML = ''; 

    // 2. Cached Check
    if (partialBook.chapters && partialBook.chapters.length > 0 && partialBook.chapters[0].url) {
        console.log("⚡ Cached chapters found!");
        renderChapterList(partialBook);
        renderComments(partialBook.comments || []);
        setupPlayButton(partialBook);
        setupPlayerListeners(); // 👈 NEW: Activate Speed/Sleep buttons
        return; 
    }

    // 3. Skeleton
    list.innerHTML = `
        <div class="skeleton-loader"></div>
        <div class="skeleton-loader"></div>
        <div class="skeleton-loader"></div>
        <p style="text-align:center; opacity:0.7; margin-top:15px;">Fetching Secure Audio...</p>
    `;

    // 4. API Call
    const fullBook = await fetchBookDetails(partialBook.bookId);

    if (fullBook) {
        const index = allBooks.findIndex(b => b.bookId === partialBook.bookId);
        if (index !== -1) allBooks[index] = { ...allBooks[index], ...fullBook };
        
        renderChapterList(fullBook);
        renderComments(fullBook.comments || []);
        setupPlayButton(fullBook);
        setupPlayerListeners(); // 👈 NEW: Activate Speed/Sleep buttons
    } else {
        list.innerHTML = `<p style="color: #ff4444; text-align: center;">❌ Failed to load chapters.</p>`;
    }
}

// 🌈 HELPER: Extract Color & Apply Theme
function applyChameleonTheme(imageUrl) {
    const root = document.documentElement;
    const body = document.body;
    
    const resetTheme = () => {
        root.style.setProperty('--primary', '#ff4b1f');
        body.style.background = "";
        const playBtn = document.getElementById('play-btn');
        if(playBtn) playBtn.style.boxShadow = 'none';
    };

    if (!window.ColorThief) { resetTheme(); return; }

    const colorThief = new ColorThief();
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = imageUrl;

    img.onload = function() {
        try {
            const color = colorThief.getColor(img);
            const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            const darkRgb = `rgb(${Math.floor(color[0]*0.2)}, ${Math.floor(color[1]*0.2)}, ${Math.floor(color[2]*0.2)})`;
            
            root.style.setProperty('--primary', rgb);
            body.style.background = `linear-gradient(-45deg, ${darkRgb}, #000000, ${rgb}, #0f0f0f)`;
            body.style.backgroundSize = "400% 400%";
            
            const playBtn = document.getElementById('play-btn');
            if(playBtn) playBtn.style.boxShadow = `0 0 30px ${rgb}`;

        } catch (e) {
            console.warn("🦎 Chameleon failed:", e);
            resetTheme();
        }
    };
    img.onerror = resetTheme;
}

// --- 📜 AUDIBLE STYLE CHAPTER LIST ---
function renderChapterList(book) {
    const list = document.getElementById('chapter-list');
    const totalChapters = document.getElementById('total-chapters');
    if(totalChapters) totalChapters.innerText = `${book.chapters.length} Chapters`;
    
    list.innerHTML = '';
    
    // Get current playing index to highlight
    const currentState = Player.getCurrentState();
    const currentIndex = (currentState.book && currentState.book.bookId === book.bookId) 
                         ? Player.getCurrentState().currentChapterIndex 
                         : -1;
    
    book.chapters.forEach((chap, idx) => {
        const li = document.createElement('li');
        li.className = `chapter-item ${idx === currentIndex ? 'active' : ''}`;
        li.dataset.index = idx; 

        // ✂️ CLEANING MAGIC: Remove "Chapter 1:", "01.", etc.
        const cleanTitle = chap.name
            .replace(/^Chapter\s+\d+[:\s-]*/i, '') // Removes "Chapter 1: "
            .replace(/^\d+[\.\s]+/, '')           // Removes "1. " or "01 "
            .trim();

        // ✨ Clean Layout: Number | Clean Title .......... Icon
        li.innerHTML = `
            <div class="chapter-info">
                <span class="chapter-num">${idx + 1}</span>
                <span class="chapter-title">${cleanTitle}</span>
            </div>
            <div class="chapter-status">
                <i class="${idx === currentIndex ? 'fas fa-chart-bar' : 'fas fa-play'}" style="font-size: 0.8rem;"></i>
            </div>
        `;
        
        li.onclick = () => { 
            Player.loadBook(book, idx); 
            updateUI(true, book, book.chapters[idx]); 
        };
        list.appendChild(li);
    });
}

// --- 🎮 NEW: LISTENERS (Speed & Sleep) ---
export function setupPlayerListeners() {
    // ⚡ SPEED CONTROL
    const speedBtn = document.getElementById('speed-btn');
    const audio = Player.getAudioElement();
    
    if(speedBtn) {
        // Remove old listener to avoid duplicates
        const newBtn = speedBtn.cloneNode(true);
        speedBtn.parentNode.replaceChild(newBtn, speedBtn);
        
        newBtn.onclick = () => {
            currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
            const newSpeed = speeds[currentSpeedIndex];
            
            audio.playbackRate = newSpeed;
            newBtn.innerText = `${newSpeed}x`;
            showToast(`Speed: ${newSpeed}x ⚡`);
        };
    }

    // 🌙 SLEEP TIMER
    const sleepBtn = document.getElementById('sleep-timer-btn');
    
    if(sleepBtn) {
        const newSleepBtn = sleepBtn.cloneNode(true);
        sleepBtn.parentNode.replaceChild(newSleepBtn, sleepBtn);

        newSleepBtn.onclick = () => {
            currentSleepIndex = (currentSleepIndex + 1) % sleepTimes.length;
            const minutes = sleepTimes[currentSleepIndex];
            
            if (sleepTimer) clearTimeout(sleepTimer);
            sleepTimer = null;
            
            if (minutes > 0) {
                newSleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold">${minutes}m</span>`;
                newSleepBtn.style.color = "var(--secondary)";
                showToast(`Sleep Timer: ${minutes} mins 🌙`);
                
                sleepTimer = setTimeout(() => {
                    Player.togglePlay();
                    updateUI(false);
                    showToast("Sleep Timer: Audio Paused 💤");
                    newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                    newSleepBtn.style.color = "";
                    currentSleepIndex = 0;
                }, minutes * 60 * 1000);
                
            } else {
                newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                newSleepBtn.style.color = "";
                showToast("Sleep Timer: Off ❌");
            }
        };
    }
}

function setupPlayButton(book) {
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

export function renderSingleComment(c) {
    const list = document.getElementById('comments-list');
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
        <div class="comment-time" onclick="window.app.seekToComment(${c.time})">${formatTime(c.time)}</div>
        <div><span class="comment-user">${c.user}</span><p>${c.text}</p></div>`;
    list.appendChild(div);
}

// --- 🔄 UI UPDATE ---
export function updateUI(isPlaying, book = null, chapter = null) {
    const playBtn = document.getElementById('play-btn');
    if(!playBtn) return;
    const icon = playBtn.querySelector('i');
    const mainPlayBtn = document.getElementById('main-play-btn');
    
    // 1. Play/Pause Icons
    if(isPlaying) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
        if(mainPlayBtn) mainPlayBtn.innerHTML = `<i class="fas fa-pause"></i> Pause`;
        document.getElementById('mini-player').classList.remove('hidden');
        
        if(book) {
            document.getElementById('mini-cover').src = book.cover;
            document.getElementById('mini-title').innerText = book.title;
            document.getElementById('mini-chapter').innerText = chapter.name;
        }
    } else {
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
        if(mainPlayBtn) mainPlayBtn.innerHTML = `<i class="fas fa-play"></i> Play`;
    }

    // 2. Active Chapter Highlight (Dynamic)
    const state = Player.getCurrentState();
    if (state.book) {
        const listItems = document.querySelectorAll('#chapter-list .chapter-item');
        listItems.forEach((li, idx) => {
            if (idx === state.currentChapterIndex) {
                li.classList.add('active');
                li.querySelector('.chapter-status').innerHTML = `<i class="fas fa-chart-bar"></i>`;
            } else {
                li.classList.remove('active');
                li.querySelector('.chapter-status').innerHTML = `<i class="fas fa-play" style="font-size: 0.8rem;"></i>`;
            }
        });
    }
}

export function formatTime(s) {
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60);
    return `${m}:${sec<10?'0'+sec:sec}`;
}

// --- 🍞 TOAST HELPER ---
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}