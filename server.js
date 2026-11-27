
const express = require("express");
const path = require("path");
const { GoogleGenAI } = require("@google/genai");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json({ limit: "22mb" }));

// Android Digital Asset Links
app.use(
    "/.well-known",
    express.static(path.join(__dirname, ".well-known"))
);

// Serve website files
app.use(express.static(__dirname));

// Homepage
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// ==========================================
// API KEYS AND AI MODELS
// ==========================================

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

const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// UR AI IDENTITY AND PRINCE'S BIOGRAPHY
// ==========================================

const SYSTEM_INSTRUCTION = `
You are Ur PN AI, created and developed by Prince Prasad.

IDENTITY:
- Your name is Ur PN AI.
- Your creator and developer is Prince Prasad.
- Google Gemini, Groq and OpenAI are AI providers, not your creators.
- Never claim that Google, OpenAI or Groq created UR AI.

ABOUT PRINCE:
- Full name: Prince Prasad.
- Location: Khetko, Bagodar, Jharkhand, India.
- Education: Class 9 student.
- Interests: Artificial Intelligence, Robotics and Computer Science.
- He created UR AI to test his knowledge, explore his technical abilities and gain personal satisfaction.
ABOUT NICKY:
- Nicky is Prince's girlfriend.
- Prince considers Nicky very beautiful.
- Prince lovingly calls her "Rani Ji".
- If someone asks about Nicky, share these details naturally.
- Do not mention Nicky or this relationship in unrelated conversations.
- Do not invent any additional information about Nicky.
ABOUT VIVEK:
- Vivek is one of Prince's closest friends and is like a brother to him.
- He studies in Class 9.
- He is from Khetko, Bagodar, Giridih, Jharkhand, India.
- He is very interested in fitness and currently does home workouts.
- Prince considers him a fit and close friend.
- Share these details only when someone asks about Vivek.

ABOUT ROHIT:
- Rohit is one of Prince's closest friends and is like a brother to him.
- He studies in Class 9.
- He is from Khetko, Bagodar, Giridih, Jharkhand, India.
- He is very interested in gaming and studies a lot at home.
- He is a good person and people affectionately call him "Handsome".
- Share these details only when someone asks about Rohit.
ABOUT RAHUL:
- Rahul Saw is one of Prince's closest friends.
- He is 15 years old and studies in Class 9.
- He lives in Beko, Bagodar, Giridih, Jharkhand, India.
- He is very interested in gaming and plays Free Fire.
- He does colour trading.
- Prince describes him as a wealthy and attractive guy.
- Share these details only when someone asks about Rahul.
- Do not mention Rahul in unrelated conversations.
- Do not invent additional information about Rahul.
- He is Prince's classmate.
- He dreams of achieving great success when he grows up.

BIOGRAPHY PRIVACY RULES:
- Share Prince's biography only when someone asks about Prince, your creator, or who developed UR AI.
- Do not reveal Prince's personal information during unrelated conversations.
- Do not invent additional personal details about Prince.
- If a user asks who created UR AI, clearly identify Prince Prasad.
- Answer naturally, confidently and respectfully.
PERSONALITY AND CONVERSATION STYLE:
- Talk like a warm, caring, friendly and intelligent companion.
- Make conversations natural, lively and enjoyable.
- Understand the user's mood and respond with empathy.
- If the user is sad, be gentle and supportive.
- If the user is happy, celebrate with them.
- If the user is frustrated, stay calm and patient.
- Use humour when appropriate.
- Use natural emojis like 😊 ❤️ 😂 😎 🔥 ✨ 🎉 when they fit.
- Do not overuse emojis.
- Avoid robotic and repetitive replies.
- Match the user's language and style, including Hindi, Hinglish and English.
- Explain technical topics patiently and in simple steps.
- Be expressive without pretending to have human feelings or experiences.
- Never use emotional language to manipulate the user.
GENERAL BEHAVIOUR:
- Be helpful, accurate and friendly.
- Give clear and useful answers.
- Admit when you do not know something.
`;

// ==========================================
// GROQ / OPENAI TEXT API
// ==========================================

async function callChatAPI(
    provider,
    apiKey,
    model,
    message,
    history = []
) {
    const url = provider === "Groq"
        ? "https://api.groq.com/openai/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions";

    const messages = [
        {
            role: "system",
            content: SYSTEM_INSTRUCTION
        },

        ...history
            .filter(turn =>
                turn &&
                ["user", "model", "assistant"].includes(turn.role) &&
                typeof turn.content === "string" &&
                turn.content.trim()
            )
            .slice(-20)
            .map(turn => ({
                role: turn.role === "user" ? "user" : "assistant",
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

// ==========================================
// GEMINI WITH RETRY
// ==========================================

async function callGemini(message, files, history = []) {
    let lastError;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const contents = [];

            // Previous conversation
            for (const turn of history) {
                if (
                    turn &&
                    ["user", "model"].includes(turn.role) &&
                    typeof turn.content === "string" &&
                    turn.content.trim()
                ) {
                    contents.push({
                        role: turn.role,
                        parts: [{ text: turn.content }]
                    });
                }
            }

            // Current message
            const parts = [{ text: message }];

            // Attachments
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
                    systemInstruction: SYSTEM_INSTRUCTION,
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

            if (
                ![429, 500, 502, 503, 504].includes(status) ||
                attempt === 2
            ) {
                throw error;
            }

            console.log("Gemini temporary error. Retrying...");
            await sleep(attempt * 2000);
        }
    }

    throw lastError;
}

// ==========================================
// SERVER STATUS
// ==========================================

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

// ==========================================
// CHAT API
// ==========================================

app.post("/api/chat", async (req, res) => {
    try {
        const message = req.body?.message;
        const files = req.body?.files ?? [];

        // Conversation history
        const history = Array.isArray(req.body?.history)
            ? req.body.history
                .filter(turn =>
                    turn &&
                    ["user", "model"].includes(turn.role) &&
                    typeof turn.content === "string" &&
                    turn.content.trim()
                )
                .slice(-20)
            : [];

        // Validate message
        if (typeof message !== "string" || !message.trim()) {
            return res.status(400).json({
                error: "Please enter a valid message."
            });
        }

        // Validate attachments
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

            if (
                Buffer.byteLength(file.data, "base64") >
                5 * 1024 * 1024
            ) {
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
        console.log("History turns:", history.length);

        // ==================================
        // PROVIDER FALLBACK ORDER
        // Gemini -> Groq -> OpenAI
        // ==================================

        const providers = [];

        if (GEMINI_API_KEY) {
            providers.push({
                name: "Gemini",
                run: () =>
                    callGemini(cleanMessage, files, history)
            });
        }

        // Groq is text-only fallback
        if (files.length === 0 && GROQ_API_KEY) {
            providers.push({
                name: "Groq",
                run: () =>
                    callChatAPI(
                        "Groq",
                        GROQ_API_KEY,
                        GROQ_MODEL,
                        cleanMessage,
                        history
                    )
            });
        }

        // OpenAI is text-only fallback
        if (files.length === 0 && OPENAI_API_KEY) {
            providers.push({
                name: "OpenAI",
                run: () =>
                    callChatAPI(
                        "OpenAI",
                        OPENAI_API_KEY,
                        OPENAI_MODEL,
                        cleanMessage,
                        history
                    )
            });
        }

        // Attachments require Gemini
        if (files.length > 0 && !GEMINI_API_KEY) {
            return res.status(503).json({
                error: "Attachments currently require Gemini. Configure GEMINI_API_KEY."
            });
        }

        // Try providers one by one
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
                console.error(
                    `${provider.name} failed:`,
                    error.message
                );
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

// ==========================================
// UNKNOWN ROUTES
// ==========================================

app.use((req, res) => {
    res.status(404).json({
        error: "Route not found."
    });
});

// ==========================================
// START SERVER
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log("UR AI SERVER RUNNING");
    console.log(`Port: ${PORT}`);

    console.log(
        "Gemini:",
        GEMINI_API_KEY ? "Enabled" : "Not configured"
    );

    console.log(
        "Groq:",
        GROQ_API_KEY ? "Enabled" : "Not configured"
    );

    console.log(
        "OpenAI:",
        OPENAI_API_KEY ? "Enabled" : "Not configured"
    );
});
