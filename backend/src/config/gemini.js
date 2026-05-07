const { GoogleGenerativeAI } = require('@google/generative-ai');

let geminiClient = null;

// ── Singleton client ──────────────────────────────────────────────────────────
const getGeminiClient = () => {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set in environment variables');
    }
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
};

// ── Model priority list (fastest/newest → stable → legacy) ───────────────────
// NOTE: Gemini versions go up to 2.x as of 2025. There is NO gemini-3.x.
const MODEL_PRIORITY = [
  'gemini-2.5-flash',   // newest & fastest — try first
  'gemini-2.5-pro',     // more powerful, higher quota usage
  'gemini-2.0-flash',   // stable GA fallback
  'gemini-1.5-flash',   // legacy safety net
];

/**
 * Get a model instance for a given index in the priority list.
 * Used by aiService for streaming (needs the raw model object).
 * @param {number} index
 */
const getModel = (index = 0) => {
  return getGeminiClient().getGenerativeModel({ model: MODEL_PRIORITY[index] });
};

/**
 * Smart non-streaming generate with automatic model fallback.
 * If a model returns 503 (overloaded) or 429 (rate-limited), the next
 * model in MODEL_PRIORITY is tried automatically.
 *
 * @param {string} prompt  Full prompt string
 * @param {number} modelIndex  Internal recursion index (default 0)
 * @returns {Promise<{ text: string, modelUsed: string }>}
 */
const smartGenerate = async (prompt, modelIndex = 0) => {
  if (modelIndex >= MODEL_PRIORITY.length) {
    throw new Error('All Gemini models are currently overloaded or unavailable.');
  }

  const modelName = MODEL_PRIORITY[modelIndex];
  const model = getGeminiClient().getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContent(prompt);
    return { text: result.response.text(), modelUsed: modelName };
  } catch (err) {
    // 503 = Service Unavailable, 429 = Rate Limit → try next model
    if (err.status === 503 || err.status === 429) {
      console.warn(`⚠️  Gemini [${modelName}] busy (${err.status}). Trying next model…`);
      return smartGenerate(prompt, modelIndex + 1);
    }
    throw err; // Auth errors, bad prompts, etc. → bubble up immediately
  }
};

/**
 * Smart streaming generate with automatic model fallback.
 * Returns the raw Gemini stream (async iterable of chunks with .text()).
 *
 * @param {string} prompt
 * @param {number} modelIndex
 * @returns {Promise<AsyncIterable>}
 */
const smartGenerateStream = async (prompt, modelIndex = 0) => {
  if (modelIndex >= MODEL_PRIORITY.length) {
    throw new Error('All Gemini models are currently overloaded or unavailable.');
  }

  const modelName = MODEL_PRIORITY[modelIndex];
  const model = getGeminiClient().getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContentStream(prompt);
    console.log(`✅ Gemini streaming from [${modelName}]`);
    return result.stream;
  } catch (err) {
    if (err.status === 503 || err.status === 429) {
      console.warn(`⚠️  Gemini [${modelName}] busy (${err.status}). Trying next model…`);
      return smartGenerateStream(prompt, modelIndex + 1);
    }
    throw err;
  }
};

module.exports = { getGeminiClient, getModel, smartGenerate, smartGenerateStream };
