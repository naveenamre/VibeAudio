// 👇 1. Ye line sabse upar honi chahiye (Environment Variables load karne ke liye)
require('dotenv').config();

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

// 👇 2. Ab Keys seedha .env se aayengi (Secure & Clean)
const client = new DynamoDBClient({
    region: process.env.AWS_REGION, // .env se 'ap-south-1' lega
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,     // .env se AKIA... lega
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY // .env se Secret lega
    }
});

const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = "Vibe_Books";

async function cleanDatabase() {
    console.log(`🧹 Starting Cleaning Mission for: ${TABLE_NAME}...`);

    try {
        const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        const items = data.Items;

        if (!items || items.length === 0) {
            console.log("✅ Table is already empty! (Safai pehle se thi)");
            return;
        }

        console.log(`⚠️ Found ${items.length} items to delete...`);

        for (const item of items) {
            await docClient.send(new DeleteCommand({
                TableName: TABLE_NAME,
                Key: { bookId: item.bookId }
            }));
            console.log(`🗑️ Deleted: ${item.title || item.bookId}`);
        }

        console.log("✨ All Clean! Table ekdum chaka-chak hai.");

    } catch (err) {
        console.error("❌ Error:", err);
        console.log("💡 Hint: Check agar .env file root folder me hai aur keys sahi hain.");
    }
}

cleanDatabase();