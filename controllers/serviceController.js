// controllers/serviceController.js - COMPLETELY FIXED VERSION
import Service from '../models/Service.js';
import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mailer from '../config/mailer.js';
// Destructure email functions
const {
  sendServiceNotificationToAdmin,
  sendServiceStatusUpdate,
  sendServiceProviderUpdateRejectionEmail,
  sendServiceProviderDeleteApprovalEmail,
  sendServiceProviderDeleteRejectionEmail
} = mailer;
import Booking from '../models/Booking.js';
import { notifyServiceStatusChange, createNotification } from './notificationController.js';
import { generateServiceProviderSerial, generateServiceSerial } from '../Utils/serialGenerator.js';
import { getExistingServiceProviderId } from '../Utils/serialGenerator.js';

// Configure multer for service images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/services/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'service-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const uploadServiceImages = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 5 // Maximum 5 images per service
  }
}).array('serviceImages', 5);

// Enhanced validation helper
const validateServiceData = (data, isUpdate = false) => {
  const errors = [];
  
  console.log('🔍 Validating service data:', {
    name: data.name,
    type: data.type,
    category: data.category,
    description: data.description,
    pricing: data.pricing
  });
  
  if (!isUpdate || data.name !== undefined) {
    if (!data.name || typeof data.name !== 'string' || data.name.trim().length < 2) {
      errors.push('Service name must be at least 2 characters long');
    }
    if (data.name && data.name.length > 100) {
      errors.push('Service name cannot exceed 100 characters');
    }
  }
  
  if (!isUpdate || data.type !== undefined) {
    const validTypes = [
      'Hair Cut', 'Hair Style', 'Face Makeup', 'Nail Art', 'Saree Draping', 'Eye Makeup'
    ];
    if (!data.type || !validTypes.includes(data.type)) {
      errors.push('Invalid service type');
    }
  }
  
  if (!isUpdate || data.category !== undefined) {
    const validCategories = ['Kids', 'Women', 'Men', 'Unisex'];
    if (!data.category || !validCategories.includes(data.category)) {
      errors.push('Invalid service category');
    }
  }
  
  if (!isUpdate || data.description !== undefined) {
    if (!data.description || typeof data.description !== 'string') {
      errors.push('Service description is required');
    } else {
      const trimmedDescription = data.description.trim();
      if (trimmedDescription.length < 5) {
        errors.push('Service description must be at least 5 characters long');
      } else if (trimmedDescription.length > 2000) {
        errors.push('Service description cannot exceed 2000 characters');
      }
    }
  }
  
  const pricing = data.pricing;
  if (!isUpdate || pricing !== undefined) {
    if (!pricing || typeof pricing !== 'object') {
      errors.push('Pricing information is required');
    } else {
      const basePrice = pricing.basePrice;
      if (!basePrice || isNaN(parseFloat(basePrice)) || parseFloat(basePrice) <= 0) {
        errors.push('Valid base price is required (must be greater than 0)');
      }
      const price = parseFloat(basePrice);
      if (price > 1000000) {
        errors.push('Base price cannot exceed 1,000,000');
      }
    }
  }
  
  if (!isUpdate || data.duration !== undefined) {
    const duration = parseInt(data.duration);
    if (!data.duration || isNaN(duration) || duration < 15 || duration > 600) {
      errors.push('Service duration must be between 15 and 600 minutes');
    }
  }
  
  console.log('🔍 Validation errors:', errors);
  return errors;
};

// Create new service with proper error handling and timestamps
export const createService = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required',
        error: 'USER_NOT_AUTHENTICATED'
      });
    }

    console.log('🔍 Create service request - User ID:', req.user.userId);
    console.log('🔍 Create service request body:', req.body);

    const serviceData = { ...req.body };

    // Map form data to service schema
    const finalServiceData = {
      name: serviceData.name?.trim() || '',
      type: serviceData.type || '',
      serviceSubType: serviceData.serviceSubType || '',
      category: serviceData.category || '',
      description: serviceData.description?.trim() || '',
      pricing: {
        basePrice: parseFloat(serviceData.pricing?.basePrice || 0),
        priceType: serviceData.pricing?.priceType || 'fixed',
        variations: [],
        addOns: []
      },
      duration: parseInt(serviceData.duration) || 60,
      experienceLevel: serviceData.experienceLevel || 'beginner',
      serviceLocation: serviceData.serviceLocation || 'both',
      preparationRequired: serviceData.preparationRequired?.trim() || '',
      customNotes: serviceData.customNotes?.trim() || '',
      cancellationPolicy: serviceData.cancellationPolicy?.trim() || '24 hours notice required',
      minLeadTime: Math.max(1, parseInt(serviceData.minLeadTime) || 2),
      maxLeadTime: Math.min(365, parseInt(serviceData.maxLeadTime) || 30)
    };

    // Validate service data
    const validationErrors = validateServiceData(finalServiceData);
    if (validationErrors.length > 0) {
      console.log('❌ Validation errors found:', validationErrors);
      return res.status(400).json({
        success: false,
        message: 'Validation errors found',
        error: 'VALIDATION_ERROR',
        details: validationErrors
      });
    }

    // Get Provider ID only if approved
    let serviceProviderId = 'Not assigned';
    try {
      const existingProviderId = await getExistingServiceProviderId(req.user.userId);
      if (existingProviderId) {
        serviceProviderId = existingProviderId;
        console.log('✅ Found existing Provider ID:', existingProviderId);
      } else {
        console.log('⚠️ Service provider not yet approved - service will be created without Provider ID');
      }
    } catch (error) {
      console.warn('⚠️ Could not get provider ID:', error.message);
    }

    // Process uploaded images
    let images = [];
    if (req.files && req.files.length > 0) {
      images = req.files.map(file => ({
        url: `/uploads/services/${file.filename}`,
        description: '',
        isPrimary: false
      }));
      
      if (images.length > 0) {
        images[0].isPrimary = true;
      }
    }

    // Set timestamps (Service ID will be assigned by admin on approval/rejection)
    const now = new Date();

    const completeServiceData = {
      // Service ID will be assigned upon admin approval or rejection
      serviceProvider: req.user.userId,
      serviceProviderId: serviceProviderId,
      ...finalServiceData,
      availability: {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        timeSlots: [{ start: '09:00', end: '18:00' }]
      },
      images,
      status: 'pending_approval',
      isActive: false,
      isVisibleToProvider: true,
      firstSubmittedAt: now, // CRITICAL: Set submission timestamp
      // Pending services are unavailable until approved
      availabilityStatus: 'No Longer Available',
      statusHistory: [{
        status: 'pending_approval',
        changedAt: now,
        reason: 'Service submitted for approval'
      }]
    };

    console.log('🔍 Final service data to save:', completeServiceData);

    const service = new Service(completeServiceData);
    
    // Add to approval history
    service.approvalHistory.push({
      action: 'create',
      reason: 'New service creation request',
      timestamp: now,
      previousData: null
    });
    
    // Save the service
    const savedService = await service.save();
    
    console.log('✅ Service saved successfully:');
    console.log('- Service ID:', savedService._id);
    console.log('- Service Provider:', savedService.serviceProvider);
    console.log('- Service Name:', savedService.name);
    console.log('- Status:', savedService.status);
    console.log('- First Submitted At:', savedService.firstSubmittedAt);
    
    // Get service provider details for notification
    const serviceProviderForNotification = await User.findById(req.user.userId)
      .select('fullName businessName emailAddress mobileNumber businessType city');
    
    console.log('🔍 Service provider for notification:', serviceProviderForNotification);
    
    // FIXED: Send enhanced notification to admin with proper labeling
    try {
      const enhancedServiceData = {
        _id: savedService._id,
        name: savedService.name,
        type: savedService.type,
        category: savedService.category,
        description: savedService.description,
        pricing: savedService.pricing,
        duration: savedService.duration,
        experienceLevel: savedService.experienceLevel,
        serviceLocation: savedService.serviceLocation,
        action: 'create',
        requestType: 'New Service', // CRITICAL: Proper request type
        submittedAt: savedService.firstSubmittedAt,
        serviceDetails: {
          basePrice: savedService.pricing.basePrice,
          duration: savedService.duration,
          targetAudience: savedService.category,
          preparationRequired: savedService.preparationRequired,
          customNotes: savedService.customNotes,
          cancellationPolicy: savedService.cancellationPolicy
        }
      };

      const enhancedProviderData = {
        ...serviceProviderForNotification.toObject(),
        userId: req.user.userId,
        serviceProviderId: serviceProviderId,
        submissionTime: now.toLocaleString()
      };
      
      console.log('📧 Sending enhanced admin notification...');
      await sendServiceNotificationToAdmin(enhancedServiceData, enhancedProviderData);
      
      console.log('✅ Service notification sent to admin successfully with request type: New Service');
    } catch (notificationError) {
      console.error('❌ Failed to send service notification to admin:', notificationError);
      // Don't fail the service creation due to notification issues
    }
    
    res.status(201).json({
      success: true,
      message: 'Service created and submitted for approval. You will receive an email notification once the admin reviews your submission.',
      service: {
        id: savedService._id,
        name: savedService.name,
        type: savedService.type,
        category: savedService.category,
        status: savedService.status,
        serviceProvider: savedService.serviceProvider,
        createdAt: savedService.createdAt,
        firstSubmittedAt: savedService.firstSubmittedAt, // Include submission timestamp
        submissionMessage: 'Your service is now pending admin approval. You will be notified via email once the review is complete.',
        requestType: 'New Service'
      }
    });
  } catch (error) {
    console.error('❌ Error creating service:', error);
    console.error('❌ Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Service validation failed',
        error: 'MONGOOSE_VALIDATION_ERROR',
        details: validationErrors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create service',
      error: 'SERVICE_CREATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
// Get provider's services with proper population
export const getProviderServices = async (req, res) => {
  try {
    let query = { 
      serviceProvider: req.user.userId, 
      isVisibleToProvider: true,
      $or: [
        { deletedAt: null },
        { deletedAt: { $exists: false } }
      ]
    };

    // Add status filter if provided
    if (req.query.status) {
      query.status = req.query.status;
    }

    console.log('🔍 Fetching provider services with query:', query);

    const services = await Service.find(query)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city averageRating reviewCount isOnline serviceProviderId')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${services.length} services for provider ${req.user.userId}`);

    // Ensure serviceProvider is always populated
    const servicesWithProvider = services.map(service => {
      if (!service.serviceProvider) {
        console.warn(`⚠️ Service ${service._id} missing serviceProvider data`);
      }
      return {
        ...service.toObject(),
        serviceProvider: service.serviceProvider || {
          _id: req.user.userId,
          fullName: 'Unknown Provider',
          businessName: 'Unknown Business',
          emailAddress: 'unknown@email.com',
          serviceProviderId: 'Not assigned'
        }
      };
    });

    const pagination = {
      totalServices: services.length,
      currentPage: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false
    };

    res.json({
      success: true,
      services: servicesWithProvider,
      pagination
    });
  } catch (error) {
    console.error('❌ Error fetching provider services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: 'SERVICE_FETCH_ERROR'
    });
  }
};

// Update service with proper pending changes handling
export const updateService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const updateData = req.body;
    const userId = req.user.userId;

    console.log(`🔍 Service provider ${userId} updating service ${serviceId}`);
    console.log('🔍 Update data received:', updateData);

    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }

    // Check if user owns this service
    if (service.serviceProvider._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own services',
        error: 'ACCESS_DENIED'
      });
    }

    // Handle approved services with pending changes system
    if (service.status === 'approved') {
      // Store original data for comparison
      const originalData = {
        name: service.name,
        type: service.type,
        category: service.category,
        description: service.description,
        pricing: service.pricing,
        duration: service.duration,
        experienceLevel: service.experienceLevel,
        serviceLocation: service.serviceLocation,
        preparationRequired: service.preparationRequired,
        customNotes: service.customNotes,
        cancellationPolicy: service.cancellationPolicy,
        minLeadTime: service.minLeadTime,
        maxLeadTime: service.maxLeadTime,
        availability: service.availability
      };

      service.pendingChanges = {
        actionType: 'update',
        changes: updateData,
        reason: 'Service update requested by provider',
        requestedAt: new Date(),
        requestType: 'update',
        originalData: originalData
      };
      
      service.approvalHistory.push({
        action: 'update_requested',
        reason: 'Service update request submitted for admin approval',
        timestamp: new Date(),
        previousData: originalData
      });
      
      await service.save();
      
      // Send notification to admin about update request
      try {
        const updateNotificationData = {
          _id: service._id,
          name: service.name,
          type: service.type,
          category: service.category,
          action: 'update',
          requestType: 'Update Request',
          originalData: originalData,
          proposedChanges: updateData,
          submittedAt: new Date()
        };

        await sendServiceNotificationToAdmin(updateNotificationData, service.serviceProvider);
        console.log('✅ Update request notification sent to admin with label: Update Request');
      } catch (notificationError) {
        console.error('❌ Failed to send update notification to admin:', notificationError);
      }
      
      return res.json({
        success: true,
        message: 'Service update request submitted successfully. You will receive an email notification once the admin reviews your changes.',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          hasPendingChanges: true,
          pendingChanges: service.pendingChanges,
          requestType: 'Update Request',
          submissionMessage: 'Your service update is pending admin approval. You will be notified via email once the review is complete.'
        }
      });
    }
    
    // For non-approved services, update directly
    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'serviceProvider') {
        service[key] = updateData[key];
      }
    });
    
    // Ensure status remains pending until admin action
    service.status = 'pending_approval';
    service.lastUpdatedAt = new Date();
    
    // Add to status history
    service.statusHistory.push({
      status: 'pending_approval',
      changedAt: new Date(),
      reason: 'Service updated and resubmitted for approval'
    });
    
    // Record in history
    service.approvalHistory.push({
      action: 'update_requested',
      reason: 'Service update request submitted',
      timestamp: new Date()
    });
    
    await service.save();
    
    return res.json({
      success: true,
      message: 'Service updated and resubmitted for admin approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        hasPendingChanges: false,
        requestType: 'Update Request',
        lastUpdatedAt: service.lastUpdatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error updating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      error: 'SERVICE_UPDATE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

//Start
// export const approveServiceChanges = async (req, res) => {
//   try {
//     const { serviceId } = req.params;
//     const { reason = 'Service approved by admin' } = req.body;
    
//     console.log(`🔍 Admin approving service ${serviceId} with reason: "${reason}"`);
    
//     const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress serviceProviderId');
    
//     if (!service) {
//       return res.status(404).json({
//         success: false,
//         message: 'Service not found.',
//         error: 'SERVICE_NOT_FOUND'
//       });
//     }
    
//     console.log('🔍 Service before approval:', {
//       id: service._id,
//       name: service.name,
//       status: service.status,
//       serviceId: service.serviceId,
//       isActive: service.isActive,
//       hasPendingChanges: !!service.pendingChanges
//     });
    
//     const now = new Date();
//     let emailActionType = 'approval';
//     let actionDescription = 'Service approved';

//     // CRITICAL: Generate Service ID if not already assigned (for first-time approvals)
//     if (!service.serviceId) {
//       service.serviceId = await generateServiceSerial();
//       console.log(`🆔 Assigned Service ID: ${service.serviceId} during approval`);
//     }

//     // Case 1: Approving a new service for the first time
//     if (service.status === 'pending_approval' && !service.pendingChanges) {
//       actionDescription = 'New service approved and activated.';
//       emailActionType = 'approval';
      
//       service.status = 'approved';
//       service.isActive = true;
//       service.availabilityStatus = 'Available';
//       service.approvalDate = now;
      
//       // Set first approval timestamp
//       if (!service.firstApprovedAt) {
//         service.firstApprovedAt = now;
//       }
      
//       // Update serviceProviderId if available
//       if (service.serviceProvider?.serviceProviderId) {
//         service.serviceProviderId = service.serviceProvider.serviceProviderId;
//       }
      
//       service.statusHistory.push({ 
//         status: 'approved', 
//         changedAt: now, 
//         changedBy: req.user.userId, 
//         reason: `Admin approved: ${reason}`
//       });
      
//       service.approvalHistory.push({ 
//         action: 'approved', 
//         adminId: req.user.userId, 
//         reason: reason, 
//         timestamp: now 
//       });
//     } 
//     // Case 2: Approving pending changes on an existing service
//     else if (service.pendingChanges) {
//       const { actionType: pendingAction, changes } = service.pendingChanges;
//       actionDescription = `Pending ${pendingAction} request approved.`;
//       emailActionType = `${pendingAction}_approval`;
      
//       if (pendingAction === 'update') {
//         // Apply pending changes
//         Object.keys(changes).forEach(key => {
//           if (key !== '_id' && key !== 'serviceProvider' && changes[key] !== undefined) {
//             service[key] = changes[key];
//           }
//         });
        
//         service.status = 'approved';
//         service.isActive = true;
//         service.availabilityStatus = 'Available';
//         service.lastUpdatedAt = now;
        
//       } else if (pendingAction === 'delete') {
//         // Handle deletion approval
//         service.status = 'deleted';
//         service.isActive = false;
//         service.availabilityStatus = 'No Longer Available';
//         service.deletedAt = now;
//         service.deletedBy = req.user.userId;
//         service.isVisibleToProvider = true; // Keep visible for audit
        
//       } else if (pendingAction === 'reactivate') {
//         // Handle reactivation approval
//         service.status = 'approved';
//         service.isActive = true;
//         service.availabilityStatus = 'Available';
//         service.isVisibleToProvider = true;
//         service.reactivatedAt = now;
//         service.reactivatedBy = req.user.userId;
        
//         // Clear deletion fields
//         service.deletedAt = null;
//         service.deletedBy = null;
//       }
      
//       service.statusHistory.push({ 
//         status: service.status,
//         changedAt: now, 
//         changedBy: req.user.userId, 
//         reason: `Admin approved ${pendingAction}: ${reason}`
//       });
      
//       service.approvalHistory.push({ 
//         action: `${pendingAction}_approved`, 
//         adminId: req.user.userId, 
//         reason: reason, 
//         timestamp: now,
//         appliedChanges: changes
//       });

//       // Clear pending changes
//       service.pendingChanges = null;
//     } else {
//       return res.status(409).json({
//         success: false,
//         message: 'This service is not pending any changes that can be approved.',
//         error: 'NO_PENDING_CHANGES'
//       });
//     }
    
//     // CRITICAL: Save the service with all updates
//     const savedService = await service.save();
    
//     console.log('✅ Service approval processed:', {
//       id: savedService._id,
//       serviceId: savedService.serviceId,
//       status: savedService.status,
//       isActive: savedService.isActive,
//       availabilityStatus: savedService.availabilityStatus,
//       approvalDate: savedService.approvalDate,
//       hasPendingChanges: !!savedService.pendingChanges
//     });
    
//     // Send email notification
//     try {
//       const providerData = await User.findById(savedService.serviceProvider._id).select('fullName businessName emailAddress');
//       await sendServiceStatusUpdate(savedService, providerData, 'approved', reason, emailActionType);
//       console.log(`✅ Approval notification sent for service ${savedService._id}`);
//     } catch (emailError) {
//       console.error(`❌ Failed to send approval notification for service ${savedService._id}:`, emailError);
//     }
    
//     // Return complete updated service data
//     const updatedService = await Service.findById(savedService._id)
//       .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city isOnline serviceProviderId')
//       .lean();

//     return res.json({
//       success: true,
//       message: `${actionDescription} The provider has been notified.`,
//       service: updatedService,
//       approvalDetails: {
//         approvedAt: savedService.approvalDate || now,
//         approvedBy: req.user.userId,
//         reason: reason,
//         serviceId: savedService.serviceId,
//         actionType: emailActionType
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error approving service:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to approve service.',
//       error: 'SERVICE_APPROVAL_ERROR',
//       details: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };
// export const approveServiceChanges = async (req, res) => {
//   try {
//     const { serviceId } = req.params;
//     const { reason = 'Approved by admin', notifyProvider = true } = req.body;
    
//     console.log(`✅ Admin approving service ${serviceId} with reason: "${reason}"`);
    
//     const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
//     if (!service) {
//       return res.status(404).json({
//         success: false,
//         message: 'Service not found.',
//         error: 'SERVICE_NOT_FOUND'
//       });
//     }
    
//     console.log('🔍 Service before approval:', {
//       id: service._id,
//       name: service.name,
//       status: service.status,
//       serviceId: service.serviceId,
//       isActive: service.isActive,
//       hasPendingChanges: !!service.pendingChanges
//     });
    
//     const now = new Date();
//     let emailActionType = 'approval';
//     let actionDescription = 'Service approved';

//     // Case 1: Approving a brand new service
//     if (service.status === 'pending_approval' && !service.pendingChanges) {
//       actionDescription = 'New service approved and activated.';
//       emailActionType = 'approval';
      
//       // Use the model's updateStatus method for new service approval
//       await service.updateStatus('approved', req.user.userId, reason.trim(), {
//         adminNotes: 'Admin approved new service submission'
//       });
//     } 
//     // Case 2: Approving pending changes on an existing service
//     //End
//     // else if (service.pendingChanges) {
//     //   const { actionType: pendingAction } = service.pendingChanges;
//     //   actionDescription = `Pending ${pendingAction} request approved.`;
//     //   emailActionType = `${pendingAction}_approval`;
      
//     //   // Use the model's approveChanges method
//     //   await service.approveChanges(req.user.userId, reason.trim(), {
//     //     adminNotes: 'Admin approved pending changes'
//     //   });
//     // } 
//     // Case 2: Rejecting pending changes on an approved service
// else if (service.pendingChanges) {
//   const { actionType: pendingAction } = service.pendingChanges;
  
//   // FIX: Handle undefined actionType
//   if (!pendingAction) {
//     console.error('❌ Pending changes found but actionType is undefined:', service.pendingChanges);
//     return res.status(400).json({
//       success: false,
//       message: 'Invalid pending changes: action type not specified.',
//       error: 'INVALID_PENDING_CHANGES'
//     });
//   }
  
//   actionDescription = `Pending ${pendingAction} request rejected.`;
//   emailActionType = `${pendingAction}_rejection`;
  
//   // Use the model's rejectChanges method instead of manual updates
//   await service.rejectChanges(req.user.userId, reason.trim(), {
//     adminNotes: 'Admin rejected pending changes'
//   });
// }
//     //start
//     else {
//       return res.status(409).json({
//         success: false,
//         message: 'This service is not pending any changes that can be approved.',
//         error: 'NO_PENDING_CHANGES'
//       });
//     }
    
//     console.log('✅ Service approval processed:', {
//       id: service._id,
//       serviceId: service.serviceId,
//       status: service.status,
//       isActive: service.isActive,
//       availabilityStatus: service.availabilityStatus,
//       approvalDate: service.approvalDate,
//       hasPendingChanges: !!service.pendingChanges
//     });
    
//     // Send email notification if requested
//     if (notifyProvider) {
//       try {
//         const providerData = await User.findById(service.serviceProvider._id).select('fullName businessName emailAddress');
//         await sendServiceStatusUpdate(service, providerData, 'approved', reason.trim(), emailActionType);
//         console.log(`✅ Approval notification sent for service ${service._id}`);
//       } catch (emailError) {
//         console.error(`❌ Failed to send approval notification for service ${service._id}:`, emailError);
//       }
//     }
    
//     // Return complete updated service data
//     const updatedService = await Service.findById(service._id)
//       .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city isOnline serviceProviderId')
//       .lean();

//     return res.json({
//       success: true,
//       message: `${actionDescription} The provider has been ${notifyProvider ? 'notified' : 'not notified'}.`,
//       service: updatedService,
//       approvalDetails: {
//         approvedAt: now,
//         approvedBy: req.user.userId,
//         reason: reason.trim(),
//         serviceId: service.serviceId,
//         notificationSent: notifyProvider,
//         actionType: emailActionType
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error approving service:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to approve service.',
//       error: 'SERVICE_APPROVAL_ERROR',
//       details: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };
// //End




export const approveServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason = 'Approved by admin', notifyProvider = true } = req.body;
    
    console.log(`✅ Admin approving service ${serviceId} with reason: "${reason}"`);
    
    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('🔍 Service before approval:', {
      id: service._id,
      name: service.name,
      status: service.status,
      serviceId: service.serviceId,
      isActive: service.isActive,
      hasPendingChanges: !!service.pendingChanges,
      pendingChanges: service.pendingChanges
    });
    
    const now = new Date();
    let emailActionType = 'approval';
    let actionDescription = 'Service approved';

    // CRITICAL: Generate Service ID if not already assigned
    if (!service.serviceId) {
      service.serviceId = await generateServiceSerial();
      console.log(`🆔 Assigned Service ID: ${service.serviceId} during approval`);
    }

    // Case 1: Approving a brand new service (no pending changes or empty/malformed pending changes)
    if (service.status === 'pending_approval' && 
        (!service.pendingChanges || 
         Object.keys(service.pendingChanges).length === 0 || 
         (!service.pendingChanges.actionType && !service.pendingChanges.requestType))) {
      
      actionDescription = 'New service approved and activated.';
      emailActionType = 'approval';
      
      // Clear any malformed pending changes
      if (service.pendingChanges) {
        console.log('🔧 Clearing malformed/empty pendingChanges object during approval');
        service.pendingChanges = null;
      }
      
      // Set approved status and all related fields
      service.status = 'approved';
      service.isActive = true;
      service.availabilityStatus = 'Available';
      service.approvalDate = now;
      
      // Set first approval timestamp
      if (!service.firstApprovedAt) {
        service.firstApprovedAt = now;
      }
      
      // Update serviceProviderId if available
      if (service.serviceProvider?.serviceProviderId) {
        service.serviceProviderId = service.serviceProvider.serviceProviderId;
      }
      
      service.statusHistory.push({ 
        status: 'approved', 
        changedAt: now, 
        changedBy: req.user.userId, 
        reason: `Admin approved: ${reason.trim()}`
      });
      
      service.approvalHistory.push({ 
        action: 'approved', 
        adminId: req.user.userId, 
        reason: reason.trim(), 
        timestamp: now 
      });
    } 
    // Case 2: Approving pending changes on an existing service
    else if (service.pendingChanges && Object.keys(service.pendingChanges).length > 0) {
      // FIX: Handle undefined actionType by checking both actionType and requestType
      const pendingAction = service.pendingChanges.actionType || service.pendingChanges.requestType;
      
      if (!pendingAction) {
        console.error('❌ Pending changes found but actionType is undefined:', service.pendingChanges);
        console.log('🔧 Clearing malformed pendingChanges and treating as new service approval');
        
        // Clear the malformed pending changes and treat as new service approval
        service.pendingChanges = null;
        
        // Treat this as a new service approval
        actionDescription = 'New service approved (cleared malformed pending changes).';
        emailActionType = 'approval';
        
        service.status = 'approved';
        service.isActive = true;
        service.availabilityStatus = 'Available';
        service.approvalDate = now;
        
        if (!service.firstApprovedAt) {
          service.firstApprovedAt = now;
        }
        
        if (service.serviceProvider?.serviceProviderId) {
          service.serviceProviderId = service.serviceProvider.serviceProviderId;
        }
        
        service.statusHistory.push({ 
          status: 'approved', 
          changedAt: now, 
          changedBy: req.user.userId, 
          reason: `Admin approved (cleared malformed pending changes): ${reason.trim()}`
        });
        
        service.approvalHistory.push({ 
          action: 'approved', 
          adminId: req.user.userId, 
          reason: reason.trim(), 
          timestamp: now 
        });
      } else {
        // Valid pending changes with proper actionType
        const { changes } = service.pendingChanges;
        actionDescription = `Pending ${pendingAction} request approved.`;
        emailActionType = `${pendingAction}_approval`;
        
        if (pendingAction === 'update') {
          // Apply pending changes
          if (changes && typeof changes === 'object') {
            Object.keys(changes).forEach(key => {
              if (key !== '_id' && key !== 'serviceProvider' && changes[key] !== undefined) {
                service[key] = changes[key];
              }
            });
          }
          
          service.status = 'approved';
          service.isActive = true;
          service.availabilityStatus = 'Available';
          service.lastUpdatedAt = now;
          
        } else if (pendingAction === 'delete') {
          // Handle deletion approval
          service.status = 'deleted';
          service.isActive = false;
          service.availabilityStatus = 'No Longer Available';
          service.deletedAt = now;
          service.deletedBy = req.user.userId;
          service.isVisibleToProvider = true; // Keep visible for audit
          
        } else if (pendingAction === 'reactivate') {
          // Handle reactivation approval
          service.status = 'approved';
          service.isActive = true;
          service.availabilityStatus = 'Available';
          service.isVisibleToProvider = true;
          service.reactivatedAt = now;
          service.reactivatedBy = req.user.userId;
          
          // Clear deletion fields
          service.deletedAt = null;
          service.deletedBy = null;
        }
        
        service.statusHistory.push({ 
          status: service.status,
          changedAt: now, 
          changedBy: req.user.userId, 
          reason: `Admin approved ${pendingAction}: ${reason.trim()}`
        });
        
        service.approvalHistory.push({ 
          action: `${pendingAction}_approved`, 
          adminId: req.user.userId, 
          reason: reason.trim(), 
          timestamp: now,
          appliedChanges: changes
        });

        // Clear pending changes
        service.pendingChanges = null;
      }
    } else {
      return res.status(409).json({
        success: false,
        message: 'This service is not pending any changes that can be approved.',
        error: 'NO_PENDING_CHANGES'
      });
    }
    
    // CRITICAL: Save the service with all updates
    const savedService = await service.save();
    
    console.log('✅ Service approval processed:', {
      id: savedService._id,
      serviceId: savedService.serviceId,
      status: savedService.status,
      isActive: savedService.isActive,
      availabilityStatus: savedService.availabilityStatus,
      approvalDate: savedService.approvalDate,
      hasPendingChanges: !!savedService.pendingChanges
    });
    
    // Send email notification if requested
    if (notifyProvider) {
      try {
        const providerData = await User.findById(savedService.serviceProvider._id).select('fullName businessName emailAddress');
        if (savedService.status === 'deleted') {
          // Deactivate provider account and send delete confirmation
          await User.findByIdAndUpdate(providerData._id, { isActive: false });
          console.log(`✅ Service provider ${providerData._id} deactivated after delete approval`);
          await sendServiceProviderDeleteApprovalEmail(providerData);
          console.log(`✅ Deletion confirmation email sent to provider: ${providerData.emailAddress}`);
        } else {
          // Generic approval notification for create/update/reactivate
          await sendServiceStatusUpdate(savedService, providerData, 'approved', reason.trim(), emailActionType);
          console.log(`✅ Approval notification sent for service ${savedService._id}`);
        }
      } catch (emailError) {
        console.error(`❌ Failed to send provider notification for service ${savedService._id}:`, emailError);
      }
    }
    
  // Emit real-time notification to service provider
  try {
    await notifyServiceStatusChange(savedService, savedService.status, req.user.userId);
    console.log('🔔 Real-time service status change notification sent to provider');
  } catch (notifyError) {
    console.error('❌ Error emitting service status change notification:', notifyError);
  }
  // Notify customers of service unavailability if deleted
  if (savedService.status === 'deleted') {
    // Service deletion approved: notify affected customers
    console.log('🗑️ Service deletion approved for service:', {
      serviceId: savedService._id,
      serviceName: savedService.name,
      serviceType: savedService.type,
      serviceStatus: savedService.status
    });
    
    try {
      // Determine providerId for booking lookup
      const providerId = savedService.serviceProvider && savedService.serviceProvider._id
        ? savedService.serviceProvider._id.toString()
        : savedService.serviceProvider.toString();
      
      console.log('🔍 Looking up bookings with providerId:', providerId);
      
      // Fetch all pending or confirmed bookings for this provider
      // FIXED: Only look up by serviceProviderId to ensure we find ALL affected bookings
      const bookings = await Booking.find({
        serviceProviderId: providerId,
        status: { $in: ['pending', 'confirmed'] }
      });
      
      console.log(`🔍 Found ${bookings.length} active bookings for provider ${providerId}. Details:`, 
        bookings.map(b => ({
          bookingId: b._id,
          customerId: b.customerId,
          serviceName: b.serviceName,
          bookingDate: b.bookingDate,
          status: b.status
        }))
      );
      
      // If no bookings found, log a warning
      if (bookings.length === 0) {
        console.log(`⚠️ No active bookings found for provider ${providerId}`);
      }
      
      // Process each booking
      let notificationCount = 0;
      for (const booking of bookings) {
        console.log(`🔔 Processing notification for customer ${booking.customerId} about service "${booking.serviceName}"`);
        
        try {
          // Create the notification with detailed logging
          // FIXED: Using 'serviceUnavailable' type which is defined in the Notification schema
          const notification = await createNotification({
            sender: 'system',
            receiver: booking.customerId.toString(),
            message: `The service "${savedService.name}" you booked on ${booking.bookingDate.toLocaleDateString()} is now unavailable and your booking has been cancelled.`,
            type: 'serviceUnavailable', // This type is defined in the Notification schema
            data: { 
              serviceId: savedService._id.toString(), 
              bookingId: booking._id.toString(),
              serviceName: savedService.name,
              cancelReason: 'Service deleted by provider'
            }
          });
          
          console.log(`✅ Notification created successfully:`, {
            notificationId: notification._id,
            customerId: booking.customerId.toString(),
            message: notification.message,
            type: notification.type,
            timestamp: notification.timestamp
          });
          
          // Cancel the booking
          booking.status = 'cancelled';
          await booking.save();
          console.log(`🛑 Booking ${booking._id} status updated to cancelled`);
          
          notificationCount++;
        } catch (notificationError) {
          console.error(`❌ Error creating notification for customer ${booking.customerId}:`, notificationError);
        }
      }
      
      console.log(`✅ Completed notifications process: ${notificationCount} notifications created out of ${bookings.length} bookings`);
    } catch (err) {
      console.error('❌ Error in customer notification process:', err);
    }
  }
  // Return complete updated service data
  const updatedService = await Service.findById(savedService._id)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city isOnline serviceProviderId')
      .lean();

    return res.json({
      success: true,
      message: `${actionDescription} The provider has been ${notifyProvider ? 'notified' : 'not notified'}.`,
      service: updatedService,
      approvalDetails: {
        approvedAt: now,
        approvedBy: req.user.userId,
        reason: reason.trim(),
        serviceId: savedService.serviceId,
        notificationSent: notifyProvider,
        actionType: emailActionType
      }
    });

  } catch (error) {
    console.error('❌ Error approving service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve service.',
      error: 'SERVICE_APPROVAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};








// Delete service with proper soft deletion
export const deleteService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.userId;

    console.log(`🔍 Service provider ${userId} requesting deletion of service ${serviceId}`);

    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }

    // Check if user owns this service
    if (service.serviceProvider._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own services',
        error: 'ACCESS_DENIED'
      });
    }

    // Always require admin approval for deletion of approved services
    if (service.status === 'approved') {
      service.pendingChanges = {
        actionType: 'delete',
        changes: { reason: 'Service deletion requested by provider' },
        reason: 'Service deletion requested by provider',
        requestedAt: new Date(),
        requestType: 'delete'
      };
      
      service.approvalHistory.push({
        action: 'delete_requested',
        reason: 'Service deletion request submitted for admin approval',
        timestamp: new Date()
      });
      
      await service.save();
      
      // Send notification to admin about deletion request
      try {
        const deleteNotificationData = {
          _id: service._id,
          name: service.name,
          type: service.type,
          category: service.category,
          action: 'delete',
          requestType: 'Delete Request',
          submittedAt: new Date(),
          serviceDetails: {
            basePrice: service.pricing.basePrice,
            duration: service.duration,
            currentStatus: service.status
          }
        };

        await sendServiceNotificationToAdmin(deleteNotificationData, service.serviceProvider);
        console.log('✅ Deletion request notification sent to admin with label: Delete Request');
      } catch (notificationError) {
        console.error('❌ Failed to send deletion notification to admin:', notificationError);
      }
      
      return res.json({
        success: true,
        message: 'Service deletion request submitted successfully. You will receive an email notification once the admin reviews your request.',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          pendingDeletion: true,
          requestType: 'Delete Request',
          submissionMessage: 'Your service deletion request is pending admin approval. You will be notified via email once the review is complete.'
        }
      });
    }

    // For non-approved services, allow immediate soft deletion
    service.status = 'deleted';
    service.deletedAt = new Date();
    service.isActive = false;
    service.availabilityStatus = 'No Longer Available';
    service.isVisibleToProvider = false;
    
    service.statusHistory.push({
      status: 'deleted',
      changedAt: new Date(),
      reason: 'Service deleted by provider (non-approved service)'
    });
    
    service.approvalHistory.push({
      action: 'deleted',
      reason: 'Service deleted by provider',
      timestamp: new Date()
    });
    
    await service.save();
    
    return res.json({
      success: true,
      message: 'Service deleted successfully',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        deletedAt: service.deletedAt
      }
    });

  } catch (error) {
    console.error('❌ Error deleting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service',
      error: 'SERVICE_DELETE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ENHANCED: Get pending services with detailed categorization
export const getPendingServiceApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    console.log('🔍 Fetching pending services for admin...');

    // Include delete and reactivate requests as pending
    const pendingQuery = {
      $or: [
        { status: 'pending_approval' },
        { 
          'pendingChanges.actionType': { $in: ['update', 'delete', 'reactivate'] }
        }
      ]
    };

    const pendingServices = await Service.find(pendingQuery)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline serviceProviderId')
      .populate('approvalHistory.adminId', 'fullName')
      .sort({ createdAt: -1, updatedAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const totalPending = await Service.countDocuments(pendingQuery);

    // Enhanced categorization and labeling
    const servicesWithLabels = pendingServices.map(service => {
      const isNewService = service.status === 'pending_approval' && !service.pendingChanges;
      const hasChanges = !!service.pendingChanges;
      
      let requestType = 'New Service';
      let requestLabel = 'New Service';
      let requestDescription = 'New service submission awaiting approval';
      let requestPriority = 'normal';
      let requestColor = '#2196f3';
      let canApprove = true;
      let canReject = true;
      
      if (hasChanges) {
        const actionType = service.pendingChanges.actionType || service.pendingChanges.requestType;
        
        switch(actionType) {
          case 'update':
            requestType = 'Update Request';
            requestLabel = 'Update Needed';
            requestDescription = 'Service update request awaiting approval';
            requestPriority = 'medium';
            requestColor = '#ff9800';
            break;
          case 'delete':
            requestType = 'Delete Request';
            requestLabel = 'Delete Requested';
            requestDescription = 'Service deletion request awaiting approval';
            requestPriority = 'high';
            requestColor = '#f44336';
            break;
          case 'reactivate':
            requestType = 'Reactivate Request';
            requestLabel = 'Reactivate Requested';
            requestDescription = 'Service reactivation request awaiting approval';
            requestPriority = 'medium';
            requestColor = '#4caf50';
            break;
          default:
            requestType = 'Change Request';
            requestLabel = 'Change Needed';
            requestDescription = 'Service modification awaiting approval';
            requestPriority = 'medium';
            requestColor = '#ff9800';
        }
      }
      
      return {
        ...service,
        email: service.serviceProvider?.emailAddress || 'N/A',
        requestType,
        requestLabel,
        requestDescription,
        requestPriority,
        requestColor,
        isNewService,
        hasChanges,
        canApprove: canApprove && service.status !== 'rejected' && service.status !== 'deleted',
        canReject: canReject && service.status !== 'rejected' && service.status !== 'deleted',
        isActionable: (service.status === 'pending_approval' || hasChanges) && 
                      service.status !== 'rejected' && service.status !== 'deleted',
        serviceProvider: service.serviceProvider || {
          _id: 'unknown',
          fullName: 'Unknown Provider',
          businessName: 'Unknown Business',
          emailAddress: 'unknown@email.com'
        }
      };
    });

    console.log(`✅ Found ${totalPending} pending services with enhanced labels`);

    res.json({
      success: true,
      pendingServices: servicesWithLabels,
      totalPending,
      requestTypesSummary: {
        newServices: servicesWithLabels.filter(s => s.requestType === 'New Service').length,
        updateRequests: servicesWithLabels.filter(s => s.requestType === 'Update Request').length,
        deleteRequests: servicesWithLabels.filter(s => s.requestType === 'Delete Request').length,
        reactivateRequests: servicesWithLabels.filter(s => s.requestType === 'Reactivate Request').length
      },
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalPending / limitNum),
        totalPending,
        hasNextPage: pageNum < Math.ceil(totalPending / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending service approvals',
      error: 'PENDING_APPROVALS_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ENHANCED: Get all services for admin with proper status tracking
export const getAllServicesAdmin = async (req, res) => {
  try {
    console.log('🔍 Admin fetching all services...');
    
    const services = await Service.find()
      .populate('serviceProvider', 'businessName fullName emailAddress mobileNumber serviceProviderId')
      .sort({ createdAt: -1 })
      .lean();

    // Add enhanced status information for admin
    const servicesWithStatus = services.map(service => ({
      ...service,
      canApprove: (service.status === 'pending_approval' && !service.pendingChanges) || 
                  (service.pendingChanges && ['update', 'delete', 'reactivate'].includes(service.pendingChanges.actionType)),
      canReject: (service.status === 'pending_approval' && !service.pendingChanges) || 
                 (service.pendingChanges && ['update', 'delete', 'reactivate'].includes(service.pendingChanges.actionType)),
      isActionable: (service.status === 'pending_approval' || !!service.pendingChanges) && 
                    service.status !== 'rejected' && service.status !== 'deleted',
      statusSummary: {
        current: service.status,
        isActive: service.isActive,
        availability: service.availabilityStatus,
        hasPendingChanges: !!service.pendingChanges,
        pendingAction: service.pendingChanges?.actionType,
        lastAction: service.statusHistory?.length > 0 ? 
          service.statusHistory[service.statusHistory.length - 1] : null
      }
    }));

    console.log(`✅ Found ${services.length} total services for admin`);

    res.json({
      success: true,
      services: servicesWithStatus,
      summary: {
        total: services.length,
        pending: services.filter(s => s.status === 'pending_approval').length,
        approved: services.filter(s => s.status === 'approved').length,
        rejected: services.filter(s => s.status === 'rejected').length,
        deleted: services.filter(s => s.status === 'deleted').length,
        withPendingChanges: services.filter(s => !!s.pendingChanges).length
      },
      pagination: {
        totalServices: services.length,
        currentPage: 1,
        totalPages: 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching services for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: 'ADMIN_SERVICES_FETCH_ERROR'
    });
  }
};

// Get single service details
export const getServiceById = async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required',
        error: 'SERVICE_ID_REQUIRED'
      });
    }

    if (!serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service ID format',
        error: 'INVALID_SERVICE_ID_FORMAT'
      });
    }

    const service = await Service.findById(serviceId)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline')
      .populate('approvalHistory.adminId', 'fullName')
      .lean();
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    // Check access permissions
    const canAccess = req.user.role === 'admin' || 
                     service.serviceProvider._id.toString() === req.user.userId ||
                     (service.status === 'approved' && req.user.role === 'customer');
    
    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view approved services or your own services.',
        error: 'SERVICE_ACCESS_DENIED'
      });
    }
    
    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('❌ Error fetching service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service details',
      error: 'SERVICE_DETAIL_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all services with enhanced filtering, sorting, and pagination
export const getAllServices = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      search, 
      type, 
      category, 
      minPrice, 
      maxPrice, 
      sortBy = 'createdAt', 
      sortOrder = 'desc', 
      providerId 
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ 
        success: false,
        message: 'Page number must be a positive integer', 
        error: 'INVALID_PAGE_NUMBER' 
      });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ 
        success: false,
        message: 'Limit must be between 1 and 100', 
        error: 'INVALID_LIMIT' 
      });
    }

    let query = { status: 'approved', isActive: true };

    if (providerId) {
      query.serviceProvider = providerId;
    }

    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { type: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } },
        { tags: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    if (type) query.type = type;
    if (category) query.category = category;

    if (minPrice || maxPrice) {
      query['pricing.basePrice'] = {};
      if (minPrice) query['pricing.basePrice'].$gte = parseFloat(minPrice);
      if (maxPrice) query['pricing.basePrice'].$lte = parseFloat(maxPrice);
    }

    const sortOptions = {};
    const validSortBy = ['createdAt', 'name', 'pricing.basePrice', 'duration'];
    if (validSortBy.includes(sortBy)) {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions['createdAt'] = -1;
    }

    const services = await Service.find(query)
      .populate('serviceProvider', 'businessName fullName city averageRating reviewCount')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const totalServices = await Service.countDocuments(query);
    const totalPages = Math.ceil(totalServices / limitNum);

    res.json({
      success: true,
      services,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalServices,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('❌ Error fetching approved services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch approved services',
      error: 'APPROVED_SERVICE_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Service Provider ID Sync Function
export const syncAllServiceProviderIds = async (userId, newProviderId) => {
  try {
    console.log(`🔄 Syncing all services for provider ${userId} with ID ${newProviderId}`);
    
    const updateResult = await Service.updateMany(
      { 
        serviceProvider: userId,
        serviceProviderId: { $in: ['Not assigned', '', null] }
      },
      { 
        serviceProviderId: newProviderId,
        lastUpdatedAt: new Date()
      }
    );
    
    console.log(`✅ Updated ${updateResult.modifiedCount} services with Provider ID`);
    return updateResult;
  } catch (error) {
    console.error('❌ Error syncing service provider IDs:', error);
    throw error;
  }
};

// Get service history for admin (including deleted)
export const getServiceHistory = async (req, res) => {
  try {
    const services = await Service.getAdminHistory();
    res.json({ success: true, services });
  } catch (error) {
    console.error('❌ Error fetching service history:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error fetching service history',
      error: 'SERVICE_HISTORY_FETCH_ERROR'
    });
  }
};

// controllers/serviceController.js - COMPLETELY FIXED REJECTION LOGIC

// ENHANCED: Reject service changes with comprehensive state management
//start
// export const rejectServiceChanges = async (req, res) => {
//   try {
//     const { serviceId } = req.params;
//     const { reason, notifyProvider = true } = req.body;
    
//     console.log(`🔍 Admin rejecting service ${serviceId} with reason: "${reason}"`);
    
//     // Enhanced validation for rejection reason
//     if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
//       return res.status(400).json({
//         success: false,
//         message: 'Rejection reason is required and must be at least 10 characters long.',
//         error: 'REJECTION_REASON_REQUIRED'
//       });
//     }
    
//     const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
//     if (!service) {
//       return res.status(404).json({
//         success: false,
//         message: 'Service not found.',
//         error: 'SERVICE_NOT_FOUND'
//       });
//     }
    
//     console.log('🔍 Service before rejection:', {
//       id: service._id,
//       name: service.name,
//       status: service.status,
//       serviceId: service.serviceId,
//       isActive: service.isActive,
//       hasPendingChanges: !!service.pendingChanges
//     });
    
//     const now = new Date();
//     let emailActionType = 'rejection';
//     let actionDescription = 'Service rejected';

//     // CRITICAL: Generate Service ID if not already assigned
//     if (!service.serviceId) {
//       service.serviceId = await generateServiceSerial();
//       console.log(`🆔 Assigned Service ID: ${service.serviceId} during rejection`);
//     }

//     // Case 1: Rejecting a brand new service
//     if (service.status === 'pending_approval' && !service.pendingChanges) {
//       actionDescription = 'New service submission rejected.';
//       emailActionType = 'rejection';
      
//       // Set rejected status and all related fields
//       service.status = 'rejected';
//       service.isActive = false;
//       service.availabilityStatus = 'No Longer Available';
//       service.rejectedAt = now;
//       service.rejectedBy = req.user.userId;
//       service.rejectionReason = reason.trim();
      
//       // Add to status history
//       service.statusHistory.push({ 
//         status: 'rejected', 
//         changedAt: now, 
//         changedBy: req.user.userId, 
//         reason: `Admin rejected: ${reason.trim()}`
//       });
      
//       // Add to approval history
//       service.approvalHistory.push({ 
//         action: 'rejected', 
//         adminId: req.user.userId, 
//         reason: reason.trim(), 
//         timestamp: now 
//       });
//     } 
//     // Case 2: Rejecting pending changes on an approved service
//     else if (service.pendingChanges) {
//       const { actionType: pendingAction } = service.pendingChanges;
//       actionDescription = `Pending ${pendingAction} request rejected.`;
//       emailActionType = `${pendingAction}_rejection`;
      
//       // For pending changes rejection, keep as approved but clear pending changes
//       service.status = 'approved';
//       service.isActive = true;
//       service.availabilityStatus = 'Available';
//       service.rejectionReason = `Admin rejected pending ${pendingAction} request: ${reason.trim()}`;
      
//       service.statusHistory.push({ 
//         status: 'approved',
//         changedAt: now, 
//         changedBy: req.user.userId, 
//         reason: `Admin rejected pending ${pendingAction}: ${reason.trim()}`
//       });
      
//       service.approvalHistory.push({ 
//         action: `${pendingAction}_rejected`, 
//         adminId: req.user.userId, 
//         reason: reason.trim(), 
//         timestamp: now,
//         rejectedChanges: service.pendingChanges.changes
//       });

//       // Clear pending changes
//       service.pendingChanges = null;
//     } else {
//       return res.status(409).json({
//         success: false,
//         message: 'This service is not pending any changes that can be rejected.',
//         error: 'NO_PENDING_CHANGES'
//       });
//     }
    
//     // CRITICAL: Save the service with all updates
//     const savedService = await service.save();
    
//     console.log('✅ Service rejection processed:', {
//       id: savedService._id,
//       serviceId: savedService.serviceId,
//       status: savedService.status,
//       isActive: savedService.isActive,
//       availabilityStatus: savedService.availabilityStatus,
//       rejectedAt: savedService.rejectedAt,
//       hasPendingChanges: !!savedService.pendingChanges
//     });
    
//     // Send email notification if requested
//     if (notifyProvider) {
//       try {
//         const providerData = await User.findById(savedService.serviceProvider._id).select('fullName businessName emailAddress');
//         await sendServiceStatusUpdate(savedService, providerData, 'rejected', reason.trim(), emailActionType);
//         console.log(`✅ Rejection notification sent for service ${savedService._id}`);
//       } catch (emailError) {
//         console.error(`❌ Failed to send rejection notification for service ${savedService._id}:`, emailError);
//       }
//     }
    
//     // Return complete updated service data
//     const updatedService = await Service.findById(savedService._id)
//       .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city isOnline serviceProviderId')
//       .lean();

//     return res.json({
//       success: true,
//       message: `${actionDescription} The provider has been ${notifyProvider ? 'notified' : 'not notified'}.`,
//       service: updatedService,
//       rejectionDetails: {
//         rejectedAt: now,
//         rejectedBy: req.user.userId,
//         reason: reason.trim(),
//         serviceId: savedService.serviceId,
//         notificationSent: notifyProvider,
//         actionType: emailActionType
//       }
//     });

//   } catch (error) {
//     console.error('❌ Error rejecting service:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Failed to reject service.',
//       error: 'SERVICE_REJECTION_ERROR',
//       details: process.env.NODE_ENV === 'development' ? error.message : undefined
//     });
//   }
// };

// ENHANCED: Reject service changes with comprehensive state management
// ENHANCED: Reject service changes with comprehensive state management
// ENHANCED: Reject service changes with comprehensive state management
export const rejectServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason, notifyProvider = true } = req.body;
    
    console.log(`🔍 Admin rejecting service ${serviceId} with reason: "${reason}"`);
    
    // Enhanced validation for rejection reason
    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required and must be at least 10 characters long.',
        error: 'REJECTION_REASON_REQUIRED'
      });
    }
    
    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found.',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('🔍 Service before rejection:', {
      id: service._id,
      name: service.name,
      status: service.status,
      serviceId: service.serviceId,
      isActive: service.isActive,
      hasPendingChanges: !!service.pendingChanges,
      pendingChanges: service.pendingChanges
    });
    
    const now = new Date();
    let emailActionType = 'rejection';
    let actionDescription = 'Service rejected';

    // CRITICAL: Generate Service ID if not already assigned
    if (!service.serviceId) {
      service.serviceId = await generateServiceSerial();
      console.log(`🆔 Assigned Service ID: ${service.serviceId} during rejection`);
    }

    // Case 1: Rejecting a brand new service OR service with malformed/empty pendingChanges
    if ((service.status === 'pending_approval' && !service.pendingChanges) || 
        (service.status === 'pending_approval' && service.pendingChanges && Object.keys(service.pendingChanges).length === 0) ||
        (service.status === 'pending_approval' && service.pendingChanges && !service.pendingChanges.actionType && !service.pendingChanges.requestType)) {
      
      actionDescription = 'New service submission rejected.';
      emailActionType = 'rejection';
      
      // Clear any malformed pending changes
      if (service.pendingChanges && Object.keys(service.pendingChanges).length === 0) {
        console.log('🔧 Clearing empty pendingChanges object');
        service.pendingChanges = null;
      }
      
      // Set rejected status and all related fields
      service.status = 'rejected';
      service.isActive = false;
      service.availabilityStatus = 'No Longer Available';
      service.rejectedAt = now;
      service.rejectedBy = req.user.userId;
      service.rejectionReason = reason.trim();
      
      // Add to status history
      service.statusHistory.push({ 
        status: 'rejected', 
        changedAt: now, 
        changedBy: req.user.userId, 
        reason: `Admin rejected: ${reason.trim()}`
      });
      
      // Add to approval history
      service.approvalHistory.push({ 
        action: 'rejected', 
        adminId: req.user.userId, 
        reason: reason.trim(), 
        timestamp: now 
      });
    } 
    // Case 2: Rejecting pending changes on an approved service
    else if (service.pendingChanges && Object.keys(service.pendingChanges).length > 0) {
      // FIX: Handle undefined actionType
      const pendingAction = service.pendingChanges.actionType || service.pendingChanges.requestType;
      
      if (!pendingAction) {
        console.error('❌ Pending changes found but actionType is undefined:', service.pendingChanges);
        console.log('🔧 Clearing malformed pendingChanges and treating as new service rejection');
        
        // Clear the malformed pending changes and treat as new service rejection
        service.pendingChanges = null;
        
        // Treat this as a new service rejection
        actionDescription = 'New service submission rejected (cleared malformed pending changes).';
        emailActionType = 'rejection';
        
        service.status = 'rejected';
        service.isActive = false;
        service.availabilityStatus = 'No Longer Available';
        service.rejectedAt = now;
        service.rejectedBy = req.user.userId;
        service.rejectionReason = reason.trim();
        
        service.statusHistory.push({ 
          status: 'rejected', 
          changedAt: now, 
          changedBy: req.user.userId, 
          reason: `Admin rejected (cleared malformed pending changes): ${reason.trim()}`
        });
        
        service.approvalHistory.push({ 
          action: 'rejected', 
          adminId: req.user.userId, 
          reason: reason.trim(), 
          timestamp: now 
        });
      }     // Case 3: Service with empty/malformed pendingChanges or no pending changes
    else if (service.pendingChanges && Object.keys(service.pendingChanges).length === 0) {
      console.log('🔧 Found empty pendingChanges object, clearing and treating as new service rejection');
      service.pendingChanges = null;
      
      // Treat as new service rejection
      actionDescription = 'New service submission rejected (cleared empty pending changes).';
      emailActionType = 'rejection';
      
      service.status = 'rejected';
      service.isActive = false;
      service.availabilityStatus = 'No Longer Available';
      service.rejectedAt = now;
      service.rejectedBy = req.user.userId;
      service.rejectionReason = reason.trim();
      
      service.statusHistory.push({ 
        status: 'rejected', 
        changedAt: now, 
        changedBy: req.user.userId, 
        reason: `Admin rejected (cleared empty pending changes): ${reason.trim()}`
      });
      
      service.approvalHistory.push({ 
        action: 'rejected', 
        adminId: req.user.userId, 
        reason: reason.trim(), 
        timestamp: now 
      });
    }
        actionDescription = `Pending ${pendingAction} request rejected.`;
        emailActionType = `${pendingAction}_rejection`;
        
        // For pending changes rejection, keep as approved but clear pending changes
        service.status = 'approved';
        service.isActive = true;
        service.availabilityStatus = 'Available';
        service.rejectionReason = `Admin rejected pending ${pendingAction} request: ${reason.trim()}`;
        
        service.statusHistory.push({ 
          status: 'approved',
          changedAt: now, 
          changedBy: req.user.userId, 
          reason: `Admin rejected pending ${pendingAction}: ${reason.trim()}`
        });
        
        // FIX: Use proper action enum value
        let approvalAction;
        switch(pendingAction) {
          case 'update':
            approvalAction = 'update_rejected';
            break;
          case 'delete':
            approvalAction = 'delete_rejected';
            break;
          case 'reactivate':
            approvalAction = 'reactivate_rejected';
            break;
          default:
            approvalAction = 'rejected'; // Fallback to generic rejection
            console.warn(`⚠️ Unknown pending action: ${pendingAction}, using generic rejection`);
        }
        
        service.approvalHistory.push({ 
          action: approvalAction, 
          adminId: req.user.userId, 
          reason: reason.trim(), 
          timestamp: now,
          rejectedChanges: service.pendingChanges.changes
        });

        // Clear pending changes
        service.pendingChanges = null;
      }
    else {
      return res.status(409).json({
        success: false,
        message: 'This service is not pending any changes that can be rejected.',
        error: 'NO_PENDING_CHANGES'
      });
    }
    
    // CRITICAL: Save the service with all updates
    const savedService = await service.save();
    
    console.log('✅ Service rejection processed:', {
      id: savedService._id,
      serviceId: savedService.serviceId,
      status: savedService.status,
      isActive: savedService.isActive,
      availabilityStatus: savedService.availabilityStatus,
      rejectedAt: savedService.rejectedAt,
      hasPendingChanges: !!savedService.pendingChanges
    });
    
    // Send email notification if requested
    if (notifyProvider) {
      try {
        const providerData = await User.findById(savedService.serviceProvider._id).select('fullName businessName emailAddress');
        if (emailActionType === 'delete_rejection') {
          // Send delete request rejection email
          await sendServiceProviderDeleteRejectionEmail(providerData, reason.trim());
          console.log(`✅ Deletion request rejected email sent to provider: ${providerData.emailAddress}`);
        } else if (emailActionType === 'update_rejection') {
          // Send update request rejection email
          await sendServiceProviderUpdateRejectionEmail(providerData, reason.trim());
          console.log(`✅ Update request rejection email sent to provider: ${providerData.emailAddress}`);
        } else {
          // Generic rejection notification for new submissions or others
          await sendServiceStatusUpdate(savedService, providerData, 'rejected', reason.trim(), emailActionType);
          console.log(`✅ Generic rejection email sent for service ${savedService._id}`);
        }
      } catch (emailError) {
        console.error(`❌ Failed to send provider rejection notification for service ${savedService._id}:`, emailError);
      }
    }
    
    // Return complete updated service data
    const updatedService = await Service.findById(savedService._id)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city isOnline serviceProviderId')
      .lean();

    return res.json({
      success: true,
      message: `${actionDescription} The provider has been ${notifyProvider ? 'notified' : 'not notified'}.`,
      service: updatedService,
      rejectionDetails: {
        rejectedAt: now,
        rejectedBy: req.user.userId,
        reason: reason.trim(),
        serviceId: savedService.serviceId,
        notificationSent: notifyProvider,
        actionType: emailActionType
      }
    });

  } catch (error) {
    console.error('❌ Error rejecting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject service.',
      error: 'SERVICE_REJECTION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
//End

// Admin reject service with reason
export const adminRejectService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }
    
    console.log(`❌ Admin rejecting service: ${serviceId}, Reason: ${reason}`);

    const serviceToReject = await Service.findById(serviceId);
    if (!serviceToReject) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Store original Service ID for verification
    const originalServiceId = serviceToReject.serviceId;
    
    // CRITICAL: Generate a service ID if it doesn't already have one
    if (!serviceToReject.serviceId) {
      serviceToReject.serviceId = await generateServiceSerial();
      console.log(`🆔 Assigned new Service ID: ${serviceToReject.serviceId} for rejected service`);
    }
    
    // Update service status and rejection details
    serviceToReject.status = 'rejected';
    serviceToReject.rejectedAt = new Date();
    serviceToReject.rejectedBy = req.user.userId;
    serviceToReject.rejectionReason = reason;
    serviceToReject.isActive = false; // Service is inactive when rejected
    serviceToReject.lastUpdatedAt = new Date();

    // Track rejection in history
    serviceToReject.approvalHistory.push({
      action: 'rejected',
      adminId: req.user.userId,
      reason: reason,
      timestamp: new Date(),
      previousStatus: serviceToReject.status
    });

    // Track in status history
    serviceToReject.statusHistory.push({
      status: 'rejected',
      changedAt: new Date(),
      changedBy: req.user.userId,
      reason: reason
    });

    await serviceToReject.save();
    
    // VERIFICATION: Ensure Service ID wasn't modified during rejection
    if (originalServiceId && serviceToReject.serviceId !== originalServiceId) {
      console.error('🚨 CRITICAL: Service ID changed during rejection!');
      return res.status(500).json({
        success: false,
        message: 'Service ID consistency violation detected during rejection'
      });
    }

    await serviceToReject.populate('serviceProvider', 'businessName fullName emailAddress mobileNumber serviceProviderId');

    res.status(200).json({
      success: true,
      message: 'Service rejected successfully',
      service: serviceToReject
    });

  } catch (error) {
    console.error('Error rejecting service:', error);
    res.status(500).json({
      success: false,
      message: 'Error rejecting service',
      error: error.message
    });
  }
};