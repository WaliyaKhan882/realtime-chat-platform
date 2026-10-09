const { Kafka } = require('kafkajs');
const Message = require('../models/Message');
const Chat = require('../models/Chat');
const mongoAnalytics = require('./mongoAnalyticsService');

class KafkaConsumer {
  constructor(io = null) {
    this.kafka = new Kafka({
      clientId: 'whatsapp-consumer',
      brokers: ['localhost:9092'],
      retry: {
        retries: 5,
        initialRetryTime: 300
      }
    });

    this.consumer = this.kafka.consumer({
      groupId: 'whatsapp-message-group',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });

    this.isConnected = false;
    this.messageBuffer = [];
    this.BATCH_SIZE = 100;
    this.BATCH_TIMEOUT = 5000; // 5 seconds
    this.batchTimer = null;
    this.io = io; // Store Socket.IO instance
  }
  
  setIO(io) {
    this.io = io;
  }

  async connect() {
    try {
      await this.consumer.connect();
      this.isConnected = true;
      console.log('✅ Kafka Consumer connected');

      // Subscribe to topics
      await this.consumer.subscribe({ 
        topics: ['chat-messages', 'analytics-events'],
        fromBeginning: false 
      });

      console.log('📡 Subscribed to Kafka topics: chat-messages, analytics-events');
      
      // Start consuming
      await this.startConsuming();
    } catch (error) {
      console.error('❌ Kafka Consumer connection error:', error.message);
      this.isConnected = false;
      // Retry connection after 5 seconds
      setTimeout(() => this.connect(), 5000);
    }
  }

  async startConsuming() {
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data = JSON.parse(message.value.toString());
          
          console.log(`📥 Received from Kafka [${topic}]:`, {
            partition,
            offset: message.offset,
            key: message.key?.toString()
          });

          if (topic === 'chat-messages') {
            await this.handleChatMessage(data);
          } else if (topic === 'analytics-events') {
            await this.handleAnalyticsEvent(data);
          }
        } catch (error) {
          console.error('❌ Error processing Kafka message:', error);
        }
      }
    });
  }

  async handleChatMessage(data) {
    // Add to buffer for batch processing
    this.messageBuffer.push(data);
    console.log(`📦 Buffer size: ${this.messageBuffer.length}/${this.BATCH_SIZE}`);

    // Process immediately if batch is full
    if (this.messageBuffer.length >= this.BATCH_SIZE) {
      await this.processBatch();
    } else {
      // Set timer to process batch after timeout
      this.resetBatchTimer();
    }
  }

  resetBatchTimer() {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }
    this.batchTimer = setTimeout(() => {
      if (this.messageBuffer.length > 0) {
        this.processBatch();
      }
    }, this.BATCH_TIMEOUT);
  }

  async processBatch() {
    if (this.messageBuffer.length === 0) return;

    const batch = [...this.messageBuffer];
    this.messageBuffer = [];
    
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    console.log(`💾 Processing batch of ${batch.length} messages`);

    try {
      // Prepare bulk operations
      const bulkOps = batch.map(msg => ({
        insertOne: {
          document: {
            chat_id: msg.chat_id,
            sender_id: msg.sender_id,
            content: msg.content,
            media_url: msg.media_url,
            timestamp: msg.timestamp || new Date(),
            status: 'sent',
            delivered_to: [],
            seen_by: [],
            deleted_for: []
          }
        }
      }));

      // Batch insert to MongoDB
      const result = await Message.bulkWrite(bulkOps, { ordered: false });
      console.log(`✅ Batch write complete: ${result.insertedCount} messages saved`);

      // Get the saved messages with their real IDs and emit to clients
      console.log(`🔍 Checking IO: this.io=${!!this.io}, insertedCount=${result.insertedCount}`);
      if (this.io && result.insertedCount > 0) {
        const insertedIds = Object.values(result.insertedIds);
        console.log(`🔍 Inserted IDs:`, insertedIds);
        const savedMessages = await Message.find({ _id: { $in: insertedIds } }).populate('sender_id', 'name email profile_image_url');
        console.log(`📨 Found ${savedMessages.length} saved messages to emit`);
        
        // Emit each message with real ID to its chat room
        savedMessages.forEach(msg => {
          const tempId = `temp-${msg.timestamp.getTime()}`;
          console.log(`🔄 Emitting message-id-update: ${tempId} → ${msg._id} to chat:${msg.chat_id}`);
          this.io.to(`chat:${msg.chat_id}`).emit('message-id-update', {
            tempId,
            realId: msg._id,
            message: msg
          });
        });
      } else {
        console.log(`⚠️ Skipping message-id-update: io=${!!this.io}, insertedCount=${result.insertedCount}`);
      }

      // Update last_message for affected chats
      const chatUpdates = new Map();
      batch.forEach(msg => {
        if (!chatUpdates.has(msg.chat_id)) {
          chatUpdates.set(msg.chat_id, msg);
        }
      });

      // Update chats in parallel
      await Promise.all(
        Array.from(chatUpdates.entries()).map(([chatId, lastMsg]) =>
          Chat.findByIdAndUpdate(chatId, {
            $set: {
              'last_message.content': lastMsg.content,
              'last_message.timestamp': lastMsg.timestamp || new Date(),
              'last_message.sender_id': lastMsg.sender_id
            }
          })
        )
      );

      // Track analytics for all messages
      for (const msg of batch) {
        await mongoAnalytics.trackMessage(
          msg.sender_id,
          msg.chat_id,
          msg.content?.length || 0
        );
      }

      console.log(`📊 Analytics tracked for ${batch.length} messages`);
    } catch (error) {
      console.error('❌ Batch processing error:', error);
      // Re-queue failed messages
      this.messageBuffer.push(...batch);
    }
  }

  async handleAnalyticsEvent(data) {
    // Handle analytics events (can be extended)
    console.log('📊 Analytics event:', data);
  }

  async disconnect() {
    if (this.isConnected) {
      // Process remaining messages
      if (this.messageBuffer.length > 0) {
        console.log('📦 Processing remaining messages before disconnect...');
        await this.processBatch();
      }
      
      await this.consumer.disconnect();
      this.isConnected = false;
      console.log('🔌 Kafka Consumer disconnected');
    }
  }
}

// Singleton instance
const kafkaConsumer = new KafkaConsumer();

module.exports = kafkaConsumer;
