
const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "22mb" }));
app.use("/.well-known", express.static(path.join(__dirname, ".well-known")));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!GEMINI_API_KEY && !GROQ_API_KEY && !OPENAI_API_KEY) {
    console.error("ERROR: No AI API key found in .env");
    process.exit(1);
}

const ai = GEMINI_API_KEY
    ? new GoogleGenAI({ apiKey: GEMINI_API_KEY })
    : null;

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENAI_MODEL = "gpt-4o-mini";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Groq / OpenAI text API

async function callChatAPI(provider, apiKey, model, message, history = []) {
    const url = provider === "Groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";

    const messages = [
        {
            role: "system",
            content: "You are UR AI, a helpful, accurate and friendly AI assistant. Give clear and useful answers."
        },
        ...history
            .filter(turn =>
                turn &&
                ["user", "assistant"].includes(turn.role) &&
                typeof turn.content === "string"
            )
            .slice(-20)
            .map(turn => ({
                role: turn.role === "assistant" ? "assistant" : "user",
                content: turn.content
            })),
        {
            role: "user",
            content: message
        }
    ];

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model,
            messages,
            temperature: 0.7,
            max_tokens: 700
        }),
        signal: AbortSignal.timeout(60000)
    });

    if (!response.ok) {
        const details = await response.text();
        throw new Error(
            `${provider} API error ${response.status}: ${details.slice(0, 300)}`
        );
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
        throw new Error(`${provider} returned an empty response.`);
    }

    return reply;
}

// Gemini with retry

async function callGemini(message, files, history = []) {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const contents = [];
            

            
            for (const turn of history) {
                if (
                    (turn.role === "user" || turn.role === "model") &&
                    typeof turn.content === "string" &&
                    turn.content.trim()
                ) {
                    contents.push({
                        role: turn.role,
                        parts: [{ text: turn.content }]
                    });
                }
            }

            const parts = [{ text: message }];

            for (const file of files) {
                parts.push({
                    inlineData: {
                        mimeType: file.mimeType,
                        data: file.data
                    }
                });
            }

            contents.push({
                role: "user",
                parts
            });

            const response = await ai.models.generateContent({
                model: GEMINI_MODEL,
                contents,
                config: {
                    maxOutputTokens: 700,
                    temperature: 0.7
                }
            });

            if (!response.text) {
                throw new Error("Gemini returned an empty response.");
            }

            return response.text;

        } catch (error) {
            lastError = error;
            const status = Number(error.status || error.code);

            if (![429, 500, 502, 503, 504].includes(status) || attempt === 2) {
                throw error;
            }

            console.log("Gemini temporary error. Retrying...");
            await sleep(attempt * 2000);
        }
    }

    throw lastError;
}


// Status endpoint
app.get("/api/status", (req, res) => {
    res.json({
        server: "Running",
        providers: {
            gemini: Boolean(GEMINI_API_KEY),
            groq: Boolean(GROQ_API_KEY),
            openai: Boolean(OPENAI_API_KEY)
        }
    });
});

// Chat endpoint
app.post("/api/chat", async (req, res) => {
    try {
        const message = req.body?.message;
        const files = req.body?.files ?? [];
        const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter(turn =>
            turn &&
            ["user", "model"].includes(turn.role) &&
            typeof turn.content === "string"
        )
        .slice(-20)
    : [];

        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a valid message."
            });
        }

        if (!Array.isArray(files) || files.length > 3) {
            return res.status(400).json({
                error: "Please attach no more than 3 files."
            });
        }

        const allowedMimeTypes = new Set([
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif",
            "application/pdf"
        ]);

        for (const file of files) {
            if (
                !file ||
                typeof file.name !== "string" ||
                typeof file.mimeType !== "string" ||
                typeof file.data !== "string" ||
                !allowedMimeTypes.has(file.mimeType)
            ) {
                return res.status(400).json({
                    error: "Only images and PDF files are supported."
                });
            }

            if (Buffer.byteLength(file.data, "base64") > 5 * 1024 * 1024) {
                return res.status(400).json({
                    error: `${file.name} is larger than 5 MB.`
                });
            }

            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) {
                return res.status(400).json({
                    error: `Invalid file data for ${file.name}.`
                });
            }
        }

        const cleanMessage = message.trim();

        console.log("User message received:", cleanMessage);
        console.log("Attached files:", files.length);

        const providers = [];

        if (GEMINI_API_KEY) {
            providers.push({
                name: "Gemini",
                run: () => callGemini(cleanMessage, files, history)
            });
        }

        // Groq and OpenAI are text-only fallbacks here.
        if (files.length === 0 && GROQ_API_KEY) {
            providers.push({
                name: "Groq",
                run: () => callChatAPI(
                    "Groq",
                    GROQ_API_KEY,
                    GROQ_MODEL,
                    cleanMessage,
                    history
                )
            });
        }

        if (files.length === 0 && OPENAI_API_KEY) {
            providers.push({
                name: "OpenAI",
                run: () => callChatAPI(
                    "OpenAI",
                    OPENAI_API_KEY,
                    OPENAI_MODEL,
                    cleanMessage, 
                    history
                )
            });
        }

        if (files.length > 0 && !GEMINI_API_KEY) {
            return res.status(503).json({
                error: "Attachments currently require Gemini. Configure GEMINI_API_KEY."
            });
        }

        for (const provider of providers) {
            try {
                console.log(`Trying ${provider.name}...`);

                const reply = await provider.run();

                console.log(`${provider.name} reply received!`);

                return res.json({
                    reply,
                    provider: provider.name
                });

            } catch (error) {
                console.error(`${provider.name} failed:`, error.message);
            }
        }

        return res.status(503).json({
            error: "All configured AI providers are unavailable. Please try again."
        });

    } catch (error) {
        console.error("CHAT ERROR:", error);

        return res.status(500).json({
            error: "Something went wrong while processing your message."
        });
    }
});

// Unknown routes
app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
    console.log("MY AI CHATBOT SERVER RUNNING");
    console.log(`Port: ${PORT}`);
    console.log("Gemini:", GEMINI_API_KEY ? "Enabled" : "Not configured");
    console.log("Groq:", GROQ_API_KEY ? "Enabled" : "Not configured");
    console.log("OpenAI:", OPENAI_API_KEY ? "Enabled" : "Not configured");
});
