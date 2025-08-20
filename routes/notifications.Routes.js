//routes/notifications.Routes.js - COMPLETE WORKING VERSION
import express from 'express';
import { protect, authorize } from '../middleware/authMiddleware.js';
import { 
  fetchNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  getUnreadCount,
  createNotification
} from '../controllers/notificationController.js';
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

// Get all notifications (for current user)
router.get('/', protect, fetchNotifications);

// Get unread notification count
router.get('/unread/count', protect, getUnreadCount);

// Get notifications for a specific user (public endpoint with userId)
router.get('/:userId', fetchNotifications);

// Mark specific notification as read
router.put('/:notificationId/read', protect, markNotificationAsRead);

// Mark all notifications as read
router.put('/read/all', protect, markAllNotificationsAsRead);

// Test endpoint to create a notification (for development/testing)
router.post('/test', protect, (req, res) => {
  try {
    const { sender, receiver, message, type } = req.body;
    
    if (!receiver || !message) {
      return res.status(400).json({
        success: false,
        message: 'Receiver and message are required'
      });
    }
    
    createNotification({
      sender: sender || req.user.userId || 'system',
      receiver,
      message,
      type: type || 'system',
      data: req.body.data || {}
    }).then(notification => {
      res.json({
        success: true,
        message: 'Test notification created',
        notification
      });
    }).catch(error => {
      throw error;
    });
  } catch (error) {
    console.error('Error creating test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create test notification',
      error: error.message
    });
  }
});

// Provider approval/rejection routes
router.put('/providers/:requestId/approve', protect, authorize('admin'), approveServiceProvider);
router.put('/providers/:requestId/reject', protect, authorize('admin'), rejectServiceProvider);

export default router;