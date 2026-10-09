const express = require('express');
const router = express.Router();
const mongoAnalyticsService = require('../services/mongoAnalyticsService');
const auth = require('../middleware/auth');

// Get daily message statistics
router.get('/daily', auth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const stats = await mongoAnalyticsService.getDailyStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error in /analytics/daily:', error);
    res.status(500).json({ error: 'Failed to fetch daily statistics' });
  }
});

// Get top users by message count
router.get('/top-users', auth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const limit = parseInt(req.query.limit) || 10;
    const users = await mongoAnalyticsService.getTopUsers(limit);
    res.json({ users });
  } catch (error) {
    console.error('Error in /analytics/top-users:', error);
    res.status(500).json({ error: 'Failed to fetch top users' });
  }
});

// Get overall statistics
router.get('/overall', auth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const stats = await mongoAnalyticsService.getOverallStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error in /analytics/overall:', error);
    res.status(500).json({ error: 'Failed to fetch overall statistics' });
  }
});

// Get hourly distribution
router.get('/hourly', auth, async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const distribution = await mongoAnalyticsService.getHourlyDistribution();
    res.json({ distribution });
  } catch (error) {
    console.error('Error in /analytics/hourly:', error);
    res.status(500).json({ error: 'Failed to fetch hourly distribution' });
  }
});

module.exports = router;
