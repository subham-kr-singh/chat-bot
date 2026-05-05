require("dotenv").config();

const http = require("http");

const app = require("./src/app");
const connectDB = require("./src/config/db");
const { initSocket } = require("./src/socket/socketHandler");

// ── HTTP Server ──────────────────────────────────────────
const httpServer = http.createServer(app);

// ── WebSocket ────────────────────────────────────────────
initSocket(httpServer);

// ── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Server → http://localhost:${PORT}`);
    console.log(`📡 Mode   → ${process.env.NODE_ENV || "development"}`);
  });
});
