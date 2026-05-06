/* ══════════════════════════════════════════════════════
   CareerBot — Frontend JavaScript
   Connects to: https://chat-bot-pd7n.onrender.com
   ══════════════════════════════════════════════════════ */

"use strict";

// ─── Configuration ────────────────────────────────────
const BACKEND_HTTP = "https://chat-bot-pd7n.onrender.com";
const BACKEND_WS = "wss://chat-bot-pd7n.onrender.com";

const API = {
  CHAT: `${BACKEND_HTTP}/api/chat`,
  HISTORY: `${BACKEND_HTTP}/api/chat/history`,
  HEALTH: `${BACKEND_HTTP}/api/health`,
};

// ─── DOM References ───────────────────────────────────
const chatArea = document.getElementById("chatArea");
const welcomeScreen = document.getElementById("welcomeScreen");
const messagesContainer = document.getElementById("messagesContainer");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const newChatBtn = document.getElementById("newChatBtn");
const clearChatBtn = document.getElementById("clearChatBtn");
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const statusDot = document.getElementById("statusDot");
const connectionStatus = document.getElementById("connectionStatus");
const toast = document.getElementById("toast");

// ─── State ────────────────────────────────────────────
let ws = null;
let isStreaming = false;
let wsReconnectTimer = null;
let currentBotEl = null; // .message-content div being streamed into
let currentBotRaw = ""; // accumulated markdown during stream

// ══════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  connectWebSocket();
  bindEvents();
});

function bindEvents() {
  sendBtn.addEventListener("click", handleSend);

  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  userInput.addEventListener("input", () => {
    autoGrow(userInput);
    sendBtn.disabled = userInput.value.trim() === "" || isStreaming;
  });

  newChatBtn.addEventListener("click", () => {
    startNewChat();
    closeSidebar();
  });
  clearChatBtn.addEventListener("click", confirmClearHistory);

  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("open");
  });
  sidebarOverlay.addEventListener("click", closeSidebar);

  document.querySelectorAll(".suggestion-card, .topic-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const prompt = el.dataset.prompt;
      if (!prompt) return;
      userInput.value = prompt;
      autoGrow(userInput);
      sendBtn.disabled = false;
      closeSidebar();
      handleSend();
    });
  });
}

// ══════════════════════════════════════════════════════
// WEBSOCKET
// ══════════════════════════════════════════════════════
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  setStatus("connecting", "Connecting\u2026");
  ws = new WebSocket(BACKEND_WS);

  ws.onopen = () => {
    setStatus("online", "Online");
    clearTimeout(wsReconnectTimer);
    loadHistory();
  };

  ws.onclose = () => {
    setStatus("offline", "Reconnecting\u2026");
    wsReconnectTimer = setTimeout(connectWebSocket, 3000);
  };

  ws.onerror = () => setStatus("offline", "Connection error");

  ws.onmessage = (e) => handleWSMessage(JSON.parse(e.data));
}

function handleWSMessage(data) {
  switch (data.type) {
    case "start":
      onStreamStart();
      break;
    case "chunk":
      onStreamChunk(data.content);
      break;
    case "done":
      onStreamDone();
      break;
    case "error":
      onStreamError(data.message);
      break;
  }
}

function onStreamStart() {
  isStreaming = true;
  sendBtn.disabled = true;
  showChatArea();

  const msgEl = createMessageShell("ai");
  const contentEl = msgEl.querySelector(".message-content");
  contentEl.innerHTML = typingHTML();
  messagesContainer.appendChild(msgEl);
  scrollToBottom();

  currentBotEl = contentEl;
  currentBotRaw = "";
}

function onStreamChunk(text) {
  if (!currentBotEl) return;
  currentBotRaw += text;
  currentBotEl.innerHTML =
    formatMarkdown(currentBotRaw) + '<span class="stream-cursor">|</span>';
  scrollToBottom();
}

function onStreamDone() {
  if (currentBotEl) currentBotEl.innerHTML = formatMarkdown(currentBotRaw);
  currentBotEl = null;
  currentBotRaw = "";
  isStreaming = false;
  sendBtn.disabled = userInput.value.trim() === "";
  scrollToBottom();
}

function onStreamError(message) {
  if (currentBotEl)
    currentBotEl.innerHTML = `<span style="color:#f87171">⚠️ ${message || "Something went wrong."}</span>`;
  currentBotEl = null;
  currentBotRaw = "";
  isStreaming = false;
  sendBtn.disabled = false;
  showToast(message || "AI response failed", "error");
}

// ══════════════════════════════════════════════════════
// SEND
// ══════════════════════════════════════════════════════
function handleSend() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  userInput.value = "";
  autoGrow(userInput);
  sendBtn.disabled = true;

  showChatArea();
  appendUserMessage(text);

  if (ws && ws.readyState === WebSocket.OPEN) {
    // WS path — backend socketHandler.js reads parsed.question
    ws.send(JSON.stringify({ question: text }));
  } else {
    // REST fallback
    sendViaREST(text);
  }
}

// ─── REST fallback (no streaming) ────────────────────
async function sendViaREST(question) {
  const typingEl = appendTypingIndicator();
  isStreaming = true;

  try {
    const res = await fetch(API.CHAT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // chatController.js: const { question } = req.body
      body: JSON.stringify({ question }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

    typingEl.remove();
    // Backend returns: { success, data: { id, question, answer, createdAt } }
    appendBotMessage(data.data.answer);
  } catch (err) {
    typingEl.remove();
    appendBotMessage(`⚠️ **Error:** ${err.message}`);
    showToast(err.message, "error");
  } finally {
    isStreaming = false;
    sendBtn.disabled = userInput.value.trim() === "";
    scrollToBottom();
  }
}

// ══════════════════════════════════════════════════════
// HISTORY
// GET /api/chat/history → { success, count, data: [{question,answer,createdAt}] }
// ══════════════════════════════════════════════════════
async function loadHistory() {
  try {
    const res = await fetch(API.HISTORY);
    const data = await res.json();

    if (data.success && data.data && data.data.length > 0) {
      showChatArea();
      // Backend returns newest-first; reverse to display oldest first
      [...data.data].reverse().forEach(({ question, answer, createdAt }) => {
        appendUserMessage(question, new Date(createdAt));
        appendBotMessage(answer, new Date(createdAt));
      });
      scrollToBottom(false);
    }
  } catch (err) {
    console.warn("History load failed:", err.message);
  }
}

// DELETE /api/chat/history → { success, message }
async function confirmClearHistory() {
  if (!confirm("Clear all chat history? This cannot be undone.")) return;
  try {
    const res = await fetch(API.HISTORY, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      resetToWelcome();
      showToast("Chat history cleared ✓", "success");
    } else {
      showToast("Could not clear history", "error");
    }
  } catch {
    showToast("Failed to clear history", "error");
  }
}

// ══════════════════════════════════════════════════════
// DOM HELPERS
// ══════════════════════════════════════════════════════
function appendUserMessage(text, time = new Date()) {
  const el = createMessageShell("user");
  el.querySelector(".message-content").textContent = text;
  el.querySelector(".message-time").textContent = formatTime(time);
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function appendBotMessage(text, time = new Date()) {
  const el = createMessageShell("ai");
  el.querySelector(".message-content").innerHTML = formatMarkdown(text);
  el.querySelector(".message-time").textContent = formatTime(time);
  messagesContainer.appendChild(el);
  scrollToBottom();
}

function createMessageShell(role) {
  const isUser = role === "user";
  const el = document.createElement("div");
  el.className = `message ${isUser ? "user-message" : "ai-message"}`;
  el.innerHTML = `
    <div class="message-avatar">${isUser ? "You" : "🤖"}</div>
    <div class="message-body">
      <div class="message-role">${isUser ? "You" : "CareerBot"}</div>
      <div class="message-content"></div>
      <div class="message-time">${formatTime()}</div>
    </div>`;
  return el;
}

function appendTypingIndicator() {
  const el = createMessageShell("ai");
  el.querySelector(".message-content").innerHTML = typingHTML();
  messagesContainer.appendChild(el);
  scrollToBottom();
  return el;
}

function typingHTML() {
  return `<div class="typing-indicator">
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  </div>`;
}

// ─── UI state ─────────────────────────────────────────
function showChatArea() {
  welcomeScreen.style.display = "none";
  messagesContainer.classList.add("has-messages");
}

function resetToWelcome() {
  messagesContainer.innerHTML = "";
  messagesContainer.classList.remove("has-messages");
  welcomeScreen.style.display = "";
}

function startNewChat() {
  messagesContainer.innerHTML = "";
  messagesContainer.classList.remove("has-messages");
  welcomeScreen.style.display = "";
  userInput.value = "";
  autoGrow(userInput);
  sendBtn.disabled = true;
}

function setStatus(state, label) {
  statusDot.className =
    "status-dot " + (state === "online" ? "online" : "offline");
  connectionStatus.textContent = label;
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
}

function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

function scrollToBottom(smooth = true) {
  chatArea.scrollTo({
    top: chatArea.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

let toastTimer;
function showToast(msg, type = "") {
  toast.textContent = msg;
  toast.className = `toast${type ? " " + type : ""} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
}

// ══════════════════════════════════════════════════════
// MARKDOWN RENDERER
// ══════════════════════════════════════════════════════
function formatMarkdown(text) {
  let html = escapeHTML(text);

  // Fenced code blocks
  html = html.replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_, lang, code) =>
      `<pre><code class="language-${lang}">${code.trim()}</code></pre>`,
  );

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h2>$1</h2>");

  // Bold / italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // Horizontal rule
  html = html.replace(/^---+$/gm, "<hr>");

  // Blockquote
  html = html.replace(/^&gt;\s+(.+)$/gm, "<blockquote>$1</blockquote>");

  // Unordered list items
  html = html.replace(/^[\-\*•]\s+(.+)$/gm, "<li>$1</li>");

  // Ordered list items
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<oli>$1</oli>");

  // Wrap <li> runs in <ul>
  html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);

  // Wrap <oli> runs in <ol>
  html = html.replace(
    /(<oli>[\s\S]*?<\/oli>\n?)+/g,
    (m) => `<ol>${m.replace(/<\/?oli>/g, (t) => t.replace("oli", "li"))}</ol>`,
  );

  // Paragraphs
  html = html.replace(/\n\n+/g, "</p><p>");
  html = html.replace(/\n/g, "<br>");
  html = `<p>${html}</p>`;

  // Clean up empty tags + unwrap block elements from <p>
  html = html
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<p>(<(?:h[123]|ul|ol|pre|blockquote|hr)[^>]*>)/g, "$1")
    .replace(/(<\/(?:h[123]|ul|ol|pre|blockquote)>)<\/p>/g, "$1");

  return html;
}

function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
