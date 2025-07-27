//models/User.js - FIXED VERSION WITH PROVIDER ID
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

const resignationRequestSchema = new Schema({
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  reason: String,
  requestedAt: Date,
  reviewedAt: Date,
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' }
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
  
  // 🔧 CRITICAL FIX: Service Provider ID - only generated after approval
  serviceProviderId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple documents without this field
    validate: {
      validator: function(v) {
        // Only service providers should have this field
        if (this.role === 'serviceProvider' && this.approvalStatus === 'approved') {
          return v && v.match(/^SP\d{3}$/);
        }
        // For non-approved providers or other roles, this field should not exist
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
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
  },
  homeAddress: {
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
  },
  mobileNumber: {
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
  },
  nicNumber: {
    type: String,
    required: function() { return this.role === 'serviceProvider'; }
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
  resetToken: String,
  resetTokenExpiry: Date,

  // Resignation request
  resignationRequest: resignationRequestSchema,
  
  // Rejection reason for service providers
  rejectionReason: String,
  rejectedAt: Date,
  rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },

  // 🔧 NEW: Audit trail fields
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

// 🔧 CRITICAL: Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 🔧 CRITICAL: Validation middleware to ensure Provider ID rules
userSchema.pre('save', function(next) {
  // If this is a service provider being approved, ensure they get a Provider ID
  if (this.role === 'serviceProvider' && this.approvalStatus === 'approved' && this.isModified('approvalStatus')) {
    // The Provider ID will be generated in the approveServiceProvider function
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

// Index for faster queries
userSchema.index({ emailAddress: 1, role: 1 });
userSchema.index({ role: 1, approvalStatus: 1 });
userSchema.index({ serviceProviderId: 1 }, { sparse: true }); // Sparse index for Provider ID

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// 🔧 NEW: Method to check if service provider has valid ID
userSchema.methods.hasValidProviderId = function() {
  return this.role === 'serviceProvider' && 
         this.approvalStatus === 'approved' && 
         this.serviceProviderId && 
         this.serviceProviderId.match(/^SP\d{3}$/);
};

// 🔧 NEW: Static method to get approved providers with IDs
userSchema.statics.getApprovedProvidersWithIds = function() {
  return this.find({
    role: 'serviceProvider',
    approvalStatus: 'approved',
    serviceProviderId: { $exists: true, $ne: null, $ne: '' }
  });
};

export default mongoose.model('User', userSchema);