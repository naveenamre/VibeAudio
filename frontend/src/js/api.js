// --- 📡 API MANAGER (Hybrid: Cloudflare Static DB + AWS User Sync) ---

// 👇 TERA NAYA CLOUDFLARE PAGES URL (Lightning Fast ⚡)
const DB_BASE_URL = "https://vibeaudio-db.pages.dev";
const CATALOG_URL = `${DB_BASE_URL}/catalog.json`;

// 👇 TERE LAMBDA URLS (Sirf User Progress & Sync ke liye)
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

// ⚠️ fetchBookDetails is PERMANENTLY DELETED - Chapters are now inside fetchAllBooks!

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

    // LOCAL SAVE
    try {
        const localKey = `vibe_progress_${bookId}`;
        localStorage.setItem(localKey, JSON.stringify(payload));
    } catch (e) {
        console.error("Local Save Failed:", e);
    }

    // CLOUD SAVE
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

    // Local Data
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

    // Cloud Data
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

    // Merge Logic
    const mergedMap = new Map();
    cloudData.forEach(item => mergedMap.set(item.bookId, item));

    localData.forEach(localItem => {
        const cloudItem = mergedMap.get(localItem.bookId);
        if (!cloudItem) {
            mergedMap.set(localItem.bookId, localItem);
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