// --- 📡 API MANAGER (Clerk & Cloud Integrated) ---

// 👇 TERE LAMBDA URLS (Make sure these are correct)
const API_URL = "https://5adznqob5lrnexreqzi5fmrzly0gzsuz.lambda-url.ap-south-1.on.aws/"; 
const DETAILS_API_URL = "https://sjl6oq3rk6tssebvh3pzrvoy6e0tzhfb.lambda-url.ap-south-1.on.aws/"; 
const PROGRESS_URL = "https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/"; 
const GET_PROGRESS_URL = "https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/"; 
const SYNC_USER_URL = "https://aj7bwk3d72tzj5n2r43lusryg40tosik.lambda-url.ap-south-1.on.aws/"; 

// --- 🧠 HELPER: GET REAL USER ID ---
function getUserId() {
    const userId = localStorage.getItem("vibe_user_id");
    if (!userId) {
        if (window.location.pathname.includes('app.html')) {
            // Silently fail or redirect if critical
            // window.location.href = "../../index.html";
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
        console.warn("⚠️ Sync Network Error:", e);
    }
}

// --- 📚 1. FETCH BOOK LIST ---
export async function fetchAllBooks() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("Server returned " + response.status);
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
        if (!response.ok) throw new Error("Server returned " + response.status);
        return await response.json();
    } catch (error) {
        console.error("❌ Cloud Error (Details):", error);
        return null;
    }
}

// --- 💾 3. SAVE PROGRESS (FIXED & ROBUST) ---
export async function saveUserProgress(bookId, chapterIndex, currentTime, totalDuration) {
    const userId = getUserId();
    if (!userId) return;

    // 🔥 FIX: Handle Infinity/NaN duration
    let safeDuration = totalDuration;
    
    if (!safeDuration || isNaN(safeDuration) || !isFinite(safeDuration)) {
        // Agar duration pata nahi hai, toh 0 mat bhejo (nahi to backend "Finished" maan lega).
        // Ek dummy bada value bhej do ya 0 bhej ke backend logic sambhalo.
        // Filhal hum 0 bhej rahe hain par console warn karenge.
        console.warn("⚠️ Duration is Infinity/NaN. Saving anyway.");
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

    console.log("💾 Saving Progress... ", payload);

    try {
        const response = await fetch(PROGRESS_URL, {
            method: "POST",
            keepalive: true, 
            credentials: "omit",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok) {
            console.error("❌ SAVE FAILED (Server):", result);
        } else {
            console.log("✅ Progress Saved!");
        }

    } catch (error) {
        console.error("❌ Save Network Error:", error);
    }
}

// --- 🔄 4. FETCH PROGRESS ---
export async function fetchUserProgress() {
    const userId = getUserId();
    if (!userId) return [];

    console.log("📥 Fetching User History...");

    try {
        const response = await fetch(`${GET_PROGRESS_URL}?userId=${userId}`);
        const data = await response.json();

        if (!response.ok) {
            console.error("❌ FETCH HISTORY FAILED:", data);
            return [];
        }
        
        console.log("✅ History Loaded:", data.length || 0, "items");
        
        // Handle Wrapper Format (agar backend { progress: [...] } bhej raha ho)
        return data.progress || data || []; 
    } catch (error) {
        console.error("❌ History Network Error:", error);
        return [];
    }
}

// --- 👤 5. GET LOCAL USER DATA ---
export function getLocalUserProfile() {
    return {
        id: localStorage.getItem("vibe_user_id"),
        name: localStorage.getItem("vibe_user_name") || "Vibe User"
    };
}