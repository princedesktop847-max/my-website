
const express = require("express");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Gemini API setup
if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY .env file mein nahi mili!");
    process.exit(1);
}

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const MODEL = "gemini-3.5-flash";

// Server status
app.get("/api/status", (req, res) => {
    res.json({
        server: "Running",
        apiKeyLoaded: true,
        model: MODEL
    });
});

// Chat API
app.post("/api/chat", async (req, res) => {
    try {
        const message = req.body.message;

        if (!message || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a message."
            });
        }

        console.log("User message received:", message);
        console.log("Connecting to Gemini...");

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: message
        });

        console.log("Gemini reply received!");

        res.json({
            reply: response.text
        });

    } catch (error) {
        console.error("GEMINI ERROR:", error);

        res.status(500).json({
            error: error.message || "Gemini API error"
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log("MY AI CHATBOT SERVER RUNNING");
    console.log(`Website: http://localhost:${PORT}`);
    console.log(`Model: ${MODEL}`);
});
