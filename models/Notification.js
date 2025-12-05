import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
  sender: { 
    type: String, 
    required: true 
  },
  receiver: { 
    type: String, 
    required: true, 
    index: true // Add index for faster queries by receiver
  },
  message: { 
    type: String, 
    required: true 
  },
  type: {
    type: String,
    enum: [
      'serviceApproved', 
      'newCustomer', 
      'customerDeleted', 
      'serviceRejected', 
      'newServiceProvider', 
      'serviceProviderUpdateRequest',
      'serviceProviderPasswordRequest',
      'serviceProviderDeleteRequest',
      'serviceUnavailable', 
      'providerUnavailable', 
      'booking_confirmation',
      'admin_booking_alert',
      'payment_success',
      'payment_failed',
      'feedback_request'
    ],
    default: 'serviceApproved'
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  data: { 
    type: mongoose.Schema.Types.Mixed // For any additional data relevant to the notification
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  }
});

// Index for efficient querying of unread notifications
NotificationSchema.index({ receiver: 1, read: 1 });

export default mongoose.model('Notification', NotificationSchema);
