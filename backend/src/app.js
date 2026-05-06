const express = require("express");
const cors = require("cors");
const path = require("path");

const chatRoutes = require("./routes/chatRoutes");
const { errorHandler } = require("./middleware/errorHandler");

const app = express();

// ── CORS ─────────────────────────────────────────────────
// Explicitly allow the deployed frontend + common local origins
const ALLOWED_ORIGINS = [
  "https://chat-bot-1-c216.onrender.com", // production frontend
  "http://localhost:3000", // local CRA / Vite
  "http://localhost:5000", // local full-stack
  "http://127.0.0.1:5500", // VS Code Live Server
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (Postman, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      callback(new Error(`CORS blocked: origin "${origin}" is not allowed`));
    },
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

// ── Body Parser ───────────────────────────────────────────
app.use(express.json());

// ── Static Frontend ───────────────────────────────────────
// Serves frontend/index.html when backend and frontend share the same server
app.use(express.static(path.join(__dirname, "../frontend")));

// ── API Routes ────────────────────────────────────────────
app.use("/api/chat", chatRoutes);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
  });
});

// Catch-all → SPA fallback
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

// Global error handler (must be last)
app.use(errorHandler);

module.exports = app;
