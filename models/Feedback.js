import mongoose from 'mongoose';

const FeedbackSchema = new mongoose.Schema({
  bookingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
    required: true 
  },
  customerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  providerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  serviceId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Service', 
    required: true 
  },
  serviceName: {
    type: String,
    required: true
  },
  providerName: {
    type: String,
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  rating: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 5 
  },
  feedbackText: { 
    type: String, 
    required: true 
  },
  sentiment: { 
    type: String, 
    enum: ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'], 
    default: 'NEUTRAL' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  processedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Indexes for faster queries
FeedbackSchema.index({ serviceId: 1, rating: -1 });
FeedbackSchema.index({ providerId: 1, createdAt: -1 });
FeedbackSchema.index({ customerId: 1 });
FeedbackSchema.index({ bookingId: 1 });

export default mongoose.model('Feedback', FeedbackSchema);
