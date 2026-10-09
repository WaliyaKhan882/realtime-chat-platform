require('dotenv').config();
const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const redis = require('redis');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { connectCassandra, initializeCassandraSchema } = require('./config/cassandra');
const { connectMinio } = require('./config/minio');
const analyticsService = require('./services/analyticsService');
const PresenceService = require('./services/presenceService');
const kafkaProducer = require('./services/kafkaProducer');
const kafkaConsumer = require('./services/kafkaConsumer');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting - 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

app.use('/api/', limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp')
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Redis Connection
const redisClient = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.connect()
  .then(() => console.log('✅ Redis Connected'))
  .catch(err => console.error('❌ Redis Error:', err));

redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Make Redis client available globally
app.set('redisClient', redisClient);

// Initialize Presence Service for online status tracking
const presenceService = new PresenceService(redisClient);
app.set('presenceService', presenceService);

// Cassandra Connection - Now working with Cassandra 3.11 + Node.js 20
(async () => {
  try {
    const connected = await connectCassandra();
    if (connected) {
      await initializeCassandraSchema();
      console.log('✅ Cassandra initialized with schema');
    }
  } catch (err) {
    console.error('❌ Cassandra error:', err.message);
    console.log('⚠️ Analytics features will be limited without Cassandra');
  }
})();

// MinIO Connection (with retry logic built-in)
connectMinio();

// Routes
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    redis: redisClient.isOpen ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Import routes (you'll create these)
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chats');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const mediaRoutes = require('./routes/media');
const presenceRoutes = require('./routes/presence');
const groupRoutes = require('./routes/groups');

app.use('/api/auth', authRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/users', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/presence', presenceRoutes);
app.use('/api/groups', groupRoutes);

// Make io available to controllers
app.set('io', io);

// Socket.IO Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch (err) {
    next(new Error('Authentication error: Invalid token'));
  }
});

// Socket.IO Connection Handler
io.on('connection', async (socket) => {
  console.log(`✅ User connected: ${socket.userId}`);

  // Set user online using PresenceService
  await presenceService.setUserOnline(socket.userId);
  
  // Broadcast online status to all connected clients
  io.emit('user-online', { 
    userId: socket.userId,
    timestamp: new Date().toISOString()
  });
  
  console.log(`📡 Broadcasting: User ${socket.userId} is online`);

  // Join user's personal room
  socket.join(`user:${socket.userId}`);

  // Handle joining chat rooms
  socket.on('join-chat', (chatId) => {
    socket.join(`chat:${chatId}`);
    console.log(`User ${socket.userId} joined chat ${chatId}`);
  });

  // Handle heartbeat to keep user online
  socket.on('heartbeat', async () => {
    await presenceService.heartbeat(socket.userId);
  });

  // Handle typing indicator
  socket.on('typing', async (data) => {
    const { chatId, isTyping } = data;
    await presenceService.setTypingStatus(socket.userId, chatId, isTyping);
    
    // Broadcast to other users in the chat
    socket.to(`chat:${chatId}`).emit('user-typing', {
      userId: socket.userId,
      chatId,
      isTyping
    });
  });

  // Handle sending messages
  socket.on('send-message', async (data) => {
    try {
      const { chat_id, content, media_url } = data;
      
      console.log(`📨 Message from ${socket.userId} to chat ${chat_id}: ${content}`);
      
      // Get sender info
      const User = require('./models/User');
      const sender = await User.findById(socket.userId, 'name profile_image_url email');

      // Create message object
      const messageData = {
        chat_id: chat_id,
        sender_id: socket.userId,
        content,
        media_url,
        timestamp: new Date(),
        status: 'sent'
      };

      // Send to Kafka for async processing
      const kafkaSent = await kafkaProducer.sendMessage('chat-messages', messageData);
      
      if (kafkaSent) {
        console.log('📤 Message sent to Kafka pipeline');
      } else {
        console.log('⚠️ Kafka unavailable, saving directly to MongoDB');
        // Fallback: Save directly to MongoDB if Kafka is down
        const Message = require('./models/Message');
        const message = new Message(messageData);
        await message.save();
        messageData._id = message._id;
      }

      // Emit to all users in the chat immediately (optimistic update)
      const emitData = {
        _id: messageData._id || `temp-${Date.now()}`,
        chat_id: messageData.chat_id,
        sender_id: {
          _id: sender._id,
          name: sender.name,
          profile_image_url: sender.profile_image_url,
          email: sender.email
        },
        content: messageData.content,
        media_url: messageData.media_url,
        timestamp: messageData.timestamp,
        status: messageData.status
      };
      
      io.to(`chat:${chat_id}`).emit('receive-message', emitData);
      console.log(`✅ Message delivered to chat:${chat_id}`);

    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message', error: error.message });
    }
  });

  // Handle message delivered status
  socket.on('message-delivered', async (data) => {
    try {
      const { messageId, chatId } = data;
      
      console.log(`📬 Received message-delivered: messageId=${messageId}, chatId=${chatId}, from user=${socket.userId}`);
      
      // Skip temp IDs that haven't been saved to MongoDB yet
      if (!messageId || messageId.toString().startsWith('temp-')) {
        console.log(`⏭️ Skipping temp ID: ${messageId}`);
        return;
      }
      
      const Message = require('./models/Message');
      
      const message = await Message.findById(messageId);
      if (message && !message.delivered_to.includes(socket.userId)) {
        message.delivered_to.push(socket.userId);
        if (message.status === 'sent') {
          message.status = 'delivered';
        }
        await message.save();

        console.log(`✓ Message ${messageId} marked as delivered by user ${socket.userId}`);
        console.log(`📤 Emitting message-status-updated to chat:${chatId} and sender user:${message.sender_id}`);
        
        // Notify everyone in the chat room
        io.to(`chat:${chatId}`).emit('message-status-updated', {
          messageId,
          status: 'delivered',
          userId: socket.userId
        });
        
        // Also notify the message sender directly
        io.to(`user:${message.sender_id}`).emit('message-status-updated', {
          messageId,
          status: 'delivered',
          userId: socket.userId
        });
      } else {
        console.log(`⏭️ Message already delivered or not found: ${messageId}`);
      }
    } catch (error) {
      console.error('Error updating delivered status:', error);
    }
  });

  // Handle message seen status
  socket.on('message-seen', async (data) => {
    try {
      const { messageId, chatId } = data;
      
      console.log(`👁️ Received message-seen: messageId=${messageId}, chatId=${chatId}, from user=${socket.userId}`);
      
      // Skip temp IDs that haven't been saved to MongoDB yet
      if (!messageId || messageId.toString().startsWith('temp-')) {
        console.log(`⏭️ Skipping temp ID: ${messageId}`);
        return;
      }
      
      const Message = require('./models/Message');
      
      const message = await Message.findById(messageId);
      if (message && !message.seen_by.includes(socket.userId)) {
        message.seen_by.push(socket.userId);
        message.status = 'seen';
        await message.save();

        console.log(`✓✓ Message ${messageId} marked as seen by user ${socket.userId}`);
        console.log(`📤 Emitting message-status-updated to chat:${chatId} and sender user:${message.sender_id}`);
        
        // Notify everyone in the chat room
        io.to(`chat:${chatId}`).emit('message-status-updated', {
          messageId,
          status: 'seen',
          userId: socket.userId
        });
        
        // Also notify the message sender directly
        io.to(`user:${message.sender_id}`).emit('message-status-updated', {
          messageId,
          status: 'seen',
          userId: socket.userId
        });
      } else {
        console.log(`⏭️ Message already seen or not found: ${messageId}`);
      }
    } catch (error) {
      console.error('Error updating seen status:', error);
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`❌ User disconnected: ${socket.userId}`);
    
    // Set user offline and update last seen
    await presenceService.setUserOffline(socket.userId);
    
    // Get last seen timestamp from Redis
    const lastSeen = await presenceService.getLastSeen(socket.userId);
    
    // Broadcast offline status to all connected clients
    io.emit('user-offline', { 
      userId: socket.userId,
      lastSeen: lastSeen || new Date().toISOString()
    });
    
    console.log(`📡 Broadcasting: User ${socket.userId} is offline`);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
server.listen(PORT, '0.0.0.0', async (err) => {
  if (err) {
    console.error('❌ Listen callback error:', err);
    process.exit(1);
  }
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 WebSocket ready for connections`);
  console.log(`🔗 Open http://localhost:${PORT}`);
  
  // Connect Kafka Producer and Consumer
  try {
    await kafkaProducer.connect();
    kafkaConsumer.setIO(io); // Pass Socket.IO instance to consumer
    await kafkaConsumer.connect();
    console.log('🔥 Kafka streaming pipeline activated');
  } catch (kafkaError) {
    console.error('⚠️ Kafka connection failed, running without streaming:', kafkaError.message);
  }
}).on('error', (err) => {
  console.error('❌ Server error event:', err);
  process.exit(1);
});

// Keep process alive
process.on('SIGTERM', async () => {
  console.log('📴 Shutting down gracefully...');
  await kafkaProducer.disconnect();
  await kafkaConsumer.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

