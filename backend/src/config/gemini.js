const { GoogleGenerativeAI } = require('@google/generative-ai');

let genAI = null;
const getGeminiClient = () => {
  if (!genAI) genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  return genAI;
};

// Priority list: Newest/Fastest -> Stable/Powerful -> Legacy
const MODEL_PRIORITY = [
  'gemini-3.1-flash-lite-preview', 
  'gemini-2.5-pro',
  'gemini-2.5-flash'
];

/**
 * Attempts to generate content using the priority list.
 * If one model is busy (503), it instantly tries the next one.
 */
const smartGenerate = async (prompt, modelIndex = 0) => {
  if (modelIndex >= MODEL_PRIORITY.length) {
    throw new Error("All Gemini models are currently overloaded.");
  }

  const modelName = MODEL_PRIORITY[modelIndex];
  const model = getGeminiClient().getGenerativeModel({ model: modelName });

  try {
    const result = await model.generateContent(prompt);
    return { response: result.response.text(), modelUsed: modelName };
  } catch (error) {
    // Catching the 503 'Service Unavailable' or 429 'Rate Limit'
    if (error.status === 503 || error.status === 429) {
      console.warn(`Model ${modelName} busy. Failing over to ${MODEL_PRIORITY[modelIndex + 1]}...`);
      return smartGenerate(prompt, modelIndex + 1);
    }
    throw error; // Rethrow actual syntax or auth errors
  }
};

module.exports = { smartGenerate };
