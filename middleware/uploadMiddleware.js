// middleware/uploadMiddleware.js - AWS S3 Upload Middleware with Multer
import multer from 'multer';
import multerS3 from 'multer-s3';
import s3Client, { S3_BUCKET_NAME } from '../config/s3.js';
import path from 'path';

/**
 * Helper function to generate a unique filename
 * This prevents filename conflicts in S3
 */
const generateUniqueFileName = (originalname) => {
  // Get current timestamp for uniqueness
  const timestamp = Date.now();
  // Generate a random number for additional uniqueness
  const randomNum = Math.round(Math.random() * 1e9);
  // Get file extension from original filename
  const ext = path.extname(originalname);
  // Get filename without extension
  const nameWithoutExt = path.basename(originalname, ext);
  // Combine everything: timestamp-randomNumber-originalName.ext
  return `${timestamp}-${randomNum}-${nameWithoutExt}${ext}`;
};

/**
 * Multer storage configuration for AWS S3
 * This replaces the local disk storage with S3 cloud storage
 */
const s3Storage = multerS3({
  s3: s3Client, // The S3 client instance from config/s3.js (SDK v3)
  bucket: S3_BUCKET_NAME, // The name of your S3 bucket
  
  // Note: ACL removed - using bucket policy for public access control instead
  // This is AWS's recommended modern approach for S3 security
  
  // Set Content-Type header automatically based on file MIME type
  // This ensures browsers display images correctly
  contentType: multerS3.AUTO_CONTENT_TYPE,
  
  // Function to determine the S3 key (file path) for each upload
  key: function (req, file, cb) {
    // Determine which folder to use based on the field name
    let folder = '';
    
    // Map form field names to S3 folder structure
    if (file.fieldname === 'profilePhoto') {
      folder = 'profiles'; // Store profile photos in 'profiles/' folder
    } else if (file.fieldname === 'nicFrontPhoto' || file.fieldname === 'nicBackPhoto') {
      folder = 'nic-documents'; // Store NIC documents in 'nic-documents/' folder
    } else if (file.fieldname === 'certificatesPhotos') {
      folder = 'certificates'; // Store certificates in 'certificates/' folder
    } else if (file.fieldname === 'serviceImages') {
      folder = 'services'; // Store service images in 'services/' folder
    } else {
      folder = 'others'; // Default folder for any other uploads
    }
    
    // Generate unique filename to prevent conflicts
    const uniqueFileName = generateUniqueFileName(file.originalname);
    
    // Construct full S3 key: folder/uniqueFileName
    const s3Key = `${folder}/${uniqueFileName}`;
    
    // Log for debugging
    console.log(`📤 Uploading ${file.fieldname} to S3: ${s3Key}`);
    
    // Call callback with null (no error) and the S3 key
    cb(null, s3Key);
  }
});

/**
 * File filter function to validate uploaded files
 * Only allows image files to be uploaded
 */
const fileFilter = (req, file, cb) => {
  // Define allowed MIME types for images
  const allowedMimeTypes = [
    'image/jpeg',      // .jpg, .jpeg
    'image/png',       // .png
    'image/gif',       // .gif
    'image/webp',      // .webp
    'image/svg+xml',   // .svg
    'image/bmp',       // .bmp
    'image/jfif'       // .jfif
  ];
  
  // Check if the file's MIME type is in the allowed list
  if (allowedMimeTypes.includes(file.mimetype)) {
    // Accept the file (null = no error, true = accept)
    cb(null, true);
    console.log(`✅ File accepted: ${file.originalname} (${file.mimetype})`);
  } else {
    // Reject the file with an error message
    cb(new Error(`Invalid file type: ${file.mimetype}. Only images are allowed.`), false);
    console.log(`❌ File rejected: ${file.originalname} (${file.mimetype})`);
  }
};

/**
 * Multer configuration for S3 uploads
 * This is the main upload middleware
 */
const upload = multer({
  storage: s3Storage, // Use S3 storage instead of disk storage
  
  // Set file size limit to 10MB per file
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB in bytes
  },
  
  // Apply file filter to validate file types
  fileFilter: fileFilter
});

/**
 * Middleware for service provider registration uploads
 * Handles multiple file fields at once
 */
export const uploadServiceProviderFiles = upload.fields([
  // Profile photo - single file
  { name: 'profilePhoto', maxCount: 1 },
  // NIC front photo - single file
  { name: 'nicFrontPhoto', maxCount: 1 },
  // NIC back photo - single file
  { name: 'nicBackPhoto', maxCount: 1 },
  // Certificates - up to 5 files
  { name: 'certificatesPhotos', maxCount: 5 }
]);

/**
 * Middleware for customer registration uploads
 * Only handles profile photo
 */
export const uploadCustomerFiles = upload.fields([
  // Profile photo - single file
  { name: 'profilePhoto', maxCount: 1 }
]);

/**
 * Middleware for admin registration uploads
 * Only handles profile photo
 */
export const uploadAdminFiles = upload.fields([
  // Profile photo - single file
  { name: 'profilePhoto', maxCount: 1 }
]);

/**
 * Middleware for single profile photo upload
 * Used for profile updates
 */
export const uploadSingleProfilePhoto = upload.single('profilePhoto');

/**
 * Middleware for service images upload
 * Used when adding/updating services
 */
export const uploadServiceImages = upload.array('serviceImages', 10); // Max 10 images

/**
 * Helper function to extract S3 URLs from multer-s3 file objects
 * Multer-S3 stores the file info in req.files
 * This function extracts just the URLs in a clean format
 */
export const extractS3Urls = (files) => {
  const urls = {};
  
  // If no files uploaded, return empty object
  if (!files) return urls;
  
  // Iterate through each field in files object
  for (const fieldName in files) {
    const fileArray = files[fieldName];
    
    // If this field has a single file
    if (fileArray.length === 1) {
      // Store the S3 URL directly
      // multer-s3 puts the URL in the 'location' property
      urls[fieldName] = fileArray[0].location;
    } 
    // If this field has multiple files (like certificates)
    else if (fileArray.length > 1) {
      // Store as an array of URLs
      urls[fieldName] = fileArray.map(file => file.location);
    }
  }
  
  // Log extracted URLs for debugging
  console.log('📎 Extracted S3 URLs:', urls);
  
  return urls;
};

/**
 * Error handling middleware for upload errors
 * Place this after your upload routes to catch upload errors
 */
export const handleUploadErrors = (err, req, res, next) => {
  // Check if error is from multer
  if (err instanceof multer.MulterError) {
    // Multer error occurred (e.g., file too large)
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB per file.'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files. Please check the upload limits.'
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Unexpected file field. Please check the form fields.'
      });
    }
    
    // Other multer errors
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  // Check if error is from file filter (invalid file type)
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  
  // Check if error is from S3
  if (err.message && err.message.includes('S3')) {
    return res.status(500).json({
      success: false,
      message: 'Failed to upload files to cloud storage. Please try again.'
    });
  }
  
  // If not an upload error, pass to next error handler
  next(err);
};

// Export the main upload instance for custom configurations
export default upload;
