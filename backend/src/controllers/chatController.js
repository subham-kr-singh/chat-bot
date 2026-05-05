const { generateResponse } = require('../services/geminiService');
const { saveChat, getHistory, clearHistory } = require('../services/chatService');

/**
 * POST /api/chat
 * Receives a question, gets AI response, saves to DB, returns result.
 */
const sendMessage = async (req, res) => {
  const { question } = req.body;

  if (!question || question.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'Question is required',
    });
  }

  const answer = await generateResponse(question.trim());
  const chat = await saveChat(question.trim(), answer);

  res.status(201).json({
    success: true,
    data: {
      id: chat._id,
      question: chat.question,
      answer: chat.answer,
      createdAt: chat.createdAt,
    },
  });
};

/**
 * GET /api/chat/history
 * Returns all saved chats, newest first.
 */
const getChatHistory = async (req, res) => {
  const chats = await getHistory();

  res.status(200).json({
    success: true,
    count: chats.length,
    data: chats,
  });
};

/**
 * DELETE /api/chat/history
 * Removes all chat records from the database.
 */
const deleteChatHistory = async (req, res) => {
  await clearHistory();

  res.status(200).json({
    success: true,
    message: 'Chat history cleared successfully',
  });
};

module.exports = { sendMessage, getChatHistory, deleteChatHistory };
