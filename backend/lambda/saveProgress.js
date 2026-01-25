const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    // 👇 1. CORS Headers (Ye Passport hai tera)
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    // 👇 2. Handle Preflight Request (Browser puchta hai: "Kya main data bheju?")
    // Agar request method OPTIONS hai, toh bas headers bhej ke 200 OK bol do.
    if (event.requestContext && event.requestContext.http.method === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: headers,
            body: ''
        };
    }

    console.log("💾 Saving Progress...", event.body);

    if (!event.body) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Empty Body" }) };
    }

    let body;
    try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    const { userId, bookId, chapterIndex, currentTime, totalDuration } = body;

    const params = {
        TableName: "Vibe_UserProgress",
        Item: {
            userId: userId,
            bookId: bookId.toString(),
            chapterIndex: chapterIndex || 0,
            currentTime: currentTime || 0,
            totalDuration: totalDuration || 0,
            lastUpdated: new Date().toISOString(),
            isFinished: (currentTime > (totalDuration * 0.9))
        }
    };

    try {
        await docClient.send(new PutCommand(params));
        return {
            statusCode: 200,
            headers: headers, // ✅ Headers yahan bhi return karna zaroori hai
            body: JSON.stringify({ message: "Progress Saved! ✅" })
        };
    } catch (err) {
        console.error("❌ DB Error:", err);
        return { 
            statusCode: 500, 
            headers: headers, 
            body: JSON.stringify({ error: err.message }) 
        };
    }
};