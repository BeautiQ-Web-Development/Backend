import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import User from '../models/User.js';
import { 
  register, 
  login, 
  verifyToken, 
  resetPassword, 
  getProfile,
  getPendingServiceProviders,
  getApprovedServiceProviders,
  approveServiceProvider,
  getUserCounts
} from '../controllers/authController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },  fileFilter: function (req, file, cb) {
    // Allow all file types for certificates (they might be PDFs, text files, or images)
    if (file.fieldname === 'certificatesPhotos') {
      const allowedTypes = /jpeg|jpg|png|gif|pdf|txt|doc|docx/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
        'application/pdf', 'text/plain', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      const mimetype = allowedMimeTypes.includes(file.mimetype);
      
      if (mimetype || extname) {
        return cb(null, true);
      } else {
        cb(new Error('Certificates must be image files (JPEG, PNG, GIF), PDF, or text documents'));
      }
    } else {
      // For other files (profile, NIC), only allow images
      const allowedTypes = /jpeg|jpg|png|gif/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);
      
      if (mimetype && extname) {
        return cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for profile and NIC photos'));
      }
    }
  }
});

// Serve static files for uploaded documents
router.use('/uploads', express.static('uploads'));

// Enhanced error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('Multer error:', err);
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          message: 'File too large. Please upload files smaller than 5MB.',
          error: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          message: 'Too many files uploaded.',
          error: 'TOO_MANY_FILES'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          message: 'Unexpected file field.',
          error: 'UNEXPECTED_FILE'
        });
      default:
        return res.status(400).json({
          message: 'File upload error.',
          error: err.code || 'FILE_UPLOAD_ERROR'
        });
    }
  }
  // Handle other file upload errors
  if (err.message && err.message.includes('Only image files are allowed')) {
    return res.status(400).json({
      message: 'Only image files are allowed for profile and NIC photos.',
      error: 'INVALID_FILE_TYPE'
    });
  }
  
  if (err.message && err.message.includes('Certificates must be image files')) {
    return res.status(400).json({
      message: 'Certificates must be image files (JPEG, PNG, GIF), PDF, or text documents.',
      error: 'INVALID_CERTIFICATE_TYPE'
    });
  }
  
  console.error('Unexpected upload error:', err);
  next(err);
};

// Simplified registration route using controller
router.post('/register', upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'nicFrontPhoto', maxCount: 1 },
  { name: 'nicBackPhoto', maxCount: 1 },
  { name: 'certificatesPhotos', maxCount: 10 }
]), handleMulterError, register);

// Use the controller functions for other routes
router.post('/login', login);
router.get('/verify-token', verifyToken);
router.post('/forgot-password', async (req, res) => {
  try {
    const { emailAddress } = req.body;
    console.log('Attempting password reset for:', emailAddress);

    // Import jwt
    const jwt = (await import('jsonwebtoken')).default;
    // Import your email sender
    const { sendResetEmail } = await import('../config/mailer.js');

    const user = await User.findOne({ emailAddress });
    if (!user) {
      return res.json({ 
        message: 'If an account exists, a reset link will be sent to the email.',
        success: true 
      });
    }

    // Generate reset token
    const resetToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save reset token to user
    user.resetToken = resetToken;
    user.resetTokenExpiry = Date.now() + 3600000; // 1 hour
    await user.save();

    try {
      await sendResetEmail(emailAddress, resetToken, user.fullName);
      console.log('Reset email sent successfully');
      res.json({ 
        message: 'Password reset link has been sent to your email.',
        success: true
      });
    } catch (emailError) {
      console.error('Detailed email error:', emailError);
      user.resetToken = undefined;
      user.resetTokenExpiry = undefined;
      await user.save();
      throw emailError;
    }
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ 
      message: 'Error processing password reset request. Please try again.',
      error: error.message,
      success: false
    });
  }
});
router.post('/reset-password', resetPassword);

// Protected routes
router.get('/profile', protect, getProfile);

// Admin routes
router.get('/pending-service-providers', protect, authorize('admin'), getPendingServiceProviders);
router.get('/pending-providers', protect, authorize('admin'), getPendingServiceProviders);
router.get('/approved-providers', protect, authorize('admin'), getApprovedServiceProviders);
router.put('/approve-provider/:userId', protect, authorize('admin'), approveServiceProvider);
router.get('/user-counts', protect, authorize('admin'), getUserCounts);

export default router;