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
 * Implemented as an async GENERATOR so that Gemini's chunk iteration
 * happens INSIDE this function — any "Failed to parse stream" or other
 * mid-stream error is caught here and Grok takes over seamlessly before
 * any broken data reaches the socket handler.
 *
 * Yields objects with a .text() method (Gemini-compatible shape).
 * socketHandler.js: `const stream = await generateStreamResponse(q)`
 * still works because awaiting a non-Promise returns it as-is.
 *
 * @param {string} question
 * @returns {AsyncGenerator<{ text: () => string }>}
 */
async function* generateStreamResponse(question) {
  const prompt = `${SYSTEM_INSTRUCTION}\n\nStudent Question: ${question}`;
  let chunksEmitted = 0;

  // ── Try Gemini streaming ─────────────────────────────────────────────────
  // Wrap the for-await in try-catch so "Failed to parse stream" (Render
  // proxy / HTTP-2 issue) is caught HERE, not in socketHandler.
  try {
    console.log('🤖 Trying Gemini (stream)…');
    const geminiStream = await smartGenerateStream(prompt);

    for await (const chunk of geminiStream) {
      chunksEmitted++;
      yield chunk; // already has .text() → compatible with socketHandler
    }
    return; // ← Gemini finished cleanly, we're done
  } catch (geminiErr) {
    console.warn(
      `⚠️  Gemini stream failed after ${chunksEmitted} chunk(s): ${geminiErr.message}`
    );
    // If we already pushed partial content, re-throw — the client already
    // has part of the answer and we can't cleanly restart from Grok.
    if (chunksEmitted > 0) throw geminiErr;
  }

  // ── Grok stream fallback (only reached when 0 Gemini chunks emitted) ────
  try {
    console.log('🤖 Grok stream fallback…');
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
  } catch (grokErr) {
    console.warn(`⚠️  Grok stream failed: ${grokErr.message}`);
    throw new Error('All AI providers failed to produce a stream response.');
  }
}

module.exports = { generateResponse, generateStreamResponse };
