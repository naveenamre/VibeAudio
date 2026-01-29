// --- 📚 UI LIBRARY MODULE (History Click Fix) ---
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
        
        card.innerHTML = `
            <img class="lazy-img" src="${placeholder}" data-src="${book.cover}" alt="${book.title}">
            <div class="card-content">
                <h3>${book.title}</h3>
                <p>${book.author}</p>
                ${moodHTML}
            </div>`;
        
        card.onclick = () => openPlayerCallback(book);
        grid.appendChild(card);

        const img = card.querySelector('img');
        if(window.imageObserver) window.imageObserver.observe(img);
    });

    if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
        window.VanillaTilt.init(document.querySelectorAll("#book-grid .book-card"), {
            max: 15, speed: 400, glare: true, "max-glare": 0.3, scale: 1.05, gyroscope: false  
        });
    }
}

// --- RENDER HISTORY (Click Fix Added) ---
export async function renderHistory(allBooks, openPlayerCallback) {
    const grid = document.getElementById('history-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Loading History...</div>';
    
    try {
        const historyData = await fetchUserProgress();
        
        if (!historyData || historyData.length === 0) {
            grid.innerHTML = '<p class="empty-msg">No history yet. Start vibing!</p>';
            return;
        }

        grid.innerHTML = ''; 

        historyData.forEach(progress => {
            const book = allBooks.find(b => b.bookId == progress.bookId); 
            
            if (book) {
                // Safe Access for Chapter Name
                const currentChapIndex = progress.chapterIndex || 0;
                let chapName = `Chapter ${currentChapIndex + 1}`; 

                if (book.chapters && book.chapters[currentChapIndex]) {
                    chapName = book.chapters[currentChapIndex].name;
                }

                const cleanChapterName = chapName.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();
                const percent = Math.min(100, Math.floor((progress.currentTime / progress.totalDuration) * 100)) || 0;

                const card = document.createElement('div');
                card.className = 'book-card';
                
                card.innerHTML = `
                    <div class="history-layout">
                        <img src="${book.cover}" loading="lazy" style="width:70px; height:70px; border-radius:10px; object-fit:cover;">
                        
                        <div class="history-info">
                            <h3 style="margin-bottom:2px;">${book.title}</h3>
                            <div class="chapter-badge">
                                <i class="fas fa-headphones" style="font-size:0.7rem;"></i> 
                                <span>${cleanChapterName}</span>
                            </div>
                            
                            <div class="mini-progress-track">
                                <div class="mini-progress-fill" style="width: ${percent}%"></div>
                            </div>
                            <p style="font-size:0.7rem; color:#888; margin-top:4px;">${percent}% Completed</p>
                        </div>
                        
                        <div class="resume-btn">
                            <i class="fas fa-play"></i>
                        </div>
                    </div>
                `;

                // 🔥 MAIN FIX: Click logic updated
                card.onclick = () => {
                    // Hum book object ke saath 'savedState' bhi bhej rahe hain
                    // Taki player samajh jaye ki kahan se resume karna hai
                    const bookWithResumeData = { 
                        ...book, 
                        savedState: {
                            chapterIndex: progress.chapterIndex,
                            currentTime: progress.currentTime
                        }
                    };
                    openPlayerCallback(bookWithResumeData);
                };

                grid.appendChild(card);
                
                if (window.matchMedia("(min-width: 768px)").matches && window.VanillaTilt) {
                    window.VanillaTilt.init(card, {
                        max: 10, speed: 400, glare: true, "max-glare": 0.1, scale: 1.02
                    });
                }
            }
        });
    } catch (error) {
        console.error("History Render Error:", error);
        grid.innerHTML = '<p class="empty-msg" style="color:#ff4444">Error loading history.</p>';
    }
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