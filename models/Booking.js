import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  // Common fields from both models
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceProviderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Added from Appointment model
  serviceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Service', 
    required: true 
  },
  // Retained from Booking model
  serviceType: {
    type: String,
    required: true
  },
  serviceName: {
    type: String,
    required: true
  },
  providerName: {
    type: String
  },
  providerEmail: {
    type: String
  },
  customerName: {
    type: String
  },
  customerEmail: {
    type: String
  },
  // Kept from Booking model but renamed to match Appointment fields if needed
  bookingDate: {
    type: Date,
    required: true
  },
  bookingTime: {
    type: String,
    required: true
  },
  // Added from Appointment model for time ranges
  start: { 
    type: Date, 
    required: true
  },
  end: { 
    type: Date, 
    required: true
  },
  duration: {
    type: Number,
    default: 60 // minutes
  },
  totalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'completed', 'cancelled'],
    default: 'confirmed' // Changed default to match Appointment model
  },
  location: {
    type: String,
    enum: ['home', 'salon', 'studio'],
    required: true
  },
  address: {
    type: String,
    required: function() {
      return this.location === 'home';
    }
  },
  notes: {
    type: String
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentId: {
    type: String
  },
  paymentTransactionLog: [{
    paymentId: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed', 'refunded']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: Object
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

bookingSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-generate start and end dates from bookingDate and bookingTime
  if (this.bookingDate && this.bookingTime && this.duration) {
    // Parse the bookingTime (format should be HH:MM)
    const [hours, minutes] = this.bookingTime.split(':').map(Number);
    
    // Set start date/time
    this.start = new Date(this.bookingDate);
    this.start.setHours(hours, minutes, 0, 0);
    
    // Set end date/time based on duration
    this.end = new Date(this.start);
    this.end.setMinutes(this.end.getMinutes() + this.duration);
  }
  
  next();
});

// Add indexes for better query performance
bookingSchema.index({ customerId: 1 });
bookingSchema.index({ serviceProviderId: 1 });
bookingSchema.index({ serviceId: 1 });
bookingSchema.index({ start: 1, end: 1 });
bookingSchema.index({ status: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

export default Booking;