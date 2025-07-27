// models/Package.js - FINAL ENHANCED VERSION FOR ABSOLUTE PACKAGE ID CONSISTENCY

import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema({
  // Basic package information
  packageName: {
    type: String,
    required: true,
    trim: true
  },
  
  // 🔒 CRITICAL: Package ID - assigned once and never changes
  packageId: {
    type: String,
    unique: true,
    sparse: true, // Allows null values but enforces uniqueness when present
    immutable: function() {
      // Only allow setting once - never allow changes after it's assigned
      return this.packageId != null;
    },
    validate: {
      validator: function(v) {
        return !v || /^PKG_\d{3}$/.test(v);
      },
      message: 'Package ID must follow format PKG_XXX'
    }
  },
  
  packageType: {
    type: String,
    required: true,
    enum: ['bridal', 'party', 'wedding', 'festival', 'custom']
  },
  
  targetAudience: {
    type: String,
    required: true,
    enum: ['Women', 'Men', 'Kids', 'Unisex']
  },
  
  packageDescription: {
    type: String,
    required: true,
    trim: true
  },
  
  // Pricing and duration
  totalPrice: {
    type: Number,
    required: true,
    min: 0
  },
  
  totalDuration: {
    type: Number,
    required: true,
    min: 1
  },
  
  // Location and policies
  packageLocation: {
    type: String,
    enum: ['home_service', 'salon_only', 'both'],
    default: 'both'
  },
  
  cancellationPolicy: {
    type: String,
    default: '24 hours notice required'
  },
  
  minLeadTime: {
    type: Number,
    default: 2
  },
  
  maxLeadTime: {
    type: Number,
    default: 30
  },
  
  // Optional fields
  packageImage: String,
  customNotes: String,
  preparationRequired: String,
  
  // Special offers
  specialOffers: {
    discountPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    validUntil: Date,
    description: String
  },
  
  // Requirements
  requirements: {
    ageRestriction: {
      minAge: {
        type: Number,
        default: 0,
        min: 0
      },
      maxAge: {
        type: Number,
        default: 100,
        max: 120
      }
    },
    healthConditions: [String],
    allergies: [String]
  },
  
  // System fields
  serviceProvider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    immutable: true // Never allow changing the provider
  },
  
  serviceProviderId: {
    type: String,
    default: 'Not assigned'
  },
  
  // Status management
  status: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected', 'deleted'],
    default: 'pending_approval'
  },
  
  // 🔒 CRITICAL: Enhanced timestamp fields with proper immutability
  firstSubmittedAt: {
    type: Date,
    default: Date.now,
    immutable: true // NEVER changes after creation
  },
  
  // 🔒 CRITICAL: First approval date - set once and never changes
  firstApprovedAt: {
    type: Date,
    immutable: function() {
      // Can only be set once, never changed
      return this.firstApprovedAt != null;
    }
  },
  
  // 🔒 CRITICAL: Last updated date - only for approved updates
  lastUpdatedAt: {
    type: Date
    // Only set when package content is actually updated after first approval
  },
  
  // 🔒 CRITICAL: Deleted date - only for actual deletions
  deletedAt: {
    type: Date
    // Only set when package is actually deleted
  },
  
  // 🔒 ENHANCED: Pending changes system for update tracking
  pendingChanges: {
    requestType: {
      type: String,
      enum: ['create', 'update', 'delete']
    },
    submittedAt: Date,
    reason: String,
    changes: mongoose.Schema.Types.Mixed, // Store proposed changes
    changedFields: [String], // Track what changed for visual indicators
    originalData: mongoose.Schema.Types.Mixed // Store original data for comparison
  },
  
  // Additional system fields
  isActive: {
    type: Boolean,
    default: true
  },
  
  isVisibleToProvider: {
    type: Boolean,
    default: true
  },
  
availabilityStatus: {
  type: String,
  enum: [
    'Available', 
    'Unavailable', 
    'Temporarily Unavailable',
    'No Longer Available'  // ✅ ADD THIS VALUE
  ],
  default: 'Available'
},
  
  version: {
    type: Number,
    default: 1
  },
  
  // 🔒 CRITICAL: Admin action tracking
  adminActionTaken: {
    type: Boolean,
    default: false
  },
  
  adminActionDate: {
    type: Date
  }
}, {
  timestamps: true // Creates createdAt and updatedAt automatically
});

// 🔒 FIXED: Package ID generation method
packageSchema.methods.generatePackageId = async function() {
  // Check if ID already exists - never overwrite
  if (this.packageId) {
    console.log('⚠️ Package ID already exists and is immutable:', this.packageId);
    return this.packageId;
  }
  
  try {
    console.log('🆔 Generating new Package ID...');
    
    // Get the highest existing Package ID
    const result = await this.constructor.aggregate([
      { $match: { packageId: { $exists: true, $ne: null } } },
      { $addFields: { 
        numericId: { 
          $toInt: { 
            $substr: ["$packageId", 4, -1] 
          } 
        } 
      }},
      { $sort: { numericId: -1 } },
      { $limit: 1 }
    ]);
    
    let nextNumber = 1;
    if (result.length > 0 && result[0].numericId) {
      nextNumber = result[0].numericId + 1;
    }
    
    const newPackageId = `PKG_${nextNumber.toString().padStart(3, '0')}`;
    console.log('🆔 Generated Package ID:', newPackageId);
    
    // CRITICAL: Set Package ID (this will be immutable after this)
    this.packageId = newPackageId;
    
    return this.packageId;
    
  } catch (error) {
    console.error('❌ Error generating Package ID:', error);
    throw new Error(`Failed to generate Package ID: ${error.message}`);
  }
};

// CRITICAL FIX: Update the handleAdminApproval method in your Package model
// Replace the existing method in models/Package.js

packageSchema.methods.handleAdminApproval = async function(adminId, reason = '') {
  try {
    console.log('✅ ADMIN APPROVAL - PACKAGE ID CONSISTENCY CHECK:', {
      _id: this._id,
      currentPackageId: this.packageId,
      status: this.status,
      pendingChanges: this.pendingChanges?.requestType,
      firstApprovedAt: this.firstApprovedAt
    });
    
    // Prevent double processing
    if (this.adminActionTaken === true) {
      console.log('⚠️ Admin action already taken');
      return this;
    }
    
    if (!this.pendingChanges) {
      // Direct approval without pending changes (initial package)
      if (this.status === 'pending_approval') {
        // Generate Package ID only if not exists
        if (!this.packageId) {
          await this.generatePackageId();
          console.log('🆔 NEW Package ID assigned on first approval:', this.packageId);
        }
        
        // Set first approval date only if not set
        if (!this.firstApprovedAt) {
          this.firstApprovedAt = new Date();
          console.log('📅 First approval date set:', this.firstApprovedAt);
        }
        
        this.status = 'approved';
        this.availabilityStatus = 'Available'; // Ensure availability is set
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
      }
    } else {
      // Handle pending changes
      const requestType = this.pendingChanges.requestType;
      
      if (requestType === 'create') {
        console.log('🆕 Approving NEW package creation...');
        
        // Generate Package ID for new package
        if (!this.packageId) {
          await this.generatePackageId();
          console.log('🆔 NEW Package ID assigned:', this.packageId);
        }
        
        // Set first approval date
        if (!this.firstApprovedAt) {
          this.firstApprovedAt = new Date();
          console.log('📅 First approval date set:', this.firstApprovedAt);
        }
        
        this.status = 'approved';
        this.availabilityStatus = 'Available'; // FIXED: Set availability for new packages
        this.pendingChanges = undefined;
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
        
      } else if (requestType === 'update') {
        console.log('📝 Approving UPDATE to existing package...');
        console.log('🔒 Package ID PRESERVED:', this.packageId);
        
        // CRITICAL: Ensure Package ID exists (should already exist for updates)
        if (!this.packageId) {
          throw new Error('CRITICAL ERROR: Cannot update package without Package ID');
        }
        
        // Apply the pending changes to the main package data
        const changes = this.pendingChanges.changes;
        if (changes) {
          // Apply each change while preserving critical fields
          Object.keys(changes).forEach(key => {
            // NEVER allow changes to critical immutable fields
            if (!['packageId', 'firstSubmittedAt', 'firstApprovedAt', '_id', 'serviceProvider'].includes(key)) {
              this[key] = changes[key];
            }
          });
        }
        
        // Set last updated date (indicating this package has been modified)
        this.lastUpdatedAt = new Date();
        console.log('📅 Last updated date set:', this.lastUpdatedAt);
        
        // Keep status as approved
        this.status = 'approved';
        this.availabilityStatus = 'Available'; // FIXED: Ensure availability is set for updates
        this.pendingChanges = undefined;
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
        
        // Ensure deletedAt is cleared (in case it was set during pending state)
        this.deletedAt = undefined;
        
        console.log('✅ UPDATE approved - Package ID unchanged:', this.packageId);
        
      } else if (requestType === 'delete') {
        console.log('🗑️ Approving DELETION of package...');
        console.log('🔒 Package ID PRESERVED for audit:', this.packageId);
        
        // CRITICAL FIX: Mark as deleted AND update availability status
        this.status = 'deleted';
        this.availabilityStatus = 'No Longer Available'; // ✅ THIS WAS MISSING!
        this.deletedAt = new Date();
        this.isActive = false;
        this.pendingChanges = undefined;
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
        
        console.log('✅ DELETION approved - Status and Availability updated:', {
          status: this.status,
          availabilityStatus: this.availabilityStatus,
          deletedAt: this.deletedAt,
          packageId: this.packageId
        });
      }
    }
    
    // Save the updated package
    await this.save();
    
    // Final verification
    console.log('✅ ADMIN APPROVAL COMPLETED:', {
      _id: this._id,
      packageId: this.packageId,
      status: this.status,
      availabilityStatus: this.availabilityStatus, // Added for verification
      firstApprovedAt: this.firstApprovedAt,
      lastUpdatedAt: this.lastUpdatedAt,
      deletedAt: this.deletedAt,
      adminActionTaken: this.adminActionTaken
    });
    
    return this;
    
  } catch (error) {
    console.error('❌ Admin approval error:', error);
    throw error;
  }
};

// 🔒 ENHANCED: Admin rejection method
packageSchema.methods.handleAdminRejection = async function(adminId, reason = '') {
  try {
    console.log('❌ ADMIN REJECTION:', {
      _id: this._id,
      packageId: this.packageId,
      pendingChanges: this.pendingChanges?.requestType
    });
    
    if (this.adminActionTaken === true) {
      console.log('⚠️ Admin action already taken');
      return this;
    }
    
    if (this.pendingChanges) {
      const requestType = this.pendingChanges.requestType;
      
      if (requestType === 'create') {
        // Reject new package creation
        this.status = 'rejected';
        this.pendingChanges = undefined;
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
        
      } else if (requestType === 'update') {
        // Reject update - revert to approved state
        this.status = 'approved';
        this.pendingChanges = undefined;
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
        this.deletedAt = undefined; // Clear any pending deletion marker
        
      } else if (requestType === 'delete') {
        // Reject deletion - keep package active
        this.status = 'approved';
        this.pendingChanges = undefined;
        this.adminActionTaken = true;
        this.adminActionDate = new Date();
        this.deletedAt = undefined; // Clear deletion marker
        this.isActive = true;
      }
    } else {
      // Direct rejection
      this.status = 'rejected';
      this.adminActionTaken = true;
      this.adminActionDate = new Date();
    }
    
    await this.save();
    console.log('✅ REJECTION COMPLETED');
    return this;
    
  } catch (error) {
    console.error('❌ Admin rejection error:', error);
    throw error;
  }
};

// 🔒 UTILITY: Check if admin action is needed
packageSchema.methods.needsAdminAction = function() {
  // Only show actions if admin hasn't taken action yet
  if (this.adminActionTaken === true) {
    return false;
  }
  
  return (
    (this.status === 'pending_approval' && !this.firstApprovedAt) ||
    (this.pendingChanges && (
      this.pendingChanges.requestType === 'create' ||
      this.pendingChanges.requestType === 'update' ||
      this.pendingChanges.requestType === 'delete'
    ))
  );
};

// 🔒 UTILITY: Get display status with update indicators
packageSchema.methods.getDisplayStatus = function() {
  if (this.pendingChanges) {
    const requestType = this.pendingChanges.requestType;
    return {
      status: `${requestType}_pending`,
      label: `${requestType.charAt(0).toUpperCase() + requestType.slice(1)} Pending`,
      isPending: true,
      requestType: requestType,
      packageIdPreserved: !!this.packageId
    };
  }
  
  return {
    status: this.status,
    label: this.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
    isPending: false,
    packageIdPreserved: !!this.packageId
  };
};

// 🔒 UTILITY: Check if package is truly new (never been approved)
packageSchema.methods.isNewPackage = function() {
  return !this.firstApprovedAt && !this.packageId;
};

// 🔒 UTILITY: Check if package has been updated after first approval
packageSchema.methods.hasBeenUpdated = function() {
  return !!(this.firstApprovedAt && this.lastUpdatedAt);
};

// Indexes for performance
packageSchema.index({ packageId: 1 }, { unique: true, sparse: true });
packageSchema.index({ serviceProvider: 1, status: 1 });
packageSchema.index({ status: 1, createdAt: -1 });
packageSchema.index({ adminActionTaken: 1 });
packageSchema.index({ 'pendingChanges.requestType': 1 });

const Package = mongoose.model('Package', packageSchema);
export default Package;