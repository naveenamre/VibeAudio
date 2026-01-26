const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

// --- 1. SETUP (Sirf DB chahiye, S3 ki zarurat nahi ab) ---
const dbClient = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(dbClient);
const TABLE_NAME = "Vibe_Books";

exports.handler = async (event) => {
    // OPTIONS request (CORS) handling
    if (event.requestContext?.http?.method === "OPTIONS") {
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
        };
    }

    try {
        console.log("⚡ Fetching Book List (Lite Mode)...");
        
        // Sirf DB Scan karo
        const data = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));
        
        // Data ko clean karo (Chapters hata do taaki payload chhota rahe)
        const lightBooks = data.Items.map(book => ({
            bookId: book.bookId,
            title: book.title,
            author: book.author,
            cover: book.cover, // Amazon link hai, seedha use hoga
            moods: book.moods,
            totalChapters: book.chapters ? book.chapters.length : 0 // Sirf count bhejo
        }));

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" }, // CORS AWS handle karega
            body: JSON.stringify(lightBooks)
        };

    } catch (err) {
        console.error("❌ Error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};