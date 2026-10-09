const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');
const Chat = require('../models/Chat');
const { faker } = require('@faker-js/faker');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-db';

async function seedMessages() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get existing users
    let users = await User.find().limit(10);
    console.log(`Found ${users.length} existing users`);

    // If no users, create some
    if (users.length < 2) {
      console.log('Creating test users...');
      const testUsers = [];
      for (let i = 0; i < 10; i++) {
        const user = new User({
          name: faker.person.fullName(),
          email: `testuser${i}@test.com`,
          password_hash: '$2b$10$dummyhashforseeddataonly1234567890', // Dummy hash for seed data
          phone: faker.phone.number(),
          status_message: faker.lorem.sentence()
        });
        testUsers.push(user);
      }
      users = await User.insertMany(testUsers);
      console.log(`✅ Created ${users.length} test users`);
    }

    // Get or create a chat
    let chat = await Chat.findOne();
    if (!chat) {
      chat = new Chat({
        participants: [users[0]._id, users[1]._id],
        is_group: false
      });
      await chat.save();
      console.log('✅ Created test chat');
    }

    // Generate messages for today and previous days
    const messages = [];
    const today = new Date();
    const numMessages = 500;

    console.log(`Generating ${numMessages} messages...`);

    for (let i = 0; i < numMessages; i++) {
      // Random date within last 7 days
      const daysAgo = Math.floor(Math.random() * 7);
      const messageDate = new Date(today);
      messageDate.setDate(messageDate.getDate() - daysAgo);
      messageDate.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60));

      const sender = users[Math.floor(Math.random() * users.length)];
      const receiver = users[Math.floor(Math.random() * users.length)];

      if (sender._id.toString() !== receiver._id.toString()) {
        const message = new Message({
          chat_id: chat._id,
          sender_id: sender._id,
          receiver_id: receiver._id,
          content: faker.lorem.sentence(),
          message_type: 'text',
          timestamp: messageDate,
          status: 'delivered'
        });
        messages.push(message);
      }
    }

    await Message.insertMany(messages);
    console.log(`✅ Created ${messages.length} messages`);

    // Print statistics
    const totalMessages = await Message.countDocuments();
    const todayMessages = await Message.countDocuments({
      timestamp: {
        $gte: new Date(today.setHours(0, 0, 0, 0))
      }
    });

    console.log('\n📊 Database Statistics:');
    console.log(`   Total Messages: ${totalMessages}`);
    console.log(`   Messages Today: ${todayMessages}`);
    console.log(`   Total Users: ${users.length}`);
    console.log(`   Total Chats: ${await Chat.countDocuments()}`);

    await mongoose.connection.close();
    console.log('\n✅ Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedMessages();
