//server.js

import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
// Multer is now imported in uploadMiddleware.js
import { createServer } from 'http';
import { initializeSocket } from './socket.js';
// Add rate limiting
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  verifyToken,
  getProfile,
  forgotPassword,
  resetPassword,
  updateProfilePhoto
} from './controllers/authController.js';
import authRoutes from './routes/auth.Routes.js';
import paymentRoutes from './routes/payment.Routes.js';
import bookingRoutes from './routes/booking.Routes.js';

// Import models
import User from './models/User.js';
import Service from './models/Service.js';

// Import middleware
import rbac from './middleware/rbacMiddleware.js';
import serviceRoutes from './routes/services.Routes.js';
// import packageRoutes from './routes/packages.Routes.js';
import notificationRoutes from './routes/notifications.Routes.js';
import feedbackRoutes from './routes/feedback.Routes.js';

import { checkAndFixDuplicateServiceProviderIds } from './Utils/serialGenerator.js';
// import { transporter } from './config/mailer.js';

// ========================================
// 🆕 FEEDBACK SYSTEM IMPORTS
// ========================================
import { MongoClient } from 'mongodb';
import { initializeFeedbackController } from './controllers/feedbackController.js';
import { checkCompletedBookings, cleanupStaleBookings } from './controllers/cronController.js';

dotenv.config();
// Initialize Express app
const app = express();
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Create HTTP server for Socket.IO
const httpServer = createServer(app);

// Initialize Socket.IO
let io;
export const getIo = () => io;

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// ========================================
// 🆕 INITIALIZE MONGODB NATIVE CLIENT FOR FEEDBACK
// ========================================
let feedbackDb;
let feedbacksCollection;

async function initializeFeedbackDb() {
  try {
    const mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    feedbackDb = mongoClient.db("beautiq");
    feedbacksCollection = feedbackDb.collection("feedbacks");
    console.log('✓ Feedback database initialized');
  } catch (error) {
    console.error('❌ Failed to initialize feedback database:', error);
  }
}

// Initialize feedback database connection
initializeFeedbackDb();

// Configure rate limiters
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

// Specific limiter for available slots API to prevent the 429 errors
const availableSlotsLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many slot requests, please try again after 1 minute'
});

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  // Enhanced headers configuration for broader compatibility
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment-Flow', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files for uploads with improved headers for image viewing
app.use('/uploads', (req, res, next) => {
  // Set cache control for better performance
  res.setHeader('Cache-Control', 'public, max-age=3600');
  // Set content disposition to inline for viewing in browser
  res.setHeader('Content-Disposition', 'inline');
  next();
  // import { getStats } from './controllers/statsController.js';
}, express.static('uploads', {
  // Ensure proper content types are set for images
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.jfif') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (ext === '.gif') {
      res.setHeader('Content-Type', 'image/gif');
    }
  }
}));

// Add API endpoint for uploads for backward compatibility
app.use('/api/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Disposition', 'inline');
  next();
}, express.static('uploads', {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.jpg' || ext === '.jpeg' || ext === '.jfif') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
    } else if (ext === '.gif') {
      res.setHeader('Content-Type', 'image/gif');
    }
  }
}));

// Create a simple placeholder image service for the frontend
app.get('/placeholder/:width/:height', (req, res) => {
  const { width, height } = req.params;
  const text = req.query.text || 'No Image';
  
  // Create a simple HTML placeholder instead of generating an image
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body, html {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f0f0f0;
        font-family: Arial, sans-serif;
      }
      .placeholder {
        width: ${width}px;
        height: ${height}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        border: 2px solid #dddddd;
        background-color: #f8f8f8;
        color: #555555;
        box-sizing: border-box;
      }
      .icon {
        font-size: 32px;
        margin-bottom: 8px;
      }
      .text {
        font-size: 14px;
        font-weight: bold;
        text-align: center;
        padding: 0 10px;
      }
    </style>
  </head>
  <body>
    <div class="placeholder">
      <div class="icon">📷</div>
      <div class="text">${text.replace(/\+/g, ' ')}</div>
    </div>
  </body>
  </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
  res.send(html);
});

// Handle via.placeholder.com redirects to our local placeholder service
app.get('/via.placeholder.com/:dimensions', (req, res) => {
  const dimensions = req.params.dimensions || '300x140';
  const text = req.query.text || 'No+Image';
  
  // Parse dimensions
  let width = 300;
  let height = 140;
  
  if (dimensions && dimensions.includes('x')) {
    const [w, h] = dimensions.split('x');
    if (!isNaN(w)) width = parseInt(w);
    if (!isNaN(h)) height = parseInt(h);
  }
  
  console.log(`📷 Handling placeholder request: ${dimensions} with text: ${text}`);
  
  // Redirect to our local placeholder service
  res.redirect(`/placeholder/${width}/${height}?text=${text}`);
});

// Log startup message about placeholders
console.log('✅ Placeholder image service initialized at /placeholder/{width}/{height}?text={text}');
console.log('✅ via.placeholder.com requests will be redirected to local placeholder service');

// Import S3 upload middleware instead of using local storage
// This middleware handles uploads directly to AWS S3
import { 
  uploadServiceProviderFiles, 
  uploadCustomerFiles, 
  uploadAdminFiles,
  uploadSingleProfilePhoto,
  handleUploadErrors 
} from './middleware/uploadMiddleware.js';

// Using the imported rbacMiddleware.js for RBAC functionality

// DB-backed auth routes with S3 upload middleware
// Each route uses the appropriate upload middleware for its user type
// Service Provider registration - handles profile, NIC front/back, and certificates
app.post('/api/auth/register-service-provider', uploadServiceProviderFiles, register);
// Customer registration - handles profile photo only
app.post('/api/auth/register-customer', uploadCustomerFiles, register);
// Admin registration - handles profile photo only
app.post('/api/auth/register-admin', uploadAdminFiles, register);
// Other auth routes that don't require file uploads
app.post('/api/auth/login', login);
app.get('/api/auth/verify-token', verifyToken);
app.get('/api/auth/profile', rbac(['admin','customer','serviceProvider']), getProfile);
// Profile photo update route - accessible to all authenticated users
// Uses authentication middleware (rbac) to verify user is logged in
// Uses uploadSingleProfilePhoto middleware to handle S3 upload
app.put('/api/auth/profile-photo', 
  rbac(['admin', 'customer', 'serviceProvider']), // Verify user is authenticated
  uploadSingleProfilePhoto, // Handle S3 upload
  updateProfilePhoto // Process the update
);
app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/reset-password', resetPassword);
// Admin profile update route is now handled in authRoutes with proper middleware
// keep any other routes in authRoutes
app.use('/api/auth', authRoutes);

// Service routes - Apply auth middleware properly
// Register stats endpoint under services
// Service routes
app.use('/api/services', serviceRoutes);
// app.use('/api/packages', packageRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/feedback', feedbackRoutes);
// Payment routes
app.use('/api/payments', paymentRoutes);
// Booking routes
app.use('/api/bookings', bookingRoutes);
// Chat routes
import chatRoutes from './routes/chat.Routes.js';
app.use('/api/chat', chatRoutes);

// ========================================
// 🆕 FEEDBACK ROUTES
// ========================================
// Initialize feedback controller with collection
initializeFeedbackController(feedbacksCollection);

// Use feedback routes
app.use('/api/feedback', feedbackRoutes);

console.log('✅ Feedback API routes initialized');

// ========================================
// END OF FEEDBACK ROUTES
// ========================================

// Admin image viewing route
// This route allows admins to retrieve image URLs for users
// Now optimized for S3 - returns the S3 URL instead of streaming the file
app.get('/api/admin/images/:type/:id/:field', rbac(['admin']), async (req, res) => {
  try {
    const { type, id, field } = req.params;
    // index is used for array fields like certificates (e.g., certificatesPhotos[0])
    const index = req.query.index ? parseInt(req.query.index) : null;
    
    // Validate that all required parameters are present
    if (!type || !id || !field) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters'
      });
    }
    
    // Define valid entity types to prevent unauthorized access
    const validTypes = ['user', 'service', 'provider'];
    // Define valid image fields to prevent security issues
    const validFields = ['profilePhoto', 'nicFrontPhoto', 'nicBackPhoto', 'serviceImages', 'certificatesPhotos'];
    
    // Validate the entity type
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image type'
      });
    }
    
    // Validate the field name
    if (!validFields.includes(field)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image field'
      });
    }
    
    // Find the entity (user or service) in the database
    let entity;
    if (type === 'user' || type === 'provider') {
      // For users/providers, select the image field and name fields
      entity = await User.findById(id).select(`${field} fullName businessName role`);
    } else if (type === 'service') {
      // For services, select the image field and service name
      entity = await Service.findById(id).select(`${field} name`);
    }
    
    // If entity not found, return 404
    if (!entity) {
      return res.status(404).json({
        success: false,
        message: 'Entity not found'
      });
    }
    
    // Get the image URL from the entity
    let imageUrl;
    if (Array.isArray(entity[field])) {
      // Handle array fields like certificatesPhotos or serviceImages
      if (index !== null && entity[field].length > index && index >= 0) {
        imageUrl = entity[field][index];
      } else {
        return res.status(404).json({
          success: false,
          message: `Image not found at index ${index}. Total images: ${entity[field].length}`
        });
      }
    } else {
      // Handle single image fields like profilePhoto, nicFrontPhoto, nicBackPhoto
      imageUrl = entity[field];
    }
    
    // If no image URL found, return 404
    if (!imageUrl) {
      return res.status(404).json({
        success: false,
        message: 'Image URL not found in database'
      });
    }
    
    // Check if this is an S3 URL
    if (imageUrl.includes('amazonaws.com')) {
      // This is an S3 URL - return it directly
      // The frontend can display it by using this URL as the image src
      return res.json({
        success: true,
        data: {
          imageUrl: imageUrl,
          type: field,
          entityName: entity.fullName || entity.businessName || entity.name || 'Unknown',
          entityType: type,
          storageType: 's3'
        }
      });
    } else {
      // This is a legacy local file path
      // For backward compatibility, we'll try to serve it from local storage
      let imagePath = imageUrl;
      
      // If path doesn't start with uploads, prepend it
      if (!imagePath.startsWith('uploads/')) {
        imagePath = `uploads/${imagePath}`;
      }
      
      // Determine full path to the image
      const fullPath = path.join(process.cwd(), imagePath);
      
      // Check if file exists locally
      if (!fs.existsSync(fullPath)) {
        // Try alternative paths for legacy files
        const alternatives = [
          path.join(process.cwd(), path.basename(imagePath)),
          path.join(process.cwd(), 'uploads', path.basename(imagePath)),
          path.join(process.cwd(), 'uploads', 'serviceProviders', path.basename(imagePath))
        ];
        
        // Find first path that exists
        const validPath = alternatives.find(p => fs.existsSync(p));
        
        if (validPath) {
          // Send the local file
          return res.sendFile(validPath);
        }
        
        // File not found anywhere
        return res.status(404).json({
          success: false,
          message: 'Image file not found in local storage',
          hint: 'This file may need to be re-uploaded to S3'
        });
      }
      
      // Send the local file
      return res.sendFile(fullPath);
    }
    
  } catch (error) {
    console.error('❌ Error serving image:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve image',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// Test email endpoint for development
if (process.env.NODE_ENV === 'development') {
  app.post('/api/test-email', async (req, res) => {
    try {
      const testResult = await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: process.env.EMAIL_USER,
        subject: 'Test Email',
        text: 'If you receive this, the email configuration is working!'
      });
      
      res.json({ 
        success: true, 
        message: 'Test email sent successfully',
        messageId: testResult.messageId 
      });
    } catch (error) {
      console.error('Test email failed:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });
}

// Upload error handling middleware
// This must come before the general error handler
// It catches errors from multer/multer-s3 file uploads
app.use(handleUploadErrors);

// General error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  
  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(e => e.message);
    return res.status(400).json({
      message: 'Validation failed',
      error: 'VALIDATION_ERROR',
      details: validationErrors
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    return res.status(400).json({
      message: 'Invalid ID format',
      error: 'INVALID_ID_FORMAT'
    });
  }

  // MongoDB duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(409).json({
      message: `Duplicate ${field} value`,
      error: 'DUPLICATE_KEY_ERROR',
      field: field
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      message: 'Invalid token',
      error: 'INVALID_TOKEN'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      message: 'Token expired',
      error: 'TOKEN_EXPIRED'
    });
  }

  // File upload errors
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File too large',
      error: 'FILE_TOO_LARGE'
    });
  }

  // Database connection errors
  if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
    return res.status(503).json({
      message: 'Database connection error',
      error: 'DATABASE_CONNECTION_ERROR'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    message: 'Internal server error',
    error: 'INTERNAL_SERVER_ERROR',
    details: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
  });
});

// Handle 404 errors
app.use('*', (req, res) => {
  res.status(404).json({
    message: `Route ${req.originalUrl} not found`,
    error: 'ROUTE_NOT_FOUND'
  });
});

// Initialize HTTP server with Express
// (Removed duplicate httpServer declaration)

// Initialize Socket.IO with the HTTP server
// (This is handled below after httpServer is declared)

// Export io for use in other files
// (getIo is already exported above)

// Run the service provider ID fix on server startup
(async function initializeSystem() {
  try {
    console.log('🔄 Running system initialization tasks...');
    
    // Check and fix duplicate service provider IDs
    const idCheckResult = await checkAndFixDuplicateServiceProviderIds();
    console.log('✅ Service Provider ID check complete:', idCheckResult);
    
    // Add more initialization tasks here if needed
    
  } catch (error) {
    console.error('❌ Error during system initialization:', error);
  }
})();

const PORT = process.env.PORT || 5000;

// Initialize Socket.IO with the HTTP server
io = initializeSocket(httpServer);

// httpServer.listen(PORT, () => {
//   console.log(`✓ Server is running on port ${PORT}`);
//   console.log(`✓ Environment: ${process.env.NODE_ENV}`);
//   console.log(`✓ Feedback API available at http://localhost:${PORT}/api/feedback`);
// });

httpServer.listen(PORT, () => {
  console.log(`✓ Server is running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}`);
});

// Run the cron job every 30 minutes
setInterval(() => {
  checkCompletedBookings();
  cleanupStaleBookings();
}, 30 * 60 * 1000);
// Run once on startup
checkCompletedBookings();
cleanupStaleBookings();