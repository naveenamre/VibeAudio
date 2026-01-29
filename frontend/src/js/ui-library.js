// --- 📚 UI LIBRARY MODULE (Mobile Stable Version) ---
import { fetchUserProgress } from './api.js';

// --- RENDER LIBRARY ---
export function renderLibrary(books, openPlayerCallback) {
    const grid = document.getElementById('book-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!books.length) { grid.innerHTML = '<p>No books found for this vibe.</p>'; return; }

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    books.forEach(book => {
        const moodHTML = book.moods ? 
            `<div class="mood-tags">${book.moods.map(m => `<span class="mood-tag">${m}</span>`).join('')}</div>` : '';

        const card = document.createElement('div');
        card.className = 'book-card';
        
        // ✨ UPDATE: Content ko wrap kiya hai better structure ke liye
        card.innerHTML = `
            <img class="lazy-img" src="${placeholder}" data-src="${book.cover}" alt="${book.title}">
            <div class="card-content">
                <h3>${book.title}</h3>
                <p>${book.author}</p>
                ${moodHTML}
            </div>`;
        
        card.onclick = () => openPlayerCallback(book);
        grid.appendChild(card);

        // Observer logic (Simple version for external module)
        const img = card.querySelector('img');
        if(window.imageObserver) window.imageObserver.observe(img);
    });

    // 🌟 JADU START: Tilt sirf PC pe lagao (Mobile pe flicker rokne ke liye)
    if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
        window.VanillaTilt.init(document.querySelectorAll("#book-grid .book-card"), {
            max: 15,          // Kitna jhukega (Degrees)
            speed: 400,       // Wapas aane ki speed
            glare: true,      // Chamak (Glare)
            "max-glare": 0.3, // Chamak ki intensity
            scale: 1.05,      // Hover karne pe thoda bada hoga
            gyroscope: false  // ⚠️ Phone wala gyroscope OFF kar diya
        });
    }
}

// --- RENDER HISTORY ---
export async function renderHistory(allBooks, openPlayerCallback) {
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
            card.onclick = () => openPlayerCallback(book);
            grid.appendChild(card);
            
            // ✨ History Cards: Tilt sirf Desktop pe
            if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
                window.VanillaTilt.init(card, {
                    max: 10,
                    speed: 400,
                    glare: true,
                    "max-glare": 0.2,
                    scale: 1.02
                });
            }
        }
    });
}

// --- FILTERS ---
export function renderCategoryFilters(books, filterCallback) {
    const container = document.getElementById('category-filters');
    if(!container) return;

    const allMoods = new Set();
    books.forEach(book => {
        if(book.moods) book.moods.forEach(mood => allMoods.add(mood));
    });

    let html = `<button class="filter-btn active" onclick="window.app.filterLibrary('All')" id="filter-all">All Books</button>`;
    allMoods.forEach(mood => {
        html += `<button class="filter-btn" onclick="window.app.filterLibrary('${mood}')" id="filter-${mood}">${mood}</button>`;
    });

    container.innerHTML = html;
}