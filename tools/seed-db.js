const path = require('path');
// 👇 Ye line sabse important hai. Ye ensure karti hai ki .env root folder se hi load ho.
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs');
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

// Debugging: Check karo ki keys load hui ya nahi
if (!process.env.AWS_REGION) {
    console.error("❌ ERROR: .env file load nahi hui! Path check karo.");
    process.exit(1);
}

// AWS Connection Setup
const client = new DynamoDBClient({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});
const docClient = DynamoDBDocumentClient.from(client);

// Load Data from JSON file
// Ye bhi path.join use kar raha hai taaki data file sahi mile
const dataPath = path.join(__dirname, '../database/sample-data.json');

try {
    const rawData = fs.readFileSync(dataPath);
    var booksData = JSON.parse(rawData);
} catch (error) {
    console.error("❌ Error reading sample-data.json:", error.message);
    process.exit(1);
}

async function uploadBooks() {
    console.log("🚀 Tool Started: Reading from database/sample-data.json...");
    console.log(`📚 Found ${booksData.length} books to upload.`);

    for (const book of booksData) {
        const params = {
            TableName: "Vibe_Books",
            Item: book
        };

        try {
            await docClient.send(new PutCommand(params));
            console.log(`✅ Uploaded: ${book.title}`);
        } catch (err) {
            console.error(`❌ Error uploading ${book.title}:`, err);
        }
    }
    console.log("🎉 Database Seeded Successfully!");
}

uploadBooks();