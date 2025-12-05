// config/s3.js - AWS S3 Configuration and Helper Functions (SDK v3)
import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Create a new S3 client instance with AWS SDK v3
// This replaces the old AWS.config.update() pattern from SDK v2
const s3Client = new S3Client({
  // AWS Region where your S3 bucket is located (e.g., 'us-east-1', 'ap-south-1')
  region: process.env.AWS_REGION,
  // Credentials for authentication
  credentials: {
    // Access Key ID - used to identify your AWS account
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    // Secret Access Key - used to authenticate your requests
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// ⚠️ IMPORTANT: CORS Configuration Required
// To allow your frontend (http://localhost:3000) to access S3 images, 
// you MUST configure CORS on your S3 bucket.
// See AWS_S3_CORS_SETUP.md for detailed instructions.

// Export the S3 bucket name from environment variables
// This is the name of your S3 bucket where all files will be stored
export const S3_BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

/**
 * Upload a file to AWS S3
 * @param {Buffer} fileBuffer - The file data as a buffer
 * @param {String} fileName - The name to give the file in S3
 * @param {String} mimeType - The MIME type of the file (e.g., 'image/jpeg')
 * @param {String} folder - The folder/prefix in S3 bucket (e.g., 'profiles', 'nics', 'certificates')
 * @returns {Promise<String>} - Returns the public URL of the uploaded file
 */
export const uploadToS3 = async (fileBuffer, fileName, mimeType, folder = '') => {
  try {
    // Create a unique filename to prevent conflicts
    // Format: timestamp-randomNumber-originalFilename
    const timestamp = Date.now();
    const randomNum = Math.round(Math.random() * 1e9);
    const uniqueFileName = `${timestamp}-${randomNum}-${fileName}`;
    
    // Construct the full S3 key (path) for the file
    // If folder is provided, file will be stored in that folder
    const s3Key = folder ? `${folder}/${uniqueFileName}` : uniqueFileName;
    
    // Use the Upload class from @aws-sdk/lib-storage for better handling of large files
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: S3_BUCKET_NAME, // The S3 bucket name
        Key: s3Key, // The path/name of the file in S3
        Body: fileBuffer, // The actual file data
        ContentType: mimeType, // MIME type (helps browsers know how to handle the file)
        // Note: ACL removed - using bucket policy for public access instead
        // To enable public access, configure:
        // 1. S3 Bucket CORS (see AWS_S3_CORS_SETUP.md)
        // 2. S3 Bucket Policy for public read access
        // 3. Unblock public access in bucket settings
        CacheControl: 'max-age=31536000', // Cache for 1 year
        ContentDisposition: 'inline' // Display in browser instead of forcing download
      }
    });
    
    // Upload the file to S3 and wait for completion
    const result = await upload.done();
    
    // Construct the public URL manually (SDK v3 doesn't return Location by default)
    const fileUrl = `https://${S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
    
    // Log success for debugging
    console.log(`✅ File uploaded successfully to S3: ${fileUrl}`);
    
    // Return the public URL where the file can be accessed
    return fileUrl;
  } catch (error) {
    // Log error details for debugging
    console.error('❌ S3 upload error:', error);
    // Throw error so calling function can handle it
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Delete a file from AWS S3
 * @param {String} fileUrl - The full S3 URL of the file to delete
 * @returns {Promise<Boolean>} - Returns true if deletion was successful
 */
export const deleteFromS3 = async (fileUrl) => {
  try {
    // If no URL provided or it's a local path, skip deletion
    if (!fileUrl || !fileUrl.includes('amazonaws.com')) {
      console.log('⚠️ No valid S3 URL to delete');
      return false;
    }
    
    // Extract the S3 key (file path) from the full URL
    // Example: https://bucket.s3.region.amazonaws.com/profiles/12345-file.jpg
    // We need to extract: profiles/12345-file.jpg
    const urlParts = fileUrl.split('.com/');
    if (urlParts.length < 2) {
      console.log('⚠️ Invalid S3 URL format');
      return false;
    }
    
    // Get the key (everything after .com/)
    const s3Key = decodeURIComponent(urlParts[1]);
    
    // Create DeleteObjectCommand with parameters
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET_NAME, // The S3 bucket name
      Key: s3Key // The path/name of the file to delete
    });
    
    // Delete the file from S3 and wait for completion
    await s3Client.send(command);
    
    // Log success for debugging
    console.log(`✅ File deleted successfully from S3: ${s3Key}`);
    
    return true;
  } catch (error) {
    // Log error details for debugging
    console.error('❌ S3 deletion error:', error);
    // Return false but don't throw error (deletion failures shouldn't break the app)
    return false;
  }
};

/**
 * Delete multiple files from AWS S3
 * @param {Array<String>} fileUrls - Array of S3 URLs to delete
 * @returns {Promise<Object>} - Returns object with success count and failed URLs
 */
export const deleteMultipleFromS3 = async (fileUrls) => {
  try {
    // Filter out invalid URLs and extract S3 keys
    const validKeys = fileUrls
      .filter(url => url && url.includes('amazonaws.com'))
      .map(url => {
        const urlParts = url.split('.com/');
        return urlParts.length >= 2 ? decodeURIComponent(urlParts[1]) : null;
      })
      .filter(key => key !== null);
    
    // If no valid keys, return early
    if (validKeys.length === 0) {
      console.log('⚠️ No valid S3 URLs to delete');
      return { success: 0, failed: [] };
    }
    
    // S3 allows batch delete of up to 1000 objects at once
    // Format keys for batch deletion
    const objects = validKeys.map(key => ({ Key: key }));
    
    // Create DeleteObjectsCommand
    const command = new DeleteObjectsCommand({
      Bucket: S3_BUCKET_NAME,
      Delete: {
        Objects: objects,
        Quiet: false // Set to false to get detailed results
      }
    });
    
    // Delete all files in one batch operation
    const result = await s3Client.send(command);
    
    // Log results
    console.log(`✅ Deleted ${result.Deleted?.length || 0} files from S3`);
    if (result.Errors && result.Errors.length > 0) {
      console.log(`⚠️ Failed to delete ${result.Errors.length} files`);
    }
    
    return {
      success: result.Deleted?.length || 0,
      failed: result.Errors || []
    };
  } catch (error) {
    console.error('❌ S3 batch deletion error:', error);
    return { success: 0, failed: fileUrls };
  }
};

/**
 * Check if a file exists in S3
 * @param {String} fileUrl - The full S3 URL of the file
 * @returns {Promise<Boolean>} - Returns true if file exists
 */
export const checkS3FileExists = async (fileUrl) => {
  try {
    // If no URL or not an S3 URL, return false
    if (!fileUrl || !fileUrl.includes('amazonaws.com')) {
      return false;
    }
    
    // Extract S3 key from URL
    const urlParts = fileUrl.split('.com/');
    if (urlParts.length < 2) return false;
    
    const s3Key = decodeURIComponent(urlParts[1]);
    
    // Create HeadObjectCommand to check if file exists without downloading it
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET_NAME,
      Key: s3Key
    });
    
    // This will throw an error if the file doesn't exist
    await s3Client.send(command);
    
    return true;
  } catch (error) {
    // If error code is 'NotFound', file doesn't exist
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    // Other errors (permissions, network, etc.)
    console.error('❌ Error checking S3 file:', error);
    return false;
  }
};

// Export the S3 client instance for direct use if needed
export default s3Client;
