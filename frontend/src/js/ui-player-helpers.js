// --- 🛠️ HELPER FUNCTIONS ---

export function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return "00:00";
    
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    // Agar 1 ghante se zyada hai toh "1:05:30" dikhayega
    if (h > 0) {
        return `${h}:${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    } 
    // Warna normal "05:30"
    else {
        return `${m}:${s < 10 ? '0' + s : s}`;
    }
}

export function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// 🔥 FIX & UPGRADE: Clean JS, CSS Handles Animations
export function applyChameleonTheme(imageUrl) {
    if (!window.ColorThief || !imageUrl) {
        document.documentElement.style.setProperty('--primary', '#ff4b1f'); // Default orange
        return;
    }

    const colorThief = new ColorThief();
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    
    // 🚀 Amazon Proxy Bypass
    const safeUrl = encodeURIComponent(imageUrl);
    img.src = `https://wsrv.nl/?url=${safeUrl}`; 
    
    img.onload = function() {
        try {
            // 🎨 1. Get Top 3 Dominant Colors
            const palette = colorThief.getPalette(img, 3);
            
            if (palette && palette.length >= 3) {
                const [r1, g1, b1] = palette[0]; // Primary
                const [r2, g2, b2] = palette[1]; // Secondary
                const [r3, g3, b3] = palette[2]; // Accent

                const c1 = `rgb(${r1}, ${g1}, ${b1})`;
                const c2 = `rgb(${r2}, ${g2}, ${b2})`;
                const c3 = `rgb(${r3}, ${g3}, ${b3})`;

                document.documentElement.style.setProperty('--primary', c1);

                // 🌋 2. LAVA LAMP EFFECT (CSS Class Handle Karegi)
                const blurBg = document.getElementById('blur-bg');
                if (blurBg) {
                    blurBg.style.backgroundImage = `linear-gradient(135deg, ${c1}, ${c2}, ${c3})`;
                    blurBg.classList.add('animated-gradient'); // 🔥 Yahan se CSS trigger hoga
                }

                // ✒️ 3. DYNAMIC FONT COLORS (Brightness Check)
                const luminance = (0.299 * r1 + 0.587 * g1 + 0.114 * b1);
                const isLight = luminance > 140; 
                
                const titleEl = document.getElementById('detail-title');
                const authorEl = document.getElementById('detail-author');
                
                if (titleEl) {
                    titleEl.style.color = isLight ? '#121212' : '#ffffff';
                    titleEl.style.textShadow = isLight ? 'none' : '0 2px 5px rgba(0,0,0,0.6)';
                }
                if (authorEl) {
                    authorEl.style.color = isLight ? '#333333' : 'rgba(255,255,255,0.7)';
                    authorEl.style.textShadow = isLight ? 'none' : '0 1px 3px rgba(0,0,0,0.5)';
                }

                // 4. Update Player Shadows
                const playBtn = document.getElementById('play-btn');
                if(playBtn) playBtn.style.boxShadow = `0 0 30px ${c1}`;
                
                const playerBar = document.querySelector('.player-bar');
                if(playerBar) playerBar.style.boxShadow = `0 20px 50px rgba(0, 0, 0, 0.5), 0 0 20px rgba(${r1}, ${g1}, ${b1}, 0.15) inset`;

            } else {
                const color = colorThief.getColor(img);
                const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
                document.documentElement.style.setProperty('--primary', rgb);
            }
        } catch (e) {
            console.warn("🦎 Canvas blocked. Applying default Vibe theme.");
            document.documentElement.style.setProperty('--primary', '#ff4b1f'); 
        }
    };

    img.onerror = () => {
        console.warn("🦎 Proxy failed to load cover. Applying default theme.");
        document.documentElement.style.setProperty('--primary', '#ff4b1f'); 
    };
}

export function renderComments(comments) {
    const list = document.getElementById('comments-list');
    if(list) {
        list.innerHTML = '';
        comments.forEach(c => renderSingleComment(c));
    }
}

export function renderSingleComment(c) {
    const list = document.getElementById('comments-list');
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
        <div class="comment-time" onclick="window.app.seekToComment(${c.time})">
            ${formatTime(c.time)}
        </div>
        <div>
            <span class="comment-user">${c.user}</span>
            <p>${c.text}</p>
        </div>
    `;
    list.appendChild(div);
}