<<<<<<< HEAD
// --- 📡 API MANAGER (Hybrid: Static GitHub DB + Cloud Progress Sync) ---

// 👇 TERA NAYA GITHUB CDN LINK (Fastest Static DB)
const CATALOG_URL = "https://cdn.jsdelivr.net/gh/heerabete/VibeAudio-DB@main/catalog.json";

// 👇 TERE DYNAMIC LAMBDA URLS (For User Data Only)
=======
// --- 📡 API MANAGER (Hybrid: Cloudflare Static DB + AWS User Sync) ---

// 👇 TERA NAYA CLOUDFLARE PAGES URL (Lightning Fast ⚡)
const DB_BASE_URL = "https://vibeaudio-db.pages.dev";
const CATALOG_URL = `${DB_BASE_URL}/catalog.json`;

// 👇 TERE LAMBDA URLS (Sirf User Progress & Sync ke liye)
>>>>>>> 8ddcc18 (db)
const PROGRESS_URL = "https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/"; 
const GET_PROGRESS_URL = "https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/"; 
const SYNC_USER_URL = "https://aj7bwk3d72tzj5n2r43lusryg40tosik.lambda-url.ap-south-1.on.aws/"; 

// --- 🧠 HELPER: GET REAL USER ID ---
function getUserId() {
    const userId = localStorage.getItem("vibe_user_id");
    if (!userId) {
        if (window.location.pathname.includes('app.html')) {
            // window.location.href = "../../index.html"; // Optional redirect
        }
        return null;
    }
    return userId;
}

// --- 🔄 0. SYNC USER WITH DATABASE ---
export async function syncUserProfile() {
    const userId = getUserId();
    const name = localStorage.getItem("vibe_user_name") || "Vibe User";

    if (!userId) return;

    console.log("☁️ Syncing User Profile...");
    
    try {
        const response = await fetch(SYNC_USER_URL, {
            method: "POST",
            keepalive: true,
            credentials: "omit", 
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                userId: userId, 
                name: name,      
                action: "sync"   
            })
        });
        const result = await response.json();
        console.log("✅ User Synced:", result);
    } catch (e) {
        console.warn("⚠️ Sync Network Error (Offline?):", e);
    }
}

<<<<<<< HEAD
// --- 📚 1. FETCH BOOK LIST (GOD MODE CACHE) ---
export async function fetchAllBooks() {
    const CACHE_KEY = 'vibe_library_master';
    const TIME_KEY = 'vibe_library_timestamp';
    const CACHE_VALIDITY = 12 * 60 * 60 * 1000; // 12 Ghante (12 hours)

    const cachedData = localStorage.getItem(CACHE_KEY);
    const lastFetchTime = localStorage.getItem(TIME_KEY);
    const now = Date.now();

    // Background Fetcher Function
    const fetchFreshData = async () => {
        try {
            console.log("☁️ Fetching Mega Catalog from GitHub CDN...");
            const response = await fetch(CATALOG_URL);
            if (!response.ok) throw new Error("CDN Server error " + response.status);
            const data = await response.json();
            
            // Cache update karo
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            localStorage.setItem(TIME_KEY, now.toString());
            
            // Optional: Dispatch event agar UI update karni ho background me
            window.dispatchEvent(new CustomEvent('library-updated', { detail: data }));
            
            return data;
        } catch (e) {
            console.error("❌ CDN Error:", e);
            return null;
        }
    };

    if (cachedData) {
        console.log("⚡ INSTANT LOAD from Phone Memory!");
        
        // Agar cache 12 ghante se purana hai, background mein naya data le aao
        if (!lastFetchTime || (now - parseInt(lastFetchTime)) > CACHE_VALIDITY) {
            console.log("🔄 Cache is old. Background syncing...");
            fetchFreshData(); // Bina 'await' ke chalne do
        }
        
        return JSON.parse(cachedData);
    } else {
        // First Time User
        console.log("⏳ First time load, fetching from cloud...");
        return await fetchFreshData() || [];
    }
}

// ⚠️ fetchBookDetails is PERMANENTLY DELETED - Chapters are now inside fetchAllBooks!
=======
// --- 📚 1. FETCH BOOK LIST (CLOUDFLARE EDGE) ---
export async function fetchAllBooks() {
    try {
        console.log("☁️ Fetching Catalog from Cloudflare...");
        // 🔥 JUGAD: 'no-cache' ensures browser hamesha fresh file layega!
        const response = await fetch(CATALOG_URL, { cache: 'no-cache' });
        if (!response.ok) throw new Error("Server returned " + response.status);
        return await response.json(); 
    } catch (error) {
        console.error("❌ Cloud Error (Books):", error);
        return [];
    }
}

// --- ⚡ 2. FETCH BOOK DETAILS (CDN LITE) ---
export async function fetchBookDetails(dataPath) {
    try {
        console.log(`📖 Fetching Chapters from: ${dataPath}`);
        // AWS Lambda POST hata ke seedha Cloudflare GET maar rahe hain
        const response = await fetch(`${DB_BASE_URL}/${dataPath}`, { cache: 'no-cache' });
        if (!response.ok) throw new Error("Server returned " + response.status);
        return await response.json();
    } catch (error) {
        console.error("❌ Cloud Error (Details):", error);
        return null;
    }
}
>>>>>>> 8ddcc18 (db)

// --- 💾 2. SAVE PROGRESS (HYBRID: LOCAL + CLOUD) ---
export async function saveUserProgress(bookId, chapterIndex, currentTime, totalDuration) {
    const userId = getUserId();
    if (!userId) return;

    if (currentTime < 5) return;

    let safeDuration = totalDuration;
    if (!safeDuration || isNaN(safeDuration) || !isFinite(safeDuration)) {
        safeDuration = 0; 
    }

    const payload = {
        userId: userId,
        bookId: String(bookId),
        chapterIndex: chapterIndex,
        currentTime: currentTime,
        totalDuration: safeDuration,
        updatedAt: new Date().toISOString()
    };

<<<<<<< HEAD
    // LOCAL SAVE
=======
>>>>>>> 8ddcc18 (db)
    try {
        const localKey = `vibe_progress_${bookId}`;
        localStorage.setItem(localKey, JSON.stringify(payload));
    } catch (e) {
        console.error("Local Save Failed:", e);
    }

<<<<<<< HEAD
    // CLOUD SAVE
=======
>>>>>>> 8ddcc18 (db)
    if (navigator.onLine) {
        try {
            const response = await fetch(PROGRESS_URL, {
                method: "POST",
                keepalive: true, 
                credentials: "omit",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!response.ok) console.warn("❌ Cloud Save Failed (Will use Local)");
        } catch (error) {
            console.warn("⚠️ Network Error (Saved Locally Only)");
        }
    } else {
        console.log("📴 Offline: Progress saved locally.");
    }
}

// --- 🔄 3. FETCH PROGRESS (SMART MERGE) ---
export async function fetchUserProgress() {
    const userId = getUserId();
    if (!userId) return [];

    console.log("📥 Fetching History (Checking Local & Cloud)...");

    let cloudData = [];
    let localData = [];

<<<<<<< HEAD
    // Local Data
=======
>>>>>>> 8ddcc18 (db)
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith("vibe_progress_")) {
                const item = JSON.parse(localStorage.getItem(key));
                if (item.userId === userId) {
                    localData.push(item);
                }
            }
        }
    } catch (e) { console.error("Local Read Error:", e); }

<<<<<<< HEAD
    // Cloud Data
=======
>>>>>>> 8ddcc18 (db)
    if (navigator.onLine) {
        try {
            const response = await fetch(`${GET_PROGRESS_URL}?userId=${userId}`);
            const data = await response.json();
            if (response.ok) {
                cloudData = data.progress || data || [];
            }
        } catch (error) {
            console.warn("⚠️ Cloud Fetch Failed (Using Local Only):", error);
        }
    }

<<<<<<< HEAD
    // Merge Logic
=======
>>>>>>> 8ddcc18 (db)
    const mergedMap = new Map();
    cloudData.forEach(item => mergedMap.set(item.bookId, item));

    localData.forEach(localItem => {
        const cloudItem = mergedMap.get(localItem.bookId);
        if (!cloudItem) {
<<<<<<< HEAD
            mergedMap.set(localItem.bookId, localItem);
=======
            mergedMap.set(localItem.bookId, localItem); 
>>>>>>> 8ddcc18 (db)
        } else {
            const localTime = new Date(localItem.updatedAt).getTime();
            const cloudTime = new Date(cloudItem.updatedAt || 0).getTime();
            if (localTime > cloudTime) {
                console.log(`🔄 Using Local Data for ${localItem.bookId} (Newer)`);
                mergedMap.set(localItem.bookId, localItem);
            }
        }
    });

    const finalHistory = Array.from(mergedMap.values());
    console.log(`✅ History Ready: ${finalHistory.length} items`);
    return finalHistory;
}

// --- 👤 4. GET LOCAL USER DATA ---
export function getLocalUserProfile() {
    return {
        id: localStorage.getItem("vibe_user_id"),
        name: localStorage.getItem("vibe_user_name") || "Vibe User"
    };
}