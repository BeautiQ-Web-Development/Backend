//models/User.js - UPDATED VERSION WITH PENDING UPDATES SCHEMA
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

const serviceSubSchema = new Schema({
  name: String,
  type: String,
  category: String,
  description: String,
  price: Number,
  duration: Number,
  location: String
}, { _id: false });

// ✅ NEW: Pending Updates Schema - This was missing!
const pendingUpdatesSchema = new Schema({
  fields: {
    type: Schema.Types.Mixed, // Allows any type of data for flexible updates
    default: {}
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  deleteRequested: {
    type: Boolean,
    default: false
  },
  requestType: {
    type: String,
    enum: ['update', 'delete'],
    default: 'update'
  },
  reason: String, // For deletion requests
  rejectionReason: String,
  approvedAt: Date,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: Date,
  rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' }
}, { _id: false });

// ✅ Status History Schema for tracking changes
const statusHistorySchema = new Schema({
  status: {
    type: String,
    enum: ['created', 'updated', 'deleted', 'update_rejected', 'deletion_rejected'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  changedBy: { 
    type: Schema.Types.ObjectId, 
    ref: 'User' 
  },
  reason: String,
  details: Schema.Types.Mixed
}, { _id: false });

// Resignation request schema
const resignationRequestSchema = new Schema({
  reason: {
    type: String,
    required: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reviewedAt: Date,
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: String
}, { _id: false });

const userSchema = new Schema({
  // Common fields for all users
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  emailAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  nicNumber: {
    type: String,
    required: function() {
      // NIC number is required for customers and service providers, not for admins
      return this.role === 'serviceProvider' || this.role === 'customer';
    }
  },
  customerId: {
    type: String,
    unique: true,
    sparse: true
  },
  role: {
    type: String,
    enum: ['customer', 'serviceProvider', 'admin'],
    default: 'customer'
  },
  approved: {
    type: Boolean,
    default: function() {
      return this.role === 'customer';
    }
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function() {
      return this.role === 'serviceProvider' ? 'pending' : 'approved';
    }
  },
  
  // ✅ CRITICAL: Add the pending updates field
  pendingUpdates: pendingUpdatesSchema,
  
  // ✅ Status history for tracking all changes
  statusHistory: [statusHistorySchema],
  
  // ✅ Account status fields
  isActive: {
    type: Boolean,
    default: true
  },
  deletedAt: Date,
  deletionReason: String,
  // Account deletion (resignation) requests from customers
  resignationRequests: [resignationRequestSchema],
  
  // Service Provider ID - only generated after approval
  serviceProviderId: {
    type: String,
    unique: true,
    sparse: true,
    validate: {
      validator: function(v) {
        if (this.role === 'serviceProvider' && this.approvalStatus === 'approved') {
          return v && v.match(/^SP\d{3}$/);
        }
        return !v;
      },
      message: 'Invalid service provider ID format or unauthorized provider ID assignment'
    }
  },
  
  // Service Provider specific fields
  businessName: {
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
  },
  businessDescription: {
    type: String
  },
  businessType: {
    type: String,
    enum: ['individual', 'salon', 'spa', 'mobile_service', 'studio'],
    required: function() { return this.role === 'serviceProvider'; }
  },
  city: {
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
  },
  currentAddress: {
    type: String
  },
  homeAddress: {
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
  },
  mobileNumber: {
    type: String
  },
  
  // Service Provider services and policies
  services: {
    type: [serviceSubSchema],
    default: []
  },
  location: {
    city: String,
    serviceArea: String
  },
  experience: {
    years: Number,
    description: String
  },
  specialties: [String],
  languages: [String],
  policies: {
    cancellation: String,
    paymentMethods: [String],
    advanceBooking: Number
  },
  
  // File uploads
  profilePhoto: String,
  nicFrontPhoto: String,
  nicBackPhoto: String,
  certificatesPhotos: [String],
  
  // Password reset fields
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  // Online status and chat fields
  isOnline: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },

  // Resignation request
  resignationRequest: resignationRequestSchema,
  
  // Rejection reason for service providers
  rejectionReason: String,
  rejectedAt: Date,
  rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // Audit trail fields
  approvedAt: Date,
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// ✅ IMPORTANT: Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  // Only update updatedAt if we're not just adding pending updates
  if (!this.isModified('pendingUpdates')) {
    this.updatedAt = Date.now();
  }
  next();
});

// ✅ Validation middleware to ensure Provider ID rules
userSchema.pre('save', function(next) {
  // If this is a service provider being approved, ensure they get a Provider ID
  if (this.role === 'serviceProvider' && this.approvalStatus === 'approved' && this.isModified('approvalStatus')) {
    console.log('Service provider being approved - Provider ID will be generated');
  }
  
  // Ensure non-approved providers don't have Provider IDs
  if (this.role === 'serviceProvider' && this.approvalStatus !== 'approved' && this.serviceProviderId) {
    this.serviceProviderId = undefined;
    console.log('Removed Provider ID from non-approved service provider');
  }
  
  // Ensure non-service-providers don't have Provider IDs
  if (this.role !== 'serviceProvider' && this.serviceProviderId) {
    this.serviceProviderId = undefined;
    console.log('Removed Provider ID from non-service-provider user');
  }
  
  next();
});

// ✅ AUTO-GENERATE customerId for new customers
userSchema.pre('save', async function(next) {
  if (this.isNew && this.role === 'customer') {
    const last = await this.constructor
      .findOne({ customerId: { $regex: /^Cust_\d{3}$/ } })
      .sort({ customerId: -1 });
    let num = 1;
    if (last?.customerId) {
      num = parseInt(last.customerId.split('_')[1], 10) + 1;
    }
    this.customerId = `Cust_${num.toString().padStart(3, '0')}`;
    console.log(`✅ [CustomerID] Assigned ${this.customerId} to new customer (${this.emailAddress || this._id})`);
  }
  next();
});

// ✅ Indexes for faster queries
userSchema.index({ emailAddress: 1, role: 1 });
userSchema.index({ role: 1, approvalStatus: 1 });
userSchema.index({ serviceProviderId: 1 }, { sparse: true });
userSchema.index({ customerId: 1 }, { unique: true, sparse: true });
userSchema.index({ 'pendingUpdates.status': 1 }); // ✅ NEW: Index for pending updates

// ✅ Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// ✅ Method to check if service provider has valid ID
userSchema.methods.hasValidProviderId = function() {
  return this.role === 'serviceProvider' && 
         this.approvalStatus === 'approved' && 
         this.serviceProviderId && 
         this.serviceProviderId.match(/^SP\d{3}$/);
};

// ✅ Method to check if user has pending updates
userSchema.methods.hasPendingUpdates = function() {
  return this.pendingUpdates && this.pendingUpdates.status === 'pending';
};

// ✅ Method to get pending update type
userSchema.methods.getPendingUpdateType = function() {
  if (!this.hasPendingUpdates()) return null;
  return this.pendingUpdates.deleteRequested ? 'delete' : 'update';
};

// ✅ Static method to get approved providers with IDs
userSchema.statics.getApprovedProvidersWithIds = function() {
  return this.find({
    role: 'serviceProvider',
    approvalStatus: 'approved',
    serviceProviderId: { $exists: true, $ne: null, $ne: '' }
  });
};

// ✅ Static method to get customers with pending updates
userSchema.statics.getCustomersWithPendingUpdates = function() {
  return this.find({
    role: 'customer',
    'pendingUpdates.status': 'pending'
  });
};

export default mongoose.model('User', userSchema);