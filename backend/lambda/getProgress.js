const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    // 👇 Headers for CORS (Zaroori hai)
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    // 1. User ID nikalo (Query String se: ?userId=user_123)
    const userId = event.queryStringParameters?.userId || "user_123"; // Default for testing

    console.log(`🔍 Fetching progress for: ${userId}`);

    // 2. Database mein Query karo
    const params = {
        TableName: "Vibe_UserProgress",
        KeyConditionExpression: "userId = :u",
        ExpressionAttributeValues: {
            ":u": userId
        }
    };

    try {
        const data = await docClient.send(new QueryCommand(params));
        
        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify(data.Items) // Saari books ka progress bhej do
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