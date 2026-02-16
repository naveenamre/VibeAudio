import { fetchBookDetails, fetchUserProgress } from './api.js';
// ✅ FIX: Import toggleVocalBoost
import { loadBook, getCurrentState, getAudioElement, togglePlay, skip, setPlaybackSpeed, setSleepTimer, isChapterDownloaded, downloadCurrentChapter, deleteChapter, getCurrentLang, toggleVocalBoost } from './player.js';
import { renderChapterList, toggleLangUI } from './ui-player-list.js';
import { applyChameleonTheme, renderComments, showToast, formatTime } from './ui-player-helpers.js';

// --- GLOBAL STATE ---
const speeds = [1, 1.25, 1.5, 2, 0.95, 0.9, 0.8]; // ✅ Updated Speeds
let currentSpeedIndex = 0;
const sleepTimes = [0, 15, 30, 60];
let currentSleepIndex = 0;

// --- OPEN PLAYER ---
export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');
    
    // UI Init
    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${partialBook.cover}')`;
    applyChameleonTheme(partialBook.cover);
    document.getElementById('chapter-list').innerHTML = '';

    // Data Fetching
    let finalBook = partialBook;
    if (!finalBook.chapters || finalBook.chapters.length === 0) {
        document.getElementById('chapter-list').innerHTML = `<div class="skeleton-loader"></div><p style="text-align:center; opacity:0.7;">Fetching...</p>`;
        const fullBook = await fetchBookDetails(partialBook.bookId);
        if (fullBook) {
            finalBook = { ...partialBook, ...fullBook };
            const index = allBooks.findIndex(b => b.bookId === partialBook.bookId);
            if (index !== -1) allBooks[index] = finalBook;
        } else {
            return;
        }
    }

    // Language Toggle
    const langContainer = document.getElementById('lang-toggle-container'); 
    if (finalBook.chapters_en && finalBook.chapters_en.length > 0) {
        langContainer.innerHTML = `
            <div class="lang-switch">
                <button class="lang-btn ${getCurrentLang() === 'hi' ? 'active' : ''}" id="btn-hi">HINDI</button>
                <button class="lang-btn ${getCurrentLang() === 'en' ? 'active' : ''}" id="btn-en">ENG</button>
            </div>`;
        langContainer.classList.remove('hidden');
        document.getElementById('btn-hi').onclick = () => toggleLangUI('hi', finalBook);
        document.getElementById('btn-en').onclick = () => toggleLangUI('en', finalBook);
    } else {
        langContainer.classList.add('hidden'); 
    }

    // Setup
    renderChapterList(finalBook);
    renderComments(finalBook.comments || []);
    setupPlayButton(finalBook);
    setupPlayerListeners();

    // Resume Logic
    if (finalBook.savedState) {
        loadBook(finalBook, finalBook.savedState.chapterIndex, finalBook.savedState.currentTime);
        updateUI(true, finalBook); 
    } else {
        const state = getCurrentState();
        if (state.book && state.book.bookId === finalBook.bookId) {
            updateUI(true, finalBook);
        } else {
            fetchUserProgress().then(history => {
                 const saved = history.find(h => h.bookId == finalBook.bookId);
                 if (saved) loadBook(finalBook, saved.chapterIndex, saved.currentTime);
                 else loadBook(finalBook, 0);
                 updateUI(true, finalBook);
            });
        }
    }
}

// --- UI UPDATER ---
export function updateUI(isPlaying, book = null, chapter = null) {
    const playBtn = document.getElementById('play-btn');
    const mainPlayBtn = document.getElementById('main-play-btn');
    const miniPlayer = document.getElementById('mini-player');
    
    if(playBtn) playBtn.innerHTML = isPlaying ? `<i class="fas fa-pause"></i>` : `<i class="fas fa-play"></i>`;
    if(mainPlayBtn) mainPlayBtn.innerHTML = isPlaying ? `<i class="fas fa-pause"></i> Pause` : `<i class="fas fa-play"></i> Resume`;

    const state = getCurrentState();
    if (book && !chapter) {
         if (state.book && state.book.bookId === book.bookId) {
             chapter = state.book.activeChapters ? state.book.activeChapters[state.currentChapterIndex] : book.chapters[state.currentChapterIndex];
         }
    }

    if (book && chapter) {
        miniPlayer.classList.remove('hidden');
        document.getElementById('mini-cover').src = book.cover;
        document.getElementById('mini-title').innerText = book.title;
        document.getElementById('mini-chapter').innerText = chapter.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();
    }

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
        
        // Download Check Logic
        if (document.body.classList.contains('is-android')) {
            const dlBtn = document.getElementById('download-btn');
            if (dlBtn) {
                isChapterDownloaded().then(dl => {
                     dlBtn.innerHTML = dl ? `<i class="fas fa-check"></i>` : `<i class="fas fa-download"></i>`;
                     dlBtn.style.color = dl ? "#00ff00" : "";
                });
            }
        }
    }
}

// --- BUTTONS & LISTENERS ---
function setupPlayButton(book) {
    const mainBtn = document.getElementById('main-play-btn');
    if (!mainBtn) return;
    const newBtn = mainBtn.cloneNode(true);
    mainBtn.parentNode.replaceChild(newBtn, mainBtn);
    newBtn.onclick = async () => {
        newBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Loading...`;
        try {
            const h = await fetchUserProgress();
            const s = h.find(x => x.bookId == book.bookId);
            loadBook(book, s ? s.chapterIndex : 0, s ? s.currentTime : 0);
            updateUI(true, book);
        } catch (e) { loadBook(book, 0); updateUI(true, book); }
    };
}

export function setupPlayerListeners() {
    // 1. SPEED BUTTON
    const speedBtnRef = document.getElementById('speed-btn');
    if(speedBtnRef) {
        // Clone to remove old listeners
        const newSpeedBtn = speedBtnRef.cloneNode(true);
        speedBtnRef.parentNode.replaceChild(newSpeedBtn, speedBtnRef);
        newSpeedBtn.onclick = () => {
            currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
            const newSpeed = speeds[currentSpeedIndex];
            setPlaybackSpeed(newSpeed);
            newSpeedBtn.innerText = `${newSpeed}x`;
            showToast(`Speed: ${newSpeed}x ⚡`);
        };
    }

    // 2. 🎙️ VOCAL BOOST BUTTON (Fixed Safe Insert)
    let boostBtn = document.getElementById('vocal-boost-btn');

    if (!boostBtn) {
        boostBtn = document.createElement('button');
        boostBtn.id = 'vocal-boost-btn';
        boostBtn.title = "Vocal Clarity Booster";
        boostBtn.innerHTML = '<i class="fas fa-microphone-alt"></i>';
        
        // 🔥 SAFE PARENT CHECK (Crucial Fix)
        const currentSpeedBtn = document.getElementById('speed-btn'); // Re-select fresh
        if (currentSpeedBtn && currentSpeedBtn.parentNode) {
            currentSpeedBtn.parentNode.insertBefore(boostBtn, currentSpeedBtn);
        } else {
            // Fallback: Just add to extra-controls if speed btn is missing
            const extraControls = document.querySelector('.extra-controls');
            if(extraControls) extraControls.appendChild(boostBtn);
        }
    }

    if (boostBtn) {
        // Clone to clean listeners
        const newBoostBtn = boostBtn.cloneNode(true);
        boostBtn.parentNode.replaceChild(newBoostBtn, boostBtn);
        
        newBoostBtn.onclick = () => {
            const isBoosting = newBoostBtn.classList.toggle('active');
            toggleVocalBoost(isBoosting); 

            if (isBoosting) {
                newBoostBtn.style.color = "#ff4b1f"; 
                newBoostBtn.style.borderColor = "#ff4b1f";
                newBoostBtn.style.boxShadow = "0 0 15px rgba(255, 75, 31, 0.5)";
                showToast("🗣️ Vocal Boost Active!");
            } else {
                newBoostBtn.style.color = "";
                newBoostBtn.style.borderColor = "";
                newBoostBtn.style.boxShadow = "";
                showToast("🔊 Normal Sound");
            }
        };
    }

    // 3. SLEEP TIMER
    const sleepBtn = document.getElementById('sleep-timer-btn');
    if(sleepBtn) {
        const newSleepBtn = sleepBtn.cloneNode(true);
        sleepBtn.parentNode.replaceChild(newSleepBtn, sleepBtn);
        newSleepBtn.onclick = () => {
            currentSleepIndex = (currentSleepIndex + 1) % sleepTimes.length;
            const minutes = sleepTimes[currentSleepIndex];
            setSleepTimer(minutes, () => { 
                togglePlay(); 
                updateUI(false); 
                newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`; 
                newSleepBtn.style.color = ""; 
                currentSleepIndex = 0; 
            });
            if(minutes > 0) { 
                newSleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold">${minutes}m</span>`; 
                newSleepBtn.style.color = "var(--secondary)";
                showToast(`Sleep: ${minutes}m 🌙`); 
            } else { 
                newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`; 
                newSleepBtn.style.color = "";
                showToast("Sleep: Off ❌"); 
            }
        };
    }
    
    // 4. DOWNLOAD BUTTON (Android Only)
    if (document.body.classList.contains('is-android')) {
        const dlBtn = document.getElementById('download-btn');
        if (dlBtn) {
            dlBtn.style.display = "flex"; 
            const newDlBtn = dlBtn.cloneNode(true);
            dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);
            newDlBtn.onclick = async () => {
                const isDl = await isChapterDownloaded();
                if (isDl) { 
                    await deleteChapter(); 
                    newDlBtn.innerHTML = `<i class="fas fa-download"></i>`; 
                    newDlBtn.style.color = "";
                    showToast("🗑️ Removed from downloads"); 
                } else { 
                    newDlBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`; 
                    await downloadCurrentChapter(s => { 
                        if(s) { 
                            newDlBtn.innerHTML = `<i class="fas fa-check"></i>`; 
                            newDlBtn.style.color = "#00ff00";
                            showToast("✅ Downloaded for Offline!"); 
                        } else {
                             newDlBtn.innerHTML = `<i class="fas fa-exclamation-triangle"></i>`;
                             showToast("❌ Download Failed");
                        }
                    }); 
                }
            };
        }
    }
}