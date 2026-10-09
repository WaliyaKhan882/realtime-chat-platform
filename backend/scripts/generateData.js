require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('../src/models/Message');
const Chat = require('../src/models/Chat');
const User = require('../src/models/User');
const analyticsService = require('../src/services/analyticsService');
const { connectCassandra, initializeCassandraSchema } = require('../src/config/cassandra');

// Sample message content for variety
const messageTemplates = [
  "Hey! How are you doing?",
  "That sounds great!",
  "Let's catch up soon",
  "👍",
  "😂😂😂",
  "I agree with you",
  "Thanks for sharing!",
  "Amazing!",
  "See you later",
  "Have a great day!",
  "What's up?",
  "Cool!",
  "Nice to hear from you",
  "Absolutely!",
  "No problem",
  "Sure thing",
  "I'm on my way",
  "Just finished work",
  "Coffee? ☕",
  "Sounds good to me",
  "Let me think about it",
  "Perfect timing!",
  "That's interesting",
  "Tell me more",
  "I'm busy right now",
  "Talk soon",
  "Good morning! 🌅",
  "Good night 🌙",
  "Happy weekend!",
  "How was your day?",
  "Any plans for today?",
  "Let's do it!",
  "Count me in",
  "Maybe later",
  "I'll get back to you",
  "Thanks a lot!",
  "You're welcome",
  "Congrats! 🎉",
  "Sorry to hear that",
  "Take care",
  "Miss you!",
  "Can't wait!",
  "Sounds fun",
  "I'm here if you need anything",
  "Let's meet tomorrow",
  "Running a bit late",
  "Almost there",
  "Just saw your message",
  "LOL 😆",
  "That's hilarious",
  "OMG",
  "Really?",
  "No way!",
  "I'm excited!",
  "This is awesome",
  "Interesting point",
  "I don't think so",
  "Maybe",
  "Definitely",
  "Okay 👌",
  "Got it",
  "Understood",
  "Will do",
  "On it!",
  "Thanks for letting me know",
  "Appreciate it",
  "You're the best!",
  "Missing the good old days",
  "Remember when...?",
  "Those were great times",
  "Can't believe it",
  "Time flies",
  "It's been a while",
  "Let's reconnect",
  "How have you been?",
  "Long time no see",
  "What's new with you?",
  "Catch me up!",
  "Busy day ahead",
  "Finally done!",
  "Exhausted 😴",
  "Need a break",
  "Weekend vibes",
  "Monday blues",
  "Happy Friday!",
  "TGIF",
  "Back to work",
  "Working from home today",
  "In a meeting",
  "Free now",
  "Call me when you can",
  "Check this out",
  "Did you see...?",
  "Guess what?",
  "You won't believe this",
  "Big news!",
  "Update: ...",
  "FYI",
  "Heads up",
  "Quick question"
];

async function generateData() {
  try {
    console.log('🔗 Connecting to databases...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/whatsapp');
    console.log('✅ MongoDB Connected');

    // Connect to Cassandra
    await connectCassandra();
    await initializeCassandraSchema();
    console.log('✅ Cassandra Connected and initialized');

    // Get all users and chats
    const users = await User.find();
    const chats = await Chat.find();

    if (users.length === 0 || chats.length === 0) {
      console.error('❌ No users or chats found. Please create some users and chats first.');
      process.exit(1);
    }

    console.log(`📊 Found ${users.length} users and ${chats.length} chats`);
    console.log('🚀 Starting data generation...');

    const TARGET_MESSAGES = 100000;
    const BATCH_SIZE = 1000;
    let totalGenerated = 0;

    // Generate messages over the past 30 days
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (let batch = 0; batch < TARGET_MESSAGES / BATCH_SIZE; batch++) {
      const messages = [];
      
      for (let i = 0; i < BATCH_SIZE; i++) {
        // Random timestamp within last 30 days
        const timestamp = new Date(
          thirtyDaysAgo.getTime() + 
          Math.random() * (now.getTime() - thirtyDaysAgo.getTime())
        );

        // Random chat and user
        const chat = chats[Math.floor(Math.random() * chats.length)];
        const sender = users[Math.floor(Math.random() * users.length)];
        
        // Random message content
        const content = messageTemplates[Math.floor(Math.random() * messageTemplates.length)];

        messages.push({
          chat_id: chat._id,
          sender_id: sender._id,
          content,
          timestamp,
          status: 'delivered'
        });
      }

      // Bulk insert to MongoDB
      const insertedMessages = await Message.insertMany(messages);

      // Track only every 10th batch in Cassandra to avoid timeout
      if (batch % 10 === 0) {
        console.log('📊 Tracking batch in analytics...');
        for (const msg of messages.slice(0, 10)) { // Track subset
          try {
            await analyticsService.trackMessage({
              chat_id: msg.chat_id.toString(),
              sender_id: msg.sender_id.toString(),
              timestamp: msg.timestamp
            });
          } catch (err) {
            // Skip analytics errors to continue
          }
        }
      }

      totalGenerated += BATCH_SIZE;
      const progress = ((totalGenerated / TARGET_MESSAGES) * 100).toFixed(1);
      console.log(`📈 Progress: ${totalGenerated}/${TARGET_MESSAGES} messages (${progress}%)`);
    }

    console.log('✅ Data generation complete!');
    console.log(`📊 Total messages generated: ${totalGenerated}`);
    console.log('💾 Data saved to MongoDB and Cassandra');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error generating data:', error);
    process.exit(1);
  }
}

// Run the script
generateData();
