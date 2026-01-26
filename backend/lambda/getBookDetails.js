const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// --- CLIENTS (Global Cache) ---
const dbClient = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(dbClient);
const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
    }
});

const TABLE_NAME = "Vibe_Books";

// Helper: Sign URL
async function signUrl(path) {
    if (!path || path.startsWith("http")) return path;
    try {
        const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: path });
        return await getSignedUrl(s3, command, { expiresIn: 3600 });
    } catch (e) { return null; }
}

exports.handler = async (event) => {
    // CORS Handling
    if (event.requestContext?.http?.method === "OPTIONS") {
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }
        };
    }

    try {
        // 1. Frontend se Book ID nikalo
        const body = JSON.parse(event.body || "{}");
        const { bookId } = body;

        if (!bookId) {
            return { statusCode: 400, body: JSON.stringify({ error: "Book ID required" }) };
        }

        console.log(`⚡ Fetching Details for: ${bookId}`);

        // 2. DB se sirf wo ek book nikalo
        const data = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: { bookId: bookId }
        }));

        const book = data.Item;
        if (!book) {
            return { statusCode: 404, body: JSON.stringify({ error: "Book not found" }) };
        }

        // 3. Sirf iske chapters sign karo (Super Fast)
        const signedChapters = await Promise.all((book.chapters || []).map(async (chap) => ({
            name: chap.name,
            url: await signUrl(chap.url)
        })));

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...book, chapters: signedChapters })
        };

    } catch (err) {
        console.error("❌ Error:", err);
        return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
    }
};