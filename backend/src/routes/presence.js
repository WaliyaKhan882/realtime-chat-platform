const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

/**
 * @route   GET /api/presence/:userId
 * @desc    Get online status and last seen for a user
 * @access  Private
 */
router.get('/:userId', auth, async (req, res) => {
  try {
    const presenceService = req.app.get('presenceService');
    const { userId } = req.params;
    
    const isOnline = await presenceService.isUserOnline(userId);
    const lastSeen = await presenceService.getLastSeen(userId);
    
    res.json({
      userId,
      isOnline,
      lastSeen,
      status: isOnline ? 'online' : 'offline'
    });
  } catch (error) {
    console.error('Error fetching presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence status' });
  }
});

/**
 * @route   POST /api/presence/bulk
 * @desc    Get online status for multiple users
 * @access  Private
 */
router.post('/bulk', auth, async (req, res) => {
  try {
    const presenceService = req.app.get('presenceService');
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds must be an array' });
    }
    
    const statusMap = await presenceService.getBulkOnlineStatus(userIds);
    
    res.json({ statusMap });
  } catch (error) {
    console.error('Error fetching bulk presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence status' });
  }
});

/**
 * @route   POST /api/presence/bulk-status
 * @desc    Get detailed online status for multiple users (frontend endpoint)
 * @access  Private
 */
router.post('/bulk-status', auth, async (req, res) => {
  try {
    const presenceService = req.app.get('presenceService');
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: 'userIds must be an array' });
    }
    
    const statuses = {};
    
    for (const userId of userIds) {
      const isOnline = await presenceService.isUserOnline(userId);
      const lastSeen = await presenceService.getLastSeen(userId);
      statuses[userId] = {
        isOnline,
        lastSeen
      };
    }
    
    res.json({ statuses });
  } catch (error) {
    console.error('Error fetching bulk presence:', error);
    res.status(500).json({ error: 'Failed to fetch presence status' });
  }
});

/**
 * @route   GET /api/presence/typing/:chatId
 * @desc    Get users currently typing in a chat
 * @access  Private
 */
router.get('/typing/:chatId', auth, async (req, res) => {
  try {
    const presenceService = req.app.get('presenceService');
    const { chatId } = req.params;
    
    const typingUsers = await presenceService.getTypingUsers(chatId);
    
    res.json({
      chatId,
      typingUsers
    });
  } catch (error) {
    console.error('Error fetching typing users:', error);
    res.status(500).json({ error: 'Failed to fetch typing users' });
  }
});

/**
 * @route   GET /api/presence/stats
 * @desc    Get overall presence statistics
 * @access  Private
 */
router.get('/stats', auth, async (req, res) => {
  try {
    const presenceService = req.app.get('presenceService');
    
    const onlineCount = await presenceService.getOnlineUsersCount();
    
    res.json({
      onlineUsersCount: onlineCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching presence stats:', error);
    res.status(500).json({ error: 'Failed to fetch presence statistics' });
  }
});

module.exports = router;
