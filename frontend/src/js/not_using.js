import { fetchBookDetails, fetchUserProgress } from './api.js';
// ✅ FIX: Use Named Imports
import { loadBook, getCurrentState, getAudioElement, togglePlay, skip, setPlaybackSpeed, setSleepTimer, isChapterDownloaded, downloadCurrentChapter, deleteChapter, setLanguage, getCurrentLang } from './player.js';

// --- ⏱️ GLOBAL STATE ---
let sleepTimer = null;
const speeds = [1, 1.25, 1.5, 2, 0.8];
let currentSpeedIndex = 0;
const sleepTimes = [0, 15, 30, 60];
let currentSleepIndex = 0;

// --- OPEN PLAYER ---
export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');

    // 1. UI Update
    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${partialBook.cover}')`;
    
    applyChameleonTheme(partialBook.cover);

    const list = document.getElementById('chapter-list');
    list.innerHTML = ''; 

    // 2. DATA PREPARATION
    let finalBook = partialBook;

    if (!finalBook.chapters || finalBook.chapters.length === 0) {
        list.innerHTML = `
            <div class="skeleton-loader"></div>
            <div class="skeleton-loader"></div>
            <p style="text-align:center; opacity:0.7; margin-top:15px;">Fetching Chapters...</p>
        `;
        
        const fullBook = await fetchBookDetails(partialBook.bookId);
        
        if (fullBook) {
            finalBook = { ...partialBook, ...fullBook };
            const index = allBooks.findIndex(b => b.bookId === partialBook.bookId);
            if (index !== -1) allBooks[index] = finalBook;
        } else {
            list.innerHTML = `<p style="color: #ff4444; text-align: center;">❌ Failed to load chapters.</p>`;
            return;
        }
    }

    // 🆕 LANGUAGE TOGGLE SETUP
    const langContainer = document.getElementById('lang-toggle-container'); 
    
    if (finalBook.chapters_en && finalBook.chapters_en.length > 0) {
        langContainer.innerHTML = `
            <div class="lang-switch">
                <button class="lang-btn ${getCurrentLang() === 'hi' ? 'active' : ''}" id="btn-hi">HINDI</button>
                <button class="lang-btn ${getCurrentLang() === 'en' ? 'active' : ''}" id="btn-en">ENG</button>
            </div>
        `;
        langContainer.classList.remove('hidden');

        document.getElementById('btn-hi').onclick = () => toggleLangUI('hi', finalBook);
        document.getElementById('btn-en').onclick = () => toggleLangUI('en', finalBook);
    } else {
        langContainer.classList.add('hidden'); 
    }

    // 3. SETUP
    renderChapterList(finalBook);
    renderComments(finalBook.comments || []);
    setupPlayButton(finalBook);
    setupPlayerListeners();

    // 4. RESUME LOGIC
    if (finalBook.savedState) {
        loadBook(finalBook, finalBook.savedState.chapterIndex, finalBook.savedState.currentTime);
        updateUI(true, finalBook); 
    } else {
        const currentState = getCurrentState();
        if (currentState.book && currentState.book.bookId === finalBook.bookId) {
            updateUI(true, finalBook);
        } else {
            fetchUserProgress().then(history => {
                 const saved = history.find(h => h.bookId == finalBook.bookId);
                 if (saved) {
                     loadBook(finalBook, saved.chapterIndex, saved.currentTime);
                 } else {
                     loadBook(finalBook, 0);
                 }
                 updateUI(true, finalBook);
            });
        }
    }
}

// 🌈 HELPER: Theme
function applyChameleonTheme(imageUrl) {
    if (!window.ColorThief) return;
    const colorThief = new ColorThief();
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = imageUrl;
    img.onload = function() {
        try {
            const color = colorThief.getColor(img);
            const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            document.documentElement.style.setProperty('--primary', rgb);
            const playBtn = document.getElementById('play-btn');
            if(playBtn) playBtn.style.boxShadow = `0 0 30px ${rgb}`;
        } catch (e) {}
    };
}

// --- 📂 RENDER LIST (With Premium Glow & Folding) ---
function renderChapterList(book) {
    const list = document.getElementById('chapter-list');
    const totalChapters = document.getElementById('total-chapters');
    
    const chaptersToShow = (getCurrentLang() === 'en' && book.chapters_en) ? book.chapters_en : book.chapters;

    if(totalChapters) totalChapters.innerText = `${chaptersToShow.length} Parts`;
    
    list.innerHTML = '';
    
    const currentState = getCurrentState();
    const currentIndex = (currentState.book && currentState.book.bookId === book.bookId) 
                          ? currentState.currentChapterIndex 
                          : -1;
    
    // Find active section
    let activeSectionName = "";
    if (currentIndex !== -1 && chaptersToShow[currentIndex].section) {
        activeSectionName = chaptersToShow[currentIndex].section;
    }

    let lastSection = null; 

    chaptersToShow.forEach((chap, idx) => {
        // Safe ID generation helper
        const getSafeId = (str) => str.replace(/[^a-zA-Z0-9]/g, '');

        // 🔥 SECTION HEADER LOGIC
        if (chap.section && chap.section !== lastSection) {
            const sectionHeader = document.createElement('li');
            sectionHeader.className = 'section-header';
            
            // Check if open
            const isOpen = (chap.section === activeSectionName);
            const safeSectionId = getSafeId(chap.section); 
            
            // 🔥 Apply Active Glow Class if Open
            if (isOpen) {
                sectionHeader.classList.add('active-header');
            }
            
            sectionHeader.innerHTML = `
                <span>${chap.section}</span>
                <i class="fas fa-chevron-down ${isOpen ? 'rotate' : ''}"></i>
            `;
            
            // 🔥 Direct Click Listener
            sectionHeader.onclick = () => toggleSectionGroup(safeSectionId, sectionHeader);
            
            list.appendChild(sectionHeader);
            lastSection = chap.section;
        }

        const li = document.createElement('li');
        
        // 🔥 Assign Data Attribute (Reliable)
        const safeSectionId = chap.section ? getSafeId(chap.section) : 'default';
        li.setAttribute('data-section-group', safeSectionId);
        
        li.className = `chapter-item ${idx === currentIndex ? 'active' : ''}`;
        
        // Auto-Collapse logic
        if (chap.section && chap.section !== activeSectionName) {
            li.classList.add('collapsed');
        }

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
            loadBook(book, idx); 
            updateUI(true, book, chaptersToShow[idx]); 
        };
        list.appendChild(li);
    });
}

// 📂 INTERNAL TOGGLE FUNCTION (Updates Glow & Icon)
function toggleSectionGroup(sectionId, headerElement) {
    const items = document.querySelectorAll(`[data-section-group="${sectionId}"]`);
    const icon = headerElement.querySelector('i');
    let isExpanding = false;

    // Toggle Items Visibility
    items.forEach(item => {
        if (item.classList.contains('collapsed')) {
            item.classList.remove('collapsed'); // Show
            isExpanding = true;
        } else {
            item.classList.add('collapsed'); // Hide
            isExpanding = false;
        }
    });

    // Toggle Styles (Rotate & Glow)
    if (isExpanding) {
        icon.classList.add('rotate');
        headerElement.classList.add('active-header'); // 🔥 Glow ON
    } else {
        icon.classList.remove('rotate');
        headerElement.classList.remove('active-header'); // 🌑 Glow OFF
    }
}

// 🆕 Helper to handle UI toggle
function toggleLangUI(lang, book) {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${lang}`).classList.add('active');
    setLanguage(lang);
    renderChapterList(book);
}


// --- LISTENERS ---
export function setupPlayerListeners() {
    // 1. Existing Buttons
    const speedBtn = document.getElementById('speed-btn');
    if(speedBtn) {
        const newBtn = speedBtn.cloneNode(true);
        speedBtn.parentNode.replaceChild(newBtn, speedBtn);
        newBtn.onclick = () => {
            currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
            const newSpeed = speeds[currentSpeedIndex];
            setPlaybackSpeed(newSpeed);
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
            setSleepTimer(minutes, () => {
                 togglePlay();
                 updateUI(false);
                 newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                 newSleepBtn.style.color = "";
                 currentSleepIndex = 0;
            });
            if (minutes > 0) {
                newSleepBtn.innerHTML = `<span style="font-size:0.8rem; font-weight:bold">${minutes}m</span>`;
                newSleepBtn.style.color = "var(--secondary)";
                showToast(`Sleep Timer: ${minutes} mins 🌙`);
            } else {
                newSleepBtn.innerHTML = `<i class="fas fa-moon"></i>`;
                newSleepBtn.style.color = "";
                showToast("Sleep Timer: Off ❌");
            }
        };
    }

    // 2. DOWNLOAD BUTTON (Only for App)
    if (document.body.classList.contains('is-android')) {
        const dlBtn = document.getElementById('download-btn');
        if (dlBtn) {
            dlBtn.style.display = "flex"; 
            const newDlBtn = dlBtn.cloneNode(true);
            dlBtn.parentNode.replaceChild(newDlBtn, dlBtn);
            newDlBtn.onclick = async () => {
                const isDownloaded = await isChapterDownloaded();
                if (isDownloaded) {
                    await deleteChapter();
                    newDlBtn.innerHTML = `<i class="fas fa-download"></i>`;
                    newDlBtn.style.color = "";
                    showToast("🗑️ Removed from downloads");
                } else {
                    newDlBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i>`;
                    await downloadCurrentChapter((success) => {
                        if(success) {
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

// --- BUTTONS ---
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
            if (savedState) loadBook(book, savedState.chapterIndex, savedState.currentTime);
            else loadBook(book, 0);
            updateUI(true, book);
        } catch (e) {
            console.error(e);
            loadBook(book, 0);
            updateUI(true, book);
        }
    };
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
    div.innerHTML = `<div class="comment-time" onclick="window.app.seekToComment(${c.time})">${formatTime(c.time)}</div><div><span class="comment-user">${c.user}</span><p>${c.text}</p></div>`;
    list.appendChild(div);
}

// --- 🔄 UI UPDATE ---
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
        const cleanName = chapter.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();
        document.getElementById('mini-chapter').innerText = cleanName;
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

        if (document.body.classList.contains('is-android')) {
            const dlBtn = document.getElementById('download-btn');
            if (dlBtn) {
                isChapterDownloaded().then(isDownloaded => {
                    if (isDownloaded) {
                        dlBtn.innerHTML = `<i class="fas fa-check"></i>`;
                        dlBtn.style.color = "#00ff00";
                    } else {
                        dlBtn.innerHTML = `<i class="fas fa-download"></i>`;
                        dlBtn.style.color = "";
                    }
                });
            }
        }
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