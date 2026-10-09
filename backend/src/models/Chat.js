const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  is_group: {
    type: Boolean,
    default: false
  },
  group_name: {
    type: String,
    default: null
  },
  group_admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  group_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  last_message: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  last_message_time: {
    type: Date,
    default: Date.now
  }
});

// Index for querying user's chats
chatSchema.index({ participants: 1, last_message_time: -1 });

module.exports = mongoose.model('Chat', chatSchema);
