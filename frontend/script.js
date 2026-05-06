/* ══════════════════════════════════════════════════════
   CareerBot — Frontend JavaScript
   B.Tech CSE Career Guidance Chatbot
   ══════════════════════════════════════════════════════ */

"use strict";

// ─── Configuration ────────────────────────────────────
const API_BASE = "http://localhost:5000/api" || "https://chat-bot-pd7n.onrender.com";
const SESSION_ID =
  "session_" +
  (localStorage.getItem("careerbotSessionId") || generateSessionId());

function generateSessionId() {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  localStorage.setItem("careerbotSessionId", id);
  return id;
}

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
let isLoading = false;

// ══════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  checkAPIHealth();
  loadChatHistory();
  bindEvents();
});

// ─── Bind All Event Listeners ─────────────────────────
function bindEvents() {
  // Send on button click
  sendBtn.addEventListener("click", handleSend);

  // Send on Enter (Shift+Enter = newline)
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // Auto-grow textarea and toggle send button
  userInput.addEventListener("input", () => {
    autoGrow(userInput);
    sendBtn.disabled = userInput.value.trim() === "" || isLoading;
  });

  // New Chat
  newChatBtn.addEventListener("click", () => {
    startNewChat();
    closeSidebar();
  });

  // Clear History
  clearChatBtn.addEventListener("click", () => confirmClearHistory());

  // Mobile sidebar
  menuToggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    sidebarOverlay.classList.toggle("open");
  });
  sidebarOverlay.addEventListener("click", closeSidebar);

  // Suggestion cards (welcome screen)
  document.querySelectorAll(".suggestion-card, .topic-btn").forEach((el) => {
    el.addEventListener("click", () => {
      const prompt = el.dataset.prompt;
      if (prompt) {
        userInput.value = prompt;
        autoGrow(userInput);
        sendBtn.disabled = false;
        closeSidebar();
        handleSend();
      }
    });
  });
}

// ──────────────────────────────────────────────────────
// SEND MESSAGE FLOW
// ──────────────────────────────────────────────────────
async function handleSend() {
  const text = userInput.value.trim();
  if (!text || isLoading) return;

  // Clear input immediately
  userInput.value = "";
  autoGrow(userInput);
  sendBtn.disabled = true;

  // Show chat area, hide welcome
  showChatArea();

  // Render user message
  appendMessage("user", text);

  // Show typing indicator
  const typingEl = appendTypingIndicator();

  isLoading = true;

  try {
    const data = await sendChatRequest(text);
    typingEl.remove();
    appendMessage("ai", data.reply);
  } catch (err) {
    const errorMessage = err.message || "Could not reach the server.";
    appendMessage("ai", `⚠️ **Error:** ${errorMessage}`);
    showToast(errorMessage, "error");
  } finally {
    isLoading = false;
    sendBtn.disabled = userInput.value.trim() === "";
    scrollToBottom();
  }
}

// ─── API: Send Chat ───────────────────────────────────
async function sendChatRequest(message) {
  const response = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, sessionId: SESSION_ID }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.details || data.error || `HTTP ${response.status}`);
  }
  return data;
}

// ─── API: Load Chat History ───────────────────────────
async function loadChatHistory() {
  try {
    const response = await fetch(
      `${API_BASE}/chat/history?sessionId=${SESSION_ID}&limit=40`,
    );
    if (!response.ok) return;

    const data = await response.json();
    if (data.chats && data.chats.length > 0) {
      showChatArea();
      data.chats.forEach((chat) => {
        appendMessage("user", chat.question, new Date(chat.createdAt));
        appendMessage("ai", chat.answer, new Date(chat.createdAt));
      });
      scrollToBottom(false);
    }
  } catch (err) {
    // Silently ignore; backend may not be running yet
    console.warn("Could not load history:", err.message);
  }
}

// ─── API: Clear History ───────────────────────────────
async function confirmClearHistory() {
  if (!confirm("Clear all chat history? This cannot be undone.")) return;
  try {
    const response = await fetch(`${API_BASE}/chat/clear`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: SESSION_ID }),
    });
    const data = await response.json();
    if (data.success) {
      resetToWelcome();
      showToast("Chat history cleared ✓", "success");
    }
  } catch (err) {
    showToast("Failed to clear history", "error");
  }
}

// ─── API: Health Check ────────────────────────────────
async function checkAPIHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    setConnectionStatus(
      true,
      data.mongoStatus === "Connected"
        ? "Online · MongoDB Connected"
        : "Online · DB Disconnected",
    );
  } catch {
    setConnectionStatus(false, "Backend offline");
  }
}

// ──────────────────────────────────────────────────────
// DOM HELPERS
// ──────────────────────────────────────────────────────

// Append a message bubble
function appendMessage(role, text, time = new Date()) {
  const isUser = role === "user";
  const msgEl = document.createElement("div");
  msgEl.className = `message ${isUser ? "user-message" : "ai-message"}`;

  const avatarEl = document.createElement("div");
  avatarEl.className = "message-avatar";
  avatarEl.textContent = isUser ? "You" : "🤖";

  const bodyEl = document.createElement("div");
  bodyEl.className = "message-body";

  const roleEl = document.createElement("div");
  roleEl.className = "message-role";
  roleEl.textContent = isUser ? "You" : "CareerBot";

  const contentEl = document.createElement("div");
  contentEl.className = "message-content";

  if (isUser) {
    contentEl.textContent = text;
  } else {
    // Render markdown-like formatting for AI responses
    contentEl.innerHTML = formatMarkdown(text);
  }

  const timeEl = document.createElement("div");
  timeEl.className = "message-time";
  timeEl.textContent = formatTime(time);

  bodyEl.appendChild(roleEl);
  bodyEl.appendChild(contentEl);
  bodyEl.appendChild(timeEl);

  msgEl.appendChild(avatarEl);
  msgEl.appendChild(bodyEl);
  messagesContainer.appendChild(msgEl);

  scrollToBottom();
  return msgEl;
}

// Append typing indicator
function appendTypingIndicator() {
  const msgEl = document.createElement("div");
  msgEl.className = "message ai-message";

  const avatarEl = document.createElement("div");
  avatarEl.className = "message-avatar";
  avatarEl.textContent = "🤖";

  const bodyEl = document.createElement("div");
  bodyEl.className = "message-body";

  const roleEl = document.createElement("div");
  roleEl.className = "message-role";
  roleEl.textContent = "CareerBot";

  const indicator = document.createElement("div");
  indicator.className = "typing-indicator";
  indicator.innerHTML = `
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  `;

  bodyEl.appendChild(roleEl);
  bodyEl.appendChild(indicator);
  msgEl.appendChild(avatarEl);
  msgEl.appendChild(bodyEl);
  messagesContainer.appendChild(msgEl);
  scrollToBottom();
  return msgEl;
}

// Show chat area, hide welcome
function showChatArea() {
  welcomeScreen.style.display = "none";
  messagesContainer.classList.add("has-messages");
}

// Reset to welcome screen
function resetToWelcome() {
  messagesContainer.innerHTML = "";
  messagesContainer.classList.remove("has-messages");
  welcomeScreen.style.display = "";
}

// Start a new chat (clears view only; doesn't delete DB)
function startNewChat() {
  messagesContainer.innerHTML = "";
  messagesContainer.classList.remove("has-messages");
  welcomeScreen.style.display = "";
  userInput.value = "";
  autoGrow(userInput);
  sendBtn.disabled = true;
}

// Auto-grow textarea height
function autoGrow(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 160) + "px";
}

// Scroll chat to bottom
function scrollToBottom(smooth = true) {
  chatArea.scrollTo({
    top: chatArea.scrollHeight,
    behavior: smooth ? "smooth" : "auto",
  });
}

// Set connection status indicator
function setConnectionStatus(online, label) {
  statusDot.className = "status-dot " + (online ? "online" : "offline");
  connectionStatus.textContent = label;
}

// Close mobile sidebar
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.classList.remove("open");
}

// ─── Toast Notification ───────────────────────────────
let toastTimer;
function showToast(message, type = "") {
  toast.textContent = message;
  toast.className = `toast${type ? " " + type : ""} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3000);
}

// ──────────────────────────────────────────────────────
// MARKDOWN FORMATTER
// Converts Gemini markdown-style text to safe HTML
// ──────────────────────────────────────────────────────
function formatMarkdown(text) {
  // Escape HTML first
  let html = escapeHTML(text);

  // Code blocks ```lang\n...\n```
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Bold **text** or __text__
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");

  // Italic *text* or _text_
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>");

  // Headings ## H2 and ### H3
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h2>$1</h2>");

  // Blockquote > text
  html = html.replace(/^&gt;\s+(.+)$/gm, "<blockquote>$1</blockquote>");

  // Unordered list: lines starting with - or *  or •
  html = html.replace(/^[\-\*•]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(
    /(<li>[\s\S]*?<\/li>)(?:\n<li>[\s\S]*?<\/li>)*/g,
    (match) => {
      return "<ul>" + match + "</ul>";
    },
  );

  // Ordered list: lines starting with 1. 2. etc.
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(
    /(<li>[\s\S]*?<\/li>)(?:\n<li>[\s\S]*?<\/li>)*/g,
    (match) => {
      if (match.startsWith("<ul>")) return match;
      return "<ol>" + match + "</ol>";
    },
  );

  // Horizontal rule ---
  html = html.replace(/^---+$/gm, "<hr>");

  // Paragraph breaks (double newline → paragraph)
  html = html.replace(/\n\n+/g, "</p><p>");

  // Single newlines → <br> (outside block elements)
  html = html.replace(/\n/g, "<br>");

  // Wrap in paragraph
  html = "<p>" + html + "</p>";

  // Clean up empty paragraphs and around block elements
  html = html
    .replace(/<p>\s*<\/p>/g, "")
    .replace(/<p>(<(?:h[123]|ul|ol|pre|blockquote|hr)[^>]*>)/g, "$1")
    .replace(/(<\/(?:h[123]|ul|ol|pre|blockquote)>)<\/p>/g, "$1");

  return html;
}

// Safely escape HTML to prevent XSS
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Format timestamp
function formatTime(date) {
  return date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
