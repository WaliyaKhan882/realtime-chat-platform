const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');

// Get all chats for current user
exports.getUserChats = async (req, res) => {
  try {
    const chats = await Chat.find({
      participants: req.userId
    })
      .populate('participants', 'name email profile_image_url status_message')
      .populate('last_message')
      .sort({ last_message_time: -1 });

    res.json({
      success: true,
      chats
    });

  } catch (error) {
    console.error('Get chats error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Create new chat (1-to-1 or group)
exports.createChat = async (req, res) => {
  try {
    const { participant_ids, is_group, group_name } = req.body;

    if (!participant_ids || participant_ids.length === 0) {
      return res.status(400).json({ error: 'At least one participant is required' });
    }

    // Add current user to participants
    const allParticipants = [req.userId, ...participant_ids];

    // Check if 1-to-1 chat already exists
    if (!is_group && participant_ids.length === 1) {
      const existingChat = await Chat.findOne({
        participants: { $all: allParticipants, $size: 2 },
        is_group: false
      });

      if (existingChat) {
        return res.json({
          success: true,
          message: 'Chat already exists',
          chat: existingChat
        });
      }
    }

    // Create new chat
    const chat = new Chat({
      participants: allParticipants,
      is_group: is_group || false,
      group_name: is_group ? group_name : null,
      group_admin: is_group ? req.userId : null
    });

    await chat.save();

    await chat.populate('participants', 'name email profile_image_url status_message');

    res.status(201).json({
      success: true,
      message: 'Chat created successfully',
      chat
    });

  } catch (error) {
    console.error('Create chat error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get messages for a chat
exports.getChatMessages = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, before } = req.query;

    // Verify user is participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Build query - exclude messages deleted for this user
    const query = { 
      chat_id: chatId,
      deleted_for: { $ne: req.userId }
    };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender_id', 'name profile_image_url')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      messages: messages.reverse(), // Return in chronological order
      count: messages.length
    });

  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Send message (via REST - mainly for testing, real messaging uses Socket.IO)
exports.sendMessage = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, media_url } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    // Verify user is participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Create message
    const message = new Message({
      chat_id: chatId,
      sender_id: req.userId,
      content,
      media_url
    });

    await message.save();

    // Update chat's last message
    chat.last_message = message._id;
    chat.last_message_time = message.timestamp;
    await chat.save();

    await message.populate('sender_id', 'name profile_image_url');

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete chat
exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;

    // Verify user is participant
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Delete all messages in the chat
    await Message.deleteMany({ chat_id: chatId });

    // Delete the chat
    await Chat.findByIdAndDelete(chatId);

    res.json({
      success: true,
      message: 'Chat deleted successfully'
    });

  } catch (error) {
    console.error('Delete chat error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete individual message
exports.deleteMessage = async (req, res) => {
  try {
    const { chatId, messageId } = req.params;

    // Verify user is participant of the chat
    const chat = await Chat.findOne({
      _id: chatId,
      participants: req.userId
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Find the message
    const message = await Message.findOne({
      _id: messageId,
      chat_id: chatId
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const isSender = message.sender_id.toString() === req.userId;
    const io = req.app.get('io');

    if (isSender) {
      // Delete for everyone - physically delete the message
      await Message.findByIdAndDelete(messageId);

      // Broadcast to all users in the chat
      if (io) {
        io.emit('message-deleted', {
          chatId: chatId,
          messageId: messageId,
          deleteForEveryone: true
        });
        console.log('🗑️ Broadcasting message deletion for everyone:', messageId);
      }
    } else {
      // Delete for me only - add user to deleted_for array
      if (!message.deleted_for) {
        message.deleted_for = [];
      }
      if (!message.deleted_for.includes(req.userId)) {
        message.deleted_for.push(req.userId);
        await message.save();
      }

      // Notify only this user
      if (io) {
        io.emit('message-deleted-for-user', {
          chatId: chatId,
          messageId: messageId,
          userId: req.userId
        });
        console.log('🗑️ Message deleted for user:', req.userId, messageId);
      }
    }

    // Update chat's last_message if this was the last message and deleted for everyone
    if (isSender && chat.last_message && chat.last_message.toString() === messageId) {
      const lastMessage = await Message.findOne({ chat_id: chatId })
        .sort({ timestamp: -1 })
        .limit(1);
      
      if (lastMessage) {
        chat.last_message = lastMessage._id;
        chat.last_message_time = lastMessage.timestamp;
      } else {
        chat.last_message = null;
        chat.last_message_time = null;
      }
      await chat.save();
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });

  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: error.message });
  }
};
