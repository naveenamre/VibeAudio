// --- 📡 API MANAGER (Cloud Connection Center) ---

// 👇 APNE LAMBDA URLS YAHAN PASTE KARO (Quotes ke andar)

// 1. Get Books Lambda URL (UPDATED: Jo sirf List lata hai)
// Isme wahi purana URL chalega agar tumne code update karke deploy kar diya hai
const API_URL = "https://5adznqob5lrnexreqzi5fmrzly0gzsuz.lambda-url.ap-south-1.on.aws/"; 

// 2. 🆕 Get Book Details Lambda URL (JO ABHI BANAYA HAI)
// Yahan Naya Lambda URL Daalo jo Chapters sign karta hai 👇
const DETAILS_API_URL = "https://sjl6oq3rk6tssebvh3pzrvoy6e0tzhfb.lambda-url.ap-south-1.on.aws/"; 

// 3. Save Progress Lambda URL (Same as before)
const PROGRESS_URL = "https://rrsv2aw64zkkgpdhkamz57ftr40tchro.lambda-url.ap-south-1.on.aws/"; 

// 4. Get Progress Lambda URL (Same as before)
const GET_PROGRESS_URL = "https://2wc6byruxj32gfzka622p22pju0qitcw.lambda-url.ap-south-1.on.aws/"; 

// 5. Auth/Login Lambda URL (Same as before)
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

// --- 📚 1. FETCH BOOK LIST (Lite Mode - Fast) ---
export async function fetchAllBooks() {
    console.log("☁️ Fetching book list (Menu)...");
    try {
        const response = await fetch(API_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log(`✅ Menu received: ${data.length} books`);
        return data; // Isme ab chapters nahi honge, sirf info hogi

    } catch (error) {
        console.error("❌ Cloud Error (Books):", error);
        return [];
    }
}

// --- ⚡ 2. FETCH BOOK DETAILS (Deep Mode - On Click) ---
export async function fetchBookDetails(bookId) {
    console.log(`⚡ Fetching chapters for Book ID: ${bookId}...`);
    try {
        const response = await fetch(DETAILS_API_URL, {
            method: "POST", // Hum ID bhej rahe hain
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookId: bookId })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("✅ Chapters signed & received!");
        return data; // Ye full book object return karega WITH chapters

    } catch (error) {
        console.error("❌ Cloud Error (Details):", error);
        return null;
    }
}

// --- 👤 FETCH USER PROFILE ---
export async function fetchUserProfile() {
    const user = getCurrentUser();
    return {
        name: user ? user.name : "Guest Vibe",
        streak: 5, 
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
        userId: user.userId,
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
    if (!user) return [];

    console.log(`☁️ Checking cloud progress for ${user.name}...`);
    try {
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