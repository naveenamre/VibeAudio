// --- 📡 API MANAGER ---

// Jab AWS API Gateway ready hoga, yahan URL daalenge
const API_BASE_URL = "https://api.vibeaudio.cloud"; 

export async function fetchAllBooks() {
    console.log("📡 Fetching books from cloud...");

    // 👇 MOCK DATA (Jab tak Backend ready nahi hota)
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve([
                {
                    bookId: "1",
                    title: "The Hobbit",
                    author: "J.R.R. Tolkien",
                    cover: "https://m.media-amazon.com/images/I/81iLCTUEboL._SL1500_.jpg",
                    category: "Fiction",
                    chapters: [
                        { name: "Intro", url: "https://archive.org/download/chapter-1_202601/Intro.mp3" },
                        { name: "Chapter 1", url: "https://archive.org/download/chapter-1_202601/Chapter1.mp3" }
                    ]
                },
                {
                    bookId: "2",
                    title: "Harry Potter & Philosopher's Stone",
                    author: "J.K. Rowling",
                    cover: "https://m.media-amazon.com/images/I/71FlgBehs4L._SL1500_.jpg",
                    category: "Fantasy",
                    chapters: [
                        { name: "The Boy Who Lived", url: "https://archive.org/download/4-h-0j-3-l-dp-0f-i-251/%E0%A4%B9%E0%A5%88%E0%A4%B0%E0%A5%80_%E0%A4%AA%E0%A5%89%E0%A4%9F%E0%A4%B0_%E0%A4%94%E0%A4%B0_%E0%A4%AA%E0%A4%BE%E0%A4%B0%E0%A4%B8_%E0%A4%AA%E0%A4%A4%E0%A5%8D%E0%A4%A5%E0%A4%B0_%E0%A4%85%E0%A4%A7%E0%A5%8D%E0%A4%AF%E0%A4%BE%E0%A4%AF_1_%E0%A4%B5%E0%A4%B9_%E0%A4%B2%E0%A4%A1%E0%A4%BC%E0%A4%95%E0%A4%BE_%E0%A4%9C%E0%A5%8B_%E0%A4%9C%E0%A4%BC%E0%A4%BF%E0%A4%82%E0%A4%A6%E0%A4%BE_%E0%A4%AC%E0%A4%9A_DTc4ICldsjk%20%281%29.m4a" }
                    ]
                },
                {
                    bookId: "3",
                    title: "Rich Dad Poor Dad",
                    author: "Robert Kiyosaki",
                    cover: "https://m.media-amazon.com/images/I/81bsw6fnUiL._SL1500_.jpg",
                    category: "Finance",
                    chapters: [
                        { name: "Lesson 1", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" }
                    ]
                }
            ]);
        }, 800); // Thoda fake delay taaki loading spinner dikhe
    });
}