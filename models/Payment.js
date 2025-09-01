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
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
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

// Define a pre-save hook to update the updatedAt field
paymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Add useful methods
paymentSchema.statics.findByBooking = function(bookingId) {
  return this.find({ bookingId });
};

paymentSchema.statics.findByCustomer = function(customerId) {
  return this.find({ customerId }).sort({ createdAt: -1 });
};

// Create and export the Payment model
const Payment = mongoose.model('Payment', paymentSchema);

export default Payment;
