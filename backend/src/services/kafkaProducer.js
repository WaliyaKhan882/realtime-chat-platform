const { Kafka } = require('kafkajs');

class KafkaProducer {
  constructor() {
    this.kafka = new Kafka({
      clientId: 'whatsapp-producer',
      brokers: ['localhost:9092'],
      retry: {
        retries: 5,
        initialRetryTime: 300
      }
    });

    this.producer = this.kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 30000
    });

    this.isConnected = false;
    this.messageQueue = [];
  }

  async connect() {
    try {
      await this.producer.connect();
      this.isConnected = true;
      console.log('✅ Kafka Producer connected');
      
      // Process any queued messages
      if (this.messageQueue.length > 0) {
        console.log(`📦 Processing ${this.messageQueue.length} queued messages`);
        const queue = [...this.messageQueue];
        this.messageQueue = [];
        for (const msg of queue) {
          await this.sendMessage(msg.topic, msg.message);
        }
      }
    } catch (error) {
      console.error('❌ Kafka Producer connection error:', error.message);
      this.isConnected = false;
      // Retry connection after 5 seconds
      setTimeout(() => this.connect(), 5000);
    }
  }

  async sendMessage(topic, message) {
    try {
      if (!this.isConnected) {
        console.log('⚠️ Kafka not connected, queueing message');
        this.messageQueue.push({ topic, message });
        return false;
      }

      const result = await this.producer.send({
        topic,
        messages: [
          {
            key: message.chat_id || message.userId,
            value: JSON.stringify(message),
            timestamp: Date.now().toString()
          }
        ]
      });

      console.log(`📤 Message sent to Kafka topic '${topic}':`, result);
      return true;
    } catch (error) {
      console.error('❌ Kafka send error:', error.message);
      // Queue for retry if send fails
      this.messageQueue.push({ topic, message });
      return false;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log('🔌 Kafka Producer disconnected');
    }
  }
}

// Singleton instance
const kafkaProducer = new KafkaProducer();

module.exports = kafkaProducer;
