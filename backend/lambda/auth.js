exports.handler = async (event) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    if (event.requestContext && event.requestContext.http.method === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // 👇 VALID CODES KI LIST (Isme koi bhi naam nahi, bas code)
    const validCodes = [
        "VIBE2026",    // Doston ke liye
        "ADMIN_GOD",   // Tere liye
        "BETA_TEST"    // Testers ke liye
    ];

    try {
        const body = JSON.parse(event.body || "{}");
        const enteredCode = body.code ? body.code.toUpperCase() : "";
        const enteredName = body.name ? body.name.trim() : "Unknown Vibe";

        // Check: Kya Code list mein hai?
        if (validCodes.includes(enteredCode)) {
            
            // ✅ UNIQUE ID GENERATOR
            // Logic: Code + Name (Spaces hata ke)
            // Example: "VIBE2026" + "Rohan" = "VIBE2026_ROHAN"
            const safeName = enteredName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
            const userId = `${enteredCode}_${safeName}`;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ 
                    success: true, 
                    userId: userId,
                    name: enteredName, // User ka asli naam wapas bhejo
                    message: `Welcome to the squad, ${enteredName}! 🔥`
                })
            };
        } else {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ success: false, error: "Wrong Code! No Entry 🚫" })
            };
        }
    } catch (e) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Server Error" }) };
    }
};