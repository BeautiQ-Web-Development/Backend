import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema({
  packageName: {
    type: String,
    required: true,
    trim: true
  },
  packageType: {
    type: String,
    required: true,
    enum: ['bridal', 'party', 'wedding', 'festival', 'custom']
  },
  targetAudience: {
    type: String,
    enum: ['Women', 'Men', 'Kids (Boy)', 'Kids (Girl)', 'Unisex'],
    required: true
  },
  packageDescription: {
    type: String,
    required: true
  },
  includedServices: [{
    type: String
  }],
  totalDuration: {
    type: Number,
    required: true,
    min: 30
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  packageLocation: {
    type: String,
    enum: ['home_service', 'salon_only', 'both'],
    default: 'both'
  },  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customNotes: {
    type: String
  },
  preparationRequired: {
    type: String
  },
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'inactive', 'deleted'],
    default: 'pending_approval'
  },
  pendingChanges: {
    requestType: {
      type: String,
      enum: ['create', 'update', 'delete']
    },
    submittedAt: Date,
    reason: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVisibleToProvider: {
    type: Boolean,
    default: true
  },
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String
}, {
  timestamps: true
});

// Index for search performance
packageSchema.index({ serviceProvider: 1, status: 1 });
packageSchema.index({ packageType: 1, status: 1 });
packageSchema.index({ totalPrice: 1 });

const Package = mongoose.model('Package', packageSchema);

export default Package;