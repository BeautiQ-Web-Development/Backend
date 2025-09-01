// routes/booking.Routes.js
import express from 'express';
import { 
  getProviderBookings, 
  getBookingById, 
  updateBookingStatus, 
  getCustomerBookings,
  createBooking,
  rescheduleBooking
} from '../controllers/bookingController.js';
import { protect as authMiddleware } from '../middleware/authMiddleware.js';
import rbac from '../middleware/rbacMiddleware.js';

const router = express.Router();

// Provider routes
router.get('/provider', authMiddleware, rbac(['serviceProvider']), getProviderBookings);

// Customer routes
router.get('/customer', authMiddleware, rbac(['customer']), getCustomerBookings);
router.post('/create', authMiddleware, rbac(['customer']), createBooking);

// Common routes
router.get('/:bookingId', authMiddleware, getBookingById);
router.put('/:bookingId/status', authMiddleware, updateBookingStatus);
router.put('/:bookingId/reschedule', authMiddleware, rescheduleBooking);

export default router;
