const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const mediaService = require('../services/mediaService');
const User = require('../models/User');

// Configure multer for memory storage (files stored in RAM before uploading to MinIO)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max file size
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and documents
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi|pdf|doc|docx|txt|zip/;
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Only images, videos, and documents allowed.'));
  }
});

// Upload profile picture
router.post('/upload/profile', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Upload to MinIO
    const result = await mediaService.uploadFile(req.file, 'PROFILES');
    
    // Update user profile picture URL in MongoDB
    await User.findByIdAndUpdate(req.userId, {
      profile_image_url: result.url
    });

    res.json({
      success: true,
      message: 'Profile picture uploaded successfully',
      url: result.url,
      fileName: result.fileName
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ error: 'Failed to upload profile picture' });
  }
});

// Upload media for chat message
router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    console.log('📥 Media upload request received');
    console.log('User ID:', req.userId);
    console.log('File:', req.file ? `${req.file.originalname} (${req.file.size} bytes)` : 'No file');
    
    if (!req.file) {
      console.log('❌ No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Determine bucket type based on file mimetype
    const bucketType = mediaService.getBucketType(req.file.mimetype);
    console.log('📦 Bucket type:', bucketType);
    
    // Upload to MinIO
    const result = await mediaService.uploadFile(req.file, bucketType);
    console.log('✅ Upload successful:', result.url);

    res.json({
      success: true,
      message: 'Media uploaded successfully',
      url: result.url,
      fileName: result.fileName,
      bucket: result.bucket,
      size: result.size,
      mimeType: result.mimeType
    });
  } catch (error) {
    console.error('❌ Error uploading media:', error);
    res.status(500).json({ error: 'Failed to upload media', details: error.message });
  }
});

// Delete media (admin or owner only)
router.delete('/media/:bucket/:fileName', auth, async (req, res) => {
  try {
    const { bucket, fileName } = req.params;
    
    await mediaService.deleteFile(bucket, fileName);
    
    res.json({
      success: true,
      message: 'Media deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting media:', error);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

module.exports = router;
