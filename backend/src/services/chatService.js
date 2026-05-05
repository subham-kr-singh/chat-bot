const Chat = require('../models/Chat');

/**
 * Save a question + answer pair to MongoDB.
 * @param {string} question
 * @param {string} answer
 * @returns {Promise<Chat>}
 */
const saveChat = async (question, answer) => {
  const chat = new Chat({ question, answer });
  return await chat.save();
};

/**
 * Retrieve chat history, newest first, capped at 50.
 * @returns {Promise<Chat[]>}
 */
const getHistory = async () => {
  return await Chat.find().sort({ createdAt: -1 }).limit(50).lean();
};

/**
 * Delete all chat documents from the collection.
 * @returns {Promise<mongoose.DeleteResult>}
 */
const clearHistory = async () => {
  return await Chat.deleteMany({});
};

module.exports = { saveChat, getHistory, clearHistory };
