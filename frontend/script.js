/* ────────────────────────────────────────────────────────
   CareerPath AI — Frontend Script
   WebSocket streaming + Gemini markdown renderer
──────────────────────────────────────────────────────── */

// ── Config ──────────────────────────────────────────────
const CONFIG = {
  WS_URL:  `ws://${location.hostname}:5000`,
  API_URL: `http://${location.hostname}:5000/api`
};

// ── State ───────────────────────────────────────────────
let ws = null;
let isStreaming = false;
let reconnectTimer = null;
let overlay = null;

// ── DOM Refs ─────────────────────────────────────────────
const chatWindow    = document.getElementById('chatWindow');
const messagesEl    = document.getElementById('messages');
const welcomeScreen = document.getElementById('welcomeScreen');
const userInput     = document.getElementById('userInput');
const sendBtn       = document.getElementById('sendBtn');
const clearBtn      = document.getElementById('clearBtn');
const statusDot     = document.getElementById('statusDot');
const dotEl         = statusDot.querySelector('.dot');
const statusText    = statusDot.querySelector('.status-text');
const toast         = document.getElementById('toast');
const sidebarToggle = document.getElementById('sidebarToggle');
const menuBtn       = document.getElementById('menuBtn');
const sidebar       = document.getElementById('sidebar');

// ── WebSocket ────────────────────────────────────────────
function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  setStatus('connecting');
  ws = new WebSocket(CONFIG.WS_URL);

  ws.onopen = () => {
    setStatus('connected');
    clearTimeout(reconnectTimer);
    loadHistory();
  };

  ws.onclose = () => {
    setStatus('error');
    reconnectTimer = setTimeout(connectWS, 3000);
  };

  ws.onerror = () => setStatus('error');

  ws.onmessage = (event) => handleWSMessage(JSON.parse(event.data));
}

function handleWSMessage(data) {
  switch (data.type) {
    case 'start':
      onStreamStart();
      break;
    case 'chunk':
      onStreamChunk(data.content);
      break;
    case 'done':
      onStreamDone();
      break;
    case 'error':
      onStreamError(data.message);
      break;
  }
}

// ── WebSocket Events ──────────────────────────────────────
let currentBotBubble = null;
let currentBotRaw    = '';

function onStreamStart() {
  isStreaming = true;
  sendBtn.disabled = true;

  // Create bot message with typing animation
  const msgEl = createMessageEl('bot');
  const bubble = msgEl.querySelector('.msg-bubble');
  bubble.innerHTML = `
    <div class="typing-indicator">
      <span></span><span></span><span></span>
    </div>`;
  messagesEl.appendChild(msgEl);
  scrollBottom();

  // Save ref for streaming
  currentBotBubble = bubble;
  currentBotRaw    = '';
}

function onStreamChunk(text) {
  if (!currentBotBubble) return;
  currentBotRaw += text;
  currentBotBubble.classList.add('cursor-blink');
  currentBotBubble.innerHTML = renderMarkdown(currentBotRaw);
  scrollBottom();
}

function onStreamDone() {
  if (currentBotBubble) {
    currentBotBubble.classList.remove('cursor-blink');
    currentBotBubble.innerHTML = renderMarkdown(currentBotRaw);
  }
  currentBotBubble = null;
  currentBotRaw    = '';
  isStreaming      = false;
  sendBtn.disabled = false;
  scrollBottom();
}

function onStreamError(msg) {
  if (currentBotBubble) {
    currentBotBubble.classList.remove('cursor-blink');
    currentBotBubble.innerHTML = `<span style="color:var(--danger)">⚠️ ${msg || 'Something went wrong. Please try again.'}</span>`;
  }
  currentBotBubble = null;
  isStreaming      = false;
  sendBtn.disabled = false;
  showToast('Failed to get response', 'error');
}

// ── Send Message ──────────────────────────────────────────
function sendMessage() {
  const text = userInput.value.trim();
  if (!text || isStreaming) return;

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    showToast('Reconnecting... please wait', 'error');
    connectWS();
    return;
  }

  // Hide welcome screen on first message
  if (welcomeScreen) welcomeScreen.style.display = 'none';

  // Render user bubble
  appendUserMessage(text);
  userInput.value  = '';
  userInput.style.height = 'auto';

  // Send to server via WebSocket
  ws.send(JSON.stringify({ question: text }));
}

// ── Load History ──────────────────────────────────────────
async function loadHistory() {
  try {
    const res  = await fetch(`${CONFIG.API_URL}/chat/history`);
    const data = await res.json();

    if (data.success && data.data.length > 0) {
      if (welcomeScreen) welcomeScreen.style.display = 'none';
      // Show oldest first
      const sorted = [...data.data].reverse();
      sorted.forEach(({ question, answer, createdAt }) => {
        appendUserMessage(question, createdAt, true);
        appendBotMessage(answer, createdAt);
      });
      scrollBottom();
    }
  } catch (err) {
    console.warn('Could not load history:', err.message);
  }
}

// ── Clear History ──────────────────────────────────────────
async function clearHistory() {
  if (!confirm('Clear all chat history? This cannot be undone.')) return;
  try {
    const res  = await fetch(`${CONFIG.API_URL}/chat/history`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      messagesEl.innerHTML = '';
      if (welcomeScreen) welcomeScreen.style.display = 'flex';
      showToast('Chat history cleared ✓', 'success');
    }
  } catch (err) {
    showToast('Failed to clear history', 'error');
  }
}

// ── Message Builders ──────────────────────────────────────
function appendUserMessage(text, timestamp, silent = false) {
  const msgEl  = createMessageEl('user');
  const bubble = msgEl.querySelector('.msg-bubble');
  const timeEl = msgEl.querySelector('.msg-time');

  bubble.textContent = text;
  timeEl.textContent = formatTime(timestamp);

  if (!silent) {
    messagesEl.appendChild(msgEl);
    scrollBottom();
  } else {
    messagesEl.appendChild(msgEl);
  }
}

function appendBotMessage(text, timestamp) {
  const msgEl  = createMessageEl('bot');
  const bubble = msgEl.querySelector('.msg-bubble');
  const timeEl = msgEl.querySelector('.msg-time');

  bubble.innerHTML   = renderMarkdown(text);
  timeEl.textContent = formatTime(timestamp);

  messagesEl.appendChild(msgEl);
}

function createMessageEl(role) {
  const el = document.createElement('div');
  el.className = `message ${role}`;

  const avatar = role === 'user' ? '👤' : '⚡';
  const name   = role === 'user' ? 'You' : 'CareerPath AI';

  el.innerHTML = `
    <div class="msg-avatar">${avatar}</div>
    <div class="msg-body">
      <div class="msg-name">${name}</div>
      <div class="msg-bubble"></div>
      <div class="msg-time">${formatTime()}</div>
    </div>`;

  return el;
}

// ── Markdown Renderer ─────────────────────────────────────
function renderMarkdown(text) {
  let html = escapePartial(text);

  // Code blocks (must come before inline code)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm,  '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm,   '<h1>$1</h1>');

  // Horizontal rule
  html = html.replace(/^---$/gm, '<hr>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');

  // Unordered lists
  html = html.replace(/^[\*\-] (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, (match) => {
    return match.replace(/(<li>[\s\S]*?<\/li>)/g, '$1');
  });
  html = wrapLists(html, 'li', 'ul');

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<oli>$1</oli>');
  html = wrapLists(html, 'oli', 'ol').replace(/<oli>/g, '<li>').replace(/<\/oli>/g, '</li>');

  // Paragraphs (lines not already wrapped)
  html = html.split('\n').map(line => {
    line = line.trim();
    if (!line) return '';
    if (/^<(h[1-3]|ul|ol|li|pre|hr|blockquote)/.test(line)) return line;
    return `<p>${line}</p>`;
  }).join('\n');

  return html;
}

function wrapLists(html, tag, wrapper) {
  const openTag  = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const openW    = `<${wrapper}>`;
  const closeW   = `</${wrapper}>`;

  return html.replace(new RegExp(`(${openTag}[\\s\\S]*?${closeTag}\\n?)+`, 'g'),
    match => `${openW}${match}${closeW}`);
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapePartial(str) {
  // Only escape < and > outside of code blocks we'll wrap
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Helpers ───────────────────────────────────────────────
function scrollBottom() {
  requestAnimationFrame(() => {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });
}

function formatTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function setStatus(state) {
  dotEl.className = 'dot';
  const map = {
    connecting: ['', 'Connecting...'],
    connected:  ['connected', 'Connected'],
    error:      ['error', 'Reconnecting...']
  };
  const [cls, txt] = map[state] || ['', 'Unknown'];
  if (cls) dotEl.classList.add(cls);
  statusText.textContent = txt;
}

let toastTimer;
function showToast(msg, type = '') {
  toast.textContent = msg;
  toast.className   = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── Public function for welcome cards ─────────────────────
function askQuestion(q) {
  userInput.value = q;
  sendMessage();
}

// ── Events ────────────────────────────────────────────────

// Send on button click
sendBtn.addEventListener('click', sendMessage);

// Send on Enter (Shift+Enter = new line)
userInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Auto-resize textarea
userInput.addEventListener('input', () => {
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 140) + 'px';
});

// Clear history
clearBtn.addEventListener('click', clearHistory);

// Sidebar toggle (desktop)
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

// Mobile menu
menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  if (sidebar.classList.contains('open')) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', closeMobileSidebar);
  } else {
    closeMobileSidebar();
  }
});

function closeMobileSidebar() {
  sidebar.classList.remove('open');
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

// Quick question buttons in sidebar
document.getElementById('quickBtns').addEventListener('click', (e) => {
  const btn = e.target.closest('.quick-btn');
  if (!btn) return;
  const q = btn.dataset.q;
  if (q) {
    userInput.value = q;
    sendMessage();
    closeMobileSidebar();
  }
});

// ── Init ───────────────────────────────────────────────────
connectWS();
