// controllers/packageController.js - COMPLETE ENHANCED VERSION FOR PACKAGE ID CONSISTENCY

import Package from '../models/Package.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import mongoose from 'mongoose';

// 🔧 UTILITY: Check if transactions are available
const isTransactionsAvailable = async () => {
  try {
    const session = await mongoose.startSession();
    await session.endSession();
    return true;
  } catch (error) {
    console.log('ℹ️  Transactions not available (standalone MongoDB) - using fallback mode');
    return false;
  }
};

// 🔒 UTILITY: Create safe update data (excludes immutable fields)
const createSafeUpdateData = (requestBody) => {
  // Deep clean function to remove circular references and unwanted fields
  const deepClean = (obj, seen = new WeakSet()) => {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (seen.has(obj)) {
      return {}; // Return empty object for circular references
    }
    
    seen.add(obj);
    
    if (Array.isArray(obj)) {
      return obj.map(item => deepClean(item, seen));
    }
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip problematic fields that might cause circular references
      if (key.startsWith('_') || 
          key === '__v' || 
          key === 'populated' || 
          key === '$__' ||
          key === 'isNew' ||
          key === 'errors') {
        continue;
      }
      cleaned[key] = deepClean(value, seen);
    }
    
    return cleaned;
  };

  const cleanedBody = deepClean(requestBody);

  // 🔒 CRITICAL: Explicitly exclude immutable fields from updates
  const {
    packageId,           // 🔒 NEVER allow Package ID changes
    firstSubmittedAt,    // 🔒 NEVER allow first submission changes
    firstApprovedAt,     // 🔒 NEVER allow first approval changes
    _id,                 // 🔒 NEVER allow MongoDB ID changes
    serviceProvider,     // 🔒 NEVER allow provider changes
    deletedAt,           // 🔒 NEVER set deleted date on updates
    lastUpdatedAt,       // 🔒 System managed field
    createdAt,           // 🔒 System managed field
    updatedAt,           // 🔒 System managed field
    status,              // 🔒 System managed field
    pendingChanges,      // 🔒 System managed field
    adminActionTaken,    // 🔒 System managed field
    adminActionDate,     // 🔒 System managed field
    ...safeData
  } = cleanedBody;
  
  // Structure safe update data with explicit type conversion
  const updateData = {
    packageName: typeof safeData.packageName === 'string' ? safeData.packageName.trim() : '',
    packageType: typeof safeData.packageType === 'string' ? safeData.packageType : 'custom',
    targetAudience: typeof safeData.targetAudience === 'string' ? safeData.targetAudience : 'Unisex',
    packageDescription: typeof safeData.packageDescription === 'string' ? safeData.packageDescription.trim() : '',
    
    includedServices: Array.isArray(safeData.includedServices) ? 
      safeData.includedServices.map(service => {
        if (typeof service === 'string') {
          return { service: service, quantity: 1 };
        }
        return {
          service: service.service || service._id || service,
          quantity: parseInt(service.quantity) || 1
        };
      }) : [],
    
    totalDuration: parseInt(safeData.totalDuration) || 180,
    totalPrice: parseFloat(safeData.totalPrice) || 0,
    
    packageLocation: typeof safeData.packageLocation === 'string' ? safeData.packageLocation : 'both',
    cancellationPolicy: typeof safeData.cancellationPolicy === 'string' ? 
      safeData.cancellationPolicy : '24 hours notice required',
    minLeadTime: parseInt(safeData.minLeadTime) || 2,
    maxLeadTime: parseInt(safeData.maxLeadTime) || 30,
    
    packageImage: typeof safeData.packageImage === 'string' ? safeData.packageImage : '',
    customNotes: typeof safeData.customNotes === 'string' ? safeData.customNotes : '',
    preparationRequired: typeof safeData.preparationRequired === 'string' ? safeData.preparationRequired : '',
    
    specialOffers: {
      discountPercentage: parseFloat(safeData.specialOffers?.discountPercentage) || 0,
      validUntil: safeData.specialOffers?.validUntil || '',
      description: typeof safeData.specialOffers?.description === 'string' ? 
        safeData.specialOffers.description : ''
    },
    
    requirements: {
      ageRestriction: {
        minAge: parseInt(safeData.requirements?.ageRestriction?.minAge) || 0,
        maxAge: parseInt(safeData.requirements?.ageRestriction?.maxAge) || 100
      },
      healthConditions: Array.isArray(safeData.requirements?.healthConditions) ? 
        safeData.requirements.healthConditions.filter(item => typeof item === 'string') : [],
      allergies: Array.isArray(safeData.requirements?.allergies) ? 
        safeData.requirements.allergies.filter(item => typeof item === 'string') : []
    }
  };

  // Remove undefined/null values and ensure no circular references
  const finalData = {};
  Object.keys(updateData).forEach(key => {
    const value = updateData[key];
    if (value !== undefined && value !== null) {
      try {
        JSON.stringify(value);
        finalData[key] = value;
      } catch (error) {
        console.warn(`⚠️ Skipping field ${key} due to circular reference:`, error.message);
      }
    }
  });

  console.log('🔧 Created safe update data:', Object.keys(finalData));
  return finalData;
};

// 🔒 UTILITY: Identify changed fields for visual indicators
const identifyChangedFields = (originalData, newData) => {
  const changedFields = [];
  const fieldsToCheck = [
    'packageName', 'packageType', 'targetAudience', 'packageDescription',
    'totalPrice', 'totalDuration', 'packageLocation', 'cancellationPolicy',
    'minLeadTime', 'maxLeadTime', 'packageImage', 'customNotes', 
    'preparationRequired', 'includedServices', 'specialOffers', 'requirements'
  ];
  
  fieldsToCheck.forEach(field => {
    const original = originalData[field];
    const updated = newData[field];
    
    // Handle different data types comparison
    if (field === 'includedServices' || field === 'specialOffers' || field === 'requirements') {
      if (JSON.stringify(original) !== JSON.stringify(updated)) {
        changedFields.push(field);
      }
    } else if (original !== updated) {
      changedFields.push(field);
    }
  });
  
  return changedFields;
};

// 🔒 CREATE: New package creation with proper pending system
export const createPackage = async (req, res) => {
  try {
    console.log('📦 Creating NEW package...');
    
    // Validate required fields
    const requiredFields = ['packageName', 'packageType', 'targetAudience', 'packageDescription', 'totalPrice', 'totalDuration'];
    const missingFields = [];
    
    for (const field of requiredFields) {
      if (!req.body[field]) {
        missingFields.push(field);
      }
    }
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        missingFields
      });
    }

    const provider = await User.findById(req.user.userId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    // Create safe package data
    const safeData = createSafeUpdateData(req.body);
    
    // Validate essential data
    if (!safeData.packageName || !safeData.packageType || !safeData.targetAudience) {
      return res.status(400).json({
        success: false,
        message: 'Essential package information is missing or invalid'
      });
    }

    const packageData = {
      ...safeData,
      // System fields
      serviceProvider: req.user.userId,
      status: 'pending_approval',
      isVisibleToProvider: true,
      availabilityStatus: 'Available',
      serviceProviderId: String(provider.serviceProviderId || 'Not assigned'),
      version: 1,
      firstSubmittedAt: new Date(),
      adminActionTaken: false, // Admin hasn't taken action yet
      
      // Store as pending creation - NO Package ID assigned yet
      pendingChanges: {
        requestType: 'create',
        submittedAt: new Date(),
        reason: 'New package created',
        changes: safeData,
        changedFields: Object.keys(safeData)
      }
    };

    // Final check for circular references
    try {
      JSON.stringify(packageData);
    } catch (circularError) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data structure - circular reference detected'
      });
    }

    const newPackage = new Package(packageData);
    await newPackage.save();
    
    const populatedPackage = await Package.findById(newPackage._id)
      .populate('serviceProvider', 'businessName fullName serviceProviderId emailAddress mobileNumber')
      .lean();
    
    console.log('✅ NEW package created and submitted for approval (no Package ID yet)');
    
    res.status(201).json({
      success: true,
      message: 'New package created successfully. Package ID will be assigned after admin approval.',
      package: populatedPackage,
      isNewPackage: true
    });
    
  } catch (error) {
    console.error('❌ Package creation error:', error);
    
    if (error.message.includes('circular structure') || error.message.includes('BSON')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data structure. Please check your form data.',
        error: 'Circular reference detected'
      });
    }
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create package. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 🔒 UPDATE: Enhanced update package - ABSOLUTE same record update, no new Package ID
export const updatePackage = async (req, res) => {
  try {
    const packageId = req.params.packageId || req.params.id;
    console.log('📝 UPDATING EXISTING PACKAGE (SAME RECORD PRESERVATION):', packageId);

    const existingPackage = await Package.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Check ownership
    if (existingPackage.serviceProvider.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to update this package'
      });
    }

    console.log('📝 Found existing package to UPDATE (SAME RECORD):', {
      _id: existingPackage._id,
      packageId: existingPackage.packageId,
      status: existingPackage.status,
      firstApprovedAt: existingPackage.firstApprovedAt,
      lastUpdatedAt: existingPackage.lastUpdatedAt,
      pendingChanges: existingPackage.pendingChanges?.requestType,
      adminActionTaken: existingPackage.adminActionTaken
    });

    // 🔒 CRITICAL: Check for existing pending changes
    if (existingPackage.pendingChanges && existingPackage.adminActionTaken !== true) {
      const pendingType = existingPackage.pendingChanges.requestType;
      
      if (pendingType === 'delete') {
        return res.status(400).json({
          success: false,
          message: 'This package has a pending deletion request. You cannot edit it until admin makes a decision.',
          hasPendingChanges: true,
          pendingRequestType: 'delete',
          packageId: existingPackage.packageId
        });
      }
      
      // For pending updates or creates, we allow overwriting but log it
      console.log(`⚠️ Overwriting existing pending ${pendingType} with new update request`);
    }

    // Create safe update data
    const newData = createSafeUpdateData(req.body);

    // Identify what changed for visual indicators
    const originalData = existingPackage.toObject();
    const changedFields = identifyChangedFields(originalData, newData);
    
    if (changedFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No changes detected. Please modify at least one field before submitting.',
        changedFields: []
      });
    }

    console.log('📝 Fields that changed:', changedFields);

    // 🔒 CRITICAL: Store pending changes WITHOUT modifying existing package data
    existingPackage.pendingChanges = {
      requestType: 'update',
      submittedAt: new Date(),
      reason: 'Package update requested',
      changes: newData,
      changedFields: changedFields,
      originalData: {
        packageName: originalData.packageName,
        packageType: originalData.packageType,
        targetAudience: originalData.targetAudience,
        packageDescription: originalData.packageDescription,
        totalPrice: originalData.totalPrice,
        totalDuration: originalData.totalDuration,
        packageLocation: originalData.packageLocation,
        specialOffers: originalData.specialOffers,
        requirements: originalData.requirements
      }
    };
    
    // 🔒 CRITICAL: Reset admin action status for new pending changes
    existingPackage.adminActionTaken = false;
    existingPackage.adminActionDate = undefined;
    
    // 🔒 CRITICAL: DO NOT modify any other fields - keep existing package data intact
    console.log('📝 Storing pending changes WITHOUT modifying package data');
    console.log('📝 Package ID remains:', existingPackage.packageId);
    console.log('📝 First approved remains:', existingPackage.firstApprovedAt);
    console.log('📝 Last updated remains:', existingPackage.lastUpdatedAt);
    
    // Save the SAME record with pending changes only
    await existingPackage.save();
    
    const responsePackage = await Package.findById(existingPackage._id)
      .populate('serviceProvider', 'businessName fullName serviceProviderId emailAddress mobileNumber')
      .lean();
    
    console.log('✅ Update request stored in SAME RECORD:', {
      _id: responsePackage._id,
      packageId: responsePackage.packageId,
      hasPendingChanges: !!responsePackage.pendingChanges,
      changedFields: changedFields,
      packageIdWillBePreserved: !!responsePackage.packageId
    });
    
    res.json({
      success: true,
      message: `Update request submitted successfully. ${responsePackage.packageId ? `Package ID ${responsePackage.packageId} will be preserved.` : 'Package ID will be assigned after approval.'}`,
      package: responsePackage,
      hasPendingChanges: true,
      changedFields: changedFields,
      sameRecordUpdated: true,
      packageIdPreserved: !!responsePackage.packageId
    });
    
  } catch (error) {
    console.error('❌ Package update error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to update package'
    });
  }
};

// 🔒 DELETE: Enhanced delete package - proper handling of pending vs approved packages
export const deletePackage = async (req, res) => {
  try {
    const packageId = req.params.packageId || req.params.id;
    console.log('🗑️ Processing delete request for package:', packageId);

    const existingPackage = await Package.findById(packageId);
    if (!existingPackage) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    if (existingPackage.serviceProvider.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to delete this package'
      });
    }

    console.log('🗑️ Package found for deletion:', {
      _id: existingPackage._id,
      packageId: existingPackage.packageId,
      status: existingPackage.status,
      hasPendingChanges: !!existingPackage.pendingChanges,
      firstApprovedAt: existingPackage.firstApprovedAt,
      adminActionTaken: existingPackage.adminActionTaken
    });

    // 🔒 CRITICAL: Special handling for packages with pending changes
    if (existingPackage.pendingChanges && existingPackage.adminActionTaken !== true) {
      const pendingType = existingPackage.pendingChanges.requestType;
      
      if (pendingType === 'create') {
        // If it's a pending creation that was never approved, remove entirely
        console.log('🗑️ Removing package with pending creation (never was approved)');
        await Package.findByIdAndDelete(packageId);
        
        return res.json({
          success: true,
          message: 'Pending package creation removed successfully.',
          packageRemoved: true
        });
      } else if (pendingType === 'update') {
        // If it's a pending update, ask user what they want to do
        return res.status(400).json({
          success: false,
          message: 'This package has pending update changes. Please wait for admin approval or contact admin to cancel the pending update before deleting.',
          hasPendingChanges: true,
          pendingRequestType: 'update',
          packageId: existingPackage.packageId
        });
      }
    }

    // 🔒 CRITICAL: If package was never approved (truly new), remove it entirely
    if (existingPackage.status === 'pending_approval' && !existingPackage.firstApprovedAt) {
      console.log('🗑️ Removing pending package entirely (never was approved)');
      await Package.findByIdAndDelete(packageId);
      
      return res.json({
        success: true,
        message: 'Pending package removed successfully.',
        packageRemoved: true
      });
    }

    // For approved packages, mark for deletion but keep same record
    existingPackage.pendingChanges = {
      requestType: 'delete',
      submittedAt: new Date(),
      reason: 'Package deletion requested',
      changes: null,
      changedFields: ['status'] // Will change to 'deleted' when approved
    };
    
    // Reset admin action status for new pending changes
    existingPackage.adminActionTaken = false;
    existingPackage.adminActionDate = undefined;
    
    // Save SAME record with deletion request
    await existingPackage.save();
    
    const responsePackage = await Package.findById(existingPackage._id)
      .populate('serviceProvider', 'businessName fullName serviceProviderId emailAddress mobileNumber')
      .lean();
    
    console.log('✅ Delete request stored for SAME record:', {
      _id: responsePackage._id,
      packageId: responsePackage.packageId,
      hasPendingChanges: !!responsePackage.pendingChanges
    });
    
    res.json({
      success: true,
      message: `Deletion request submitted successfully. ${responsePackage.packageId ? `Package ID ${responsePackage.packageId} will be preserved for audit purposes.` : 'Package will be removed after approval.'}`,
      package: responsePackage,
      sameRecordMarked: true,
      packageIdPreserved: !!responsePackage.packageId
    });
    
  } catch (error) {
    console.error('❌ Package deletion error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit deletion request'
    });
  }
};

// 🔒 ADMIN: Enhanced approval - ensures ABSOLUTE Package ID consistency
export const adminApprovePackage = async (req, res) => {
  try {
    const packageId = req.params.id;
    const { reason } = req.body;
    
    console.log('✅ Admin approving package:', packageId, 'Reason:', reason);

    // 🔧 CRITICAL: Use findOneAndUpdate for atomic operation
    const packageToApprove = await Package.findById(packageId);
    if (!packageToApprove) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    console.log('✅ Found package to approve:', {
      _id: packageToApprove._id,
      packageId: packageToApprove.packageId,
      status: packageToApprove.status,
      pendingChanges: packageToApprove.pendingChanges?.requestType,
      adminActionTaken: packageToApprove.adminActionTaken
    });
    
    // 🔧 CRITICAL: Prevent double processing
    if (packageToApprove.adminActionTaken === true) {
      return res.status(400).json({
        success: false,
        message: 'Admin has already taken action on this package',
        package: packageToApprove
      });
    }
    
    // Store original values for verification
    const originalId = packageToApprove._id.toString();
    const originalPackageId = packageToApprove.packageId;
    
    // 🔧 CRITICAL: Use the enhanced approval method
    const approvedPackage = await packageToApprove.handleAdminApproval(req.user.userId, reason);
    
    // 🔒 VERIFICATION: Ensure same record was updated
    if (approvedPackage._id.toString() !== originalId) {
      console.error('🚨 CRITICAL ERROR: New record was created instead of updating existing one!');
      return res.status(500).json({
        success: false,
        message: 'System error: New record created instead of updating existing one'
      });
    }
    
    // 🔧 VERIFICATION: Package ID should now be assigned if it wasn't before
    if (!approvedPackage.packageId) {
      console.error('🚨 CRITICAL ERROR: Package ID not assigned after approval!');
      return res.status(500).json({
        success: false,
        message: 'System error: Package ID was not assigned during approval'
      });
    }
    
    // 🔧 VERIFICATION: If there was an original Package ID, it should be preserved
    if (originalPackageId && approvedPackage.packageId !== originalPackageId) {
      console.error('🚨 CRITICAL ERROR: Package ID changed during approval!');
      return res.status(500).json({
        success: false,
        message: 'System error: Package ID was changed during approval (should be preserved)'
      });
    }
    
    // 🔧 CRITICAL: Populate and return the updated package
    await approvedPackage.populate('serviceProvider', 'businessName fullName emailAddress mobileNumber serviceProviderId');
    
    // 🔧 VERIFICATION: Final status check
    console.log('✅ Package approval verification passed:', {
      _id: approvedPackage._id,
      packageId: approvedPackage.packageId,
      status: approvedPackage.status,
      firstApprovedAt: approvedPackage.firstApprovedAt,
      adminActionTaken: approvedPackage.adminActionTaken,
      pendingChanges: approvedPackage.pendingChanges
    });
    
    // Determine the success message based on request type
    let successMessage = 'Package approved successfully.';
    const requestType = packageToApprove.pendingChanges?.requestType;
    
    if (requestType === 'create') {
      successMessage = `New package approved and Package ID ${approvedPackage.packageId} assigned.`;
    } else if (requestType === 'update') {
      successMessage = `Package update approved. Package ID ${approvedPackage.packageId} preserved.`;
    } else if (requestType === 'delete') {
      successMessage = `Package deletion approved. Package ID ${approvedPackage.packageId} preserved for audit.`;
    } else {
      successMessage = `Package approved. Package ID ${approvedPackage.packageId} assigned.`;
    }
    
    // 🔧 CRITICAL: Return success with complete package data
    res.json({
      success: true,
      message: successMessage,
      package: approvedPackage.toObject(), // Convert to plain object
      packageId: approvedPackage.packageId, // Explicit Package ID for frontend
      requestType: requestType,
      statusUpdated: true,
      adminActionCompleted: true,
      packageIdConsistent: true
    });
    
  } catch (error) {
    console.error('❌ Admin approve package error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to approve package',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// 🔒 ADMIN: Enhanced rejection with Package ID consistency
export const adminRejectPackage = async (req, res) => {
  try {
    const packageId = req.params.id;
    const { reason } = req.body;
    
    console.log('❌ Admin rejecting package:', packageId);

    const packageToReject = await Package.findById(packageId);
    if (!packageToReject) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Store original Package ID for verification
    const originalPackageId = packageToReject.packageId;
    const requestType = packageToReject.pendingChanges?.requestType;
    
    // Use the enhanced method for proper handling
    await packageToReject.handleAdminRejection(req.user.userId, reason);
    
    // VERIFICATION: Ensure Package ID wasn't modified during rejection
    if (originalPackageId && packageToReject.packageId !== originalPackageId) {
      console.error('🚨 CRITICAL: Package ID changed during rejection!');
      return res.status(500).json({
        success: false,
        message: 'Package ID consistency violation detected during rejection'
      });
    }
    
    await packageToReject.populate('serviceProvider', 'businessName fullName emailAddress mobileNumber serviceProviderId');
    
    // Determine success message
    let successMessage = 'Package request rejected.';
    if (requestType === 'create') {
      successMessage = 'New package creation rejected.';
    } else if (requestType === 'update') {
      successMessage = `Package update rejected. Package ID ${packageToReject.packageId} remains unchanged.`;
    } else if (requestType === 'delete') {
      successMessage = `Package deletion rejected. Package ID ${packageToReject.packageId} preserved and package remains active.`;
    }
    
    console.log('✅ Package rejection completed. Package ID preserved:', packageToReject.packageId);
    
    res.json({
      success: true,
      message: successMessage,
      package: packageToReject,
      requestType: requestType,
      packageIdConsistent: true
    });
    
  } catch (error) {
    console.error('❌ Admin reject package error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to reject package'
    });
  }
};

// 🔧 ENHANCED: Get provider packages with proper error handling
export const getProviderPackages = async (req, res) => {
  try {
    console.log('📦 Fetching provider packages for:', req.user.userId);
    
    // First verify the user exists and is a service provider
    const provider = await User.findById(req.user.userId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    if (provider.role !== 'serviceProvider') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Only service providers can access this endpoint.'
      });
    }
    
    console.log('✅ Provider verified:', {
      id: provider._id,
      role: provider.role,
      approvalStatus: provider.approvalStatus,
      serviceProviderId: provider.serviceProviderId
    });
    
    // Fetch packages with enhanced error handling
    let packages;
    try {
      packages = await Package.find({
        serviceProvider: req.user.userId,
        isVisibleToProvider: true
      })
      .populate({
        path: 'serviceProvider',
        select: 'businessName fullName serviceProviderId emailAddress mobileNumber approvalStatus',
        options: { strictPopulate: false } // Prevents errors if referenced doc doesn't exist
      })
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for better performance and to avoid circular references

      console.log(`✅ Found ${packages.length} packages for provider`);
      
    } catch (populateError) {
      console.warn('⚠️ Population failed, fetching without populate:', populateError.message);
      
      // Fallback: fetch without populate
      packages = await Package.find({
        serviceProvider: req.user.userId,
        isVisibleToProvider: true
      })
      .sort({ createdAt: -1 })
      .lean();
      
      // Manually add provider info
      packages = packages.map(pkg => ({
        ...pkg,
        serviceProvider: {
          _id: provider._id,
          businessName: provider.businessName,
          fullName: provider.fullName,
            serviceProviderId: provider.serviceProviderId,
          emailAddress: provider.emailAddress,
          mobileNumber: provider.mobileNumber,
          approvalStatus: provider.approvalStatus
        }
      }));
    }
    
    // Clean packages data to prevent circular references
    const cleanPackages = packages.map(pkg => {
      const cleanPkg = { ...pkg };
      
      // Remove any problematic fields that might cause circular references
      delete cleanPkg.__v;
      delete cleanPkg.$__;
      
      // Ensure serviceProviderId is set
      if ((!cleanPkg.serviceProviderId || cleanPkg.serviceProviderId === 'Not assigned') && provider.serviceProviderId) {
        cleanPkg.serviceProviderId = provider.serviceProviderId;
      }
      
      return cleanPkg;
    });
    
    // Update missing serviceProviderId in database (background task)
    if (provider.serviceProviderId) {
      const packagesNeedingUpdate = packages.filter(pkg => 
        !pkg.serviceProviderId || pkg.serviceProviderId === 'Not assigned'
      );
      
      if (packagesNeedingUpdate.length > 0) {
        console.log(`🔧 Updating serviceProviderId for ${packagesNeedingUpdate.length} packages`);
        
        // Update in background without blocking response
        Package.updateMany(
          { 
            serviceProvider: req.user.userId,
            $or: [
              { serviceProviderId: { $exists: false } },
              { serviceProviderId: 'Not assigned' },
              { serviceProviderId: null }
            ]
          },
          { serviceProviderId: provider.serviceProviderId }
        ).exec().catch(updateError => {
          console.warn('⚠️ Background serviceProviderId update failed:', updateError.message);
        });
      }
    }
    
    // Final validation before sending response
    try {
      JSON.stringify(cleanPackages);
    } catch (jsonError) {
      console.error('❌ JSON serialization error:', jsonError.message);
      return res.status(500).json({
        success: false,
        message: 'Data serialization error. Please try again.',
        error: 'Circular reference in package data'
      });
    }
    
    console.log('✅ Successfully prepared package response');
    
    res.json({
      success: true,
      packages: cleanPackages,
      count: cleanPackages.length,
      provider: {
        id: provider._id,
        serviceProviderId: provider.serviceProviderId,
        businessName: provider.businessName
      }
    });
    
  } catch (error) {
    console.error('❌ Get provider packages error:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Provide specific error messages based on error type
    let errorMessage = 'Failed to fetch packages';
    let statusCode = 500;
    
    if (error.name === 'CastError') {
      errorMessage = 'Invalid user ID format';
      statusCode = 400;
    } else if (error.message.includes('circular structure')) {
      errorMessage = 'Data structure error. Please contact support.';
      statusCode = 500;
    } else if (error.name === 'ValidationError') {
      errorMessage = 'Data validation error';
      statusCode = 400;
    }
    
    res.status(statusCode).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }
};

// 🔧 PUBLIC: Get approved packages for customers
export const getApprovedPackages = async (req, res) => {
  try {
    const packages = await Package.find({
      status: 'approved',
      isActive: true,
      availabilityStatus: 'Available'
    })
    .populate('serviceProvider', 'businessName fullName serviceProviderId')
    .populate('includedServices.service', 'name type category duration pricing')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Get approved packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages'
    });
  }
};

// 🔧 PROVIDER: Get only approved packages for provider
export const getProviderApprovedPackages = async (req, res) => {
  try {
    const packages = await Package.find({
      serviceProvider: req.user.userId,
      status: 'approved',
      isVisibleToProvider: true
    })
    .populate('serviceProvider', 'businessName fullName serviceProviderId')
    .populate('includedServices.service', 'name type category duration pricing')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      packages
    });
  } catch (error) {
    console.error('Get provider approved packages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approved packages'
    });
  }
};

// 🔧 ADMIN: Get pending packages with enhanced error handling
export const getPendingPackages = async (req, res) => {
  try {
    console.log('📦 Admin fetching pending packages...');
    
    // Enhanced query with better error handling
    let pendingPackages;
    try {
      pendingPackages = await Package.find({
        $or: [
          { status: 'pending_approval', adminActionTaken: { $ne: true } },
          { pendingChanges: { $exists: true }, adminActionTaken: { $ne: true } }
        ]
      })
      .sort({ createdAt: -1 })
      .lean(); // Use lean for better performance
      
    } catch (queryError) {
      console.error('❌ Database query error in getPendingPackages:', queryError);
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }

    console.log(`✅ Found ${pendingPackages.length} pending packages requiring admin action`);
    
    // Clean packages and populate service provider data separately
    const cleanedPackages = [];
    
    for (const pkg of pendingPackages) {
      try {
        // Clean the package data
        const cleanPkg = {
          ...pkg,
          // Remove any problematic fields
          __v: undefined,
          $__: undefined
        };
        
        // Fetch service provider data separately to avoid population issues
        if (pkg.serviceProvider) {
          try {
            const provider = await User.findById(pkg.serviceProvider)
              .select('businessName fullName emailAddress mobileNumber serviceProviderId approvalStatus')
              .lean();
            
            if (provider) {
              cleanPkg.serviceProvider = provider;
            } else {
              // Handle missing service provider
              console.warn(`⚠️ Service provider not found for package ${pkg._id}`);
              cleanPkg.serviceProvider = {
                _id: pkg.serviceProvider,
                businessName: 'Unknown Provider',
                fullName: 'Unknown Provider',
                emailAddress: 'N/A',
                mobileNumber: 'N/A',
                serviceProviderId: 'N/A',
                approvalStatus: 'unknown'
              };
            }
          } catch (providerError) {
            console.warn(`⚠️ Error fetching service provider for package ${pkg._id}:`, providerError.message);
            cleanPkg.serviceProvider = {
              _id: pkg.serviceProvider,
              businessName: 'Error Loading Provider',
              fullName: 'Error Loading Provider',
              emailAddress: 'N/A',
              mobileNumber: 'N/A',
              serviceProviderId: 'N/A',
              approvalStatus: 'error'
            };
          }
        }
        
        // Test serialization
        JSON.stringify(cleanPkg);
        cleanedPackages.push(cleanPkg);
        
      } catch (serializationError) {
        console.error(`❌ Serialization error for package ${pkg._id}:`, serializationError.message);
        // Skip this package or provide minimal data
        cleanedPackages.push({
          _id: pkg._id,
          packageName: pkg.packageName || 'Error Loading Package',
          status: pkg.status || 'unknown',
          error: 'Data serialization error'
        });
      }
    }
    
    console.log(`✅ Successfully prepared ${cleanedPackages.length} pending packages for admin`);
    
    res.json({
      success: true,
      data: cleanedPackages,
      count: cleanedPackages.length
    });
    
  } catch (error) {
    console.error('❌ Get pending packages error:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending packages',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
};

// 🔧 ADMIN: Get history packages with comprehensive error handling
export const getHistoryPackages = async (req, res) => {
  try {
    console.log('📦 Admin fetching package history...');
    
    let packages;
    try {
      // Fetch all packages with pagination support
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 100; // Limit to prevent memory issues
      const skip = (page - 1) * limit;
      
      packages = await Package.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(); // Use lean for better performance
        
    } catch (queryError) {
      console.error('❌ Database query error in getHistoryPackages:', queryError);
      return res.status(500).json({
        success: false,
        message: 'Database query failed',
        error: process.env.NODE_ENV === 'development' ? queryError.message : undefined
      });
    }

    console.log(`✅ Found ${packages.length} total packages in history`);
    
    // Process packages with enhanced error handling
    const processedPackages = [];
    let errorCount = 0;
    
    for (const pkg of packages) {
      try {
        // Clean the package data
        const cleanPkg = {
          ...pkg,
          // Remove mongoose-specific fields that might cause issues
          __v: undefined,
          $__: undefined
        };
        
        // Handle service provider data separately
        if (pkg.serviceProvider) {
          try {
            const provider = await User.findById(pkg.serviceProvider)
              .select('businessName fullName emailAddress mobileNumber serviceProviderId approvalStatus')
              .lean();
            
            if (provider) {
              cleanPkg.serviceProvider = provider;
            } else {
              // Provider was deleted or doesn't exist
              console.warn(`⚠️ Service provider not found for package ${pkg._id}`);
              cleanPkg.serviceProvider = {
                _id: pkg.serviceProvider,
                businessName: 'Deleted Provider',
                fullName: 'Deleted Provider',
                emailAddress: 'N/A',
                mobileNumber: 'N/A',
                serviceProviderId: 'N/A',
                approvalStatus: 'deleted'
              };
            }
          } catch (providerError) {
            console.warn(`⚠️ Error fetching service provider for package ${pkg._id}:`, providerError.message);
            cleanPkg.serviceProvider = {
              _id: pkg.serviceProvider,
              businessName: 'Error Loading Provider',
              fullName: 'Error Loading Provider',
              emailAddress: 'N/A',
              mobileNumber: 'N/A',
              serviceProviderId: 'N/A',
              approvalStatus: 'error'
            };
          }
        } else {
          // No service provider reference
          cleanPkg.serviceProvider = {
            _id: null,
            businessName: 'No Provider',
            fullName: 'No Provider',
            emailAddress: 'N/A',
            mobileNumber: 'N/A',
            serviceProviderId: 'N/A',
            approvalStatus: 'none'
          };
        }
        
        // Ensure all required fields exist with defaults
        cleanPkg.packageName = cleanPkg.packageName || 'Unnamed Package';
        cleanPkg.status = cleanPkg.status || 'unknown';
        cleanPkg.packageType = cleanPkg.packageType || 'custom';
        cleanPkg.targetAudience = cleanPkg.targetAudience || 'Unisex';
        cleanPkg.totalPrice = cleanPkg.totalPrice || 0;
        cleanPkg.totalDuration = cleanPkg.totalDuration || 0;
        
        // Test serialization before adding
        JSON.stringify(cleanPkg);
        processedPackages.push(cleanPkg);
        
      } catch (packageError) {
        console.error(`❌ Error processing package ${pkg._id}:`, packageError.message);
        errorCount++;
        
        // Add minimal error package data
        processedPackages.push({
          _id: pkg._id,
          packageName: pkg.packageName || 'Error Loading Package',
          status: pkg.status || 'error',
          packageType: 'unknown',
          targetAudience: 'unknown',
          totalPrice: 0,
          totalDuration: 0,
          createdAt: pkg.createdAt,
          serviceProvider: {
            _id: pkg.serviceProvider || null,
            businessName: 'Error Loading Provider',
            fullName: 'Error Loading Provider',
            serviceProviderId: 'N/A'
          },
          error: 'Package data error'
        });
      }
    }
    
    console.log(`✅ Successfully processed ${processedPackages.length} packages (${errorCount} with errors)`);
    
    // Get total count for pagination
    let totalCount = 0;
    try {
      totalCount = await Package.countDocuments({});
    } catch (countError) {
      console.warn('⚠️ Could not get total package count:', countError.message);
      totalCount = processedPackages.length;
    }
    
    res.json({
      success: true,
      data: processedPackages,
      count: processedPackages.length,
      totalCount,
      errorCount,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 100
    });
    
  } catch (error) {
    console.error('❌ Get package history error:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package history',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack,
        name: error.name
      } : undefined
    });
  }
};

// 🔧 UTILITY: Get package by ID
export const getPackageById = async (req, res) => {
  try {
    const packageId = req.params.id;
    
    const package_ = await Package.findById(packageId)
      .populate('serviceProvider', 'businessName fullName emailAddress mobileNumber serviceProviderId')
      .populate('includedServices.service', 'name type category duration pricing');

    if (!package_) {
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    res.json({
      success: true,
      package: package_
    });
  } catch (error) {
    console.error('Get package by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package'
    });
  }
};

// 🔧 ADMIN: Package ID verification endpoint for debugging
export const verifyPackageIds = async (req, res) => {
  try {
    console.log('🔍 Verifying Package ID consistency...');
    
    const packages = await Package.find({})
      .select('_id packageId status firstApprovedAt adminActionTaken pendingChanges packageName')
      .sort({ createdAt: -1 });
    
    const verification = {
      totalPackages: packages.length,
      packagesWithIds: packages.filter(p => p.packageId).length,
      approvedPackages: packages.filter(p => p.status === 'approved').length,
      approvedWithoutIds: packages.filter(p => p.status === 'approved' && !p.packageId).length,
      pendingPackages: packages.filter(p => p.status === 'pending_approval').length,
      inconsistentPackages: []
    };
    
    // Check for inconsistencies
    packages.forEach(pkg => {
      const issues = [];
      
      // Approved packages should have Package IDs
      if (pkg.status === 'approved' && !pkg.packageId) {
        issues.push('Approved but no Package ID');
      }
      
      // Packages with IDs should be approved
      if (pkg.packageId && pkg.status !== 'approved') {
        issues.push('Has Package ID but not approved');
      }
      
      // Admin action taken but still pending
      if (pkg.adminActionTaken && pkg.status === 'pending_approval') {
        issues.push('Admin action taken but still pending');
      }
      
      if (issues.length > 0) {
        verification.inconsistentPackages.push({
          _id: pkg._id,
          packageName: pkg.packageName,
          packageId: pkg.packageId,
          status: pkg.status,
          adminActionTaken: pkg.adminActionTaken,
          issues
        });
      }
    });
    
    console.log('🔍 Package ID verification results:', verification);
    
    res.json({
      success: true,
      verification,
      message: `Found ${verification.inconsistentPackages.length} inconsistent packages`,
      packages: packages.map(p => ({
        _id: p._id,
        packageName: p.packageName,
        packageId: p.packageId,
        status: p.status,
        adminActionTaken: p.adminActionTaken,
        pendingChanges: p.pendingChanges?.requestType
      }))
    });
    
  } catch (error) {
    console.error('❌ Package ID verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify Package IDs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 🔧 ADMIN: Get all packages for admin (alternative endpoint)
export const getAllPackagesForAdmin = async (req, res) => {
  try {
    console.log('📦 Admin fetching all packages...');
    
    // Add filters if provided
    const filters = {};
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.serviceProvider) {
      filters.serviceProvider = req.query.serviceProvider;
    }
    
    const packages = await Package.find(filters)
      .sort({ createdAt: -1 })
      .limit(200) // Prevent memory issues
      .lean();
      
    console.log(`✅ Found ${packages.length} packages with filters:`, filters);
    
    // Simplified processing for admin view
    const simplifiedPackages = packages.map(pkg => ({
      _id: pkg._id,
      packageId: pkg.packageId,
      packageName: pkg.packageName || 'Unnamed Package',
      status: pkg.status || 'unknown',
      packageType: pkg.packageType || 'custom',
      totalPrice: pkg.totalPrice || 0,
      createdAt: pkg.createdAt,
      firstApprovedAt: pkg.firstApprovedAt,
      lastUpdatedAt: pkg.lastUpdatedAt,
      deletedAt: pkg.deletedAt,
      serviceProvider: pkg.serviceProvider,
      serviceProviderId: pkg.serviceProviderId,
      pendingChanges: pkg.pendingChanges,
      adminActionTaken: pkg.adminActionTaken
    }));
    
    res.json({
      success: true,
      data: simplifiedPackages,
      count: simplifiedPackages.length
    });
    
  } catch (error) {
    console.error('❌ Get all packages for admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch packages for admin',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// 🔧 ADMIN: Dashboard statistics
export const getAdminPackageStats = async (req, res) => {
  try {
    console.log('📊 Fetching admin package statistics...');
    
    const [
      totalPackages,
      pendingApproval,
      approved,
      rejected,
      deleted,
      withPendingChanges,
      withPackageIds
    ] = await Promise.all([
      Package.countDocuments({}),
      Package.countDocuments({ status: 'pending_approval', adminActionTaken: { $ne: true } }),
      Package.countDocuments({ status: 'approved' }),
      Package.countDocuments({ status: 'rejected' }),
      Package.countDocuments({ status: 'deleted' }),
      Package.countDocuments({ pendingChanges: { $exists: true }, adminActionTaken: { $ne: true } }),
      Package.countDocuments({ packageId: { $exists: true, $ne: null } })
    ]);
    
    const stats = {
      total: totalPackages,
      byStatus: {
        pending: pendingApproval,
        approved,
        rejected,
        deleted
      },
      pendingChanges: withPendingChanges,
      withPackageIds,
      needsAttention: pendingApproval + withPendingChanges
    };
    
    console.log('📊 Package statistics:', stats);
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    console.error('❌ Get admin package stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch package statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};