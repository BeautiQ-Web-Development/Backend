import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';
import multer from 'multer';           // add multer
import { createServer } from 'http';
import { initializeSocket } from './socket.js';
import {
  register,
  login,
  verifyToken,
  getProfile,
  forgotPassword,
  resetPassword
} from './controllers/authController.js';
import authRoutes from './routes/auth.Routes.js';
import serviceRoutes from './routes/services.Routes.js';
// import packageRoutes from './routes/packages.Routes.js';
import notificationRoutes from './routes/notifications.Routes.js';
// import { transporter } from './config/mailer.js';

dotenv.config();
// Initialize Express app
const app = express();
const SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  // allow custom headers so JWT can be sent in Authorization header
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files for uploads
app.use('/uploads', express.static('uploads'));

// ensure uploads/serviceProviders dir exists
const uploadsDir = path.join(process.cwd(), 'uploads');
const spDir = path.join(uploadsDir, 'serviceProviders');
fs.mkdirSync(spDir, { recursive: true });

// Multer setup for service‐provider file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, spDir),
  filename: (req, file, cb) => {
    const suffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, suffix + '-' + file.originalname);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});
const uploadSpFields = upload.fields([
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'nicFrontPhoto', maxCount: 1 },
  { name: 'nicBackPhoto', maxCount: 1 },
  { name: 'certificatesPhotos', maxCount: 5 }
]);

// RBAC middleware
function rbac(allowedRoles = []) {
  return (req, res, next) => {
    const auth = req.headers.authorization?.split(' ')[1];
    if (!auth) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const payload = jwt.verify(auth, SECRET);
      if (!allowedRoles.includes(payload.role)) return res.status(403).json({ message: 'Forbidden' });
      req.user = payload;
      next();
    } catch {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };
}

// DB-backed auth routes
app.post('/api/auth/register-service-provider', uploadSpFields, register);
app.post('/api/auth/register-customer', register);
app.post('/api/auth/register-admin', register);
app.post('/api/auth/login', login);
app.get('/api/auth/verify-token', verifyToken);
app.get('/api/auth/profile', rbac(['admin','customer','serviceProvider']), getProfile);
app.post('/api/auth/forgot-password', forgotPassword);
app.post('/api/auth/reset-password', resetPassword);
// keep any other routes in authRoutes
app.use('/api/auth', authRoutes);

// Service routes - Apply auth middleware properly
app.use('/api/services', serviceRoutes);
// app.use('/api/packages', packageRoutes);
app.use('/api/notifications', notificationRoutes);

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

// Error handling middleware
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
const httpServer = createServer(app);

// Initialize Socket.IO with the HTTP server
const io = initializeSocket(httpServer);

// Export io for use in other files
export const getIo = () => io;

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`✓ Server is running on port ${PORT}`);
  console.log(`✓ Environment: ${process.env.NODE_ENV}`);
});