const cassandra = require('cassandra-driver');

// Create client but don't initialize connection yet
let client = null;
let isConnected = false;

const ENABLE_CASSANDRA = false; // Disabled due to driver incompatibility - using MongoDB for analytics

if (ENABLE_CASSANDRA) {
  try {
    client = new cassandra.Client({
      contactPoints: ['127.0.0.1'],
      localDataCenter: 'datacenter1'
    });
    console.log('✅ Cassandra client created');
  } catch (error) {
    console.error('Error creating Cassandra client:', error);
  }
}

const connectCassandra = async () => {
  if (!ENABLE_CASSANDRA) {
    console.log('⚠️ Cassandra disabled');
    return false;
  }
  
  if (!client) {
    console.error('❌ Cassandra client not initialized');
    return false;
  }
  
  try {
    console.log('🔄 Connecting to Cassandra...');
    await client.connect();
    isConnected = true;
    console.log('✅ Connected to Cassandra');
    return true;
  } catch (error) {
    console.error('❌ Cassandra connection error:', error.message);
    isConnected = false;
    return false;
  }
};

const getClient = () => {
  if (!isConnected) {
    throw new Error('Cassandra client not connected');
  }
  return client;
};

const isClientConnected = () => isConnected;

const initializeCassandraSchema = async () => {
  if (!isConnected || !client) {
    console.log('⚠️ Cassandra not connected, skipping schema initialization');
    return;
  }
  
  try {
    // Use system keyspace first to create whatsapp_analytics
    await client.execute(`
      CREATE KEYSPACE IF NOT EXISTS whatsapp_analytics
      WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
    `);
    console.log('✅ Keyspace created/verified');

    // Switch to whatsapp_analytics keyspace
    await client.execute('USE whatsapp_analytics');
    console.log('✅ Using keyspace whatsapp_analytics');

    // Create table for daily message statistics
    await client.execute(`
      CREATE TABLE IF NOT EXISTS daily_message_stats (
        date date,
        hour int,
        message_count counter,
        PRIMARY KEY (date, hour)
      )
    `);
    console.log('✅ Table daily_message_stats created/verified');

    // Create table for user message statistics
    await client.execute(`
      CREATE TABLE IF NOT EXISTS user_message_stats (
        user_id text,
        date date,
        message_count counter,
        PRIMARY KEY (user_id, date)
      )
    `);
    console.log('✅ Table user_message_stats created/verified');

    // Create table for chat statistics
    await client.execute(`
      CREATE TABLE IF NOT EXISTS chat_stats (
        chat_id text,
        date date,
        message_count counter,
        PRIMARY KEY (chat_id, date)
      )
    `);
    console.log('✅ Table chat_stats created/verified');

    // Create table for overall statistics
    await client.execute(`
      CREATE TABLE IF NOT EXISTS overall_stats (
        stat_name text PRIMARY KEY,
        stat_value counter
      )
    `);
    console.log('✅ Table overall_stats created/verified');

  } catch (error) {
    console.error('❌ Error initializing Cassandra schema:', error);
    throw error;
  }
};

module.exports = { client, connectCassandra, initializeCassandraSchema, getClient, isClientConnected };
