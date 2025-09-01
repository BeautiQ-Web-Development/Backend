import Notification from '../models/Notification.js';
import mailer from './mailer.js';

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

export function notifyNewCustomerRegistration(customerData) {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const subject = 'New Customer Registration';
    const message = `
A new customer has registered:
---------------------------
Name: ${customerData.fullName || customerData.name || 'Not provided'}
Email: ${customerData.emailAddress || customerData.email || 'Not provided'}
Phone: ${customerData.mobileNumber || 'Not provided'}
Address: ${customerData.currentAddress || 'Not provided'}
NIC: ${customerData.nicNumber || 'Not provided'}
---------------------------
`;
    
    // Use the sendServiceNotificationToAdmin from mailer
    return mailer.sendServiceNotificationToAdmin({
      subject: subject,
      text: message,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>New Customer Registration</h2>
        <p><strong>Name:</strong> ${customerData.fullName || customerData.name || 'Not provided'}</p>
        <p><strong>Email:</strong> ${customerData.emailAddress || customerData.email || 'Not provided'}</p>
        <p><strong>Phone:</strong> ${customerData.mobileNumber || 'Not provided'}</p>
        <p><strong>Address:</strong> ${customerData.currentAddress || 'Not provided'}</p>
        <p><strong>NIC:</strong> ${customerData.nicNumber || 'Not provided'}</p>
      </div>`
    }).then(info => {
      console.log('✅ New customer registration notification sent to admin');
      return info;
    }).catch(error => {
      console.error('❌ Error sending registration notification:', error);
      // Don't throw the error - we don't want to block registration
      return null;
    });
  } catch (error) {
    console.error('❌ Error in notifyNewCustomerRegistration:', error);
    // Don't throw the error - we don't want to block registration
    return Promise.resolve(null);
  }
}
