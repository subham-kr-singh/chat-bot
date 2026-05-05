const express = require('express');
const router = express.Router();
const { sendMessage, getChatHistory, deleteChatHistory } = require('../controllers/chatController');
const { asyncHandler } = require('../middleware/errorHandler');

// POST   /api/chat          → send a question, get AI response
router.post('/', asyncHandler(sendMessage));

// GET    /api/chat/history  → fetch all past chats
router.get('/history', asyncHandler(getChatHistory));

// DELETE /api/chat/history  → clear all chats
router.delete('/history', asyncHandler(deleteChatHistory));

module.exports = router;
