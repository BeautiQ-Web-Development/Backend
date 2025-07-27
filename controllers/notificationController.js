import Notification from '../models/Notification.js';
import User from '../models/User.js';

export const fetchNotifications = async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      const notes = await Notification.find({}).sort({ createdAt: -1 }).lean();
      const data = await Promise.all(notes.map(async (n) => {
        let details = n.payload;
        if (n.type === 'newServiceProvider' && n.payload.userId) {
          const user = await User.findById(n.payload.userId).select('-password');
          details = { ...n.payload, details: user };
        }
        return { ...n, payload: details };
      }));
      return res.json({ success: true, data });
    }
    
    if (req.user.role === 'serviceProvider') {
      // Get notifications for service provider (approvals, rejections, etc.)
      const user = await User.findById(req.user.userId);
      const notifications = [];
      
      if (user && user.notifications) {
        notifications.push(...user.notifications);
      }
      
      return res.json({ success: true, notifications });
    }
    
    const notifications = await Notification.find().sort({ createdAt: -1 });
    res.json({ success: true, data: notifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notifications',
      error: error.message 
    });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    if (req.user.role === 'serviceProvider') {
      await User.findByIdAndUpdate(
        req.user.userId,
        { $pull: { notifications: { _id: notificationId } } }
      );
    } else {
      await Notification.findByIdAndUpdate(notificationId, { read: true });
    }
    
    res.json({ success: true, message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notification as read' 
    });
  }
};
     