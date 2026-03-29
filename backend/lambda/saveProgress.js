const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

function toSafeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (event.requestContext?.http?.method === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    if (!event.body) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Empty Body" }) };
    }

    let body;
    try {
        body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } catch (error) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
    }

    const userId = String(body.userId || "").trim();
    const bookId = String(body.bookId || "").trim();

    if (!userId || !bookId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "userId and bookId are required" })
        };
    }

    const chapterIndex = Math.max(0, Math.floor(toSafeNumber(body.chapterIndex, 0)));
    const currentTime = Math.max(0, toSafeNumber(body.currentTime, 0));
    const totalDuration = Math.max(0, toSafeNumber(body.totalDuration, 0));
    const totalChapters = Math.max(0, Math.floor(toSafeNumber(body.totalChapters, 0)));
    const currentChapterFinished = totalDuration > 0 && currentTime >= totalDuration * 0.98;
    const legacyFinishedFlag = typeof body.isFinished === "boolean" ? body.isFinished : false;
    const bookFinished = typeof body.bookFinished === "boolean"
        ? body.bookFinished
        : Boolean(totalChapters && chapterIndex >= totalChapters - 1 && currentChapterFinished)
            || Boolean(!totalChapters && legacyFinishedFlag && currentChapterFinished);
    const lastInteractionAt = body.lastInteractionAt || body.updatedAt || body.lastUpdated || new Date().toISOString();

    const item = {
        userId,
        bookId,
        chapterIndex,
        currentTime,
        totalDuration,
        currentChapterFinished,
        bookFinished,
        lastInteractionAt
    };

    if (totalChapters > 0) {
        item.totalChapters = totalChapters;
    }

    try {
        await docClient.send(new PutCommand({
            TableName: "Vibe_UserProgress",
            Item: item
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ message: "Progress saved", progress: item })
        };
    } catch (error) {
        console.error("DB Error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
