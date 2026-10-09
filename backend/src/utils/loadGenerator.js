const axios = require('axios');
const io = require('socket.io-client');
const faker = require('@faker-js/faker').faker;

const API_URL = 'http://127.0.0.1:3000';
const SOCKET_URL = 'http://127.0.0.1:3000';

class LoadGenerator {
  constructor(config = {}) {
    this.numUsers = config.numUsers || 10;
    this.numMessages = config.numMessages || 1000;
    this.messagesPerSecond = config.messagesPerSecond || 10;
    this.users = [];
    this.sockets = [];
    this.chats = [];
    this.messageCount = 0;
    this.startTime = null;
    this.endTime = null;
  }

  // Register test users
  async registerUsers() {
    console.log(`📝 Registering ${this.numUsers} test users...`);
    
    for (let i = 0; i < this.numUsers; i++) {
      const email = `testuser${i}@load.test`;
      const password = 'password123';
      const name = faker.person.fullName();

      try {
        // Try to register
        await axios.post(`${API_URL}/api/auth/register`, {
          email,
          password,
          name
        });
        console.log(`✅ Registered user: ${email}`);
      } catch (error) {
        // User might already exist, try to login
        if (error.response?.status === 400) {
          console.log(`⚠️ User ${email} already exists, will login`);
        } else {
          console.error(`❌ Error registering ${email}:`, error.message);
        }
      }

      // Login to get token
      try {
        const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
          email,
          password
        });

        this.users.push({
          email,
          password,
          name,
          token: loginRes.data.token,
          userId: loginRes.data.user._id
        });
      } catch (error) {
        console.error(`❌ Error logging in ${email}:`, error.message);
      }
    }

    console.log(`✅ Successfully prepared ${this.users.length} users`);
  }

  // Create chats between users
  async createChats() {
    console.log('💬 Creating chats between users...');
    
    // Create chats between consecutive users
    for (let i = 0; i < this.users.length - 1; i++) {
      try {
        const user1 = this.users[i];
        const user2 = this.users[i + 1];

        const res = await axios.post(
          `${API_URL}/api/chats`,
          {
            participant_ids: [user2.userId],
            is_group: false
          },
          {
            headers: { Authorization: `Bearer ${user1.token}` }
          }
        );

        this.chats.push({
          chatId: res.data.chat._id,
          user1,
          user2
        });

        console.log(`✅ Created chat between ${user1.email} and ${user2.email}`);
      } catch (error) {
        console.error(`❌ Error creating chat:`, error.message);
      }
    }

    // Create some group chats
    const groupSize = Math.min(5, Math.floor(this.users.length / 2));
    if (groupSize >= 3) {
      try {
        const adminUser = this.users[0];
        const memberIds = this.users.slice(1, groupSize).map(u => u.userId);

        const res = await axios.post(
          `${API_URL}/api/groups`,
          {
            name: `Load Test Group ${Date.now()}`,
            member_ids: memberIds,
            description: 'Automated load test group'
          },
          {
            headers: { Authorization: `Bearer ${adminUser.token}` }
          }
        );

        this.chats.push({
          chatId: res.data.chat_id,
          user1: adminUser,
          isGroup: true
        });

        console.log(`✅ Created group chat with ${groupSize} members`);
      } catch (error) {
        console.error(`❌ Error creating group:`, error.message);
      }
    }

    console.log(`✅ Created ${this.chats.length} total chats`);
  }

  // Connect all users via Socket.IO
  async connectSockets() {
    console.log('🔌 Connecting users to WebSocket...');

    for (const user of this.users) {
      const socket = io(SOCKET_URL, {
        auth: { token: user.token },
        transports: ['websocket']
      });

      socket.on('connect', () => {
        console.log(`✅ ${user.email} connected`);
      });

      socket.on('connect_error', (error) => {
        console.error(`❌ Connection error for ${user.email}:`, error.message);
      });

      this.sockets.push({ user, socket });
    }

    // Wait for all connections
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`✅ ${this.sockets.length} users connected`);
  }

  // Generate random messages
  generateMessage() {
    const messages = [
      faker.lorem.sentence(),
      faker.company.catchPhrase(),
      faker.hacker.phrase(),
      `Hello! ${faker.lorem.words(3)}`,
      `Testing: ${faker.number.int({ min: 1, max: 1000 })}`,
      faker.lorem.paragraph(1),
      `${faker.word.adjective()} ${faker.word.noun()}!`,
      `How are you? ${faker.lorem.words(5)}`
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  // Start load test
  async startLoad() {
    console.log(`\n🔥 STARTING LOAD TEST 🔥`);
    console.log(`📊 Target: ${this.numMessages} messages`);
    console.log(`⚡ Rate: ${this.messagesPerSecond} messages/second\n`);

    this.startTime = Date.now();
    const delayMs = 1000 / this.messagesPerSecond;
    let successCount = 0;
    let errorCount = 0;

    const sendMessage = () => {
      if (this.messageCount >= this.numMessages) {
        this.endLoad(successCount, errorCount);
        return;
      }

      // Pick random chat and sender
      const chat = this.chats[Math.floor(Math.random() * this.chats.length)];
      if (!chat) return;

      const userSocket = this.sockets.find(s => 
        s.user.userId === chat.user1.userId
      );

      if (userSocket) {
        const content = this.generateMessage();
        
        userSocket.socket.emit('send-message', {
          chat_id: chat.chatId,
          content
        });

        this.messageCount++;
        successCount++;

        if (this.messageCount % 100 === 0) {
          const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(2);
          const rate = (this.messageCount / elapsed).toFixed(2);
          console.log(`📤 Sent ${this.messageCount}/${this.numMessages} messages (${rate} msg/s)`);
        }
      } else {
        errorCount++;
      }

      // Schedule next message
      setTimeout(sendMessage, delayMs);
    };

    // Start sending messages
    sendMessage();
  }

  // End load test
  endLoad(successCount, errorCount) {
    this.endTime = Date.now();
    const duration = ((this.endTime - this.startTime) / 1000).toFixed(2);
    const actualRate = (successCount / duration).toFixed(2);

    console.log(`\n✅ LOAD TEST COMPLETE ✅`);
    console.log(`⏱️  Duration: ${duration} seconds`);
    console.log(`📨 Messages sent: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⚡ Average rate: ${actualRate} messages/second`);
    console.log(`📊 Target rate: ${this.messagesPerSecond} messages/second\n`);

    // Disconnect all sockets
    this.sockets.forEach(s => s.socket.disconnect());
    
    console.log('🔌 Disconnected all users');
    console.log('✅ Load test finished\n');

    process.exit(0);
  }

  // Run full load test
  async run() {
    try {
      await this.registerUsers();
      await this.createChats();
      await this.connectSockets();
      await this.startLoad();
    } catch (error) {
      console.error('❌ Load test error:', error);
      process.exit(1);
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const config = {
  numUsers: parseInt(args[0]) || 10,
  numMessages: parseInt(args[1]) || 1000,
  messagesPerSecond: parseInt(args[2]) || 10
};

console.log(`
╔══════════════════════════════════════════╗
║   WHATSAPP LOAD GENERATOR               ║
║   Big Data Stress Test Tool             ║
╚══════════════════════════════════════════╝

Configuration:
  Users: ${config.numUsers}
  Messages: ${config.numMessages}
  Rate: ${config.messagesPerSecond} msg/s

Usage: node loadGenerator.js <users> <messages> <rate>
Example: node loadGenerator.js 50 10000 100

Starting in 3 seconds...
`);

setTimeout(() => {
  const generator = new LoadGenerator(config);
  generator.run();
}, 3000);
