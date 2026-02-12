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

export function applyChameleonTheme(imageUrl) {
    if (!window.ColorThief) return;
    const colorThief = new ColorThief();
    const img = new Image();
    img.crossOrigin = "Anonymous"; 
    img.src = imageUrl;
    img.onload = function() {
        try {
            const color = colorThief.getColor(img);
            const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
            document.documentElement.style.setProperty('--primary', rgb);
            const playBtn = document.getElementById('play-btn');
            if(playBtn) playBtn.style.boxShadow = `0 0 30px ${rgb}`;
        } catch (e) {}
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
