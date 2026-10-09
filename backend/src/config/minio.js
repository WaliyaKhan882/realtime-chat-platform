const Minio = require('minio');

// MinIO client configuration
const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT) || 9000,
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123'
});

// Bucket names for different media types
const BUCKETS = {
  IMAGES: 'whatsapp-images',
  VIDEOS: 'whatsapp-videos',
  DOCUMENTS: 'whatsapp-documents',
  PROFILES: 'whatsapp-profiles'
};

// Initialize buckets
const initializeBuckets = async () => {
  try {
    for (const [key, bucketName] of Object.entries(BUCKETS)) {
      const exists = await minioClient.bucketExists(bucketName);
      if (!exists) {
        await minioClient.makeBucket(bucketName, 'us-east-1');
        console.log(`✅ MinIO bucket created: ${bucketName}`);
        
        // Set public read policy for easier access (demo purposes)
        const policy = {
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`]
          }]
        };
        await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
      }
    }
    console.log('✅ MinIO initialized with all buckets');
  } catch (error) {
    console.error('❌ Error initializing MinIO buckets:', error);
  }
};

// Connect and initialize
const connectMinio = async () => {
  try {
    // Test connection by listing buckets
    await minioClient.listBuckets();
    console.log('✅ Connected to MinIO');
    await initializeBuckets();
  } catch (error) {
    console.error('❌ MinIO connection error:', error);
    console.log('Retrying MinIO connection in 5 seconds...');
    setTimeout(connectMinio, 5000);
  }
};

module.exports = { minioClient, BUCKETS, connectMinio };
