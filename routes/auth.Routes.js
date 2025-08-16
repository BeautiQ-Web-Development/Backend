// routes/auth.Routes.js - Add missing password reset route
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { protect, authorize } from '../middleware/authMiddleware.js';
import {
  register,
  login,
  verifyToken,
  getProfile,
  getPendingServiceProviders,
  getApprovedServiceProviders,
  forgotPassword,
  resetPassword,
  approveServiceProvider,
  rejectServiceProvider,
  updateProfile,
  requestAccountDeletion,
  approveCustomerUpdate,
  rejectCustomerUpdate,
  getCustomersWithPendingUpdates,
  getCustomers
} from '../controllers/authController.js';
import User from '../models/User.js';

const router = express.Router();

// Multer config for service-provider uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/serviceProviders';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const name = Date.now() + path.extname(file.originalname);
    cb(null, name);
  }
});
const upload = multer({ storage, limits: { fileSize: 5*1024*1024 } });

// Debug middleware for auth routes
router.use((req, res, next) => {
  if (req.path.includes('approve') || req.path.includes('reject')) {
    console.log('🔍 Auth route debug:', req.method, req.path, req.params);
  }
  next();
});

// Basic auth routes
router.post('/register', upload.none(), register);
router.post('/register-customer', upload.none(), register);

// Service provider registration routes
const spFields = [
  { name: 'profilePhoto', maxCount: 1 },
  { name: 'nicFrontPhoto', maxCount: 1 },
  { name: 'nicBackPhoto', maxCount: 1 },
  { name: 'certificatesPhotos', maxCount: 5 }
];
router.post('/register-service-provider', upload.fields(spFields), register);
router.post('/register/service-provider', upload.fields(spFields), register);

router.post('/register-admin', upload.none(), register);
router.post('/login', login);
router.get('/verify-token', verifyToken);
router.get('/profile', protect, getProfile);

// // CRITICAL FIX: Add the missing password reset routes
// router.post('/forgot-password', forgotPassword);
// router.post('/reset-password/:token', resetPassword); // Fixed: Add token parameter
// router.put('/reset-password/:token', resetPassword); // Support both POST and PUT


// ✅ FIX 4: Ensure routes are correct (routes/auth.Routes.js)
// These routes should already be correct from your paste-4.txt:
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword); // ✅ This is correct
router.put('/reset-password/:token', resetPassword); // Support both POST and PUT



// Profile management routes
router.post('/update-profile', protect, updateProfile);
router.post('/request-account-deletion', protect, requestAccountDeletion);

// Public routes for service providers
router.get('/approved-providers', getApprovedServiceProviders);
router.get('/approved-service-providers', getApprovedServiceProviders);

// Provider approval routes with proper parameter mapping
router.post('/approve-request/:requestId', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Auth approve-request route hit:', req.params.requestId);
  req.params.userId = req.params.requestId;
  approveServiceProvider(req, res);
});

router.put('/approve-provider/:userId', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Auth approve-provider route hit:', req.params.userId);
  approveServiceProvider(req, res);
});

router.post('/reject-request/:requestId', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Auth reject-request route hit:', req.params.requestId);
  req.params.userId = req.params.requestId;
  rejectServiceProvider(req, res);
});

router.put('/reject-provider/:userId', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Auth reject-provider route hit:', req.params.userId);
  rejectServiceProvider(req, res);
});

// Admin routes for handling customer update and delete requests
router.get('/admin/pending-customer-updates', protect, authorize('admin'), getCustomersWithPendingUpdates);
router.put('/admin/approve-customer-update/:customerId', protect, authorize('admin'), approveCustomerUpdate);
router.put('/admin/reject-customer-update/:customerId', protect, authorize('admin'), rejectCustomerUpdate);

// Get user counts for admin dashboard
router.get('/user-counts', protect, authorize('admin'), async (req, res) => {
  try {
    const customers = await User.countDocuments({ role: 'customer' });
    const serviceProviders = await User.countDocuments({ role: 'serviceProvider' });
    const pendingProviders = await User.countDocuments({ 
      role: 'serviceProvider', 
      approvalStatus: 'pending' 
    });
    const approvedProviders = await User.countDocuments({ 
      role: 'serviceProvider', 
      approvalStatus: 'approved' 
    });
    const totalUsers = customers + serviceProviders;

    res.json({
      success: true,
      counts: {
        customers,
        serviceProviders,
        pendingProviders,
        approvedProviders,
        totalUsers
      }
    });
  } catch (error) {
    console.error('Get user counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user counts',
      error: error.message
    });
  }
});

// Get pending service providers for admin dashboard
router.get('/pending-service-providers', protect, authorize('admin'), async (req, res) => {
  try {
    const pendingProviders = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'pending'
    }).select('-password');

    res.json({
      success: true,
      providers: pendingProviders
    });
  } catch (error) {
    console.error('Get pending providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending providers',
      error: error.message
    });
  }
});

// Aliases for client compatibility
router.get('/pending-providers', protect, authorize('admin'), getPendingServiceProviders);

// Get all customers for admin
router.get('/customers', protect, authorize('admin'), getCustomers);

// Get all service providers for admin
router.get('/service-providers', protect, authorize('admin'), async (req, res) => {
  try {
    const providers = await User.find({ role: 'serviceProvider' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      providers
    });
  } catch (error) {
    console.error('Get service providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get service providers',
      error: error.message
    });
  }
});

// Request resignation
router.post('/request-resignation', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.resignationRequest = {
      status: 'pending',
      reason: reason || '',
      requestedAt: new Date()
    };

    await user.save();

    res.json({
      success: true,
      message: 'Resignation request submitted for admin approval'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to submit resignation request',
      error: error.message
    });
  }
});

export default router;