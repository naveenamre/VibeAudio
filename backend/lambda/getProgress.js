const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({ region: "ap-south-1" });
const docClient = DynamoDBDocumentClient.from(client);

exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (event.requestContext?.http?.method === "OPTIONS") {
        return {
            statusCode: 200,
            headers,
            body: ""
        };
    }

    const userId = String(event.queryStringParameters?.userId || "").trim();
    if (!userId) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: "userId is required" })
        };
    }

    try {
        const data = await docClient.send(new QueryCommand({
            TableName: "Vibe_UserProgress",
            KeyConditionExpression: "userId = :u",
            ExpressionAttributeValues: {
                ":u": userId
            }
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ progress: Array.isArray(data.Items) ? data.Items : [] })
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
