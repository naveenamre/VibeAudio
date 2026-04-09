const DEFAULT_PALETTE = [
    [181, 108, 43],
    [214, 170, 112],
    [43, 54, 77],
    [9, 12, 19]
];

const SURFACES = ['library', 'history', 'player'];
const SURFACE_BASE_PALETTES = {
    library: [
        [145, 92, 46],
        [208, 169, 108],
        [42, 53, 73],
        [8, 12, 19]
    ],
    history: [
        [124, 95, 62],
        [175, 156, 118],
        [46, 55, 72],
        [9, 12, 20]
    ],
    player: [
        [159, 92, 58],
        [214, 170, 119],
        [62, 73, 94],
        [9, 12, 20]
    ]
};
const SURFACE_DYNAMIC_THEME = {
    library: false,
    history: false,
    player: true
};
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

function normalizeSurface(surface) {
    return SURFACES.includes(surface) ? surface : 'library';
}

function getSurfaceBasePalette(surface) {
    return SURFACE_BASE_PALETTES[normalizeSurface(surface)] || DEFAULT_PALETTE;
}

function buildSurfacePalette(palette, surface) {
    const basePalette = getSurfaceBasePalette(surface);

    if (!SURFACE_DYNAMIC_THEME[normalizeSurface(surface)] || !Array.isArray(palette) || !palette.length) {
        return basePalette;
    }

    const blendWeights = [0.26, 0.24, 0.18, 0.1];
    return basePalette.map((baseColor, index) => {
        const sourceColor = palette[index] || baseColor;
        return mixColor(baseColor, sourceColor, blendWeights[index]);
    });
}

function buildTheme(palette, surface = 'library') {
    const [primaryBase, secondaryBase, tertiaryBase, depthBase] = buildSurfacePalette(palette, surface);
    const primary = mixColor(primaryBase, [255, 238, 212], 0.12);
    const secondary = mixColor(secondaryBase, [255, 245, 223], 0.12);
    const tertiary = mixColor(tertiaryBase, [236, 228, 216], 0.06);
    const depth = mixColor(depthBase, [0, 0, 0], 0.48);
    const shell = mixColor(depth, [8, 12, 18], 0.6);
    const titleAccent = mixColor(secondary, [255, 255, 255], 0.34);

    return {
        '--primary': rgb(primary),
        '--secondary': rgb(secondary),
        '--accent-soft': rgba(primary, 0.18),
        '--theme-bg-1': rgba(mixColor(primary, shell, 0.82), 0.72),
        '--theme-bg-2': rgba(mixColor(secondary, shell, 0.8), 0.42),
        '--theme-bg-3': rgba(mixColor(tertiary, shell, 0.74), 0.34),
        '--theme-bg-4': rgba(mixColor(shell, [0, 0, 0], 0.3), 0.995),
        '--theme-surface-1': rgba(mixColor(shell, primary, 0.08), 0.9),
        '--theme-surface-2': rgba(mixColor(shell, secondary, 0.08), 0.58),
        '--theme-surface-3': rgba(mixColor(shell, [255, 255, 255], 0.06), 0.14),
        '--theme-border': rgba(mixColor(primary, [255, 255, 255], 0.22), 0.14),
        '--theme-border-strong': rgba(mixColor(secondary, [255, 255, 255], 0.18), 0.26),
        '--theme-glow': rgba(primary, 0.18),
        '--theme-glow-soft': rgba(secondary, 0.12),
        '--theme-shadow': rgba(mixColor(shell, [0, 0, 0], 0.28), 0.62),
        '--theme-shadow-strong': rgba(mixColor(shell, [0, 0, 0], 0.44), 0.82),
        '--theme-title': 'rgba(248, 244, 236, 0.98)',
        '--theme-text': 'rgba(235, 229, 220, 0.96)',
        '--theme-text-soft': 'rgba(214, 206, 194, 0.82)',
        '--theme-text-dim': 'rgba(173, 167, 158, 0.66)',
        '--theme-title-gradient-start': 'rgb(248, 243, 234)',
        '--theme-title-gradient-end': rgb(titleAccent),
        '--theme-progress-track': rgba(mixColor(shell, [255, 255, 255], 0.12), 0.24),
        '--theme-progress-fill': `linear-gradient(90deg, ${rgb(primary)}, ${rgb(secondary)})`,
        '--theme-player-overlay': `linear-gradient(135deg, ${rgba(primary, 0.16)}, ${rgba(secondary, 0.08)} 42%, ${rgba(shell, 0.82)})`
    };
}

function getDefaultTheme() {
    return buildTheme(DEFAULT_PALETTE, 'library');
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

    if (!SURFACE_DYNAMIC_THEME[safeSurface] || !imageUrl) {
        const theme = buildTheme(null, safeSurface);
        surfaceThemes[safeSurface] = theme;

        if (activeSurface === safeSurface) {
            setCssVariables(theme);
        }

        return theme;
    }

    const palette = await extractPaletteFromImage(imageUrl);
    if (pendingThemeTokens[safeSurface] !== token) {
        return surfaceThemes[safeSurface] || getDefaultTheme();
    }

    const theme = buildTheme(palette, safeSurface);
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
    if (!list) return null;

    const div = document.createElement('div');
    div.className = 'comment-item';

    const timeButton = document.createElement('button');
    timeButton.type = 'button';
    timeButton.className = 'comment-time';
    timeButton.textContent = formatTime(comment.time);
    timeButton.addEventListener('click', () => window.app.seekToComment(Number(comment.time || 0)));

    const copyWrap = document.createElement('div');
    const userEl = document.createElement('span');
    userEl.className = 'comment-user';
    userEl.textContent = String(comment.user || 'Listener');

    const textEl = document.createElement('p');
    textEl.textContent = String(comment.text || '');

    copyWrap.appendChild(userEl);
    copyWrap.appendChild(textEl);
    div.appendChild(timeButton);
    div.appendChild(copyWrap);
    list.appendChild(div);
    return div;
}

surfaceThemes.library = getDefaultTheme();
surfaceThemes.history = buildTheme(null, 'history');
surfaceThemes.player = buildTheme(null, 'player');
