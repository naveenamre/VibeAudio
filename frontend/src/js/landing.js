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
        greetingEl.textContent = 'Morning listening lands better when the next chapter already feels chosen for you.';
    } else if (hour < 18) {
        greetingEl.textContent = 'Afternoons move faster when the shelf keeps your next standout story close.';
    } else {
        greetingEl.textContent = 'Evenings deserve immersive stories, stronger atmosphere, and a shelf worth returning to.';
    }
}

function pickFeaturedBook(books = []) {
    return [...books]
        .filter((book) => book?.cover && book?.title)
        .sort((left, right) => {
            const chapterDiff = Number(right.totalChapters || 0) - Number(left.totalChapters || 0);
            if (chapterDiff) return chapterDiff;
            return String(left.title || '').localeCompare(String(right.title || ''));
        })[0] || books[0] || null;
}

function renderHeroStats(books) {
    const statsEl = document.getElementById('hero-stats');
    if (!statsEl) return;

    const genreCount = new Set(books.map((book) => String(book.genre || '').trim()).filter(Boolean)).size;
    const chapterCount = books.reduce((sum, book) => sum + Number(book.totalChapters || 0), 0);
    const offlineReady = window.VibePWA?.isOfflineShellLikelyReady?.() ? 'Ready' : 'Warming';

    statsEl.innerHTML = `
        <div class="metric-card">
            <strong>${books.length}</strong>
            <span>Stories ready to start</span>
        </div>
        <div class="metric-card">
            <strong>${chapterCount || 0}</strong>
            <span>Chapters already in the catalog</span>
        </div>
        <div class="metric-card">
            <strong>${genreCount || 'Curated'}</strong>
            <span>Genres and moods in rotation</span>
        </div>
        <div class="metric-card">
            <strong>${offlineReady}</strong>
            <span>Browser shelf availability</span>
        </div>
    `;
}

function renderSpotlight(books) {
    const spotlightEl = document.getElementById('featured-spotlight');
    const coverEl = document.getElementById('featured-cover');
    if (!spotlightEl || !coverEl) return;

    const featuredBook = pickFeaturedBook(books);
    if (!featuredBook) {
        spotlightEl.innerHTML = '<span class="eyebrow">Featured listening</span><h2>Catalog warming up</h2><p>Your standout cover story will appear here as soon as the browser shelf is ready.</p>';
        coverEl.hidden = true;
        return;
    }

    coverEl.hidden = false;
    coverEl.src = featuredBook.cover || './public/icons/logo.png';
    coverEl.alt = featuredBook.title || 'Featured audiobook';

    const moodText = Array.isArray(featuredBook.moods) && featuredBook.moods.length
        ? featuredBook.moods.slice(0, 2).join(' / ')
        : (featuredBook.genre || 'Curated audio story');

    spotlightEl.innerHTML = `
        <span class="eyebrow">Featured listening</span>
        <h2>${escapeHTML(featuredBook.title || 'VibeAudio select')}</h2>
        <p class="featured-byline">${escapeHTML(featuredBook.author || 'Curated author')}</p>
        <p>${escapeHTML(moodText)} atmosphere with ${Number(featuredBook.totalChapters || 0)} chapters ready for a longer session.</p>
        <div class="hero-actions">
            <button class="solid-btn" type="button" data-open-auth="true">Start Listening</button>
            <button class="ghost-btn" type="button" data-scroll-target="#library-preview-panel">Browse Catalog</button>
        </div>
    `;
}

function renderPreviewGrid(books) {
    const previewEl = document.getElementById('library-preview');
    if (!previewEl) return;

    if (!books.length) {
        previewEl.innerHTML = '<div class="empty-preview">The shelf preview is unavailable right now. Refresh once the catalog is reachable.</div>';
        return;
    }

    previewEl.innerHTML = books.slice(0, 5).map((book, index) => {
        const meta = Array.isArray(book.moods) && book.moods.length
            ? book.moods.slice(0, 2).join(' / ')
            : (book.genre || 'Curated listening');

        return `
            <article class="preview-card ${index === 0 ? 'is-featured' : ''}">
                <img src="${escapeHTML(book.cover || './public/icons/logo.png')}" alt="${escapeHTML(book.title || 'Audiobook cover')}">
                <div class="preview-copy">
                    <span class="preview-kicker">${escapeHTML(book.genre || 'Featured pick')}</span>
                    <strong>${escapeHTML(book.title || 'Untitled')}</strong>
                    <span>${escapeHTML(book.author || 'Unknown author')}</span>
                    <p>${escapeHTML(meta)} - ${Number(book.totalChapters || 0)} parts</p>
                </div>
            </article>
        `;
    }).join('');
}

function renderCategoryTags(books) {
    const tagEl = document.getElementById('category-spotlight');
    if (!tagEl) return;

    const tagCounts = new Map();
    books.forEach((book) => {
        if (book.genre) {
            const genre = String(book.genre);
            tagCounts.set(genre, (tagCounts.get(genre) || 0) + 2);
        }
        (book.moods || []).forEach((mood) => {
            const label = String(mood);
            tagCounts.set(label, (tagCounts.get(label) || 0) + 1);
        });
    });

    const picked = Array.from(tagCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .map(([label]) => label)
        .filter(Boolean)
        .slice(0, 10);
    if (!picked.length) {
        tagEl.innerHTML = '<span>Late-night listening</span><span>Slow-burn fantasy</span><span>Comfort replay</span>';
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

        statusEl.textContent = 'Sign in to unlock your synced shelf, saved moments, and premium listening flow.';
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
                    fontFamily: '"Manrope", sans-serif',
                    colorPrimary: '#d78d46',
                    colorText: 'white',
                    colorBackground: 'transparent',
                    colorInputBackground: 'rgba(255,255,255,0.06)',
                    colorInputText: 'white',
                    borderRadius: '18px'
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
        statusEl.textContent = 'The sign-in panel could not load right now. You can still explore the public shelf preview below.';
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
