// --- 📡 API MANAGER (Cloud Connection Center) ---

// 👇 APNE LAMBDA URLS YAHAN PASTE KARO (Quotes ke andar)
// 1. Get Books Lambda URL
const API_URL = "https://5adznqob5lrnexreqzi5fmrzly0gzsuz.lambda-url.ap-south-1.on.aws/"; 

// 2. Save Progress Lambda URL
const PROGRESS_URL = "https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/"; 

// 3. Get Progress Lambda URL
const GET_PROGRESS_URL = "https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/"; 

// 4. Auth/Login Lambda URL (🆕 Naya wala)
const AUTH_URL = "https://aj7bwk3d72tzj5n2r43lusryg40tosik.lambda-url.ap-south-1.on.aws/"; 


// --- 🛠️ HELPER: GET CURRENT USER ---
function getCurrentUser() {
    const stored = localStorage.getItem('vibe_user');
    return stored ? JSON.parse(stored) : null;
}

// --- 🔐 LOGIN FUNCTION ---
export async function loginUser(code, name) {
    try {
        console.log("🔐 Attempting Login...");
        const response = await fetch(AUTH_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: code, name: name })
        });
        
        const data = await response.json();
        return data; // Returns { success: true, userId: "...", name: "..." }
    } catch (error) {
        console.error("Login Error:", error);
        return { success: false, error: "Network Error" };
    }
}

// --- 📚 FETCH BOOKS ---
export async function fetchAllBooks() {
    console.log("☁️ Fetching books from AWS Cloud...");
    try {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("✅ Books received:", data);
        return data;

    } catch (error) {
        console.error("❌ Cloud Error (Books):", error);
        return [];
    }
}

// --- 👤 FETCH USER PROFILE ---
export async function fetchUserProfile() {
    const user = getCurrentUser();
    return {
        name: user ? user.name : "Guest Vibe", // ✨ Asli Naam
        streak: 5, // Abhi ke liye dummy (baad me database se layenge)
        totalBooks: 12,
        totalHours: "45h"
    };
}

// --- 💾 SAVE PROGRESS (Cloud Memory) ---
export async function saveUserProgress(bookId, chapterIndex, currentTime, totalDuration) {
    const user = getCurrentUser();
    
    if (!user) {
        console.log("⚠️ Guest user - Progress not saved to cloud.");
        return;
    }

    const payload = {
        userId: user.userId, // ✨ Dynamic User ID
        bookId: bookId.toString(),
        chapterIndex: chapterIndex,
        currentTime: currentTime,
        totalDuration: totalDuration
    };

    try {
        await fetch(PROGRESS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        console.log("💾 Progress Saved to Cloud!");
    } catch (error) {
        console.error("❌ Save Failed:", error);
    }
}

// --- 🔄 FETCH PROGRESS (Smart Resume) ---
export async function fetchUserProgress() {
    const user = getCurrentUser();
    if (!user) return []; // Guest ke liye empty

    console.log(`☁️ Checking cloud progress for ${user.name}...`);
    try {
        // URL me userId bhejo query parameter ki tarah
        const response = await fetch(`${GET_PROGRESS_URL}?userId=${user.userId}`);
        
        if (!response.ok) throw new Error("Failed to fetch progress");
        
        const data = await response.json();
        console.log("📂 Loaded Progress:", data);
        return data;
    } catch (error) {
        console.error("❌ Progress Load Error:", error);
        return [];
    }
}