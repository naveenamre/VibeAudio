import { loadBook, getCurrentState, getCurrentLang, setLanguage } from './player.js';
import { getOfflineChapterStatus, OFFLINE_STATES } from './offline-shelf.js';
import { updateUI } from './ui-player-main.js';

function escapeHTML(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

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

    let activeSectionName = '';
    if (currentIndex !== -1 && chaptersToShow[currentIndex].section) {
        activeSectionName = chaptersToShow[currentIndex].section;
    } else if (savedChapterIndex !== -1 && chaptersToShow[savedChapterIndex]?.section) {
        activeSectionName = chaptersToShow[savedChapterIndex].section;
    }

    let lastSection = null;

    chaptersToShow.forEach((chapter, idx) => {
        const getSafeId = (value) => value.replace(/[^a-zA-Z0-9]/g, '');

        if (chapter.section && chapter.section !== lastSection) {
            const sectionHeader = document.createElement('li');
            sectionHeader.className = 'section-header';
            const isOpen = (chapter.section === activeSectionName);
            const safeSectionId = getSafeId(chapter.section);

            if (isOpen) sectionHeader.classList.add('active-header');

            sectionHeader.innerHTML = `<span>${escapeHTML(chapter.section)}</span><i class="fas fa-chevron-down ${isOpen ? 'rotate' : ''}"></i>`;
            sectionHeader.onclick = () => toggleSectionGroup(safeSectionId, sectionHeader);
            list.appendChild(sectionHeader);
            lastSection = chapter.section;
        }

        const item = document.createElement('li');
        const safeSectionId = chapter.section ? getSafeId(chapter.section) : 'default';
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

        item.setAttribute('data-section-group', safeSectionId);
        item.setAttribute('data-chapter-index', String(idx));
        item.className = `chapter-item ${isCurrent ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isResumePoint ? 'resume-point' : ''}`.trim();

        if (chapter.section && chapter.section !== activeSectionName) item.classList.add('collapsed');

        const cleanTitle = String(chapter.name || '')
            .replace(/^Chapter\s+\d+[:\s-]*/i, '')
            .replace(/^\d+[\.\s]+/, '')
            .trim();

        item.innerHTML = `
            <div class="chapter-info">
                <span class="chapter-num">${idx + 1}</span>
                <div class="chapter-copy">
                    <span class="chapter-title">${escapeHTML(cleanTitle)}</span>
                    <div class="chapter-meta-line">
                        ${progressLabel}
                        <span class="chapter-offline-badge hidden" data-offline-badge></span>
                    </div>
                </div>
            </div>
            <div class="chapter-status"><i class="${statusClass}" style="font-size: 0.8rem;"></i></div>
        `;
        item.onclick = () => {
            loadBook(book, idx);
            updateUI(true, book, chaptersToShow[idx]);
        };
        list.appendChild(item);
    });

    void hydrateChapterOfflineBadges(book, chaptersToShow);
}

async function hydrateChapterOfflineBadges(book, chapters) {
    const list = document.getElementById('chapter-list');
    if (!list || !book) return;

    const lang = getCurrentLang();

    await Promise.all(chapters.map(async (chapter, idx) => {
        const item = list.querySelector(`.chapter-item[data-chapter-index="${idx}"]`);
        if (!item) return;

        const badge = item.querySelector('[data-offline-badge]');
        if (!badge) return;

        const status = await getOfflineChapterStatus(book.bookId, lang, idx, chapter);
        badge.className = 'chapter-offline-badge';

        if (status.status === OFFLINE_STATES.downloaded) {
            badge.textContent = 'Offline';
            badge.classList.add('is-downloaded');
            return;
        }

        if (status.status === OFFLINE_STATES.updateAvailable) {
            badge.textContent = 'Update';
            badge.classList.add('is-update');
            return;
        }

        if (status.status === OFFLINE_STATES.downloading) {
            badge.textContent = `${Math.max(0, Math.round(Number(status.record?.progressPercent || 0)))}%`;
            badge.classList.add('is-downloading');
            return;
        }

        if (status.status === OFFLINE_STATES.queued) {
            badge.textContent = 'Queued';
            badge.classList.add('is-queued');
            return;
        }

        if (status.status === OFFLINE_STATES.failed) {
            badge.textContent = 'Retry';
            badge.classList.add('is-failed');
            return;
        }

        badge.classList.add('hidden');
    }));
}

function toggleSectionGroup(sectionId, headerElement) {
    const items = document.querySelectorAll(`[data-section-group="${sectionId}"]`);
    const icon = headerElement.querySelector('i');
    let isExpanding = false;

    items.forEach((item) => {
        if (item.classList.contains('collapsed')) {
            item.classList.remove('collapsed');
            isExpanding = true;
        } else {
            item.classList.add('collapsed');
            isExpanding = false;
        }
    });

    if (isExpanding) {
        icon.classList.add('rotate');
        headerElement.classList.add('active-header');
    } else {
        icon.classList.remove('rotate');
        headerElement.classList.remove('active-header');
    }
}

export function toggleLangUI(lang, book) {
    document.querySelectorAll('.lang-btn').forEach((button) => button.classList.remove('active'));
    document.getElementById(`btn-${lang}`).classList.add('active');
    setLanguage(lang);
    renderChapterList(book);
}
