// --- 🎧 UI PLAYER MODULE (Crash Fixed & Smart Resume) ---
import { fetchBookDetails, fetchUserProgress } from './api.js';
import * as Player from './player.js';

// --- ⏱️ GLOBAL STATE ---
let sleepTimer = null;
const speeds = [1, 1.25, 1.5, 2, 0.8];
let currentSpeedIndex = 0;
const sleepTimes = [0, 15, 30, 60];
let currentSleepIndex = 0;

// --- OPEN PLAYER (Logic moved here) ---
export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');

    // 1. UI Update Basics (Turant dikhao taki app fast lage)
    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${partialBook.cover}')`;
    
    applyChameleonTheme(partialBook.cover);

    const list = document.getElementById('chapter-list');
    list.innerHTML = ''; 

    // 2. DATA PREPARATION (Chapters Check)
    let finalBook = partialBook;

    // Agar chapters missing hain (History se aaye ho), toh pehle fetch karo
    if (!finalBook.chapters || finalBook.chapters.length === 0) {
        list.innerHTML = `
            <div class="skeleton-loader"></div>
            <div class="skeleton-loader"></div>
            <p style="text-align:center; opacity:0.7; margin-top:15px;">Fetching Chapters...</p>
        `;
        
        const fullBook = await fetchBookDetails(partialBook.bookId);
        
        if (fullBook) {
            // Merge details (keep savedState from history)
            finalBook = { ...partialBook, ...fullBook };
            
            // Global Cache update karo taki agli baar fetch na karna pade
            const index = allBooks.findIndex(b => b.bookId === partialBook.bookId);
            if (index !== -1) allBooks[index] = finalBook;
        } else {
            list.innerHTML = `<p style="color: #ff4444; text-align: center;">❌ Failed to load chapters.</p>`;
            return; // Aage mat badho agar book hi nahi mili
        }
    }

    // 3. AB SAB READY HAI (Safe to Play) 🛡️
    renderChapterList(finalBook);
    renderComments(finalBook.comments || []);
    setupPlayButton(finalBook);
    setupPlayerListeners();

    // 4. RESUME LOGIC
    if (finalBook.savedState) {
        // Case A: History se click kiya hai
        console.log(`🚀 Resuming History: Ch ${finalBook.savedState.chapterIndex + 1}`);
        
        // Safety check: Kya ye chapter exist karta hai?
        if (finalBook.chapters[finalBook.savedState.chapterIndex]) {
            Player.loadBook(finalBook, finalBook.savedState.chapterIndex);
            updateUI(true, finalBook, finalBook.chapters[finalBook.savedState.chapterIndex]);
        } else {
            // Agar chapter index galat hai toh start se chalao
            console.warn("Saved chapter not found, resetting.");
            Player.loadBook(finalBook, 0);
            updateUI(true, finalBook, finalBook.chapters[0]);
        }

    } else {
        // Case B: Library se click kiya hai
        const currentState = Player.getCurrentState();
        
        // Agar pehle se wahi book chal rahi thi, toh reload mat karo
        if (currentState.book && currentState.book.bookId === finalBook.bookId) {
            updateUI(true, finalBook, finalBook.chapters[currentState.currentChapterIndex]);
        } else {
            // Nayi book hai -> Start from 0
            console.log("Starting New Book");
            Player.loadBook(finalBook, 0);
            updateUI(true, finalBook, finalBook.chapters[0]);
        }
    }
}

// 🌈 HELPER: Theme
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
            resetTheme();
        }
    };
    img.onerror = resetTheme;
}

// --- RENDER LIST ---
function renderChapterList(book) {
    const list = document.getElementById('chapter-list');
    const totalChapters = document.getElementById('total-chapters');
    if(totalChapters) totalChapters.innerText = `${book.chapters.length} Chapters`;
    
    list.innerHTML = '';
    
    const currentState = Player.getCurrentState();
    const currentIndex = (currentState.book && currentState.book.bookId === book.bookId) 
                         ? Player.getCurrentState().currentChapterIndex 
                         : -1;
    
    book.chapters.forEach((chap, idx) => {
        const li = document.createElement('li');
        li.className = `chapter-item ${idx === currentIndex ? 'active' : ''}`;
        
        const cleanTitle = chap.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();

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

// --- LISTENERS ---
export function setupPlayerListeners() {
    const speedBtn = document.getElementById('speed-btn');
    const audio = Player.getAudioElement();
    
    if(speedBtn) {
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

    const sleepBtn = document.getElementById('sleep-timer-btn');
    if(sleepBtn) {
        const newSleepBtn = sleepBtn.cloneNode(true);
        sleepBtn.parentNode.replaceChild(newSleepBtn, sleepBtn);
        newSleepBtn.onclick = () => {
            currentSleepIndex = (currentSleepIndex + 1) % sleepTimes.length;
            const minutes = sleepTimes[currentSleepIndex];
            if (sleepTimer) clearTimeout(sleepTimer);
            
            if (minutes > 0) {
                newSleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold">${minutes}m</span>`;
                newSleepBtn.style.color = "var(--secondary)";
                showToast(`Sleep Timer: ${minutes} mins 🌙`);
                sleepTimer = setTimeout(() => {
                    Player.togglePlay();
                    updateUI(false);
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

// --- SMART PLAY BUTTON ---
function setupPlayButton(book) {
    const mainBtn = document.getElementById('main-play-btn');
    if (!mainBtn) return;

    const newBtn = mainBtn.cloneNode(true);
    mainBtn.parentNode.replaceChild(newBtn, mainBtn);

    newBtn.onclick = async () => {
        newBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading...`;
        try {
            const history = await fetchUserProgress();
            const savedState = history.find(h => h.bookId == book.bookId);

            if (savedState) {
                console.log(`🔥 Smart Resume: Ch ${savedState.chapterIndex + 1}`);
                Player.loadBook(book, savedState.chapterIndex);
            } else {
                Player.loadBook(book, 0);
            }
            // Update UI with correct chapter info
            const chIndex = savedState ? savedState.chapterIndex : 0;
            updateUI(true, book, book.chapters[chIndex]);
        } catch (e) {
            console.error(e);
            Player.loadBook(book, 0);
            updateUI(true, book, book.chapters[0]);
        }
    };
}

// --- UI HELPERS ---
function renderComments(comments) {
    const list = document.getElementById('comments-list');
    if(list) {
        list.innerHTML = '';
        comments.forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.innerHTML = `<div class="comment-time" onclick="window.app.seekToComment(${c.time})">${formatTime(c.time)}</div><div><span class="comment-user">${c.user}</span><p>${c.text}</p></div>`;
            list.appendChild(div);
        });
    }
}

export function renderSingleComment(c) {
    const list = document.getElementById('comments-list');
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `<div class="comment-time" onclick="window.app.seekToComment(${c.time})">${formatTime(c.time)}</div><div><span class="comment-user">${c.user}</span><p>${c.text}</p></div>`;
    list.appendChild(div);
}

export function updateUI(isPlaying, book = null, chapter = null) {
    const playBtn = document.getElementById('play-btn');
    const mainPlayBtn = document.getElementById('main-play-btn');
    const miniPlayer = document.getElementById('mini-player');
    
    if(playBtn) playBtn.innerHTML = isPlaying ? `<i class="fas fa-pause"></i>` : `<i class="fas fa-play"></i>`;
    
    if(mainPlayBtn) {
        mainPlayBtn.innerHTML = isPlaying ? `<i class="fas fa-pause"></i> Pause` : `<i class="fas fa-play"></i> Resume`;
    }

    if (book && chapter) {
        miniPlayer.classList.remove('hidden');
        document.getElementById('mini-cover').src = book.cover;
        document.getElementById('mini-title').innerText = book.title;
        const cleanName = chapter.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();
        document.getElementById('mini-chapter').innerText = cleanName;
    }

    const state = Player.getCurrentState();
    if (state.book) {
        document.querySelectorAll('#chapter-list .chapter-item').forEach((li, idx) => {
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

function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}