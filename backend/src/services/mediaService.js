const { minioClient, BUCKETS } = require('../config/minio');
const crypto = require('crypto');
const path = require('path');

class MediaService {
  // Upload file to MinIO
  async uploadFile(file, bucketType = 'IMAGES') {
    try {
      const bucketName = BUCKETS[bucketType] || BUCKETS.IMAGES;
      
      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const fileName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${fileExtension}`;
      
      // Prepare metadata
      const metaData = {
        'Content-Type': file.mimetype,
        'X-Original-Name': file.originalname
      };

      // Upload to MinIO
      await minioClient.putObject(
        bucketName,
        fileName,
        file.buffer,
        file.size,
        metaData
      );

      // Generate URL
      const fileUrl = `http://localhost:9000/${bucketName}/${fileName}`;
      
      console.log(`✅ File uploaded to MinIO: ${fileUrl}`);
      
      return {
        success: true,
        url: fileUrl,
        fileName,
        bucket: bucketName,
        size: file.size,
        mimeType: file.mimetype
      };
    } catch (error) {
      console.error('Error uploading to MinIO:', error);
      throw error;
    }
  }

  // Delete file from MinIO
  async deleteFile(bucketName, fileName) {
    try {
      await minioClient.removeObject(bucketName, fileName);
      console.log(`✅ File deleted from MinIO: ${fileName}`);
      return { success: true };
    } catch (error) {
      console.error('Error deleting from MinIO:', error);
      throw error;
    }
  }

  // Get file URL (presigned for private files)
  async getFileUrl(bucketName, fileName, expirySeconds = 86400) {
    try {
      const url = await minioClient.presignedGetObject(bucketName, fileName, expirySeconds);
      return url;
    } catch (error) {
      console.error('Error getting file URL:', error);
      throw error;
    }
  }

  // Get file metadata
  async getFileStats(bucketName, fileName) {
    try {
      const stat = await minioClient.statObject(bucketName, fileName);
      return stat;
    } catch (error) {
      console.error('Error getting file stats:', error);
      throw error;
    }
  }

  // Determine bucket type from file mimetype
  getBucketType(mimetype) {
    if (mimetype.startsWith('image/')) return 'IMAGES';
    if (mimetype.startsWith('video/')) return 'VIDEOS';
    if (mimetype.startsWith('application/') || mimetype.startsWith('text/')) return 'DOCUMENTS';
    return 'DOCUMENTS';
  }
}

module.exports = new MediaService();
