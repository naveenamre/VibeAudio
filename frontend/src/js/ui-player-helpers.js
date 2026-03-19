const DEFAULT_PALETTE = [
    [255, 90, 58],
    [57, 214, 255],
    [31, 24, 59],
    [8, 11, 23]
];

const SURFACES = ['library', 'history', 'player'];
const paletteCache = new Map();
const surfaceThemes = {
    library: null,
    history: null,
    player: null
};
const pendingThemeTokens = {
    library: 0,
    history: 0,
    player: 0
};

let activeSurface = 'library';

export function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    if (h > 0) {
        return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    }

    return `${m}:${s < 10 ? '0' + s : s}`;
}

export function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function clampChannel(value) {
    return Math.max(0, Math.min(255, Math.round(value)));
}

function mixColor(colorA, colorB, weight = 0.5) {
    return colorA.map((channel, index) => clampChannel(channel * (1 - weight) + colorB[index] * weight));
}

function rgb(color) {
    return `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
}

function rgba(color, alpha) {
    return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function luminance(color) {
    return (0.2126 * color[0]) + (0.7152 * color[1]) + (0.0722 * color[2]);
}

function normalizeSurface(surface) {
    return SURFACES.includes(surface) ? surface : 'library';
}

function buildTheme(palette) {
    const [primaryBase, secondaryBase, tertiaryBase, depthBase] = [...palette, ...DEFAULT_PALETTE].slice(0, 4);
    const primary = mixColor(primaryBase, [255, 255, 255], 0.06);
    const secondary = mixColor(secondaryBase, [255, 255, 255], 0.1);
    const tertiary = mixColor(tertiaryBase, [255, 255, 255], 0.04);
    const depth = mixColor(depthBase, [0, 0, 0], 0.18);

    const titleAnchor = luminance(primary) > 145 ? mixColor(primary, [15, 16, 20], 0.72) : mixColor(primary, [255, 255, 255], 0.72);
    const titleAccent = luminance(secondary) > 150 ? mixColor(secondary, [25, 28, 35], 0.68) : mixColor(secondary, [255, 255, 255], 0.55);
    const text = luminance(depth) > 118 ? 'rgb(20, 24, 32)' : 'rgba(245, 247, 255, 0.96)';
    const textSoft = luminance(depth) > 118 ? 'rgba(36, 42, 54, 0.74)' : 'rgba(236, 241, 255, 0.78)';
    const textDim = luminance(depth) > 118 ? 'rgba(40, 46, 58, 0.56)' : 'rgba(220, 229, 255, 0.56)';

    return {
        '--primary': rgb(primary),
        '--secondary': rgb(secondary),
        '--accent-soft': rgba(primary, 0.16),
        '--theme-bg-1': rgba(mixColor(primary, depth, 0.24), 0.9),
        '--theme-bg-2': rgba(mixColor(secondary, [255, 255, 255], 0.14), 0.72),
        '--theme-bg-3': rgba(mixColor(tertiary, [255, 255, 255], 0.08), 0.68),
        '--theme-bg-4': rgba(mixColor(depth, [0, 0, 0], 0.4), 0.98),
        '--theme-surface-1': rgba(mixColor(depth, primary, 0.22), 0.74),
        '--theme-surface-2': rgba(mixColor(depth, secondary, 0.14), 0.42),
        '--theme-surface-3': rgba(mixColor(depth, [255, 255, 255], 0.08), 0.22),
        '--theme-border': rgba(mixColor(primary, [255, 255, 255], 0.38), 0.2),
        '--theme-border-strong': rgba(mixColor(secondary, [255, 255, 255], 0.28), 0.36),
        '--theme-glow': rgba(primary, 0.34),
        '--theme-glow-soft': rgba(secondary, 0.22),
        '--theme-shadow': rgba(mixColor(depth, [0, 0, 0], 0.25), 0.56),
        '--theme-shadow-strong': rgba(mixColor(depth, [0, 0, 0], 0.4), 0.74),
        '--theme-title': text,
        '--theme-text': text,
        '--theme-text-soft': textSoft,
        '--theme-text-dim': textDim,
        '--theme-title-gradient-start': rgb(titleAnchor),
        '--theme-title-gradient-end': rgb(titleAccent),
        '--theme-progress-track': rgba(mixColor(depth, [255, 255, 255], 0.16), 0.36),
        '--theme-progress-fill': `linear-gradient(90deg, ${rgb(primary)}, ${rgb(secondary)})`,
        '--theme-player-overlay': `linear-gradient(135deg, ${rgba(primary, 0.18)}, ${rgba(secondary, 0.08)} 45%, ${rgba(depth, 0.24)})`
    };
}

function getDefaultTheme() {
    return buildTheme(DEFAULT_PALETTE);
}

function resolveImageUrl(imageUrl) {
    try {
        return new URL(imageUrl, window.location.href).href;
    } catch (error) {
        console.warn("Theme image URL fallback used.", error);
        return imageUrl;
    }
}

function setCssVariables(theme) {
    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta && theme['--primary']) {
        themeMeta.setAttribute('content', theme['--primary']);
    }
}

function applyThemeForSurface(surface) {
    const safeSurface = normalizeSurface(surface);
    activeSurface = safeSurface;
    document.body.dataset.themeSurface = safeSurface;
    setCssVariables(surfaceThemes[safeSurface] || getDefaultTheme());
}

function extractPaletteFromImage(imageUrl) {
    if (!imageUrl) return Promise.resolve(DEFAULT_PALETTE);

    const resolvedUrl = resolveImageUrl(imageUrl);
    if (paletteCache.has(resolvedUrl)) {
        return Promise.resolve(paletteCache.get(resolvedUrl));
    }

    if (!window.ColorThief) {
        paletteCache.set(resolvedUrl, DEFAULT_PALETTE);
        return Promise.resolve(DEFAULT_PALETTE);
    }

    return new Promise((resolve) => {
        const colorThief = new ColorThief();
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.referrerPolicy = 'no-referrer';

        img.onload = () => {
            try {
                const palette = colorThief.getPalette(img, 4);
                const finalPalette = Array.isArray(palette) && palette.length ? palette : DEFAULT_PALETTE;
                paletteCache.set(resolvedUrl, finalPalette);
                resolve(finalPalette);
            } catch (error) {
                console.warn("Palette extraction failed. Using fallback theme.", error);
                paletteCache.set(resolvedUrl, DEFAULT_PALETTE);
                resolve(DEFAULT_PALETTE);
            }
        };

        img.onerror = () => {
            console.warn("Theme image load failed. Using fallback theme.");
            paletteCache.set(resolvedUrl, DEFAULT_PALETTE);
            resolve(DEFAULT_PALETTE);
        };

        img.src = `https://wsrv.nl/?url=${encodeURIComponent(resolvedUrl)}&w=480&fit=cover`;
    });
}

async function queueSurfaceTheme(imageUrl, surface, activate = false) {
    const safeSurface = normalizeSurface(surface);
    const token = ++pendingThemeTokens[safeSurface];

    if (activate) {
        applyThemeForSurface(safeSurface);
    }

    const palette = await extractPaletteFromImage(imageUrl);
    if (pendingThemeTokens[safeSurface] !== token) {
        return surfaceThemes[safeSurface] || getDefaultTheme();
    }

    const theme = buildTheme(palette);
    surfaceThemes[safeSurface] = theme;

    if (activeSurface === safeSurface) {
        setCssVariables(theme);
    }

    return theme;
}

export function setActiveThemeSurface(surface) {
    applyThemeForSurface(surface);
}

export function applyLibraryTheme(imageUrl, activate = true) {
    return queueSurfaceTheme(imageUrl, 'library', activate);
}

export function applyHistoryTheme(imageUrl, activate = true) {
    return queueSurfaceTheme(imageUrl, 'history', activate);
}

export function applyChameleonTheme(imageUrl) {
    return queueSurfaceTheme(imageUrl, 'player', true);
}

export function renderComments(comments) {
    const list = document.getElementById('comments-list');
    if (list) {
        list.innerHTML = '';
        comments.forEach((comment) => renderSingleComment(comment));
    }
}

export function renderSingleComment(comment) {
    const list = document.getElementById('comments-list');
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
        <div class="comment-time" onclick="window.app.seekToComment(${comment.time})">
            ${formatTime(comment.time)}
        </div>
        <div>
            <span class="comment-user">${comment.user}</span>
            <p>${comment.text}</p>
        </div>
    `;
    list.appendChild(div);
}

surfaceThemes.library = getDefaultTheme();
surfaceThemes.history = getDefaultTheme();
surfaceThemes.player = getDefaultTheme();
