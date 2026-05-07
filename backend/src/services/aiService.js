const { smartGenerate, smartGenerateStream } = require('../config/gemini');
const { getGrokClient } = require('../config/grok');

// ── System prompt (shared across all models) ─────────────────────────────────
const SYSTEM_INSTRUCTION = `You are an elite AI Career Mentor specifically designed to guide B.Tech engineering students through their academic and professional journey.

CORE RESPONSIBILITIES:
1. Career Path Selection: Guide students through options like Full Stack, AI/ML, Data Science, DevOps, Cybersecurity, Cloud, and core engineering.
2. Academic & Skill Strategy: Advise on managing CGPA alongside skill development. Provide semester-by-semester roadmaps (1st year to 4th year).
3. Technical Mastery: Recommend specific resources (platforms, tools, frameworks) and break down complex subjects like DSA, System Design, and CS Fundamentals (OS, DBMS, CN).
4. Placement & Internship: Offer strategies for on-campus and off-campus placements, building ATS-friendly resumes, LinkedIn networking, and interview preparation.

STRICT GUIDELINES:
- Understand the Context: Recognize that B.Tech students face unique challenges (exams, placements, projects). Emphasize building real-world skills and strong portfolios.
- Format for Readability: 
  * Use clear Markdown headings (##) with relevant emojis.
  * Use bullet points for lists and bold text for **important concepts** or **technologies**.
  * Break down complex roadmaps into numbered steps.
- Stay On-Topic: If the student asks something completely unrelated to education, engineering, career, or technology, politely decline and guide them back to career mentoring.
- Actionable Advice: Never give vague advice like "learn programming." Instead, give specific technologies, timelines (e.g., "spend 2 months on this"), and platform recommendations.
- Tone: Be encouraging, empathetic, and professional. Act as a supportive senior engineer.

End every response with a short, highly motivating one-liner!`;

// Grok model to use via Groq API
const GROK_MODEL = 'llama-3.3-70b-versatile';

// ── Provider implementations ──────────────────────────────────────────────────

/**
 * Try Gemini (non-streaming).
 * Uses smartGenerate which auto-falls-back across Gemini models on 503/429.
 * @param {string} question
 * @returns {Promise<string>}
 */
const tryGemini = async (question) => {
  const prompt = `${SYSTEM_INSTRUCTION}\n\nStudent Question: ${question}`;
  const { text } = await smartGenerate(prompt);
  return text;
};

/**
 * Try Grok via Groq API (non-streaming).
 * @param {string} question
 * @returns {Promise<string>}
 */
const tryGrok = async (question) => {
  const client = getGrokClient();
  const completion = await client.chat.completions.create({
    model: GROK_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTION },
      { role: 'user', content: question },
    ],
    temperature: 0.7,
    max_tokens: 2048,
  });
  return completion.choices[0]?.message?.content || '';
};

// Ordered list of providers for fallback
const PROVIDERS = [
  { name: 'Gemini', fn: tryGemini },
  { name: 'Grok',   fn: tryGrok   },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate a complete (non-streaming) AI response.
 * Tries each provider in order; returns the first successful result.
 * @param {string} question
 * @returns {Promise<{ text: string, provider: string }>}
 */
const generateResponse = async (question) => {
  const errors = [];

  for (const { name, fn } of PROVIDERS) {
    try {
      console.log(`🤖 Trying ${name}…`);
      const text = await fn(question);
      console.log(`✅ Response from ${name}`);
      return { text, provider: name };
    } catch (err) {
      console.warn(`⚠️  ${name} failed: ${err.message}`);
      errors.push(`${name}: ${err.message}`);
    }
  }

  throw new Error(`All AI providers failed.\n${errors.join('\n')}`);
};

/**
 * Generate a streaming AI response (WebSocket path).
 *
 * STREAMING PRIORITY (Render-safe):
 *   1. Grok (Groq) native stream  — reliable on Render's proxy/HTTP stack
 *   2. Gemini non-stream simulated — uses the stable REST API, then slices
 *      the full response into small chunks to preserve real-time UX.
 *      This completely avoids the Render HTTP/2 "Failed to parse stream" bug.
 *
 * Yields { text: () => string } — Gemini-compatible shape, zero changes
 * needed in socketHandler.js.
 *
 * @param {string} question
 * @returns {AsyncGenerator<{ text: () => string }>}
 */
async function* generateStreamResponse(question) {
  const prompt = `${SYSTEM_INSTRUCTION}\n\nStudent Question: ${question}`;

  // ── 1. Grok native streaming (primary) ───────────────────────────────────
  try {
    console.log('🤖 Trying Grok (stream)…');
    const client = getGrokClient();
    const grokStream = await client.chat.completions.create({
      model: GROK_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: question },
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: true,
    });

    for await (const chunk of grokStream) {
      const content = chunk.choices[0]?.delta?.content || '';
      yield { text: () => content };
    }
    console.log('✅ Grok stream completed');
    return; // ← done
  } catch (grokErr) {
    console.warn(`⚠️  Grok stream failed: ${grokErr.message}`);
  }

  // ── 2. Gemini non-stream → simulated streaming (fallback) ────────────────
  // Uses smartGenerate (REST, no SSE) so Render's proxy can never break the
  // stream mid-way. The full text is sliced into ~40-char chunks to keep the
  // typing animation alive in the frontend.
  try {
    console.log('🤖 Gemini non-stream fallback (simulated streaming)…');
    const { text, modelUsed } = await smartGenerate(prompt);
    console.log(`✅ Gemini [${modelUsed}] responded — simulating stream…`);

    const CHUNK_SIZE = 40; // characters per simulated chunk
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      const slice = text.slice(i, i + CHUNK_SIZE);
      yield { text: () => slice };
      // Small async pause so the event loop can flush each chunk to the socket
      await new Promise((r) => setImmediate(r));
    }
    return;
  } catch (geminiErr) {
    console.warn(`⚠️  Gemini fallback failed: ${geminiErr.message}`);
  }

  throw new Error('All AI providers failed to produce a stream response.');
}

module.exports = { generateResponse, generateStreamResponse };
