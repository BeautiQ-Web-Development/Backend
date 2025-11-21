import mongoose from 'mongoose';

// Define the Payment schema
const paymentSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true
  },
  serviceProviderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  providerName: {
    type: String,
    default: 'Service Provider'
  },
  providerEmail: {
    type: String
  },
  customerName: {
    type: String,
    default: 'Customer'
  },
  customerEmail: {
    type: String
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'usd'
  },
  paymentMethod: {
    type: String,
    enum: ['stripe', 'cash', 'credit_card', 'paypal', 'other'],
    default: 'stripe'
  },
  paymentId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  transactionDetails: {
    type: Object,
    default: {}
  },
  paymentDate: {
    type: Date,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add index for efficient queries
paymentSchema.index({ bookingId: 1, status: 1 });
paymentSchema.index({ customerId: 1, createdAt: -1 });
paymentSchema.index({ paymentId: 1 }, { sparse: true }); // Stripe payment intent ID

// CRITICAL: Composite index to prevent duplicate payments for the same booking
// This ensures only ONE active payment record per booking
paymentSchema.index(
  { 
    bookingId: 1, 
    status: 1 
  },
  { 
    name: 'unique_booking_payment',
    background: true
  }
);

// Index for finding pending payments that need cleanup
paymentSchema.index(
  { 
    status: 1, 
    updatedAt: 1 
  },
  {
    name: 'cleanup_stale_payments',
    background: true
  }
);

// Index for customer payment history queries
paymentSchema.index(
  { 
    customerId: 1, 
    status: 1,
    paymentDate: -1 
  },
  {
    name: 'customer_payment_history',
    background: true
  }
);

// Define a pre-save hook to update the updatedAt field
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static methods for common queries
paymentSchema.statics.findByBooking = function(bookingId) {
  return this.find({ bookingId });
};

paymentSchema.statics.findByCustomer = function(customerId) {
  return this.find({ customerId }).sort({ createdAt: -1 });
};

paymentSchema.statics.findCompletedByCustomer = function(customerId) {
  return this.find({ 
    customerId,
    status: { $in: ['completed', 'paid'] }
  }).sort({ paymentDate: -1 });
};

paymentSchema.statics.findPendingPayments = function(olderThanMinutes = 20) {
  const cutoffTime = new Date(Date.now() - olderThanMinutes * 60 * 1000);
  return this.find({
    status: 'pending',
    updatedAt: { $lt: cutoffTime }
  });
};

paymentSchema.statics.findByStripePaymentId = function(paymentId) {
  return this.findOne({ paymentId });
};

// Instance methods
paymentSchema.methods.isCompleted = function() {
  return this.status === 'completed' || this.status === 'paid';
};

paymentSchema.methods.isPending = function() {
  return this.status === 'pending';
};

paymentSchema.methods.canBeRefunded = function() {
  return (this.status === 'completed' || this.status === 'paid') && this.paymentMethod === 'stripe';
};

paymentSchema.methods.markAsCompleted = function(stripePaymentId) {
  this.status = 'paid'; // Use 'paid' status instead of 'completed'
  this.paymentId = stripePaymentId;
  this.paymentDate = new Date();
  this.transactionDetails = {
    ...this.transactionDetails,
    paymentSuccess: true,
    completedAt: new Date(),
    stripePaymentId
  };
  return this.save();
};

paymentSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'failed';
  this.transactionDetails = {
    ...this.transactionDetails,
    paymentFailed: true,
    failedAt: new Date(),
    errorMessage
  };
  return this.save();
};

// Create and export the Payment model
const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;