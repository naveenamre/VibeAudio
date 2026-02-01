// ✅ AWS SDK v3
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);

// 🔥 FIX: Table name ab sahi hai
const TABLE_NAME = "Vibe_Users"; 

exports.handler = async (event) => {
    // Headers (AWS Console handle kar raha hai, par safe side rakh lete hain)
    const headers = { "Content-Type": "application/json" };

    if (event.requestContext && event.requestContext.http.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const validCodes = ["VIBE2026", "ADMIN_GOD", "BETA_TEST"];

    try {
        const body = event.body ? JSON.parse(event.body) : {};

        // --- 🔥 SCENARIO 1: CLERK SYNC ---
        if (body.action === 'sync') {
            const userId = body.userId;
            const name = body.name || "Vibe User";

            if (!userId) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({ error: "Missing userId" })
                };
            }

            // DynamoDB Write
            await dynamo.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    userId: userId,   
                    name: name,
                    tier: 'free',
                    lastLogin: new Date().toISOString()
                }
            }));

            console.log(`✅ Synced User: ${name}`);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ success: true, message: "User Synced ✅" })
            };
        }

        // --- 🔒 SCENARIO 2: MANUAL LOGIN ---
        const enteredCode = body.code ? body.code.toUpperCase().trim() : "";
        const enteredName = body.name ? body.name.trim() : "Unknown";

        if (validCodes.includes(enteredCode)) {
            const safeName = enteredName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
            const manualUserId = `${enteredCode}_${safeName}`;

            await dynamo.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    userId: manualUserId,
                    name: enteredName,
                    tier: 'manual',
                    lastLogin: new Date().toISOString()
                }
            }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    userId: manualUserId, 
                    name: enteredName, 
                    message: "Welcome to Vibe!" 
                })
            };
        }

        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ success: false, error: "Invalid Access Code" })
        };

    } catch (e) {
        console.error("❌ SERVER ERROR:", e);
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ error: "Backend Crash", details: e.message }) 
        };
    }
};