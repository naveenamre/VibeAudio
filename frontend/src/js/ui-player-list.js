import { loadBook, getCurrentState, getCurrentLang, setLanguage } from './player.js';
import { updateUI } from './ui-player-main.js'; // Cyclic dependency handle karenge

// --- 📜 LIST RENDERER ---
export function renderChapterList(book) {
    const list = document.getElementById('chapter-list');
    const totalChapters = document.getElementById('total-chapters');
    
    const chaptersToShow = (getCurrentLang() === 'en' && book.chapters_en) ? book.chapters_en : book.chapters;

    if(totalChapters) totalChapters.innerText = `${chaptersToShow.length} Parts`;
    list.innerHTML = '';
    
    const currentState = getCurrentState();
    const currentIndex = (currentState.book && currentState.book.bookId === book.bookId) 
                          ? currentState.currentChapterIndex : -1;
    
    // Find active section
    let activeSectionName = "";
    if (currentIndex !== -1 && chaptersToShow[currentIndex].section) {
        activeSectionName = chaptersToShow[currentIndex].section;
    }
    let lastSection = null; 

    chaptersToShow.forEach((chap, idx) => {
        const getSafeId = (str) => str.replace(/[^a-zA-Z0-9]/g, '');

        // SECTION HEADER
        if (chap.section && chap.section !== lastSection) {
            const sectionHeader = document.createElement('li');
            sectionHeader.className = 'section-header';
            const isOpen = (chap.section === activeSectionName);
            const safeSectionId = getSafeId(chap.section); 
            
            if (isOpen) sectionHeader.classList.add('active-header');
            
            sectionHeader.innerHTML = `<span>${chap.section}</span><i class="fas fa-chevron-down ${isOpen ? 'rotate' : ''}"></i>`;
            sectionHeader.onclick = () => toggleSectionGroup(safeSectionId, sectionHeader);
            list.appendChild(sectionHeader);
            lastSection = chap.section;
        }

        // CHAPTER ITEM
        const li = document.createElement('li');
        const safeSectionId = chap.section ? getSafeId(chap.section) : 'default';
        li.setAttribute('data-section-group', safeSectionId);
        li.className = `chapter-item ${idx === currentIndex ? 'active' : ''}`;
        
        if (chap.section && chap.section !== activeSectionName) li.classList.add('collapsed');

        const cleanTitle = chap.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();
        li.innerHTML = `
            <div class="chapter-info"><span class="chapter-num">${idx + 1}</span><span class="chapter-title">${cleanTitle}</span></div>
            <div class="chapter-status"><i class="${idx === currentIndex ? 'fas fa-chart-bar' : 'fas fa-play'}" style="font-size: 0.8rem;"></i></div>
        `;
        li.onclick = () => { loadBook(book, idx); updateUI(true, book, chaptersToShow[idx]); };
        list.appendChild(li);
    });
}

function toggleSectionGroup(sectionId, headerElement) {
    const items = document.querySelectorAll(`[data-section-group="${sectionId}"]`);
    const icon = headerElement.querySelector('i');
    let isExpanding = false;
    items.forEach(item => {
        if (item.classList.contains('collapsed')) { item.classList.remove('collapsed'); isExpanding = true; } 
        else { item.classList.add('collapsed'); isExpanding = false; }
    });
    if (isExpanding) { icon.classList.add('rotate'); headerElement.classList.add('active-header'); } 
    else { icon.classList.remove('rotate'); headerElement.classList.remove('active-header'); }
}

export function toggleLangUI(lang, book) {
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-${lang}`).classList.add('active');
    setLanguage(lang);
    renderChapterList(book);
}