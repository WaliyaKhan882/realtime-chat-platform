const mongoose = require('mongoose');
const Message = require('./src/models/Message');
const User = require('./src/models/User');
const Chat = require('./src/models/Chat');
const { faker } = require('@faker-js/faker');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp-db';

async function seedTodayMessages() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get existing users
    const users = await User.find().limit(10);
    console.log(`Found ${users.length} users`);

    if (users.length < 2) {
      console.log('❌ Need at least 2 users. Run seedMessages.js first.');
      process.exit(1);
    }

    // Get or create a chat
    let chat = await Chat.findOne();
    if (!chat) {
      chat = new Chat({
        participants: [users[0]._id, users[1]._id],
        is_group: false
      });
      await chat.save();
    }

    // Generate messages for TODAY only (using local system time)
    const messages = [];
    const today = new Date();
    const numMessages = 1000; // Generate 1000 messages for today

    console.log(`Generating ${numMessages} messages for TODAY (${today.toString()})...`);
    console.log(`Local time: ${today.toLocaleString()}`);
    console.log(`System timezone offset: ${today.getTimezoneOffset()} minutes`);

    for (let i = 0; i < numMessages; i++) {
      // Random time TODAY (hours 0-23) - using current local date
      const messageDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      messageDate.setHours(Math.floor(Math.random() * 24));
      messageDate.setMinutes(Math.floor(Math.random() * 60));
      messageDate.setSeconds(Math.floor(Math.random() * 60));

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
    console.log(`✅ Created ${messages.length} messages for today`);

    // Print statistics
    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);
    
    const totalMessages = await Message.countDocuments();
    const todayMessages = await Message.countDocuments({
      timestamp: { $gte: todayStart }
    });

    // Get hourly distribution for today
    const hourly = await Message.aggregate([
      { $match: { timestamp: { $gte: todayStart } } },
      { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 1 }
    ]);

    console.log('\n📊 Database Statistics:');
    console.log(`   Total Messages: ${totalMessages}`);
    console.log(`   Messages Today: ${todayMessages}`);
    console.log(`   Peak Hour Today: ${hourly[0]?._id}:00 (${hourly[0]?.count} messages)`);

    await mongoose.connection.close();
    console.log('\n✅ Today\'s messages seeded successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  }
}

seedTodayMessages();
