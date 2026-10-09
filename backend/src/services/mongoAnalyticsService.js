const Message = require('../models/Message');

class MongoAnalyticsService {
  // Track message (no-op for MongoDB since messages are already stored)
  async trackMessage(userId, chatId) {
    // Messages are automatically tracked in MongoDB
    return true;
  }

  // Get daily message stats for last 30 days
  async getDailyStats() {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stats = await Message.aggregate([
        {
          $match: {
            timestamp: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$timestamp" }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      return stats.map(s => ({ date: s._id, message_count: s.count }));
    } catch (error) {
      console.error('MongoDB analytics error:', error);
      return [];
    }
  }

  // Get top users by message count
  async getTopUsers(limit = 10) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const stats = await Message.aggregate([
        {
          $match: {
            timestamp: { $gte: thirtyDaysAgo }
          }
        },
        {
          $group: {
            _id: "$sender_id",
            message_count: { $sum: 1 }
          }
        },
        {
          $sort: { message_count: -1 }
        },
        {
          $limit: limit
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'userInfo'
          }
        },
        {
          $unwind: '$userInfo'
        },
        {
          $project: {
            user_id: { $toString: '$_id' },
            username: '$userInfo.name',
            message_count: 1
          }
        }
      ]);

      return stats;
    } catch (error) {
      console.error('MongoDB analytics error:', error);
      return [];
    }
  }

  // Get hourly distribution for today
  async getHourlyDistribution() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = await Message.aggregate([
        {
          $match: {
            timestamp: { $gte: today }
          }
        },
        {
          $group: {
            _id: { $hour: "$timestamp" },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      return stats.map(s => ({ hour: s._id, message_count: s.count }));
    } catch (error) {
      console.error('MongoDB analytics error:', error);
      return [];
    }
  }

  // Get overall stats
  async getOverallStats() {
    try {
      const totalMessages = await Message.countDocuments();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayMessages = await Message.countDocuments({ timestamp: { $gte: today } });

      // Get peak hour
      const hourlyToday = await Message.aggregate([
        {
          $match: {
            timestamp: { $gte: today }
          }
        },
        {
          $group: {
            _id: { $hour: "$timestamp" },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 1
        }
      ]);

      const peakHour = hourlyToday.length > 0 ? hourlyToday[0]._id : null;

      return {
        total_messages: totalMessages,
        messages_today: todayMessages,
        peak_hour: peakHour
      };
    } catch (error) {
      console.error('MongoDB analytics error:', error);
      return { total_messages: 0, messages_today: 0, peak_hour: null };
    }
  }
}

module.exports = new MongoAnalyticsService();
