// --- 📡 API MANAGER (Hybrid: Cloudflare Static DB + AWS User Sync) ---

// 👇 TERA NAYA CLOUDFLARE PAGES URL
const DB_BASE_URL = "https://vibeaudio-db.pages.dev";
const CATALOG_URL = `${DB_BASE_URL}/catalog.json`;

// 👇 TERE LAMBDA URLS
const PROGRESS_URL = "https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/"; 
const GET_PROGRESS_URL = "https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/"; 
const SYNC_USER_URL = "https://aj7bwk3d72tzj5n2r43lusryg40tosik.lambda-url.ap-south-1.on.aws/"; 

// 🧠 INTERNAL CACHE: Taaki network requests kam hon aur speed zyada!
const bookCache = new Map();

// --- 🧠 HELPER: GET REAL USER ID ---
function getUserId() {
    const userId = localStorage.getItem("vibe_user_id");
    if (!userId) return null;
    return userId;
}

// --- 🔄 0. SYNC USER PROFILE ---
export async function syncUserProfile() {
    const userId = getUserId();
    const name = localStorage.getItem("vibe_user_name") || "Vibe User";
    if (!userId) return;

    try {
        console.log("☁️ Syncing User Profile...");
        await fetch(SYNC_USER_URL, {
            method: "POST",
            keepalive: true,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId, name, action: "sync" })
        });
    } catch (e) { console.warn("⚠️ Sync Failed (Offline?):", e); }
}

// --- 📚 1. FETCH BOOK LIST (INDEX) ---
export async function fetchAllBooks() {
    try {
        console.log("☁️ Fetching Index from Cloudflare...");
        const response = await fetch(CATALOG_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error("Catalog load fail!");
        return await response.json(); 
    } catch (error) {
        console.error("❌ Catalog Error:", error);
        return [];
    }
}

// --- ⚡ 2. FETCH BOOK DETAILS (SMART CACHED) ---
export async function fetchBookDetails(dataPath) {
    // Pehle check karo cache mein hai kya?
    if (bookCache.has(dataPath)) {
        console.log("⚡ Serving Book Details from Memory Cache!");
        return bookCache.get(dataPath);
    }

    try {
        console.log("📥 Fetching Book Details from:", dataPath);
        const response = await fetch(dataPath, { cache: 'no-cache' });
        if (!response.ok) throw new Error("Detail fetch failed!");
        const data = await response.json();
        
        // Cache mein save kar lo
        bookCache.set(dataPath, data);
        return data;
    } catch (error) {
        console.error("❌ Detail Fetch Error:", error);
        return null;
    }
}

// --- 💾 3. SAVE PROGRESS ---
export async function saveUserProgress(bookId, chapterIndex, currentTime, totalDuration) {
    const userId = getUserId();
    if (!userId || currentTime < 5) return;

    const payload = {
        userId, 
        bookId: String(bookId), 
        chapterIndex, 
        currentTime, 
        totalDuration: isFinite(totalDuration) ? totalDuration : 0,
        updatedAt: new Date().toISOString()
    };

    // LOCAL SAVE (Turant)
    localStorage.setItem(`vibe_progress_${bookId}`, JSON.stringify(payload));

    // CLOUD SAVE (Background)
    if (navigator.onLine) {
        try {
            await fetch(PROGRESS_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } catch (e) { console.warn("⚠️ Cloud Save Failed, using Local."); }
    }
}

// --- 🔄 4. FETCH PROGRESS (SMART MERGE) ---
export async function fetchUserProgress() {
    const userId = getUserId();
    if (!userId) return [];

    let cloudData = [];
    let localData = [];

    // Local History uthao
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith("vibe_progress_")) {
            localData.push(JSON.parse(localStorage.getItem(key)));
        }
    }

    // Cloud History mangvao
    if (navigator.onLine) {
        try {
            const res = await fetch(`${GET_PROGRESS_URL}?userId=${userId}`);
            const data = await res.json();
            cloudData = data.progress || data || [];
        } catch (e) { console.warn("⚠️ Cloud History Fetch Failed"); }
    }

    // Merge Logic (Latest wala rakho)
    const merged = new Map();
    cloudData.forEach(item => merged.set(item.bookId, item));
    localData.forEach(local => {
        const cloud = merged.get(local.bookId);
        if (!cloud || new Date(local.updatedAt) > new Date(cloud.updatedAt)) {
            merged.set(local.bookId, local);
        }
    });

    return Array.from(merged.values());
}

// --- 👤 5. GET LOCAL USER DATA (Fix for ui.js) ---
export function getLocalUserProfile() {
    return {
        id: localStorage.getItem("vibe_user_id"),
        name: localStorage.getItem("vibe_user_name") || "Vibe User"
    };
}