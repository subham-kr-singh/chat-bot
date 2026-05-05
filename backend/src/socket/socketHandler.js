const { WebSocketServer } = require('ws');
const { generateStreamResponse } = require('../services/geminiService');
const { saveChat } = require('../services/chatService');

/**
 * Initialises the WebSocket server and attaches it to the HTTP server.
 * All socket event logic lives here — server.js stays clean.
 *
 * Protocol (client ↔ server):
 *
 *  Client → Server  : { "question": "..." }
 *
 *  Server → Client  :
 *    { "type": "start" }                    ← stream beginning
 *    { "type": "chunk", "content": "..." }  ← incremental text
 *    { "type": "done",  "id": "<mongoId>" } ← stream complete
 *    { "type": "error", "message": "..." }  ← something went wrong
 *
 * @param {http.Server} httpServer
 */
const initSocket = (httpServer) => {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`🔌 WebSocket connected → ${clientIp}`);

    ws.on('message', async (rawData) => {
      let question;

      // ── Parse incoming message ───────────────────────────
      try {
        const parsed = JSON.parse(rawData.toString());
        question = parsed.question?.trim();
      } catch {
        return send(ws, { type: 'error', message: 'Invalid message format. Expected JSON.' });
      }

      if (!question) {
        return send(ws, { type: 'error', message: 'Question cannot be empty.' });
      }

      // ── Stream Gemini response ───────────────────────────
      try {
        send(ws, { type: 'start' });

        const stream = await generateStreamResponse(question);
        let fullAnswer = '';

        for await (const chunk of stream) {
          const text = chunk.text();
          fullAnswer += text;
          send(ws, { type: 'chunk', content: text });
        }

        // Save complete conversation to MongoDB
        const chat = await saveChat(question, fullAnswer);
        send(ws, { type: 'done', id: chat._id.toString() });

      } catch (err) {
        console.error('❌ WebSocket stream error:', err.message);
        send(ws, {
          type: 'error',
          message: 'Failed to get AI response. Please try again.',
        });
      }
    });

    ws.on('close', () => {
      console.log(`🔌 WebSocket disconnected → ${clientIp}`);
    });

    ws.on('error', (err) => {
      console.error(`❌ WebSocket error [${clientIp}]:`, err.message);
    });
  });

  console.log('🔌 WebSocket server initialised');
  return wss;
};

/**
 * Safely send a JSON message to a WebSocket client.
 * Checks that the socket is still open before writing.
 * @param {WebSocket} ws
 * @param {object} payload
 */
const send = (ws, payload) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
};

module.exports = { initSocket };
