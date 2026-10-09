const { client, isClientConnected } = require('../config/cassandra');

class AnalyticsService {
  // Track a new message in Cassandra
  async trackMessage(messageData) {
    if (!isClientConnected()) {
      console.log('⚠️ Cassandra not connected, skipping analytics tracking');
      return;
    }
    
    try {
      const { chat_id, sender_id, timestamp } = messageData;
      const date = new Date(timestamp);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
      const hour = date.getHours();

      // Update daily message stats (by hour)
      await client.execute(
        'UPDATE daily_message_stats SET message_count = message_count + 1 WHERE date = ? AND hour = ?',
        [dateStr, hour],
        { prepare: true }
      );

      // Update user message stats
      await client.execute(
        'UPDATE user_message_stats SET message_count = message_count + 1 WHERE user_id = ? AND date = ?',
        [sender_id.toString(), dateStr],
        { prepare: true }
      );

      // Update chat stats
      await client.execute(
        'UPDATE chat_stats SET message_count = message_count + 1 WHERE chat_id = ? AND date = ?',
        [chat_id.toString(), dateStr],
        { prepare: true }
      );

      // Update overall total
      await client.execute(
        'UPDATE overall_stats SET stat_value = stat_value + 1 WHERE stat_name = ?',
        ['total_messages'],
        { prepare: true }
      );

    } catch (error) {
      console.error('Error tracking message in analytics:', error);
    }
  }

  // Get daily message stats for the last N days
  async getDailyStats(days = 7) {
    if (!isClientConnected()) {
      return [];
    }
    
    try {
      const dates = [];
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }

      const results = await client.execute(
        'SELECT date, hour, message_count FROM daily_message_stats',
        [],
        { prepare: true }
      );

      // Aggregate by date
      const dailyTotals = {};
      results.rows.forEach(row => {
        const dateStr = row.date;
        const count = parseInt(row.message_count || 0);
        dailyTotals[dateStr] = (dailyTotals[dateStr] || 0) + count;
      });

      // Convert to array format and filter to requested days
      const dailyData = dates.map(date => ({
        date,
        message_count: dailyTotals[date] || 0
      }));

      return dailyData;
    } catch (error) {
      console.error('Error getting daily stats:', error);
      return [];
    }
  }

  // Get top users by message count
  async getTopUsers(limit = 10) {
    if (!isClientConnected()) {
      return [];
    }
    
    try {
      // Get stats for last 30 days to have data
      const dates = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        dates.push(date.toISOString().split('T')[0]);
      }
      
      const results = await client.execute(
        'SELECT user_id, date, message_count FROM user_message_stats',
        [],
        { prepare: true }
      );

      // Aggregate by user_id
      const userTotals = {};
      results.rows.forEach(row => {
        const userId = row.user_id;
        const count = parseInt(row.message_count || 0);
        userTotals[userId] = (userTotals[userId] || 0) + count;
      });

      // Convert to array and sort
      const sorted = Object.entries(userTotals)
        .map(([user_id, message_count]) => ({ user_id, message_count }))
        .sort((a, b) => b.message_count - a.message_count)
        .slice(0, limit);

      return sorted;
    } catch (error) {
      console.error('Error getting top users:', error);
      return [];
    }
  }

  // Get overall statistics
  async getOverallStats() {
    if (!isClientConnected()) {
      return { totalMessages: 0, totalUsers: 0, totalChats: 0 };
    }
    
    try {
      const result = await client.execute(
        'SELECT stat_name, stat_value FROM overall_stats WHERE stat_name = ?',
        ['total_messages'],
        { prepare: true }
      );

      return result.rows[0] || { stat_name: 'total_messages', stat_value: 0 };
    } catch (error) {
      console.error('Error getting overall stats:', error);
      return { stat_name: 'total_messages', stat_value: 0 };
    }
  }

  // Get hourly distribution for today
  async getHourlyDistribution() {
    if (!isClientConnected()) {
      return Array(24).fill(0);
    }
    
    try {
      const date = new Date().toISOString().split('T')[0];
      
      const results = await client.execute(
        'SELECT hour, message_count FROM daily_message_stats WHERE date = ?',
        [date],
        { prepare: true }
      );

      return results.rows.sort((a, b) => a.hour - b.hour);
    } catch (error) {
      console.error('Error getting hourly distribution:', error);
      return [];
    }
  }
}

module.exports = new AnalyticsService();
