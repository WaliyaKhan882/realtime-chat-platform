/**
 * Presence Service - Redis-based online status and last seen tracking
 * Key-value storage for quick lookups (< 1ms response time)
 */

class PresenceService {
  constructor(redisClient) {
    this.redis = redisClient;
    this.ONLINE_PREFIX = 'user:online:';
    this.LAST_SEEN_PREFIX = 'user:lastseen:';
    this.TYPING_PREFIX = 'user:typing:';
    this.ONLINE_EXPIRE = 30; // 30 seconds - user considered offline if no heartbeat
  }

  /**
   * Mark user as online
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async setUserOnline(userId) {
    try {
      const key = `${this.ONLINE_PREFIX}${userId}`;
      await this.redis.set(key, '1', { EX: this.ONLINE_EXPIRE });
      console.log(`✅ User ${userId} is now online`);
      return true;
    } catch (error) {
      console.error('Error setting user online:', error);
      return false;
    }
  }

  /**
   * Update last seen timestamp
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async updateLastSeen(userId) {
    try {
      const key = `${this.LAST_SEEN_PREFIX}${userId}`;
      const timestamp = new Date().toISOString();
      await this.redis.set(key, timestamp);
      return true;
    } catch (error) {
      console.error('Error updating last seen:', error);
      return false;
    }
  }

  /**
   * Mark user as offline and update last seen
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async setUserOffline(userId) {
    try {
      const onlineKey = `${this.ONLINE_PREFIX}${userId}`;
      await this.redis.del(onlineKey);
      await this.updateLastSeen(userId);
      console.log(`✅ User ${userId} is now offline`);
      return true;
    } catch (error) {
      console.error('Error setting user offline:', error);
      return false;
    }
  }

  /**
   * Check if user is online
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async isUserOnline(userId) {
    try {
      const key = `${this.ONLINE_PREFIX}${userId}`;
      const result = await this.redis.get(key);
      return result === '1';
    } catch (error) {
      console.error('Error checking online status:', error);
      return false;
    }
  }

  /**
   * Get user's last seen timestamp
   * @param {string} userId - User ID
   * @returns {Promise<string|null>}
   */
  async getLastSeen(userId) {
    try {
      const key = `${this.LAST_SEEN_PREFIX}${userId}`;
      return await this.redis.get(key);
    } catch (error) {
      console.error('Error getting last seen:', error);
      return null;
    }
  }

  /**
   * Get online status for multiple users
   * @param {string[]} userIds - Array of user IDs
   * @returns {Promise<Object>} Map of userId -> isOnline
   */
  async getBulkOnlineStatus(userIds) {
    try {
      const pipeline = this.redis.multi();
      userIds.forEach(userId => {
        pipeline.get(`${this.ONLINE_PREFIX}${userId}`);
      });
      const results = await pipeline.exec();
      
      const statusMap = {};
      userIds.forEach((userId, index) => {
        statusMap[userId] = results[index] === '1';
      });
      
      return statusMap;
    } catch (error) {
      console.error('Error getting bulk online status:', error);
      return {};
    }
  }

  /**
   * Set user typing status in a chat
   * @param {string} userId - User ID
   * @param {string} chatId - Chat ID
   * @param {boolean} isTyping - Typing status
   * @returns {Promise<boolean>}
   */
  async setTypingStatus(userId, chatId, isTyping) {
    try {
      const key = `${this.TYPING_PREFIX}${chatId}:${userId}`;
      if (isTyping) {
        await this.redis.set(key, '1', { EX: 5 }); // Auto-expire after 5 seconds
      } else {
        await this.redis.del(key);
      }
      return true;
    } catch (error) {
      console.error('Error setting typing status:', error);
      return false;
    }
  }

  /**
   * Get all users typing in a chat
   * @param {string} chatId - Chat ID
   * @returns {Promise<string[]>} Array of user IDs who are typing
   */
  async getTypingUsers(chatId) {
    try {
      const pattern = `${this.TYPING_PREFIX}${chatId}:*`;
      const keys = await this.redis.keys(pattern);
      
      const userIds = keys.map(key => {
        const parts = key.split(':');
        return parts[parts.length - 1];
      });
      
      return userIds;
    } catch (error) {
      console.error('Error getting typing users:', error);
      return [];
    }
  }

  /**
   * Get all online users count (for analytics)
   * @returns {Promise<number>}
   */
  async getOnlineUsersCount() {
    try {
      const keys = await this.redis.keys(`${this.ONLINE_PREFIX}*`);
      return keys.length;
    } catch (error) {
      console.error('Error getting online users count:', error);
      return 0;
    }
  }

  /**
   * Heartbeat - keeps user online status fresh
   * Should be called every 10-15 seconds from client
   * @param {string} userId - User ID
   * @returns {Promise<boolean>}
   */
  async heartbeat(userId) {
    await this.setUserOnline(userId);
    return true;
  }
}

module.exports = PresenceService;
