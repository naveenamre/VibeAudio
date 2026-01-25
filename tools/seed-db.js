require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

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

// --- 2. FOLDER CONFIG ---
// Hum 'tools' folder me hain, to ek step piche jaake 'books_data' dhundenge
const BOOKS_DIR = path.join(__dirname, '../books_data');

async function seedDatabase() {
    console.log(`🚀 Starting Database Seeding from folder: ${BOOKS_DIR}`);

    // Check agar folder exist karta hai
    if (!fs.existsSync(BOOKS_DIR)) {
        console.error(`❌ Error: Folder '${BOOKS_DIR}' nahi mila! Pehle folder banao.`);
        return;
    }

    // Saari files read karo
    const files = fs.readdirSync(BOOKS_DIR);
    const jsonFiles = files.filter(file => file.endsWith('.json'));

    if (jsonFiles.length === 0) {
        console.log("⚠️ Folder me koi .json file nahi mili.");
        return;
    }

    console.log(`📚 Found ${jsonFiles.length} books. Uploading...`);

    // Loop through each file
    for (const file of jsonFiles) {
        const filePath = path.join(BOOKS_DIR, file);
        
        try {
            // File padho aur JSON parse karo
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            const book = JSON.parse(fileContent);

            // Validation: Check karo zaroori cheezein hain ya nahi
            if (!book.bookId || !book.title) {
                console.log(`⚠️ Skipping ${file}: 'bookId' or 'title' is missing.`);
                continue;
            }

            // DynamoDB me daalo
            await docClient.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: book
            }));
            
            console.log(`✅ Uploaded: ${book.title} (ID: ${book.bookId})`);

        } catch (err) {
            console.error(`❌ Error uploading ${file}:`, err.message);
        }
    }

    console.log("🎉 All books processed!");
}

seedDatabase();