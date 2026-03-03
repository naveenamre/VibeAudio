// --- 📚 UI LIBRARY MODULE (Function Name Fix) ---
import { fetchUserProgress } from './api.js';

// --- 1. RENDER CATEGORY FILTERS (Naam waapas sahi kar diya!) ---
export function renderCategoryFilters(allBooks) {
    const container = document.getElementById('category-filters'); 
    if(!container) return;

    // Unique genres aur moods nikalna filters ke liye
    const moods = new Set(['All']);
    allBooks.forEach(book => {
        if (book.genre) moods.add(book.genre);
        if (book.moods) book.moods.forEach(m => moods.add(m));
    });

    container.innerHTML = Array.from(moods).map(mood => `
        <button class="filter-btn ${mood === 'All' ? 'active' : ''}" 
                id="filter-${mood.replace(/\s+/g, '-')}"
                onclick="window.app.filterLibrary('${mood}')">
            ${mood}
        </button>
    `).join('');
}

// --- 2. RENDER LIBRARY GRID ---
export function renderLibrary(books, openPlayerCallback) {
    const grid = document.getElementById('book-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!books.length) { 
        grid.innerHTML = '<div class="empty-state"><p>Iss vibe ki koi book nahi mili. 🏜️</p></div>'; 
        return; 
    }

    const placeholder = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

    books.forEach(book => {
        const moodHTML = (book.moods || []).map(m => `<span class="mood-tag">${m}</span>`).join('');
        const genreHTML = book.genre ? `<span class="mood-tag genre-accent">${book.genre}</span>` : '';

        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `
            <div class="img-container">
                <img class="lazy-img" src="${placeholder}" data-src="${book.cover}" alt="${book.title}">
                <div class="book-badge">${book.totalChapters || 0} Parts</div>
            </div>
            <div class="card-content">
                <h3>${book.title}</h3>
                <p>${book.author}</p>
                <div class="mood-tags">${genreHTML}${moodHTML}</div>
            </div>`;
        
        card.onclick = () => openPlayerCallback(book);
        grid.appendChild(card);

        const img = card.querySelector('img');
        if(window.imageObserver) window.imageObserver.observe(img);
    });

    if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
        window.VanillaTilt.init(document.querySelectorAll("#book-grid .book-card"), {
            max: 12, speed: 400, glare: true, "max-glare": 0.2, scale: 1.05
        });
    }
}

// --- 3. RENDER HISTORY ---
export async function renderHistory(allBooks, openPlayerCallback) {
    const grid = document.getElementById('history-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="shimmer-loader"><i class="fas fa-spinner fa-spin"></i> Fetching your history...</div>';
    
    try {
        const historyData = await fetchUserProgress();
        
        if (!historyData || historyData.length === 0) {
            grid.innerHTML = '<p class="empty-msg">Abhi tak kuch nahi suna? Start listening! 🎧</p>';
            return;
        }

        grid.innerHTML = ''; 

        historyData.forEach(progress => {
            const book = allBooks.find(b => String(b.bookId) === String(progress.bookId)); 
            
            if (book) {
                const percent = Math.min(100, Math.floor((progress.currentTime / progress.totalDuration) * 100)) || 0;

                const card = document.createElement('div');
                card.className = 'history-card';
                card.innerHTML = `
                    <div class="history-layout">
                        <img src="${book.cover}" loading="lazy" class="history-cover">
                        <div class="history-info">
                            <h3>${book.title}</h3>
                            <div class="progress-container">
                                <div class="mini-progress-track">
                                    <div class="mini-progress-fill" style="width: ${percent}%"></div>
                                </div>
                                <span class="progress-text">${percent}% Done</span>
                            </div>
                        </div>
                        <div class="history-play-btn"><i class="fas fa-play"></i></div>
                    </div>`;

                card.onclick = () => {
                    openPlayerCallback({ 
                        ...book, 
                        savedState: {
                            chapterIndex: progress.chapterIndex,
                            currentTime: progress.currentTime
                        }
                    });
                };

                grid.appendChild(card);
            }
        });
    } catch (error) {
        console.error("History Render Error:", error);
        grid.innerHTML = '<p class="empty-msg" style="color:#ff4b1f">History load nahi ho paayi.</p>';
    }
}