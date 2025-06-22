import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  // Service Provider Reference
  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Basic Service Information
  serviceName: {
    type: String,
    required: true,
    trim: true
  },
  serviceType: {
    type: String,
    required: true,
    enum: [
      'Hairstyle', 'Haircuts', 'Hair Color', 'Nail Art', 'Manicure', 'Pedicure',
      'Makeup', 'Threading', 'Eyebrow Shaping', 'Facial', 'Skincare', 'Massage', 
      'Saree Draping', 'Hair Extensions', 'Keratin Treatment', 'Hair Wash', 
      'Head Massage', 'Mehendi/Henna', 'Other'
    ]
  },
  targetAudience: {
    type: String,
    required: true,
    enum: ['Women', 'Men', 'Kids (Boy)', 'Kids (Girl)', 'Unisex']
  },
  serviceSubType: {
    type: String,
    required: function() {
      return this.serviceType !== 'Other';
    }
  },
  description: {
    type: String,
    required: true
  },
  detailedDescription: {
    type: String
  },
  
  // Pricing Structure
  pricing: {
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    priceType: {
      type: String,
      enum: ['fixed', 'hourly'],
      default: 'fixed'
    },
    variations: [{
      name: String, // e.g., "Long Hair", "Short Hair"
      additionalPrice: Number
    }],
    addOns: [{
      name: String,
      price: Number,
      description: String
    }]
  },
  
  // Service Details
  duration: {
    type: Number,
    required: true,
    min: 15
  },
  experienceLevel: {
    type: String,
    enum: ['beginner', 'intermediate', 'experienced', 'expert'],
    default: 'beginner'
  },
  serviceLocation: {
    type: String,
    enum: ['home_service', 'salon_only', 'both'],
    default: 'both'
  },
  images: [{
    type: String // File paths
  }],
  customNotes: {
    type: String
  },
  preparationRequired: {
    type: String
  },
  
  // Availability
  availability: {
    days: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
    timeSlots: [{
      start: String,
      end: String
    }]
  },
  
  // Service Policies
  cancellationPolicy: {
    type: String,
    default: '24 hours notice required'
  },
  minLeadTime: {
    type: Number, // in hours
    default: 2
  },
  maxLeadTime: {
    type: Number, // in days
    default: 30
  },
  
  // Status Management
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'inactive', 'deleted'],
    default: 'pending_approval'
  },
  approvalDate: {
    type: Date
  },
  rejectedAt: {
    type: Date
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isVisibleToProvider: {
    type: Boolean,
    default: true
  },
  
  // Service Statistics
  bookingCount: {
    type: Number,
    default: 0
  },
  averageRating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  
  // Approval workflow fields
  pendingChanges: {
    actionType: String, // 'create', 'update', 'delete', 'reactivate'
    changes: mongoose.Schema.Types.Mixed,
    reason: String,
    requestedAt: Date,
    requestType: String
  },
  
  approvalHistory: [{
    action: String, // 'create', 'update', 'delete', 'approved', 'rejected'
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    timestamp: {
      type: Date,
      default: Date.now
    },
    previousData: mongoose.Schema.Types.Mixed
  }],
  
  verificationStatus: {
    documentsSubmitted: {
      type: Boolean,
      default: false
    },
    documentsVerified: {
      type: Boolean,
      default: false
    },
    identityVerified: {
      type: Boolean,
      default: false
    },
    skillsVerified: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  indexes: [
    { serviceProvider: 1 },
    { status: 1 },
    { serviceType: 1, status: 1 },
    { targetAudience: 1, status: 1 },
    { 'pricing.basePrice': 1 },
    { status: 1, isActive: 1 }
  ]
});

// Middleware to update search keywords before save
serviceSchema.pre('save', function(next) {
  if (this.isModified('serviceName') || this.isModified('serviceType') || this.isModified('targetAudience') || this.isModified('detailedDescription')) {
    this.searchKeywords = [
      this.serviceName.toLowerCase(),
      this.serviceType.toLowerCase(),
      this.targetAudience.toLowerCase(),
      ...this.detailedDescription.toLowerCase().split(' ').filter(word => word.length > 2)
    ];
  }
  next();
});

// Virtual for formatted duration
serviceSchema.virtual('formattedDuration').get(function() {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes}m`;
});

// Virtual for price range
serviceSchema.virtual('priceRange').get(function() {
  if (this.pricing.priceType === 'fixed') {
    return `LKR ${this.pricing.basePrice.toLocaleString()}`;
  } else if (this.pricing.priceType === 'starting_from') {
    return `From LKR ${this.pricing.basePrice.toLocaleString()}`;
  } else {
    return 'Price varies';
  }
});

// Method to check if service is bookable
serviceSchema.methods.isBookable = function() {
  return this.status === 'approved' && this.isActive;
};

// Method to get available time slots for a specific date
serviceSchema.methods.getAvailableSlots = function(date) {
  const dayName = date.toLocaleLowerCase().substring(0, 3);
  const dayMap = {
    'sun': 'sunday',
    'mon': 'monday',
    'tue': 'tuesday',
    'wed': 'wednesday',
    'thu': 'thursday',
    'fri': 'friday',
    'sat': 'saturday'
  };
  
  const fullDayName = dayMap[dayName];
  if (!this.availability.days.includes(fullDayName)) {
    return [];
  }
  
  return this.availability.timeSlots;
};

// Method to request approval for service changes
serviceSchema.methods.requestApproval = function(actionType, changes, reason) {
  this.pendingChanges = {
    actionType,
    changes,
    reason,
    requestedAt: new Date()
  };
  
  this.approvalHistory.push({
    action: actionType,
    reason: reason || '',
    timestamp: new Date(),
    previousData: actionType === 'update' ? this.toObject() : null
  });
  
  return this.save();
};

// Method to approve pending changes
serviceSchema.methods.approveChanges = function(adminId, reason) {
  if (!this.pendingChanges) {
    throw new Error('No pending changes to approve');
  }
  
  const actionType = this.pendingChanges.actionType;
  
  if (actionType === 'create' || actionType === 'update') {
    // Apply the pending changes
    Object.assign(this, this.pendingChanges.changes);
    this.status = 'approved';
    this.approvalDate = new Date();
  } else if (actionType === 'delete') {
    this.isVisibleToProvider = false;
    this.status = 'deleted';
  } else if (actionType === 'reactivate') {
    this.isVisibleToProvider = true;
    this.status = 'approved';
    this.isActive = true;
  }
  
  // Add approval to history
  this.approvalHistory.push({
    action: 'approved',
    adminId,
    reason: reason || 'Approved by admin',
    timestamp: new Date()
  });
  
  // Clear pending changes
  this.pendingChanges = undefined;
  
  return this.save();
};

// Method to reject pending changes
serviceSchema.methods.rejectChanges = function(adminId, reason) {
  if (!this.pendingChanges) {
    throw new Error('No pending changes to reject');
  }
  
  const actionType = this.pendingChanges.actionType;
  
  if (actionType === 'create') {
    this.status = 'rejected';
    this.rejectedAt = new Date();
    this.rejectedBy = adminId;
    this.rejectionReason = reason;
  }
  
  // Add rejection to history
  this.approvalHistory.push({
    action: 'rejected',
    adminId,
    reason: reason || 'Rejected by admin',
    timestamp: new Date()
  });
  
  // Clear pending changes
  this.pendingChanges = undefined;
  
  return this.save();
};

// Static method for admin to get service history (including deleted services)
serviceSchema.statics.getAdminHistory = function(providerId) {
  const query = providerId ? { serviceProvider: providerId } : {};
  return this.find(query)
    .populate('serviceProvider', 'fullName businessName emailAddress')
    .sort({ createdAt: -1 })
    .lean();
};

const Service = mongoose.model('Service', serviceSchema);

export default Service;
