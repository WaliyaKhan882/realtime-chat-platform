const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  chat_id: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String for testing
    required: true,
    index: true
  },
  sender_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  media_url: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'seen'],
    default: 'sent'
  },
  delivered_to: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  seen_by: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  deleted_for: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
});

// Compound index for efficient querying
messageSchema.index({ chat_id: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
