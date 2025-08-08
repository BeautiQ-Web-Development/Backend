// models/Service.js - ENHANCED VERSION WITH COMPLETE WORKFLOW SUPPORT
import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  // Reference to service provider
  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Provider ID - will be set when provider is approved
  serviceProviderId: {
    type: String,
    required: false,
    default: 'Not assigned',
    index: true
  },

  // Unique service ID (generated when approved for first time)
  serviceId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },

  // Basic service info
  name: { 
    type: String, 
    required: true, 
    trim: true,
    maxlength: 100,
    index: true
  },
  
  type: {
    type: String,
    required: true,
    enum: [
      'Hair Cut', 'Hair Style', 'Face Makeup', 'Nail Art', 'Saree Draping', 'Eye Makeup'
    ],
    index: true
  },
  
  category: {
    type: String,
    required: true,
    enum: ['Kids', 'Women', 'Men', 'Unisex'],
    index: true
  },
  
  // serviceSubType: {
  //   type: String,
  //   required: false,
  //   trim: true
  // },
  
  description: { 
    type: String, 
    required: true,
    minlength: 5,
    maxlength: 2000
  },

  // Pricing structure
  pricing: {
    basePrice: { 
      type: Number, 
      required: true, 
      min: 0,
      max: 1000000,
      index: true
    },
    priceType: {
      type: String,
      enum: ['fixed', 'hourly', 'variable'],
      default: 'fixed'
    },
    variations: [{
      name: String,
      additionalPrice: Number,
      description: String
    }],
    addOns: [{
      name: String,
      price: Number,
      description: String,
      isOptional: { type: Boolean, default: true }
    }]
  },

  // Service details
  duration: { 
    type: Number, 
    required: true, 
    min: 15,
    max: 600
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

  // Additional information
  preparationRequired: { type: String, maxlength: 500 },
  customNotes: { type: String, maxlength: 500 },
  cancellationPolicy: {
    type: String,
    default: '24 hours notice required',
    maxlength: 200
  },
  minLeadTime: { type: Number, default: 2, min: 1 },
  maxLeadTime: { type: Number, default: 30, max: 365 },

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

  // Media
  images: [{
    url: String,
    description: String,
    isPrimary: { type: Boolean, default: false }
  }],

  // Status Management - ENHANCED
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'inactive', 'deleted'],
    default: 'pending_approval',
    required: true,
    index: true
  },

  // Approval tracking
  approvalDate: Date,
  firstApprovedAt: { type: Date, default: null },
  rejectedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: { type: String, maxlength: 500 },

  // Activity status
  isActive: { type: Boolean, default: false, index: true },
  isVisibleToProvider: { type: Boolean, default: true },
  availabilityStatus: {
    type: String,
    enum: ['Available', 'No Longer Available'],
    default: 'Available'
  },

  // ENHANCED: Complete Status History Tracking
  statusHistory: [{
    status: {
      type: String,
      enum: ['pending_approval', 'approved', 'rejected', 'inactive', 'deleted'],
      required: true
    },
    changedAt: { 
      type: Date, 
      default: Date.now,
      required: true
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: { type: String, maxlength: 200 },
    metadata: mongoose.Schema.Types.Mixed,
    adminNotes: { type: String, maxlength: 500 }
  }],

  // ENHANCED: Complete Audit Trail
  firstSubmittedAt: { type: Date, default: Date.now, required: true },
  lastUpdatedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reactivatedAt: { type: Date, default: null },
  reactivatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // ENHANCED: Pending Changes System
  pendingChanges: {
    actionType: {
      type: String,
      enum: ['create', 'update', 'delete', 'reactivate']
    },
    changes: mongoose.Schema.Types.Mixed,
    reason: { type: String, maxlength: 200 },
    requestedAt: Date,
    requestType: {
      type: String,
      enum: ['create', 'update', 'delete', 'reactivate']
    },
    originalData: mongoose.Schema.Types.Mixed,
    adminNotes: { type: String, maxlength: 500 }
  },

  // ENHANCED: Comprehensive Approval History
  approvalHistory: [{
    action: {
      type: String,
      enum: [
        'create', 'created', 'approved', 'rejected', 
        'update_requested', 'update_approved', 'update_rejected',
        'delete_requested', 'delete_approved', 'delete_rejected',
        'reactivate_requested', 'reactivate_approved', 'reactivate_rejected',
        'deleted'
      ]
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: { type: String, maxlength: 200 },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true
    },
    previousData: mongoose.Schema.Types.Mixed,
    appliedChanges: mongoose.Schema.Types.Mixed,
    previousStatus: String,
    adminNotes: { type: String, maxlength: 500 }
  }],

  // Performance metrics
  bookingCount: { type: Number, default: 0 },
  averageRating: { type: Number, min: 0, max: 5, default: 0 },
  reviewCount: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },

  // SEO and search
  searchKeywords: [String],
  tags: [String],

  // Version control
  version: { type: Number, default: 1 },
  
  // Verification status
  verificationStatus: {
    documentsSubmitted: { type: Boolean, default: false },
    documentsVerified: { type: Boolean, default: false },
    skillsVerified: { type: Boolean, default: false },
    identityVerified: { type: Boolean, default: false }
  }

}, {
  timestamps: true,
  collection: 'services'
});

// INDEXES for better performance
serviceSchema.index({ serviceProvider: 1, status: 1 });
serviceSchema.index({ status: 1, isActive: 1 });
serviceSchema.index({ type: 1, category: 1, status: 1 });
serviceSchema.index({ 'pricing.basePrice': 1 });
serviceSchema.index({ createdAt: -1 });
serviceSchema.index({ serviceId: 1 }, { unique: true, sparse: true });
serviceSchema.index({ serviceProviderId: 1 });
serviceSchema.index({ searchKeywords: 1 });

// ENHANCED: Auto-generate service ID and handle provider ID updates
serviceSchema.pre('save', async function(next) {
  try {
    // Generate service ID when approved for the first time
    if (this.status === 'approved' && !this.serviceId && this.isModified('status')) {
      console.log('🆔 Generating Service ID for first-time approval');
      
      // Find the highest existing service ID
      const lastService = await this.constructor.findOne(
        { serviceId: { $exists: true, $ne: null, $regex: /^S\d{3}$/ } },
        {},
        { sort: { serviceId: -1 } }
      );
      
      let nextNumber = 1;
      if (lastService && lastService.serviceId) {
        const match = lastService.serviceId.match(/S(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      
      this.serviceId = `S${nextNumber.toString().padStart(3, '0')}`;
      console.log('✅ Generated Service ID:', this.serviceId);
      
      // Set first approval timestamp
      if (!this.firstApprovedAt) {
        this.firstApprovedAt = new Date();
        console.log('📅 Set first approval date:', this.firstApprovedAt);
      }
    }
    
    // Update serviceProviderId from the populated service provider
    if (this.status === 'approved' && this.isModified('status')) {
      if (this.populated('serviceProvider') && this.serviceProvider?.serviceProviderId) {
        this.serviceProviderId = this.serviceProvider.serviceProviderId;
        console.log('🔗 Updated service with Provider ID:', this.serviceProvider.serviceProviderId);
      }
    }
    
    next();
  } catch (error) {
    console.error('❌ Error in Service pre-save:', error);
    next(error);
  }
});

// ENHANCED: Automatically track status changes
serviceSchema.pre('save', function(next) {
  // Track status changes in statusHistory automatically
  if (this.isModified('status') && !this.isNew) {
    const lastHistoryEntry = this.statusHistory[this.statusHistory.length - 1];
    
    // Only add if status actually changed
    if (!lastHistoryEntry || lastHistoryEntry.status !== this.status) {
      this.statusHistory.push({
        status: this.status,
        changedAt: new Date(),
        reason: `Status automatically changed to ${this.status}`,
        metadata: {
          autoGenerated: true,
          previousStatus: lastHistoryEntry?.status
        }
      });
      
      console.log(`📊 Status change tracked: ${lastHistoryEntry?.status || 'new'} → ${this.status}`);
    }
  }
  
  next();
});

// ENHANCED: Update search keywords automatically
serviceSchema.pre('save', function (next) {
  if (this.isModified('name') || this.isModified('type') || this.isModified('category') || this.isModified('description')) {
    const keywords = new Set();
    
    // Add name words
    if (this.name) {
      this.name.toLowerCase().split(' ').forEach(word => {
        if (word.length > 2) keywords.add(word);
      });
    }
    
    // Add type and category
    if (this.type) keywords.add(this.type.toLowerCase());
    if (this.category) keywords.add(this.category.toLowerCase());
    
    // Add description words (first 50 words only)
    if (this.description) {
      this.description.toLowerCase().split(' ')
        .slice(0, 50)
        .forEach(word => {
          if (word.length > 2) keywords.add(word.replace(/[^\w]/g, ''));
        });
    }
    
    this.searchKeywords = Array.from(keywords).filter(keyword => keyword.length > 2);
    console.log('🔍 Updated search keywords:', this.searchKeywords.slice(0, 10));
  }
  next();
});

// VIRTUAL FIELDS
serviceSchema.virtual('formattedDuration').get(function () {
  const hours = Math.floor(this.duration / 60);
  const minutes = this.duration % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
});

serviceSchema.virtual('priceRange').get(function () {
  if (this.pricing.priceType === 'fixed') {
    return `LKR ${this.pricing.basePrice.toLocaleString()}`;
  } else if (this.pricing.priceType === 'hourly') {
    return `LKR ${this.pricing.basePrice.toLocaleString()}/hour`;
  } else {
    return `From LKR ${this.pricing.basePrice.toLocaleString()}`;
  }
});

serviceSchema.virtual('currentStatusInfo').get(function() {
  return {
    status: this.status,
    isActive: this.isActive,
    isVisible: this.isVisibleToProvider,
    hasPendingChanges: !!this.pendingChanges,
    pendingAction: this.pendingChanges?.actionType,
    pendingReason: this.pendingChanges?.reason,
    lastStatusChange: this.statusHistory.length > 0 ? 
      this.statusHistory[this.statusHistory.length - 1] : null,
    serviceId: this.serviceId || 'Pending Assignment',
    providerId: this.serviceProviderId || 'Not Assigned'
  };
});

// INSTANCE METHODS

// Check if service is bookable by customers
serviceSchema.methods.isBookable = function () {
  return this.status === 'approved' && 
         this.isActive && 
         this.availabilityStatus === 'Available' &&
         !this.deletedAt;
};

// Get available time slots for a specific date
serviceSchema.methods.getAvailableSlots = function (date) {
  const dayName = new Date(date).toLocaleDateString('en', { weekday: 'long' }).toLowerCase();
  
  if (!this.availability.days.includes(dayName)) {
    return [];
  }
  
  return this.availability.timeSlots || [];
};

// ENHANCED: Update status with complete tracking
serviceSchema.methods.updateStatus = async function(newStatus, adminId, reason, metadata = {}) {
  const previousStatus = this.status;
  
  this.status = newStatus;
  
  // Update relevant fields based on status
  switch (newStatus) {
    case 'approved':
      this.approvalDate = new Date();
      this.isActive = true;
      if (!this.firstApprovedAt) {
        this.firstApprovedAt = new Date();
      } else {
        this.lastUpdatedAt = new Date();
      }
      this.availabilityStatus = 'Available';
      break;
      
    case 'rejected':
      this.rejectedAt = new Date();
      this.rejectedBy = adminId;
      this.rejectionReason = reason;
      this.isActive = false;
      break;
      
    case 'deleted':
      this.deletedAt = new Date();
      this.deletedBy = adminId;
      this.isActive = false;
      this.availabilityStatus = 'No Longer Available';
      // Keep visible for audit purposes
      break;
      
    case 'inactive':
      this.isActive = false;
      break;
      
    default:
      break;
  }
  
  // Add to status history with enhanced tracking
  this.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    changedBy: adminId,
    reason: reason,
    metadata: {
      ...metadata,
      previousStatus: previousStatus,
      actionPerformed: 'admin_status_update'
    }
  });
  
  // Add to approval history
  this.approvalHistory.push({
    action: newStatus,
    adminId: adminId,
    reason: reason,
    timestamp: new Date(),
    previousStatus: previousStatus,
    adminNotes: metadata.adminNotes
  });
  
  console.log(`📊 Status updated: ${previousStatus} → ${newStatus} (Reason: ${reason})`);
  
  return await this.save();
};

// ENHANCED: Request approval with detailed tracking
serviceSchema.methods.requestApproval = function (actionType, changes, reason, metadata = {}) {
  if (actionType === 'create') {
    // For new services
    this.status = 'pending_approval';
    this.statusHistory.push({
      status: 'pending_approval',
      changedAt: new Date(),
      reason: reason || 'New service creation request',
      metadata: { actionType: 'create', ...metadata }
    });
    
    this.approvalHistory.push({
      action: 'create',
      reason: reason || 'New service creation request',
      timestamp: new Date(),
      previousData: null
    });
  } else {
    // For updates, deletions, reactivations
    this.pendingChanges = {
      actionType,
      changes,
      reason,
      requestedAt: new Date(),
      requestType: actionType,
      originalData: actionType === 'update' ? this.toObject() : null,
      adminNotes: metadata.adminNotes
    };
    
    this.approvalHistory.push({
      action: `${actionType}_requested`,
      reason: reason || `${actionType} request submitted`,
      timestamp: new Date(),
      previousData: actionType === 'update' ? this.toObject() : null
    });
  }
  
  console.log(`📝 Approval requested: ${actionType} (Reason: ${reason})`);
  return this.save();
};

// ENHANCED: Approve changes with comprehensive tracking
serviceSchema.methods.approveChanges = async function (adminId, reason = 'Approved by admin', metadata = {}) {
  if (this.status === 'pending_approval' && !this.pendingChanges) {
    // New service approval
    await this.updateStatus('approved', adminId, reason, metadata);
    return this;
  }

  if (this.pendingChanges) {
    const { changes, actionType } = this.pendingChanges;
    const originalData = { ...this.toObject() };
    
    if (actionType === 'update') {
      // Apply pending changes
      Object.keys(changes).forEach(key => {
        if (key !== '_id' && key !== 'serviceProvider' && changes[key] !== undefined) {
          this[key] = changes[key];
        }
      });
      
      this.status = 'approved';
      this.isActive = true;
      this.lastUpdatedAt = new Date();
      this.availabilityStatus = 'Available';
      
    } else if (actionType === 'delete') {
      // Handle deletion
      this.status = 'deleted';
      this.isActive = false;
      this.availabilityStatus = 'No Longer Available';
      this.deletedAt = new Date();
      this.deletedBy = adminId;
      this.isVisibleToProvider = true; // Keep visible for audit
      
    } else if (actionType === 'reactivate') {
      // Handle reactivation
      this.status = 'approved';
      this.isActive = true;
      this.availabilityStatus = 'Available';
      this.isVisibleToProvider = true;
      this.reactivatedAt = new Date();
      this.reactivatedBy = adminId;
      
      // Clear deletion fields
      this.deletedAt = null;
      this.deletedBy = null;
    }
    
    // Store applied changes for history
    const appliedChanges = { ...changes };
    
    // Clear pending changes
    this.pendingChanges = null;

    // Add to status history
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      changedBy: adminId,
      reason: reason,
      metadata: {
        actionType: `${actionType}_approved`,
        originalData: originalData,
        appliedChanges: appliedChanges,
        ...metadata
      }
    });

    // Add to approval history
    this.approvalHistory.push({
      action: `${actionType}_approved`,
      adminId,
      reason,
      timestamp: new Date(),
      previousData: originalData,
      appliedChanges: appliedChanges,
      adminNotes: metadata.adminNotes
    });
    
    console.log(`✅ Changes approved: ${actionType} (Reason: ${reason})`);
    return await this.save();
  }

  throw new Error('No pending changes to approve');
};

// ENHANCED: Reject changes with detailed tracking
serviceSchema.methods.rejectChanges = async function (adminId, reason, metadata = {}) {
  if (this.status === 'pending_approval' && !this.pendingChanges) {
    // Reject new service
    await this.updateStatus('rejected', adminId, reason, metadata);
    return this;
  }

  if (this.pendingChanges) {
    const rejectedChanges = { ...this.pendingChanges };
    const actionType = rejectedChanges.actionType;
    
    // Clear pending changes without applying them
    this.pendingChanges = null;
    this.rejectedAt = new Date();
    this.rejectedBy = adminId;
    this.rejectionReason = reason;

    // Add to status history (keep current status but record rejection)
    this.statusHistory.push({
      status: this.status,
      changedAt: new Date(),
      changedBy: adminId,
      reason: `${actionType} request rejected: ${reason}`,
      metadata: {
        actionType: `${actionType}_rejected`,
        rejectedChanges: rejectedChanges,
        ...metadata
      }
    });

    // Add to approval history
    this.approvalHistory.push({
      action: `${actionType}_rejected`,
      adminId,
      reason,
      timestamp: new Date(),
      previousData: rejectedChanges,
      adminNotes: metadata.adminNotes
    });
    
    console.log(`❌ Changes rejected: ${actionType} (Reason: ${reason})`);
    return await this.save();
  }

  throw new Error('No pending changes to reject');
};

// Get comprehensive status summary
serviceSchema.methods.getStatusSummary = function() {
  const pendingInfo = this.pendingChanges ? {
    type: this.pendingChanges.actionType,
    reason: this.pendingChanges.reason,
    requestedAt: this.pendingChanges.requestedAt
  } : null;

  return {
    // Current state
    currentStatus: this.status,
    isActive: this.isActive,
    isBookable: this.isBookable(),
    isVisible: this.isVisibleToProvider,
    availabilityStatus: this.availabilityStatus,
    
    // IDs
    serviceId: this.serviceId || 'Pending Assignment',
    providerId: this.serviceProviderId || 'Not Assigned',
    
    // Pending changes
    hasPendingChanges: !!this.pendingChanges,
    pendingInfo,
    
    // Timeline
    firstSubmitted: this.firstSubmittedAt,
    firstApproved: this.firstApprovedAt,
    lastUpdated: this.lastUpdatedAt,
    deletedDate: this.deletedAt,
    reactivatedDate: this.reactivatedAt,
    
    // History counts
    statusChanges: this.statusHistory.length,
    approvalActions: this.approvalHistory.length,
    
    // Performance
    bookings: this.bookingCount,
    rating: this.averageRating,
    reviews: this.reviewCount,
    revenue: this.totalRevenue
  };
};

// Get workflow progress
serviceSchema.methods.getWorkflowProgress = function() {
  const steps = [
    {
      name: 'submission',
      label: 'Service Submitted',
      completed: !!this.firstSubmittedAt,
      date: this.firstSubmittedAt,
      icon: 'send'
    },
    {
      name: 'review',
      label: 'Under Review',
      completed: this.status !== 'pending_approval',
      active: this.status === 'pending_approval' || !!this.pendingChanges,
      date: null,
      icon: 'rate_review'
    },
    {
      name: 'decision',
      label: 'Admin Decision',
      completed: ['approved', 'rejected', 'deleted'].includes(this.status),
      date: this.approvalDate || this.rejectedAt || this.deletedAt,
      icon: this.status === 'approved' ? 'check_circle' : 
            this.status === 'rejected' ? 'cancel' : 
            this.status === 'deleted' ? 'delete' : 'pending'
    },
    {
      name: 'active',
      label: 'Service Active',
      completed: this.status === 'approved' && this.isActive,
      date: this.firstApprovedAt,
      icon: 'verified',
      final: this.status === 'approved'
    }
  ];

  // Add special steps for rejected/deleted services
  if (this.status === 'rejected') {
    steps.push({
      name: 'rejected',
      label: 'Needs Revision',
      completed: true,
      date: this.rejectedAt,
      icon: 'edit',
      error: true
    });
  }

  if (this.status === 'deleted') {
    steps.push({
      name: 'deleted',
      label: 'Service Deleted',
      completed: true,
      date: this.deletedAt,
      icon: 'delete_forever',
      final: true
    });
  }

  return {
    currentStep: this.status,
    steps,
    overallProgress: this.status === 'approved' ? 100 : 
                    this.status === 'rejected' ? 75 : 
                    this.status === 'deleted' ? 100 : 
                    this.status === 'pending_approval' ? 50 : 25
  };
};

// Update serviceProviderId from approved provider
serviceSchema.methods.updateProviderIdFromUser = async function() {
  try {
    const provider = await mongoose.model('User').findById(this.serviceProvider);
    if (provider && provider.serviceProviderId && provider.approvalStatus === 'approved') {
      this.serviceProviderId = provider.serviceProviderId;
      this.lastUpdatedAt = new Date();
      await this.save();
      console.log(`🔗 Updated service ${this._id} with Provider ID: ${provider.serviceProviderId}`);
    }
  } catch (error) {
    console.error('❌ Error updating service provider ID:', error);
  }
};

// STATIC METHODS

// Get admin history with comprehensive details
serviceSchema.statics.getAdminHistory = function (providerId) {
  const query = providerId ? { serviceProvider: providerId } : {};
  return this.find(query)
    .populate('serviceProvider', 'fullName businessName emailAddress serviceProviderId')
    .populate('statusHistory.changedBy', 'fullName')
    .populate('approvalHistory.adminId', 'fullName')
    .populate('rejectedBy', 'fullName')
    .populate('deletedBy', 'fullName')
    .populate('reactivatedBy', 'fullName')
    .sort({ createdAt: -1 })
    .lean();
};

// Get services with pending actions for admin
serviceSchema.statics.getPendingActions = function() {
  return this.find({
    $or: [
      { status: 'pending_approval' },
      { pendingChanges: { $exists: true, $ne: null } }
    ]
  })
  .populate('serviceProvider', 'fullName businessName emailAddress serviceProviderId')
  .populate('approvalHistory.adminId', 'fullName')
  .sort({ updatedAt: -1, createdAt: -1 });
};

// Get comprehensive service statistics
serviceSchema.statics.getServiceStats = async function(providerId = null) {
  const matchQuery = providerId ? { serviceProvider: mongoose.Types.ObjectId(providerId) } : {};
  
  const [statusStats, pendingStats, performanceStats] = await Promise.all([
    // Status breakdown
    this.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$totalRevenue' },
          avgPrice: { $avg: '$pricing.basePrice' },
          avgDuration: { $avg: '$duration' }
        }
      }
    ]),
    
    // Pending changes stats
    this.aggregate([
      { $match: { ...matchQuery, pendingChanges: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$pendingChanges.actionType',
          count: { $sum: 1 }
        }
      }
    ]),
    
    // Performance metrics
    this.aggregate([
      { $match: { ...matchQuery, status: 'approved' } },
      {
        $group: {
          _id: null,
          totalBookings: { $sum: '$bookingCount' },
          totalRevenue: { $sum: '$totalRevenue' },
          avgRating: { $avg: '$averageRating' },
          totalReviews: { $sum: '$reviewCount' }
        }
      }
    ])
  ]);
  
  const totalServices = await this.countDocuments(matchQuery);
  
  return {
    totalServices,
    statusBreakdown: statusStats,
    pendingActions: pendingStats,
    performance: performanceStats[0] || {
      totalBookings: 0,
      totalRevenue: 0,
      avgRating: 0,
      totalReviews: 0
    },
    lastUpdated: new Date()
  };
};

// Search services with advanced filters
serviceSchema.statics.searchServices = function(searchParams = {}) {
  const {
    query,
    type,
    category,
    minPrice,
    maxPrice,
    location,
    status = 'approved',
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10
  } = searchParams;

  let mongoQuery = { status };
  
  if (query) {
    mongoQuery.$or = [
      { searchKeywords: { $in: [new RegExp(query, 'i')] } },
      { name: { $regex: query, $options: 'i' } },
      { description: { $regex: query, $options: 'i' } }
    ];
  }
  
  if (type) mongoQuery.type = type;
  if (category) mongoQuery.category = category;
  if (location) mongoQuery.serviceLocation = { $in: [location, 'both'] };
  
  if (minPrice || maxPrice) {
    mongoQuery['pricing.basePrice'] = {};
    if (minPrice) mongoQuery['pricing.basePrice'].$gte = parseFloat(minPrice);
    if (maxPrice) mongoQuery['pricing.basePrice'].$lte = parseFloat(maxPrice);
  }

  const sortOptions = {};
  sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

  return this.find(mongoQuery)
    .populate('serviceProvider', 'businessName fullName city averageRating reviewCount')
    .sort(sortOptions)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();
};

// Create the model
const Service = mongoose.model('Service', serviceSchema);

export default Service;