// --- 📡 API MANAGER (Clerk & Cloud Integrated) ---

// 👇 TERE LAMBDA URLS
const API_URL = "https://5adznqob5lrnexreqzi5fmrzly0gzsuz.lambda-url.ap-south-1.on.aws/"; 
const DETAILS_API_URL = "https://sjl6oq3rk6tssebvh3pzrvoy6e0tzhfb.lambda-url.ap-south-1.on.aws/"; 
const PROGRESS_URL = "https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/"; 
const GET_PROGRESS_URL = "https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/"; 
// 👇 User Sync URL
const SYNC_USER_URL = "https://aj7bwk3d72tzj5n2r43lusryg40tosik.lambda-url.ap-south-1.on.aws/"; 

// --- 🧠 HELPER: GET REAL USER ID ---
function getUserId() {
    const userId = localStorage.getItem("vibe_user_id");
    if (!userId) {
        if (!window.location.href.includes('index.html')) {
            window.location.href = "../../index.html";
        }
        return null;
    }
    return userId;
}

// --- 🔄 0. SYNC USER WITH DATABASE (SMART DEBUG VERSION) ---
export async function syncUserProfile() {
    const userId = getUserId();
    const name = localStorage.getItem("vibe_user_name") || "Vibe User";

    if (!userId) return;

    console.log("☁️ Syncing User Profile...");
    
    try {
        const response = await fetch(SYNC_USER_URL, {
            method: "POST",
            keepalive: true,
            credentials: "omit", // CORS Fix
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                userId: userId, 
                name: name,      
                action: "sync"   
            })
        });

        // 🔥 Response ko JSON me convert karo taaki error message padh sakein
        const result = await response.json();

        // Agar Server ne 200 OK nahi bola, toh Error dikhao
        if (!response.ok) {
            console.error("❌ SYNC FAILED (Server Error):", result);
            return;
        }

        console.log("✅ User Synced Successfully!", result);

    } catch (e) {
        console.warn("⚠️ Network/Connection Error:", e);
    }
}

// --- 📚 1. FETCH BOOK LIST ---
export async function fetchAllBooks() {
    console.log("☁️ Fetching book list...");
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Failed");
        return await response.json(); 
    } catch (error) {
        console.error("❌ Cloud Error (Books):", error);
        return [];
    }
}

// --- ⚡ 2. FETCH BOOK DETAILS ---
export async function fetchBookDetails(bookId) {
    try {
        const response = await fetch(DETAILS_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookId: bookId })
        });
        if (!response.ok) throw new Error("Failed");
        return await response.json();
    } catch (error) {
        console.error("❌ Cloud Error (Details):", error);
        return null;
    }
}

// --- 💾 3. SAVE PROGRESS (CORS FIXED) ---
export async function saveUserProgress(bookId, chapterIndex, currentTime, totalDuration) {
    const userId = getUserId();
    if (!userId) return;

    const payload = {
        userId: userId,
        bookId: String(bookId),
        chapterIndex: chapterIndex,
        currentTime: currentTime,
        totalDuration: totalDuration,
        updatedAt: new Date().toISOString()
    };

    try {
        await fetch(PROGRESS_URL, {
            method: "POST",
            keepalive: true, 
            credentials: "omit", // CORS Fix
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (error) {
        console.error("❌ Save Failed:", error);
    }
}

// --- 🔄 4. FETCH PROGRESS ---
export async function fetchUserProgress() {
    const userId = getUserId();
    if (!userId) return [];

    try {
        const response = await fetch(`${GET_PROGRESS_URL}?userId=${userId}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.progress || data;
    } catch (error) {
        return [];
    }
}

// --- 👤 5. GET LOCAL USER DATA (For UI) ---
export function getLocalUserProfile() {
    return {
        id: localStorage.getItem("vibe_user_id"),
        name: localStorage.getItem("vibe_user_name") || "Vibe User"
    };
}