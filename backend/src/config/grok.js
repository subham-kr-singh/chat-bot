const Groq = require('groq-sdk');

let groqClient = null;

const getGrokClient = () => {
  if (!groqClient) {
    if (!process.env.GROK_API_KEY) {
      throw new Error('GROK_API_KEY is not set in environment variables');
    }
    groqClient = new Groq({ apiKey: process.env.GROK_API_KEY });
  }
  return groqClient;
};

module.exports = { getGrokClient };
