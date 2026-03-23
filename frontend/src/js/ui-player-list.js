import { loadBook, getCurrentState, getCurrentLang, setLanguage } from './player.js';
import { updateUI } from './ui-player-main.js'; // Cyclic dependency handle karenge

// --- 📜 LIST RENDERER ---
export function renderChapterList(book) {
    const list = document.getElementById('chapter-list');
    const totalChapters = document.getElementById('total-chapters');

    const chaptersToShow = (getCurrentLang() === 'en' && book.chapters_en) ? book.chapters_en : book.chapters;
    const savedState = book?.savedState || null;
    const savedChapterIndex = savedState ? Number(savedState.chapterIndex || 0) : -1;
    const savedCurrentTime = savedState ? Number(savedState.currentTime || 0) : 0;
    const exploredCount = savedState ? Math.min(chaptersToShow.length, savedChapterIndex + 1) : 0;

    if (totalChapters) {
        totalChapters.innerText = exploredCount > 0
            ? `${chaptersToShow.length} Parts - ${exploredCount} explored`
            : `${chaptersToShow.length} Parts`;
    }

    list.innerHTML = '';

    const currentState = getCurrentState();
    const currentIndex = (currentState.book && currentState.book.bookId === book.bookId)
        ? currentState.currentChapterIndex : -1;

    let activeSectionName = "";
    if (currentIndex !== -1 && chaptersToShow[currentIndex].section) {
        activeSectionName = chaptersToShow[currentIndex].section;
    } else if (savedChapterIndex !== -1 && chaptersToShow[savedChapterIndex]?.section) {
        activeSectionName = chaptersToShow[savedChapterIndex].section;
    }

    let lastSection = null;

    chaptersToShow.forEach((chap, idx) => {
        const getSafeId = (str) => str.replace(/[^a-zA-Z0-9]/g, '');

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

        const li = document.createElement('li');
        const safeSectionId = chap.section ? getSafeId(chap.section) : 'default';
        const isCurrent = idx === currentIndex;
        const isCompleted = savedChapterIndex > idx;
        const isResumePoint = !isCurrent && savedChapterIndex === idx && savedCurrentTime > 5;
        const statusClass = isCurrent
            ? 'fas fa-chart-bar'
            : isCompleted
                ? 'fas fa-check-circle'
                : isResumePoint
                    ? 'fas fa-history'
                    : 'fas fa-play';
        const progressLabel = isCompleted
            ? '<span class="chapter-progress-label done">Heard</span>'
            : isResumePoint
                ? '<span class="chapter-progress-label resume">Resume</span>'
                : '';

        li.setAttribute('data-section-group', safeSectionId);
        li.className = `chapter-item ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isResumePoint ? 'resume-point' : ''}`.trim();

        if (chap.section && chap.section !== activeSectionName) li.classList.add('collapsed');

        const cleanTitle = chap.name.replace(/^Chapter\s+\d+[:\s-]*/i, '').replace(/^\d+[\.\s]+/, '').trim();
        li.innerHTML = `
            <div class="chapter-info">
                <span class="chapter-num">${idx + 1}</span>
                <div class="chapter-copy">
                    <span class="chapter-title">${cleanTitle}</span>
                    ${progressLabel}
                </div>
            </div>
            <div class="chapter-status"><i class="${statusClass}" style="font-size: 0.8rem;"></i></div>
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
