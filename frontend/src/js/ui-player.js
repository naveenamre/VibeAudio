// --- 🎧 UI PLAYER MODULE ---
import { fetchBookDetails } from './api.js';
import * as Player from './player.js';

// --- OPEN PLAYER (Logic moved here) ---
export async function openPlayerUI(partialBook, allBooks, switchViewCallback) {
    switchViewCallback('player');

    // 1. UI Update
    document.getElementById('detail-cover').src = partialBook.cover;
    document.getElementById('detail-title').innerText = partialBook.title;
    document.getElementById('detail-author').innerText = partialBook.author;
    document.getElementById('blur-bg').style.backgroundImage = `url('${partialBook.cover}')`;
    
    const list = document.getElementById('chapter-list');
    list.innerHTML = ''; 

    // 2. Cached Check
    if (partialBook.chapters && partialBook.chapters.length > 0 && partialBook.chapters[0].url) {
        console.log("⚡ Cached chapters found!");
        renderChapterList(partialBook);
        renderComments(partialBook.comments || []);
        setupPlayButton(partialBook);
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
    } else {
        list.innerHTML = `<p style="color: #ff4444; text-align: center;">❌ Failed to load chapters.</p>`;
    }
}

// --- HELPERS ---
function renderChapterList(book) {
    const list = document.getElementById('chapter-list');
    document.getElementById('total-chapters').innerText = `${book.chapters.length} Chapters`;
    list.innerHTML = '';
    
    book.chapters.forEach((chap, idx) => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${idx+1}. ${chap.name}</span> <i class="fas fa-play"></i>`;
        li.onclick = () => { Player.loadBook(book, idx); updateUI(true); };
        list.appendChild(li);
    });
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

export function updateUI(isPlaying, book = null, chapter = null) {
    const playBtn = document.getElementById('play-btn');
    if(!playBtn) return;
    const icon = playBtn.querySelector('i');
    
    if(isPlaying) {
        icon.classList.remove('fa-play');
        icon.classList.add('fa-pause');
        document.getElementById('mini-player').classList.remove('hidden');
        
        // Agar state pass hui hai to update karo
        if(book) {
            document.getElementById('mini-cover').src = book.cover;
            document.getElementById('mini-title').innerText = book.title;
            document.getElementById('mini-chapter').innerText = chapter.name;
        }
    } else {
        icon.classList.remove('fa-pause');
        icon.classList.add('fa-play');
    }
}

export function formatTime(s) {
    const m = Math.floor(s/60);
    const sec = Math.floor(s%60);
    return `${m}:${sec<10?'0'+sec:sec}`;
}