//routes/notifications.Routes.js - COMPLETE WORKING VERSION
import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { getNotifications, markAsRead } from '../config/notifications.js';
import { 
  approveServiceProvider, 
  rejectServiceProvider 
} from '../controllers/authController.js';

const router = express.Router();

// Debug middleware
router.use((req, res, next) => {
  console.log('🔍 Notification route hit:', req.method, req.originalUrl);
  console.log('🔍 Request params:', req.params);
  console.log('🔍 Request body:', req.body);
  next();
});

// Get all notifications (admin only)
router.get('/', protect, authorize('admin'), (req, res) => {
  try {
    const notifications = getNotifications();
    res.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notifications'
    });
  }
});

// 🔧 CRITICAL FIX: Provider approval/rejection routes that match frontend calls
router.put('/providers/:providerId/approve', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Notification approve route hit with Provider ID:', req.params.providerId);
  
  // Map providerId to userId for controller compatibility
  req.params.userId = req.params.providerId;
  
  // Call the approve function directly (not async wrapper)
  approveServiceProvider(req, res);
});

router.put('/providers/:providerId/reject', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Notification reject route hit with Provider ID:', req.params.providerId);
  
  // Map providerId to userId for controller compatibility
  req.params.userId = req.params.providerId;
  
  // Call the reject function directly (not async wrapper)
  rejectServiceProvider(req, res);
});

// Alternative POST routes for compatibility
router.post('/providers/:providerId/approve', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Notification POST approve route hit with Provider ID:', req.params.providerId);
  req.params.userId = req.params.providerId;
  approveServiceProvider(req, res);
});

router.post('/providers/:providerId/reject', protect, authorize('admin'), (req, res) => {
  console.log('🔍 Notification POST reject route hit with Provider ID:', req.params.providerId);
  req.params.userId = req.params.providerId;
  rejectServiceProvider(req, res);
});

// Mark notification as read
router.put('/:id/read', protect, authorize('admin'), (req, res) => {
  try {
    const { id } = req.params;
    const notification = markAsRead(id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }
    
    res.json({
      success: true,
      notification
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

export default router;