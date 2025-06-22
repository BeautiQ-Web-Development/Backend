import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
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
      return this.role === 'customer' ? true : false;
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
  services: [{
    name: String,
    type: String,
    category: String,
    description: String,
    price: Number,
    duration: Number,
    location: String
  }],
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

// Update the updatedAt field before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for faster queries
userSchema.index({ emailAddress: 1, role: 1 });
userSchema.index({ role: 1, approved: 1 });

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('User', userSchema);