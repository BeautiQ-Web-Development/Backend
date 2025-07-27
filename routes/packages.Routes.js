// routes/packageRoutes.js - CLEAN VERSION with no duplicates
import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { requirePackageOwnership } from '../middleware/packageMiddleware.js';
import {
  createPackage,
  getProviderPackages,
  getProviderApprovedPackages,
  getApprovedPackages,
  getPackageById,
  updatePackage,
  deletePackage,
  getPendingPackages,
  getHistoryPackages,
  getAllPackagesForAdmin,
  getAdminPackageStats,
  adminApprovePackage,
  adminRejectPackage,
  verifyPackageIds
} from '../controllers/packageController.js';

const router = express.Router();

// Enhanced async wrapper with detailed logging
const asyncHandler = (fn, routeName) => (req, res, next) => {
  const startTime = Date.now();
  if (routeName) {
    console.log(`🚀 Starting ${routeName} - User: ${req.user?.userId} (${req.user?.role})`);
  }
  
  Promise.resolve(fn(req, res, next))
    .then(() => {
      if (routeName) {
        const duration = Date.now() - startTime;
        console.log(`✅ Completed ${routeName} in ${duration}ms`);
      }
    })
    .catch((error) => {
      if (routeName) {
        const duration = Date.now() - startTime;
        console.error(`❌ Failed ${routeName} after ${duration}ms:`, {
          error: error.message,
          user: req.user?.userId,
          route: req.originalUrl
        });
      }
      next(error);
    });
};

// Enhanced logging middleware for debugging
const logRequest = (req, res, next) => {
  console.log(`📋 ${req.method} ${req.originalUrl} - User: ${req.user?.userId || 'Not authenticated'}`);
  next();
};

// Public routes - only approved packages
router.get('/', asyncHandler(getApprovedPackages, 'getApprovedPackages'));

// Apply authentication to all routes below
router.use(protect);

// Provider-specific routes
router.post('/', 
  logRequest,
  authorize('serviceProvider'), 
  asyncHandler(createPackage, 'createPackage')
);

router.get('/provider', 
  logRequest,
  authorize('serviceProvider'), 
  asyncHandler(getProviderPackages, 'getProviderPackages')
);

router.get('/provider/approved', 
  logRequest,
  authorize('serviceProvider'), 
  asyncHandler(getProviderApprovedPackages, 'getProviderApprovedPackages')
);

// Package detail route (accessible to authenticated users)
router.get('/:id([0-9a-fA-F]{24})', 
  logRequest,
  asyncHandler(getPackageById, 'getPackageById')
);

// Package modification routes with ownership protection
router.put('/:packageId([0-9a-fA-F]{24})', 
  logRequest,
  authorize('serviceProvider'), 
  asyncHandler(requirePackageOwnership), 
  asyncHandler(updatePackage, 'updatePackage')
);

router.delete('/:packageId([0-9a-fA-F]{24})', 
  logRequest,
  authorize('serviceProvider'), 
  asyncHandler(requirePackageOwnership), 
  asyncHandler(deletePackage, 'deletePackage')
);

// Admin routes - consolidated and clean
router.get('/admin/stats', 
  logRequest,
  authorize('admin'), 
  asyncHandler(getAdminPackageStats, 'getAdminPackageStats')
);

router.get('/admin/all', 
  logRequest,
  authorize('admin'), 
  asyncHandler(getAllPackagesForAdmin, 'getAllPackagesForAdmin')
);

router.get('/admin/pending', 
  logRequest,
  authorize('admin'), 
  asyncHandler(getPendingPackages, 'getPendingPackages')
);

router.get('/admin/history', 
  logRequest,
  authorize('admin'), 
  asyncHandler(getHistoryPackages, 'getHistoryPackages')
);

router.get('/admin/verify-ids', 
  logRequest,
  authorize('admin'), 
  asyncHandler(verifyPackageIds, 'verifyPackageIds')
);

router.post('/admin/:id([0-9a-fA-F]{24})/approve', 
  logRequest,
  authorize('admin'), 
  asyncHandler(adminApprovePackage, 'adminApprovePackage')
);

router.post('/admin/:id([0-9a-fA-F]{24})/reject', 
  logRequest,
  authorize('admin'), 
  asyncHandler(adminRejectPackage, 'adminRejectPackage')
);

// Enhanced error handling middleware
router.use((error, req, res, next) => {
  console.error('🚨 Package route error:', {
    method: req.method,
    url: req.originalUrl,
    error: error.message,
    user: req.user?.userId
  });

  // Handle specific error types
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Invalid ID format',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }

  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors
    });
  }

  if (error.message.includes('circular structure')) {
    return res.status(500).json({
      success: false,
      message: 'Data structure error. Please try again.',
      error: 'Circular reference detected'
    });
  }

  if (error.name === 'MongooseError' || error.name === 'MongoError') {
    return res.status(500).json({
      success: false,
      message: 'Database error occurred',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Database operation failed'
    });
  }

  // Default error response
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? {
      message: error.message,
      stack: error.stack
    } : undefined
  });
});

export default router;