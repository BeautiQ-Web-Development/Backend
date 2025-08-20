import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { getIo } from '../server.js'; // Make sure to export io from server.js

// Create a new notification and emit via Socket.IO
export const createNotification = async ({ sender, receiver, message, type, data = {} }) => {
  try {
    console.log(`📝 Creating notification: ${type} from ${sender} to ${receiver}`);
    
    const notification = new Notification({
      sender,
      receiver,
      message,
      type,
      data,
      read: false,
      timestamp: new Date()
    });
    
    const savedNotification = await notification.save();
    console.log(`✅ Notification created with ID: ${savedNotification._id}`);
    
    // Emit the notification to the receiver via Socket.IO
    const io = getIo();
    if (io) {
      const delivered = io.emitToUser(receiver, 'newNotification', savedNotification);
      console.log(`🔔 Notification ${delivered ? 'delivered' : 'queued'} for user ${receiver}`);
    } else {
      console.warn('⚠️ Socket.IO not initialized, notification will be delivered on next fetch');
    }
    
    return savedNotification;
  } catch (error) {
    console.error('❌ Error creating notification:', error);
    throw error;
  }
};

export const fetchNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId || req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'User ID is required'
      });
    }
    
    console.log(`🔍 Fetching notifications for user: ${userId}`);
    
    // Get notifications for the user, sorted by timestamp (newest first)
    const notifications = await Notification.find({ receiver: userId })
      .sort({ timestamp: -1 })
      .limit(50); // Limit to prevent too many notifications
    
    console.log(`✅ Found ${notifications.length} notifications for user ${userId}`);
    
    return res.json({ 
      success: true, 
      data: notifications 
    });
  } catch (error) {
    console.error('❌ Error fetching notifications:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch notifications',
      error: error.message 
    });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    console.log(`📝 Marking notification ${notificationId} as read`);
    
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      { read: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        message: 'Notification not found' 
      });
    }
    
    console.log(`✅ Notification ${notificationId} marked as read`);
    
    return res.json({ 
      success: true, 
      message: 'Notification marked as read',
      notification 
    });
  } catch (error) {
    console.error('❌ Error marking notification as read:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notification as read',
      error: error.message 
    });
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    console.log(`📝 Marking all notifications as read for user ${userId}`);
    
    const result = await Notification.updateMany(
      { receiver: userId, read: false },
      { read: true }
    );
    
    console.log(`✅ Marked ${result.modifiedCount} notifications as read for user ${userId}`);
    
    return res.json({ 
      success: true, 
      message: `Marked ${result.modifiedCount} notifications as read`,
      count: result.modifiedCount 
    });
  } catch (error) {
    console.error('❌ Error marking all notifications as read:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to mark notifications as read',
      error: error.message 
    });
  }
};

// Get unread notification count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const count = await Notification.countDocuments({ 
      receiver: userId, 
      read: false 
    });
    
    console.log(`📊 User ${userId} has ${count} unread notifications`);
    
    return res.json({ 
      success: true, 
      count 
    });
  } catch (error) {
    console.error('❌ Error getting unread notification count:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get unread notification count',
      error: error.message 
    });
  }
};

// Helper function to send notifications for service status updates
export const notifyServiceStatusChange = async (service, status, adminId) => {
  try {
    if (!service || !service.serviceProvider) {
      console.warn('⚠️ Invalid service data for notification');
      return null;
    }
    
    const providerId = typeof service.serviceProvider === 'object' 
      ? service.serviceProvider._id.toString()
      : service.serviceProvider.toString();
    
    let message = '';
    let type = '';
    
    switch(status) {
      case 'approved':
        message = `Your service "${service.name}" has been approved`;
        type = 'serviceApproved';
        break;
      case 'rejected':
        message = `Your service "${service.name}" has been rejected`;
        type = 'serviceRejected';
        break;
      default:
        message = `Your service "${service.name}" status has been updated to ${status}`;
        type = 'serviceUpdate';
    }
    
    return await createNotification({
      sender: adminId || 'system',
      receiver: providerId,
      message,
      type,
      data: {
        serviceId: service._id,
        serviceName: service.name,
        status
      }
    });
  } catch (error) {
    console.error('❌ Error sending service status notification:', error);
    return null;
  }
};

export const notifyServiceApproval = async (service, adminId) => {
  if (!service || !service.serviceProvider) return null;
  
  const providerId = typeof service.serviceProvider === 'object' 
    ? service.serviceProvider._id.toString()
    : service.serviceProvider.toString();
  
  return await createNotification({
    sender: adminId || 'system',
    receiver: providerId,
    message: `Your service "${service.name}" has been approved`,
    type: 'serviceApproved',
    data: {
      serviceId: service._id,
      serviceName: service.name,
      status: 'approved'
    }
  });
};

export const notifyNewCustomerRegistration = async (customer) => {
  // Notify admin(s) about new customer registration
  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  
  for (const admin of adminUsers) {
    await createNotification({
      sender: 'system',
      receiver: admin._id.toString(),
      message: `New customer registered: ${customer.fullName || customer.emailAddress}`,
      type: 'newCustomer',
      data: {
        customerId: customer._id,
        customerName: customer.fullName,
        customerEmail: customer.emailAddress
      }
    });
  }
};

export const notifyCustomerDeleted = async (customer, reason) => {
  // Notify admin(s) about customer account deletion
  const adminUsers = await User.find({ role: 'admin' }).select('_id');
  
  for (const admin of adminUsers) {
    await createNotification({
      sender: 'system',
      receiver: admin._id.toString(),
      message: `Customer account deleted: ${customer.fullName || customer.emailAddress}`,
      type: 'customerDeleted',
      data: {
        customerId: customer._id,
        customerName: customer.fullName,
        customerEmail: customer.emailAddress,
        reason: reason || 'Not specified'
      }
    });
  }
};
