const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

router.get('/', chatController.getUserChats);
router.post('/', chatController.createChat);
router.delete('/:chatId', chatController.deleteChat);
router.get('/:chatId/messages', chatController.getChatMessages);
router.post('/:chatId/messages', chatController.sendMessage);
router.delete('/:chatId/messages/:messageId', chatController.deleteMessage);

module.exports = router;
