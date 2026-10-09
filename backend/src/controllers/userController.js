const User = require('../models/User');
const mediaService = require('../services/mediaService');

// Search user by email
exports.searchUser = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email }, 'name email profile_image_url status_message');

    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profile_image_url: user.profile_image_url,
        status_message: user.status_message
      }
    });

  } catch (error) {
    console.error('Search user error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all users (for testing)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}, 'name email profile_image_url status_message').limit(50);

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update user status message
exports.updateStatus = async (req, res) => {
  try {
    const { status_message } = req.body;

    if (!status_message) {
      return res.status(400).json({ error: 'Status message is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.userId,
      { status_message },
      { new: true }
    ).select('name email profile_image_url status_message');

    // Broadcast status update to all connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('user-status-updated', {
        userId: req.userId,
        status_message: status_message
      });
      console.log('📢 Broadcasting status update:', req.userId, status_message);
    }

    res.json({
      success: true,
      message: 'Status updated successfully',
      user
    });

  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Upload profile picture
exports.uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to MinIO
    const uploadResult = await mediaService.uploadFile(req.file, 'IMAGES');

    if (!uploadResult.success) {
      return res.status(500).json({ error: 'Failed to upload profile picture' });
    }

    // Update user profile
    const user = await User.findByIdAndUpdate(
      req.userId,
      { profile_image_url: uploadResult.url },
      { new: true }
    ).select('name email profile_image_url status_message');

    // Broadcast profile update to all connected clients
    const io = req.app.get('io');
    if (io) {
      io.emit('user-profile-updated', {
        userId: req.userId,
        profile_image_url: uploadResult.url
      });
      console.log('📢 Broadcasting profile picture update:', req.userId);
    }

    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      user,
      file: {
        url: uploadResult.url,
        size: uploadResult.size,
        mimeType: uploadResult.mimeType
      }
    });

  } catch (error) {
    console.error('Upload profile picture error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Delete profile picture
exports.deleteProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    if (!user || !user.profile_image_url) {
      return res.status(400).json({ error: 'No profile picture to delete' });
    }

    // Extract bucket and filename from URL
    const urlParts = user.profile_image_url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const bucketName = urlParts[urlParts.length - 2];

    // Delete from MinIO
    await mediaService.deleteFile(bucketName, fileName);

    // Update user profile
    user.profile_image_url = null;
    await user.save();

    // Broadcast profile update
    const io = req.app.get('io');
    if (io) {
      io.emit('user-profile-updated', {
        userId: req.userId,
        profile_image_url: null
      });
      console.log('📢 Broadcasting profile picture deletion:', req.userId);
    }

    res.json({
      success: true,
      message: 'Profile picture deleted successfully',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        profile_image_url: user.profile_image_url,
        status_message: user.status_message
      }
    });

  } catch (error) {
    console.error('Delete profile picture error:', error);
    res.status(500).json({ error: error.message });
  }
};
