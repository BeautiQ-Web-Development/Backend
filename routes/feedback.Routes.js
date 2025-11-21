// routes/feedback.Routes.js

import express from 'express';
import {
  getAllFeedbacks,
  getFeedbackStats,
  getFeedbackById,
  getFeedbacksByBooking,
  getFeedbacksByCustomer,
  getFeedbacksByProvider,
  getFeedbacksByService,
  deleteFeedback,
  getFeedbackTrends,
  initializeFeedbackController,
} from '../controllers/feedbackController.js';
import {
  validateFeedbackQuery,
  validateDateParams,
  checkFeedbackAccess,
  validateObjectId,
  logFeedbackAccess,
  cacheFeedbackStats,
  validateTrendPeriod,
} from '../middleware/feedbackMiddleware.js';
import rbac from '../middleware/rbacMiddleware.js';

const router = express.Router();

// Initialize controller with feedback collection (called from server.js)
export { initializeFeedbackController };

// Apply logging to all routes
router.use(logFeedbackAccess);

/**
 * Public/General Routes
 */

// Get all feedbacks with filters
// GET /api/feedback?sentiment=POSITIVE&rating=5&page=1&limit=10
router.get(
  '/',
  validateFeedbackQuery,
  validateDateParams,
  getAllFeedbacks
);

// Get feedback statistics (with caching)
// GET /api/feedback/stats
router.get(
  '/stats',
  cacheFeedbackStats,
  getFeedbackStats
);

// Get feedback trends
// GET /api/feedback/trends?period=week
router.get(
  '/trends',
  rbac(['admin']), // Only admins can see trends
  validateTrendPeriod,
  getFeedbackTrends
);

/**
 * Specific Resource Routes (must come before /:id)
 */

// Get feedbacks by booking ID
// GET /api/feedback/booking/:bookingId
router.get(
  '/booking/:bookingId',
  rbac(['admin', 'customer', 'serviceProvider']),
  checkFeedbackAccess,
  getFeedbacksByBooking
);

// Get feedbacks by customer ID
// GET /api/feedback/customer/:customerId
router.get(
  '/customer/:customerId',
  rbac(['admin', 'customer']),
  checkFeedbackAccess,
  getFeedbacksByCustomer
);

// Get feedbacks by provider ID (with stats)
// GET /api/feedback/provider/:providerId
router.get(
  '/provider/:providerId',
  rbac(['admin', 'serviceProvider']),
  checkFeedbackAccess,
  getFeedbacksByProvider
);

// Get feedbacks by service name
// GET /api/feedback/service/:serviceName
router.get(
  '/service/:serviceName',
  getFeedbacksByService
);

/**
 * Single Feedback Routes
 */

// Get single feedback by ID
// GET /api/feedback/:id
router.get(
  '/:id',
  validateObjectId('id'),
  getFeedbackById
);

// Delete feedback by ID (Admin only)
// DELETE /api/feedback/:id
router.delete(
  '/:id',
  rbac(['admin']),
  validateObjectId('id'),
  deleteFeedback
);

export default router;