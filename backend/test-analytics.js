const mongoose = require('mongoose');
const mongoAnalyticsService = require('./src/services/mongoAnalyticsService');

async function testAnalytics() {
  try {
    await mongoose.connect('mongodb://localhost:27017/whatsapp-db');
    console.log('✅ Connected to MongoDB\n');

    // Test overall stats
    console.log('Testing getOverallStats()...');
    const overall = await mongoAnalyticsService.getOverallStats();
    console.log('Overall Stats:', JSON.stringify(overall, null, 2));

    // Test daily stats
    console.log('\nTesting getDailyStats()...');
    const daily = await mongoAnalyticsService.getDailyStats();
    console.log('Daily Stats (last 7):', JSON.stringify(daily.slice(-7), null, 2));

    // Test hourly stats
    console.log('\nTesting getHourlyDistribution()...');
    const hourly = await mongoAnalyticsService.getHourlyDistribution();
    console.log('Hourly Distribution:', JSON.stringify(hourly, null, 2));

    // Test top users
    console.log('\nTesting getTopUsers()...');
    const users = await mongoAnalyticsService.getTopUsers(5);
    console.log('Top Users:', JSON.stringify(users, null, 2));

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testAnalytics();
