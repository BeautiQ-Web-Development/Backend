// routes/authRoutes.js - UPDATED WITH SERVICE PROVIDER REQUEST ROUTES
import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { 
  uploadServiceProviderFiles, 
  uploadCustomerFiles,
  uploadAdminFiles
} from '../middleware/uploadMiddleware.js';
import {
  register,
  login,
  logout,
  verifyToken,
  checkAdminExists,
  getProfile,
  updateProfile,
  requestAccountDeletion,
  requestServiceProviderUpdate,
  requestServiceProviderDeletion,
  approveCustomerUpdate,
  rejectCustomerUpdate,
  approveServiceProviderUpdate,
  rejectServiceProviderUpdate,
  getCustomersWithPendingUpdates,
  getServiceProvidersWithPendingUpdates,
  getCustomers,
  getServiceProviders,
  forgotPassword,
  resetPassword,
  approveServiceProvider,
  rejectServiceProvider,
  getPendingServiceProviders,
  getApprovedServiceProviders,
  getDashboardData,
  adminUpdateProfile
} from '../controllers/authController.js';

const router = express.Router();

// PUBLIC ROUTE: Check if admin exists (for system initialization check)
router.get('/check-admin-exists', checkAdminExists);

// REGISTRATION ROUTES
router.post('/register-customer', uploadCustomerFiles, register);
router.post('/register-admin', uploadAdminFiles, register);
router.post('/register-service-provider', uploadServiceProviderFiles, register);

// AUTHENTICATION ROUTES
router.post('/login', login);
router.post('/logout', protect, logout);
router.get('/verify-token', verifyToken);

// PASSWORD RESET ROUTES
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// PUBLIC ROUTE: fetch approved service providers for customers
router.get('/approved-service-providers', getApprovedServiceProviders);

// PROTECTED ROUTES (require authentication)
router.use(protect); // All routes below require authentication

// ADMIN PROFILE UPDATE (No approval needed)
router.put('/admin/update-profile', authorize('admin'), adminUpdateProfile);

// PROFILE ROUTES
router.get('/profile', getProfile);


// CUSTOMER PROFILE UPDATE ROUTES
router.post('/update-profile', authorize('customer'), updateProfile);
router.post('/request-account-deletion', authorize('customer'), requestAccountDeletion);

// NEW: SERVICE PROVIDER PROFILE UPDATE ROUTES
router.post('/service-provider/update-profile', authorize('serviceProvider'), requestServiceProviderUpdate);
router.post('/service-provider/request-account-deletion', authorize('serviceProvider'), requestServiceProviderDeletion);

// ADMIN ROUTES - Customer Management
router.get('/customers', authorize('admin'), getCustomers);
router.get('/customers/pending-updates', authorize('admin'), getCustomersWithPendingUpdates);
router.put('/admin/approve-customer-update/:customerId', authorize('admin'), approveCustomerUpdate);
router.put('/admin/reject-customer-update/:customerId', authorize('admin'), rejectCustomerUpdate);

// NEW: ADMIN ROUTES - Service Provider Management
router.get('/service-providers', authorize('admin'), getServiceProviders);
router.get('/service-providers/pending-updates', authorize('admin'), getServiceProvidersWithPendingUpdates);
router.put('/admin/approve-service-provider-update/:providerId', authorize('admin'), approveServiceProviderUpdate);
router.put('/admin/reject-service-provider-update/:providerId', authorize('admin'), rejectServiceProviderUpdate);

// ADMIN ROUTES - Service Provider Approval (for new registrations)
router.get('/pending-providers', authorize('admin'), getPendingServiceProviders);
// Duplicate admin route removed: use public '/approved-service-providers' above for customers
router.put('/approve-provider/:userId', authorize('admin'), approveServiceProvider);
router.put('/reject-provider/:userId', authorize('admin'), rejectServiceProvider);

// Admin dashboard data
router.get(
  '/admin/dashboard-data',
  protect,
  authorize('admin'),
  getDashboardData
);

// // Admin profile update route - NO approval required
// router.put('/admin/update-profile', rbac(['admin']), updateAdminProfile);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        message: 'Too many files or unexpected field name.'
      });
    }
  }
  
  if (error.message === 'Only image files are allowed') {
    return res.status(400).json({
      success: false,
      message: 'Only image files are allowed for upload.'
    });
  }
  
  console.error('Upload error:', error);
  res.status(500).json({
    success: false,
    message: 'File upload error occurred.'
  });
});

export default router;