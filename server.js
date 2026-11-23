
const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

// Homepage route
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"), (error) => {
        if (error) {
            console.error("Homepage error:", error);
            if (!res.headersSent) {
                res.status(500).send("Homepage could not be loaded. Check index.html.");
            }
        }
    });
});

// Gemini API setup
if (!process.env.GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing!");
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
        const message = req.body?.message;

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a valid message."
            });
        }

        console.log("User message received:", message);
        console.log("Connecting to Gemini...");

        const response = await ai.models.generateContent({
            model: MODEL,
            contents: message.trim(),
            config: {
                maxOutputTokens: 256,
                temperature: 0.7
            }
        });

        const reply = response.text;

        if (!reply) {
            throw new Error("Gemini returned an empty response.");
        }

        console.log("Gemini reply received!");

        return res.json({ reply });

    } catch (error) {
        console.error("GEMINI ERROR:", error);

        if (!res.headersSent) {
            return res.status(500).json({
                error: error.message || "Gemini API error"
            });
        }
    }
});

// Handle unknown routes
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log("MY AI CHATBOT SERVER RUNNING");
    console.log(`Port: ${PORT}`);
    console.log(`Model: ${MODEL}`);
});
