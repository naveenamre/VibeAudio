import { fetchAllBooks } from './api.js';
import { getSignedInUser, mountSignIn, persistUserProfile } from './auth.js';

const APP_URL = './src/pages/app.html';
const OFFLINE_APP_URL = `${APP_URL}#offline`;

function toAbsoluteUrl(value) {
    try {
        return new URL(String(value || ''), window.location.href).href;
    } catch (error) {
        return '';
    }
}

function warmOfflinePreview(books = []) {
    const bridge = window.VibePWA;
    if (!bridge?.primeOfflineResources) return;

    const previewBooks = Array.isArray(books) ? books.slice(0, 8) : [];
    const urls = [
        './',
        './index.html',
        './app.webmanifest',
        APP_URL,
        ...previewBooks.flatMap((book) => [book?.dataPath, book?.cover])
    ]
        .map(toAbsoluteUrl)
        .filter(Boolean);

    void bridge.primeOfflineResources(urls);
}

async function hasCachedOfflineAppShell() {
    if (window.VibePWA?.isOfflineShellLikelyReady?.()) {
        return true;
    }

    if (!('caches' in window)) return false;

    try {
        const absoluteAppUrl = new URL(APP_URL, window.location.href).href;
        const cachedAppShell = await caches.match(absoluteAppUrl) || await caches.match(APP_URL);
        return Boolean(cachedAppShell);
    } catch (error) {
        console.warn('Unable to inspect cached app shell.', error);
        return false;
    }
}

async function openOfflineShelfIfReady() {
    if (navigator.onLine) return false;
    if (window.location.pathname.includes('/src/pages/app')) return false;

    const ready = await hasCachedOfflineAppShell();
    if (!ready) return false;

    window.location.replace(OFFLINE_APP_URL);
    return true;
}

function escapeHTML(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function setGreeting() {
    const hour = new Date().getHours();
    const greetingEl = document.getElementById('landing-greeting');
    if (!greetingEl) return;

    if (hour < 12) {
        greetingEl.textContent = 'Morning listening starts better with a calm shelf.';
    } else if (hour < 18) {
        greetingEl.textContent = 'Afternoons feel lighter when your next chapter is already lined up.';
    } else {
        greetingEl.textContent = 'Evenings are made for long-form listening and immersive stories.';
    }
}

function renderHeroStats(books) {
    const statsEl = document.getElementById('hero-stats');
    if (!statsEl) return;

    const genreCount = new Set(books.map((book) => String(book.genre || '').trim()).filter(Boolean)).size;
    const chapterCount = books.reduce((sum, book) => sum + Number(book.totalChapters || 0), 0);

    statsEl.innerHTML = `
        <div class="metric-card">
            <strong>${books.length}</strong>
            <span>Stories ready to stream</span>
        </div>
        <div class="metric-card">
            <strong>${genreCount || 'Curated'}</strong>
            <span>Genres and moods to explore</span>
        </div>
        <div class="metric-card">
            <strong>${chapterCount || 'Always on'}</strong>
            <span>Chapters waiting in your queue</span>
        </div>
    `;
}

function renderSpotlight(books) {
    const spotlightEl = document.getElementById('featured-spotlight');
    const coverEl = document.getElementById('featured-cover');
    if (!spotlightEl || !coverEl) return;

    const [firstBook] = books;
    if (!firstBook) {
        spotlightEl.innerHTML = '<h2>Cloud shelf warming up</h2><p>Catalog preview will appear here as soon as books are available.</p>';
        coverEl.hidden = true;
        return;
    }

    coverEl.hidden = false;
    coverEl.src = firstBook.cover || './public/icons/logo.png';
    coverEl.alt = firstBook.title || 'Featured audiobook';

    const moodText = Array.isArray(firstBook.moods) && firstBook.moods.length
        ? firstBook.moods.slice(0, 3).join(', ')
        : (firstBook.genre || 'Curated audio stories');

    spotlightEl.innerHTML = `
        <span class="eyebrow">Featured for your browser shelf</span>
        <h2>${escapeHTML(firstBook.title || 'VibeAudio pick')}</h2>
        <p>${escapeHTML(firstBook.author || 'Curated author')}</p>
        <p>${escapeHTML(moodText)} listening with ${Number(firstBook.totalChapters || 0)} chapters ready to go.</p>
        <div class="hero-actions">
            <button class="solid-btn" type="button" data-open-auth="true">Start Listening</button>
            <button class="ghost-btn" type="button" data-scroll-target="#library-preview-panel">Browse First</button>
        </div>
    `;
}

function renderPreviewGrid(books) {
    const previewEl = document.getElementById('library-preview');
    if (!previewEl) return;

    if (!books.length) {
        previewEl.innerHTML = '<div class="empty-preview">Preview shelf is unavailable right now. Refresh once the catalog is reachable.</div>';
        return;
    }

    previewEl.innerHTML = books.slice(0, 6).map((book) => {
        const meta = Array.isArray(book.moods) && book.moods.length
            ? book.moods.slice(0, 2).join(' - ')
            : (book.genre || 'Curated listening');

        return `
            <article class="preview-card">
                <img src="${escapeHTML(book.cover || './public/icons/logo.png')}" alt="${escapeHTML(book.title || 'Audiobook cover')}">
                <strong>${escapeHTML(book.title || 'Untitled')}</strong>
                <span>${escapeHTML(book.author || 'Unknown author')}</span>
                <p>${escapeHTML(meta)} - ${Number(book.totalChapters || 0)} parts</p>
            </article>
        `;
    }).join('');
}

function renderCategoryTags(books) {
    const tagEl = document.getElementById('category-spotlight');
    if (!tagEl) return;

    const tags = new Set();
    books.forEach((book) => {
        if (book.genre) tags.add(String(book.genre));
        (book.moods || []).forEach((mood) => tags.add(String(mood)));
    });

    const picked = Array.from(tags).filter(Boolean).slice(0, 10);
    if (!picked.length) {
        tagEl.innerHTML = '<span>Fresh picks</span><span>Motivation</span><span>Night listening</span>';
        return;
    }

    tagEl.innerHTML = picked.map((tag) => `<span>${escapeHTML(tag)}</span>`).join('');
}

function bindScrollActions() {
    document.querySelectorAll('[data-open-auth="true"]').forEach((button) => {
        if (button.dataset.boundScroll === 'true') return;
        button.dataset.boundScroll = 'true';
        button.addEventListener('click', async () => {
            if (!navigator.onLine) {
                const redirected = await openOfflineShelfIfReady();
                if (!redirected) {
                    document.getElementById('auth-status')?.classList.add('is-ready');
                    if (document.getElementById('auth-status')) {
                        document.getElementById('auth-status').textContent = 'Offline shelf is not cached strongly enough yet. Open the app once online, then it will launch here offline too.';
                    }
                }
                return;
            }
            document.getElementById('auth-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });

    document.querySelectorAll('[data-scroll-target]').forEach((button) => {
        if (button.dataset.boundTarget === 'true') return;
        button.dataset.boundTarget = 'true';
        button.addEventListener('click', () => {
            const target = document.querySelector(button.dataset.scrollTarget || '');
            target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

async function bootAuthPanel() {
    const signInContainer = document.getElementById('sign-in-container');
    const statusEl = document.getElementById('auth-status');
    if (!signInContainer || !statusEl) return;

    if (!navigator.onLine) {
        const redirected = await openOfflineShelfIfReady();
        statusEl.textContent = redirected
            ? 'Offline mode active. Opening your saved browser shelf instead of the sign-in panel.'
            : 'Offline mode active. Your saved shelf will open here once the app shell has been cached from an online session.';
        statusEl.classList.add('is-ready');
        return;
    }

    try {
        const currentUser = await getSignedInUser();
        if (currentUser) {
            persistUserProfile(currentUser);
            window.location.replace(APP_URL);
            return;
        }

        statusEl.textContent = 'Sign in to unlock resume, history, and your synced listening shelf.';
        statusEl.classList.add('is-ready');

        await mountSignIn(signInContainer, {
            afterSignInUrl: APP_URL,
            afterSignUpUrl: APP_URL,
            appearance: {
                layout: {
                    socialButtonsPlacement: 'top',
                    showOptionalFields: false
                },
                variables: {
                    fontFamily: '"Outfit", sans-serif',
                    colorPrimary: '#ff8a4c',
                    colorText: 'white',
                    colorBackground: 'transparent',
                    colorInputBackground: 'rgba(255,255,255,0.08)',
                    colorInputText: 'white',
                    borderRadius: '14px'
                },
                elements: {
                    card: 'shadow-none bg-transparent p-0',
                    headerTitle: 'hidden',
                    headerSubtitle: 'hidden',
                    footer: 'hidden'
                }
            }
        });
    } catch (error) {
        console.error('Unable to boot Clerk on landing page.', error);
        statusEl.textContent = 'Auth panel could not load right now. You can still browse the public shelf preview below.';
    }
}

async function initLanding() {
    if (!navigator.onLine && await openOfflineShelfIfReady()) {
        return;
    }

    setGreeting();

    const books = await fetchAllBooks();
    renderHeroStats(books);
    renderSpotlight(books);
    renderPreviewGrid(books);
    renderCategoryTags(books);
    warmOfflinePreview(books);
    bindScrollActions();
    await bootAuthPanel();
}

document.addEventListener('DOMContentLoaded', initLanding);
