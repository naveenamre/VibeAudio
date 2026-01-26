require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // 🔐 Hash banane ke liye
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

// --- 1. AWS CONFIG ---
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "Vibe_Books";
const BOOKS_DIR = path.join(__dirname, '../books_data');

// --- 🧠 HELPER: Create Digital Fingerprint (Hash) ---
// Ye book ke content ka ek unique code banata hai. Agar content badla, to code badlega.
function generateHash(data) {
    const str = JSON.stringify(data);
    return crypto.createHash('md5').update(str).digest('hex');
}

async function seedDatabase() {
    console.log(`🚀 Starting SMART Sync...`);

    if (!fs.existsSync(BOOKS_DIR)) {
        console.error(`❌ Error: Folder '${BOOKS_DIR}' nahi mila!`);
        return;
    }

    // --- STEP 1: LOCAL FILES READ KARO ---
    const files = fs.readdirSync(BOOKS_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));
    
    // Local books ko ek Map me store karenge (ID -> Data)
    const localBooksMap = new Map();

    console.log(`📂 Reading ${jsonFiles.length} local files...`);

    for (const file of jsonFiles) {
        try {
            const content = fs.readFileSync(path.join(BOOKS_DIR, file), 'utf-8');
            const book = JSON.parse(content);
            
            if (!book.bookId) {
                console.log(`⚠️ Skipping ${file}: No bookId found.`);
                continue;
            }

            // Hum content ka hash bhi add kar denge taaki agli baar compare kar sakein
            // Note: Hum hash ko book object me temporary add kar rahe hain check karne ke liye
            const contentHash = generateHash(book);
            book.versionHash = contentHash; // ✨ New Field for Tracking
            
            localBooksMap.set(book.bookId, book);

        } catch (err) {
            console.error(`❌ Error reading ${file}:`, err.message);
        }
    }

    // --- STEP 2: DATABASE SCAN KARO (EXISTING DATA) ---
    console.log(`☁️ Scanning DynamoDB for existing books...`);
    const dbData = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
    const dbBooks = dbData.Items || [];
    
    console.log(`☁️ Found ${dbBooks.length} books in Cloud.`);

    // --- STEP 3: GARBAGE COLLECTION (DELETE GHOST ENTRIES) ---
    // Agar DB me koi book hai jo Local me nahi hai -> DELETE karo
    for (const dbBook of dbBooks) {
        if (!localBooksMap.has(dbBook.bookId)) {
            console.log(`🗑️ Deleting Ghost Entry: ${dbBook.title} (ID: ${dbBook.bookId})`);
            await docClient.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { bookId: dbBook.bookId }
            }));
        }
    }

    // --- STEP 4: SMART UPLOAD (UPDATE ONLY IF CHANGED) ---
    let updatedCount = 0;
    let skippedCount = 0;

    for (const [id, localBook] of localBooksMap) {
        // DB me ye book dhundo
        const dbBook = dbBooks.find(b => b.bookId === id);

        // CHECK: Kya book already hai aur content same hai?
        if (dbBook && dbBook.versionHash === localBook.versionHash) {
            console.log(`⏭️ Skipped (No Change): ${localBook.title}`);
            skippedCount++;
            continue; 
        }

        // Agar nahi hai, ya hash alag hai -> UPLOAD
        const action = dbBook ? "🔄 Updating" : "✨ New Upload";
        console.log(`${action}: ${localBook.title}`);

        await docClient.send(new PutCommand({
            TableName: TABLE_NAME,
            Item: localBook
        }));
        updatedCount++;
    }

    console.log(`\n🎉 SYNC COMPLETE!`);
    console.log(`✅ Updated/Added: ${updatedCount}`);
    console.log(`⏭️ Skipped: ${skippedCount}`);
    console.log(`🗑️ Cleaned Ghosts: We did that in real-time.`);
}

seedDatabase();