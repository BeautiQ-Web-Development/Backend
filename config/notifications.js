import Notification from '../models/Notification.js';

// In-memory notification storage (replace with database in production)
let notifications = [];

export const addNotification = async ({ type, payload, timestamp, read = false }) => {
  try {
    const newNotification = {
      id: Date.now().toString(),
      type,
      payload,                 // now supports arbitrary object
      read,
      timestamp: timestamp || new Date(),
    };

    notifications.unshift(newNotification);

    // Keep only last 100 notifications
    if (notifications.length > 100) {
      notifications = notifications.slice(0, 100);
    }

    console.log('Notification added:', newNotification);
    return newNotification;
  } catch (error) {
    console.error('Failed to add notification:', error);
  }
};

export const getNotifications = () => {
  return notifications;
};

export const markAsRead = (notificationId) => {
  const notification = notifications.find(n => n.id === notificationId);
  if (notification) {
    notification.read = true;
  }
  return notification;
};

export const addServiceNotification = (serviceData, action = 'created') => {
  return addNotification({
    type: 'newService',
    action,
    payload: {
      serviceId: serviceData._id,
      serviceName: serviceData.name,
      serviceType: serviceData.type,
      providerName: serviceData.serviceProvider?.fullName || serviceData.serviceProvider?.businessName,
      providerId: serviceData.serviceProvider?._id || serviceData.serviceProvider,
      status: serviceData.status
    },
    message: `New service "${serviceData.name}" submitted for approval`,
    timestamp: new Date(),
    read: false
  });
};
