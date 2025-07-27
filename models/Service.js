// models/Service.js - COMPLETELY FIXED VERSION
import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  // Reference to service provider
  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 🔧 CRITICAL FIX: Remove the faulty default function
  serviceProviderId: {
    type: String,
    required: false, // Will be set when provider is approved
    default: 'Not assigned' // Clear default instead of ObjectId
  },

  // Unique service ID (generated when approved)
  serviceId: {
    type: String,
    unique: true,
    sparse: true
  },

  // Basic service info
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    required: true,
    enum: [
      'Hairstyle', 'Haircuts', 'Hair Color', 'Nail Art', 'Manicure', 'Pedicure',
      'Makeup', 'Threading', 'Eyebrow Shaping', 'Facial', 'Skincare', 'Massage',
      'Saree Draping', 'Hair Extensions', 'Keratin Treatment', 'Hair Wash',
      'Head Massage', 'Mehendi/Henna', 'Other'
    ]
  },
  category: {
    type: String,
    required: true,
    enum: ['Kids', 'Women', 'Men', 'Unisex']
  },
  serviceSubType: {
    type: String,
    required: function () {
      return this.type !== 'Other';
    },
    trim: true
  },
  description: { type: String, required: true },
  detailedDescription: { type: String },

  // Pricing
  pricing: {
    basePrice: { type: Number, required: true, min: 0 },
    priceType: {
      type: String,
      enum: ['fixed', 'hourly'],
      default: 'fixed'
    },
    variations: [{
      name: String,
      additionalPrice: Number
    }],
    addOns: [{
      name: String,
      price: Number,
      description: String
    }]
  },

  duration: { type: Number, required: true, min: 15 },
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
  images: [{ type: String }],
  customNotes: { type: String },
  preparationRequired: { type: String },

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

  cancellationPolicy: {
    type: String,
    default: '24 hours notice required'
  },
  minLeadTime: { type: Number, default: 2 },
  maxLeadTime: { type: Number, default: 30 },

  // Status Tracking
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'inactive', 'deleted'],
    default: 'pending_approval'
  },
  approvalDate: Date,
  rejectedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String,
  isActive: { type: Boolean, default: true },
  isVisibleToProvider: { type: Boolean, default: true },

  // Audit Trail
  firstSubmittedAt: { type: Date, default: Date.now },
  firstApprovedAt: { type: Date, default: null },
  lastUpdatedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },

  availabilityStatus: {
    type: String,
    enum: ['Available', 'No Longer Available'],
    default: 'Available'
  },

  // Stats
  bookingCount: { type: Number, default: 0 },
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  reviewCount: { type: Number, default: 0 },

  // Approval system
  pendingChanges: {
    actionType: String,
    changes: mongoose.Schema.Types.Mixed,
    reason: String,
    requestedAt: Date,
    requestType: String
  },

  approvalHistory: [{
    action: String,
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

  // Verification
  verificationStatus: {
    documentsSubmitted: { type: Boolean, default: false },
    documentsVerified: { type: Boolean, default: false },
    identityVerified: { type: Boolean, default: false },
    skillsVerified: { type: Boolean, default: false }
  }

}, {
  timestamps: true,
  indexes: [
    { serviceProvider: 1 },
    { status: 1 },
    { type: 1, status: 1 },
    { category: 1, status: 1 },
    { 'pricing.basePrice': 1 },
    { status: 1, isActive: 1 }
  ]
});

// 🔧 CRITICAL FIX: Generate service ID when approved for first time
serviceSchema.pre('save', async function(next) {
  try {
    // Generate service ID when approved for the first time
    if (this.status === 'approved' && !this.serviceId && this.isModified('status')) {
      const lastService = await this.constructor.findOne(
        { serviceId: { $exists: true, $ne: null, $regex: /^SRV_\d{3}$/ } },
        {},
        { sort: { serviceId: -1 } }
      );
      
      let nextNumber = 1;
      if (lastService && lastService.serviceId) {
        const match = lastService.serviceId.match(/SRV_(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      
      this.serviceId = `SRV_${nextNumber.toString().padStart(3, '0')}`;
      console.log('Generated service ID:', this.serviceId);
      
      // Set first approval date
      if (!this.firstApprovedAt) {
        this.firstApprovedAt = new Date();
      }
    }
    
    // Update serviceProviderId from the service provider when approved
    if (this.status === 'approved' && this.isModified('status') && this.populated('serviceProvider')) {
      if (this.serviceProvider && this.serviceProvider.serviceProviderId) {
        this.serviceProviderId = this.serviceProvider.serviceProviderId;
        console.log('Updated service with Provider ID:', this.serviceProvider.serviceProviderId);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// 🔧 FIX: Update serviceProviderId when provider gets approved
serviceSchema.methods.updateProviderIdFromUser = async function() {
  try {
    const provider = await mongoose.model('User').findById(this.serviceProvider);
    if (provider && provider.serviceProviderId && provider.approvalStatus === 'approved') {
      this.serviceProviderId = provider.serviceProviderId;
      await this.save();
      console.log(`Updated service ${this._id} with Provider ID: ${provider.serviceProviderId}`);
    }
  } catch (error) {
    console.error('Error updating service provider ID:', error);
  }
};

// Middleware: Search keywords
serviceSchema.pre('save', function (next) {
  if (this.isModified('name') || this.isModified('type') || this.isModified('category') || this.isModified('detailedDescription')) {
    this.searchKeywords = [
      this.name.toLowerCase(),
      this.type.toLowerCase(),
      this.category.toLowerCase(),
      ...(this.detailedDescription ? this.detailedDescription.toLowerCase().split(' ').filter(w => w.length > 2) : [])
    ];
  }
  next();
});

// Virtuals
serviceSchema.virtual('formattedDuration').get(function () {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
});

serviceSchema.virtual('priceRange').get(function () {
  if (this.pricing.priceType === 'fixed') {
    return `LKR ${this.pricing.basePrice.toLocaleString()}`;
  } else if (this.pricing.priceType === 'starting_from') {
    return `From LKR ${this.pricing.basePrice.toLocaleString()}`;
  } else {
    return 'Price varies';
  }
});

// Methods
serviceSchema.methods.isBookable = function () {
  return this.status === 'approved' && this.isActive;
};

serviceSchema.methods.getAvailableSlots = function (date) {
  const dayName = date.toLocaleLowerCase().substring(0, 3);
  const dayMap = {
    sun: 'sunday',
    mon: 'monday',
    tue: 'tuesday',
    wed: 'wednesday',
    thu: 'thursday',
    fri: 'friday',
    sat: 'saturday'
  };
  const fullDayName = dayMap[dayName];
  if (!this.availability.days.includes(fullDayName)) return [];
  return this.availability.timeSlots;
};

serviceSchema.methods.requestApproval = function (actionType, changes, reason) {
  if (actionType === 'create') {
    this.status = 'pending_approval';
    this.approvalHistory.push({
      action: 'create',
      reason: reason || 'New service creation request',
      timestamp: new Date(),
      previousData: null
    });
  } else {
    this.pendingChanges = {
      actionType,
      changes,
      reason,
      requestedAt: new Date(),
      requestType: actionType
    };
    this.approvalHistory.push({
      action: actionType,
      reason: reason || '',
      timestamp: new Date(),
      previousData: actionType === 'update' ? this.toObject() : null
    });
  }
  return this.save();
};

serviceSchema.methods.approveChanges = async function (adminId, reason = 'Approved by admin') {
  if (this.status === 'pending_approval' && !this.pendingChanges) {
    this.status = 'approved';
    this.isActive = true;
    this.approvalDate = new Date();
    if (!this.firstApprovedAt) this.firstApprovedAt = new Date();

    this.approvalHistory.push({
      action: 'approved',
      adminId,
      reason,
      timestamp: new Date()
    });
    return await this.save();
  }

  if (this.pendingChanges?.changes) {
    Object.keys(this.pendingChanges.changes).forEach(key => {
      if (key !== '_id' && key !== 'serviceProvider') {
        this[key] = this.pendingChanges.changes[key];
      }
    });
    this.status = 'approved';
    this.isActive = true;
    this.pendingChanges = null;
    this.approvalDate = new Date();
    this.lastUpdatedAt = new Date();

    this.approvalHistory.push({
      action: 'approved',
      adminId,
      reason,
      timestamp: new Date()
    });
    return await this.save();
  }

  throw new Error('No pending changes to approve');
};

serviceSchema.methods.rejectChanges = async function (adminId, reason) {
  if (this.status === 'pending_approval' && !this.pendingChanges) {
    this.status = 'rejected';
    this.isActive = false;
    this.rejectedAt = new Date();
    this.rejectedBy = adminId;
    this.rejectionReason = reason;

    this.approvalHistory.push({
      action: 'rejected',
      adminId,
      reason,
      timestamp: new Date()
    });
    return await this.save();
  }

  if (this.pendingChanges) {
    this.pendingChanges = null;
    this.rejectedAt = new Date();
    this.rejectedBy = adminId;
    this.rejectionReason = reason;

    this.approvalHistory.push({
      action: 'rejected',
      adminId,
      reason,
      timestamp: new Date()
    });
    return await this.save();
  }

  throw new Error('No pending changes to reject');
};

// Admin utility
serviceSchema.statics.getAdminHistory = function (providerId) {
  const query = providerId ? { serviceProvider: providerId } : {};
  return this.find(query)
    .populate('serviceProvider', 'fullName businessName emailAddress')
    .sort({ createdAt: -1 })
    .lean();
};

const Service = mongoose.model('Service', serviceSchema);
export default Service;