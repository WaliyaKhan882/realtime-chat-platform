const Group = require('../models/Group');
const Chat = require('../models/Chat');
const User = require('../models/User');

// Create new group
exports.createGroup = async (req, res) => {
  try {
    const { name, member_ids, description } = req.body;

    if (!name || !member_ids || member_ids.length === 0) {
      return res.status(400).json({ error: 'Group name and members are required' });
    }

    // Include admin in members
    const allMembers = [req.userId, ...member_ids.filter(id => id !== req.userId)];

    // Create group
    const group = new Group({
      name,
      admin_id: req.userId,
      members: allMembers,
      description: description || ''
    });

    await group.save();

    // Create corresponding chat
    const chat = new Chat({
      participants: allMembers,
      is_group: true,
      group_id: group._id,
      group_name: name
    });

    await chat.save();

    await group.populate('admin_id members', 'name email profile_image_url');

    res.status(201).json({
      success: true,
      message: 'Group created successfully',
      group,
      chat_id: chat._id
    });

  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get group details
exports.getGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId)
      .populate('admin_id members', 'name email profile_image_url status_message');

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is member
    if (!group.members.some(member => member._id.toString() === req.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      group
    });

  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update group (add/remove members, change name, etc.)
exports.updateGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { name, description, add_members, remove_members } = req.body;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is admin
    if (group.admin_id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only admin can update group' });
    }

    // Update basic info
    if (name) group.name = name;
    if (description !== undefined) group.description = description;

    // Add members
    if (add_members && add_members.length > 0) {
      add_members.forEach(memberId => {
        if (!group.members.includes(memberId)) {
          group.members.push(memberId);
        }
      });

      // Update corresponding chat
      const chat = await Chat.findOne({ group_id: groupId });
      if (chat) {
        add_members.forEach(memberId => {
          if (!chat.participants.includes(memberId)) {
            chat.participants.push(memberId);
          }
        });
        await chat.save();
      }
    }

    // Remove members
    if (remove_members && remove_members.length > 0) {
      group.members = group.members.filter(
        memberId => !remove_members.includes(memberId.toString())
      );

      // Update corresponding chat
      const chat = await Chat.findOne({ group_id: groupId });
      if (chat) {
        chat.participants = chat.participants.filter(
          participantId => !remove_members.includes(participantId.toString())
        );
        await chat.save();
      }
    }

    await group.save();
    await group.populate('admin_id members', 'name email profile_image_url status_message');

    // Broadcast group update to all members
    const io = req.app.get('io');
    if (io) {
      io.emit('group-updated', {
        groupId: group._id,
        name: group.name,
        members: group.members,
        description: group.description
      });
    }

    res.json({
      success: true,
      message: 'Group updated successfully',
      group
    });

  } catch (error) {
    console.error('Update group error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete group
exports.deleteGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Verify user is admin
    if (group.admin_id.toString() !== req.userId) {
      return res.status(403).json({ error: 'Only admin can delete group' });
    }

    // Delete corresponding chat
    await Chat.deleteOne({ group_id: groupId });

    // Delete group
    await Group.findByIdAndDelete(groupId);

    res.json({
      success: true,
      message: 'Group deleted successfully'
    });

  } catch (error) {
    console.error('Delete group error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Leave group
exports.leaveGroup = async (req, res) => {
  try {
    const { groupId } = req.params;

    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Admin cannot leave, must transfer admin first
    if (group.admin_id.toString() === req.userId) {
      return res.status(400).json({ error: 'Admin must transfer admin rights before leaving' });
    }

    // Remove user from members
    group.members = group.members.filter(
      memberId => memberId.toString() !== req.userId
    );

    await group.save();

    // Update corresponding chat
    const chat = await Chat.findOne({ group_id: groupId });
    if (chat) {
      chat.participants = chat.participants.filter(
        participantId => participantId.toString() !== req.userId
      );
      await chat.save();
    }

    res.json({
      success: true,
      message: 'Left group successfully'
    });

  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: error.message });
  }
};
