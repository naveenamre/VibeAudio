// --- 📡 API MANAGER (Dummy Data Center) ---

export async function fetchAllBooks() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                {
                    bookId: "1",
                    title: "The Psychology of Money",
                    author: "Morgan Housel",
                    cover: "https://m.media-amazon.com/images/I/71FlgBehs4L._SL1500_.jpg",
                    moods: ["💰 Finance", "🧠 Smart", "📈 Growth"], // ✨ New: Mood Metadata
                    chapters: [
                        { name: "Intro", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
                        { name: "Chapter 1", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" }
                    ],
                    // ✨ New: Timestamp Comments (SoundCloud Style)
                    comments: [
                        { time: 10, user: "Rohan", text: "Bhai kya line boli! 🔥" },
                        { time: 45, user: "Simran", text: "Mind blown 🤯" },
                        { time: 120, user: "Amit", text: "Ye chapter best hai." }
                    ]
                },
                {
                    bookId: "2",
                    title: "Solo Leveling (Audio)",
                    author: "Chugong",
                    cover: "https://m.media-amazon.com/images/I/81iLCTUEboL._SL1500_.jpg",
                    moods: ["⚔️ Action", "🌌 Night-Vibe", "🔥 Hype"], // ✨ New: Mood Metadata
                    chapters: [
                        { name: "Episode 1", url: "https://archive.org/download/chapter-1_202601/Intro.mp3" }
                    ],
                    comments: [
                        { time: 5, user: "ShadowArmy", text: "ARISE! ☠️" }
                    ]
                }
            ]);
        }, 500);
    });
}

// ✨ New: User Profile with Streak
export async function fetchUserProfile() {
    return {
        name: "Captain Naksh",
        streak: 5, // 🔥 5 Day Streak
        totalBooks: 12,
        totalHours: "45h"
    };
}