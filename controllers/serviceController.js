// controllers/serviceController.js - COMPLETELY FIXED VERSION
import Service from '../models/Service.js';
import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import mailer from '../config/mailer.js';
const { sendServiceNotificationToAdmin, sendServiceStatusUpdate } = mailer;
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

// FIXED: Enhanced validation helper
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
// FIXED: Create new service with proper error handling and timestamps
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

    // FIXED: Set proper timestamps at creation
    const now = new Date();
    const completeServiceData = {
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
      availabilityStatus: 'Available',
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

// Get all pending service approvals with proper labeling
export const getPendingServiceApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    console.log('🔍 Fetching pending services for admin...');

    const pendingQuery = {
      $or: [
        { status: 'pending_approval' },
        { 
          pendingChanges: { $exists: true, $ne: null },
          status: { $in: ['approved', 'pending_approval'] }
        }
      ]
    };

    console.log('🔍 Pending services query:', JSON.stringify(pendingQuery, null, 2));

    const pendingServices = await Service.find(pendingQuery)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline serviceProviderId')
      .populate('approvalHistory.adminId', 'fullName')
      .sort({ createdAt: -1, updatedAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const totalPending = await Service.countDocuments(pendingQuery);

    // Add proper request type labels and categorization
    const servicesWithEnhancedLabeling = pendingServices.map(service => {
      const isNewService = service.status === 'pending_approval' && !service.pendingChanges;
      const hasChanges = !!service.pendingChanges;
      
      let requestType = 'New Service';
      let requestLabel = 'New Service';
      let requestDescription = 'New service submission awaiting approval';
      let requestPriority = 'normal';
      let requestColor = '#2196f3';
      
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
        requestType,
        requestLabel,
        requestDescription,
        requestPriority,
        requestColor,
        isNewService,
        hasChanges,
        serviceProvider: service.serviceProvider || {
          _id: 'unknown',
          fullName: 'Unknown Provider',
          businessName: 'Unknown Business',
          emailAddress: 'unknown@email.com'
        },
        adminDebugInfo: {
          status: service.status,
          hasPendingChanges: hasChanges,
          pendingActionType: service.pendingChanges?.actionType,
          submittedAt: service.firstSubmittedAt || service.createdAt,
          lastModified: service.updatedAt,
          serviceId: service.serviceId || 'Pending Assignment'
        }
      };
    });

    console.log(`✅ Found ${totalPending} pending services with labels:`);
    servicesWithEnhancedLabeling.forEach((s, index) => {
      console.log(`${index + 1}. "${s.name}" - ${s.requestLabel} (${s.requestType}) - Provider: ${s.serviceProvider?.fullName || 'Unknown'}`);
    });

    res.json({
      success: true,
      pendingServices: servicesWithEnhancedLabeling,
      totalPending,
      requestTypesSummary: {
        newServices: servicesWithEnhancedLabeling.filter(s => s.requestType === 'New Service').length,
        updateRequests: servicesWithEnhancedLabeling.filter(s => s.requestType === 'Update Request').length,
        deleteRequests: servicesWithEnhancedLabeling.filter(s => s.requestType === 'Delete Request').length,
        reactivateRequests: servicesWithEnhancedLabeling.filter(s => s.requestType === 'Reactivate Request').length
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

// Get all services for admin
export const getAllServicesAdmin = async (req, res) => {
  try {
    console.log('🔍 Admin fetching all services...');
    
    const services = await Service.find({})
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline serviceProviderId')
      .sort({ createdAt: -1 });

    console.log(`✅ Found ${services.length} total services for admin`);

    res.json({
      success: true,
      services: services,
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

// Approve service changes - ENHANCED version
export const approveServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    console.log(`🔍 Admin approving service ${serviceId} with reason:`, reason);
    
    // Retrieve full mongoose document (no lean) to allow saves
    const service = await Service.findById(serviceId)
      .populate('serviceProvider', 'fullName businessName emailAddress serviceProviderId approvalStatus');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('🔍 Service before approval:', { 
      id: service._id, 
      name: service.name, 
      status: service.status,
      isActive: service.isActive,
      hasPendingChanges: !!service.pendingChanges,
      currentProviderId: service.serviceProviderId,
      providerApprovalStatus: service.serviceProvider?.approvalStatus
    });
    
    // Check if provider is approved before proceeding
    if (service.serviceProvider.approvalStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve service - service provider is not yet approved',
        error: 'PROVIDER_NOT_APPROVED'
      });
    }
    
    // Handle only explicit pendingChanges (update/delete/reactivate) first
    if (service.pendingChanges && service.pendingChanges.actionType) {
      const { changes, actionType } = service.pendingChanges;
      const historyAction = `${actionType}_approved`;
      
      const originalData = { /* ...existing code... */ };
      // Process update
      if (actionType === 'update') {
        Object.keys(changes).forEach(key => service[key] = changes[key]);
        service.status = 'approved';
        service.isActive = true;
        service.lastUpdatedAt = new Date();
        service.availabilityStatus = 'Available';
      }
      // Process delete
      if (actionType === 'delete') {
        service.status = 'deleted';
        service.isActive = false;
        service.deletedAt = new Date();
        service.availabilityStatus = 'No Longer Available';
      }
      service.pendingChanges = null;
      service.statusHistory.push({ status: service.status, changedAt: new Date(), changedBy: req.user.userId, reason: reason });
  service.approvalHistory.push({ action: historyAction, adminId: req.user.userId, reason: reason, timestamp: new Date(), previousData: originalData, appliedChanges: changes });
      await service.save();
      // send notification etc.
      return res.json({ success: true, message: 'Service changes approved.', service: { id: service._id, status: service.status } });
    }
  // Handle new service approval (first time or fallback when no explicit pendingChanges)
  if (service.status === 'pending_approval') {
      service.status = 'approved';
      service.isActive = true;
      service.approvalDate = new Date();

      // Always generate service ID on first approval
      if (!service.serviceId) {
        service.serviceId = await generateServiceSerial();
      }

      // Always update serviceProviderId from approved provider
      if (service.serviceProvider && service.serviceProvider.serviceProviderId) {
        service.serviceProviderId = service.serviceProvider.serviceProviderId;
        console.log('✅ Updated service with Provider ID:', service.serviceProvider.serviceProviderId);
      } else {
        console.error('❌ Service provider does not have a Provider ID despite being approved!');
        return res.status(500).json({
          success: false,
          message: 'Service provider missing Provider ID',
          error: 'PROVIDER_ID_MISSING'
        });
      }

      // Set audit fields for first approval
      if (!service.firstApprovedAt) {
        service.firstApprovedAt = new Date();
      } else {
        service.lastUpdatedAt = new Date();
      }

      service.availabilityStatus = 'Available';
      
      // Clear any pending changes
      if (service.pendingChanges) {
        service.pendingChanges = null;
      }
      
      // Add to status history
      service.statusHistory.push({
        status: 'approved',
        changedAt: new Date(),
        changedBy: req.user.userId,
        reason: reason || 'Service approved by admin'
      });
      
      // Add approval to history
      service.approvalHistory.push({
        action: 'approved',
        adminId: req.user.userId,
        reason: reason || 'Service approved by admin',
        timestamp: new Date()
      });
      
      await service.save();
      
      // Send approval notification email to provider
      try {
        const providerData = await User.findById(service.serviceProvider._id).select('fullName businessName emailAddress');
        await sendServiceStatusUpdate(service, providerData, 'approved', reason, 'approval');
        console.log('✅ Approval notification sent to provider');
      } catch (emailError) {
        console.error('❌ Failed to send approval notification:', emailError);
      }
      
      console.log('✅ Service approved successfully:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive,
        serviceId: service.serviceId,
        serviceProviderId: service.serviceProviderId
      });
      
      return res.json({
        success: true,
        message: 'Service approved successfully. Provider has been notified via email.',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          isActive: service.isActive,
          serviceId: service.serviceId,
          serviceProviderId: service.serviceProviderId,
          approvedAt: new Date()
        }
      });
    }
    
    // Handle services with pending changes (updates/deletions)
    if (service.pendingChanges) {
      const { changes, actionType } = service.pendingChanges;
      
      // Store original data for audit trail
      const originalData = {
        name: service.name,
        type: service.type,
        serviceSubType: service.serviceSubType,
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
      
      if (actionType === 'update') {
        // Apply the pending changes
        Object.keys(changes).forEach(key => {
          if (changes[key] !== undefined) {
            service[key] = changes[key];
          }
        });
        
        service.status = 'approved';
        service.isActive = true;
        service.lastUpdatedAt = new Date();
        service.availabilityStatus = 'Available';
        
        // Clear pending changes
        service.pendingChanges = null;
        
        // Add to status history
        service.statusHistory.push({
          status: 'approved',
          changedAt: new Date(),
          changedBy: req.user.userId,
          reason: reason || 'Service update approved by admin'
        });
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'update_approved',
          adminId: req.user.userId,
          reason: reason || 'Service updates approved by admin',
          timestamp: new Date(),
          previousData: originalData,
          appliedChanges: changes
        });
        
        await service.save();
        
        // Send update approval notification
        try {
          const providerData = await User.findById(service.serviceProvider._id).select('fullName businessName emailAddress');
          await sendServiceStatusUpdate(service, providerData, 'approved', reason, 'update_approval');
          console.log('✅ Update approval notification sent to provider');
        } catch (emailError) {
          console.error('❌ Failed to send update approval notification:', emailError);
        }
        
      } else if (actionType === 'delete') {
        // Handle deletion approval - ENHANCED SOFT DELETE
        service.status = 'deleted';
        service.isActive = false;
        service.availabilityStatus = 'No Longer Available';
        service.deletedAt = new Date();
        service.deletedBy = req.user.userId;
        service.isVisibleToProvider = true; // Keep visible for read-only access
        
        // Clear pending changes
        service.pendingChanges = null;
        
        // Add to status history
        service.statusHistory.push({
          status: 'deleted',
          changedAt: new Date(),
          changedBy: req.user.userId,
          reason: reason || 'Service deletion approved by admin'
        });
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'delete_approved',
          adminId: req.user.userId,
          reason: reason || 'Service deletion approved by admin',
          timestamp: new Date()
        });
        
        await service.save();
        
        // Send deletion approval notification
        try {
          const providerData = await User.findById(service.serviceProvider._id).select('fullName businessName emailAddress');
          await sendServiceStatusUpdate(service, providerData, 'deleted', reason, 'deletion_approval');
          console.log('✅ Deletion approval notification sent to provider');
        } catch (emailError) {
          console.error('❌ Failed to send deletion approval notification:', emailError);
        }
        
      } else if (actionType === 'reactivate') {
        // Handle reactivation approval
        service.status = 'approved';
        service.isActive = true;
        service.availabilityStatus = 'Available';
        service.isVisibleToProvider = true;
        service.reactivatedAt = new Date();
        service.reactivatedBy = req.user.userId;
        
        // Clear deletion fields
        service.deletedAt = null;
        service.deletedBy = null;
        
        // Clear pending changes
        service.pendingChanges = null;
        
        // Add to status history
        service.statusHistory.push({
          status: 'approved',
          changedAt: new Date(),
          changedBy: req.user.userId,
          reason: reason || 'Service reactivation approved by admin'
        });
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'reactivate_approved',
          adminId: req.user.userId,
          reason: reason || 'Service reactivation approved by admin',
          timestamp: new Date()
        });
        
        await service.save();
        
        // Send reactivation notification
        try {
          const providerData = await User.findById(service.serviceProvider._id).select('fullName businessName emailAddress');
          await sendServiceStatusUpdate(service, providerData, 'approved', reason, 'reactivation_approval');
          console.log('✅ Reactivation notification sent to provider');
        } catch (emailError) {
          console.error('❌ Failed to send reactivation notification:', emailError);
        }
      }
      
      console.log('✅ Service changes approved:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive,
        actionType
      });
      
      return res.json({
        success: true,
        message: `Service ${actionType} approved successfully. Provider has been notified via email.`,
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          isActive: service.isActive,
          approvedAt: new Date(),
          actionType
        }
      });
    }
    
    // If service is already approved and no pending changes
    return res.status(409).json({
      success: false,
      message: 'Service is already approved or no pending changes found',
      error: 'NO_PENDING_CHANGES'
    });
    
  } catch (error) {
    console.error('❌ Error approving service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve service',
      error: 'SERVICE_APPROVAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Reject service changes - ENHANCED with email notifications
export const rejectServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    console.log(`🔍 Admin rejecting service ${serviceId} with reason:`, reason);
    
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required (minimum 5 characters)',
        error: 'REJECTION_REASON_REQUIRED'
      });
    }
    
    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('🔍 Service before rejection:', { 
      id: service._id, 
      name: service.name, 
      status: service.status,
      isActive: service.isActive
    });
    
    // Direct status update for new services
    if (service.status === 'pending_approval' && !service.pendingChanges) {
      service.status = 'rejected';
      service.isActive = false;
      service.rejectedAt = new Date();
      service.rejectedBy = req.user.userId;
      service.rejectionReason = reason.trim();
      
      // Add to status history
      service.statusHistory.push({
        status: 'rejected',
        changedAt: new Date(),
        changedBy: req.user.userId,
        reason: reason.trim()
      });
      
      // Clear any pending changes
      if (service.pendingChanges) {
        service.pendingChanges = null;
      }
      
      // Add rejection to history
      service.approvalHistory.push({
        action: 'rejected',
        adminId: req.user.userId,
        reason: reason.trim(),
        timestamp: new Date()
      });
      
      await service.save();
      
      // Send rejection notification email
      try {
        const providerData = await User.findById(service.serviceProvider._id).select('fullName businessName emailAddress');
        await sendServiceStatusUpdate(service, providerData, 'rejected', reason, 'rejection');
        console.log('✅ Rejection notification sent to provider');
      } catch (emailError) {
        console.error('❌ Failed to send rejection notification:', emailError);
      }
      
      console.log('✅ Service after rejection:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive
      });
      
      return res.json({
        success: true,
        message: 'Service rejected. Provider has been notified via email.',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          isActive: service.isActive,
          rejectedAt: new Date(),
          rejectionReason: service.rejectionReason
        }
      });
    }
    
    // Handle services with pending changes
    if (service.pendingChanges) {
      const actionType = service.pendingChanges.actionType;
      // Determine valid actions or fallback
      const historyAction = actionType ? `${actionType}_rejected` : 'rejected';
      const emailActionType = actionType ? `${actionType}_rejection` : 'rejection';
      const historyReason = actionType ? `${actionType} request rejected: ${reason.trim()}` : reason.trim();

      // Clear pending changes without applying them
      service.pendingChanges = null;
      service.rejectedAt = new Date();
      service.rejectedBy = req.user.userId;
      service.rejectionReason = reason.trim();

      // Add to status history
      service.statusHistory.push({
        status: service.status,
        changedAt: new Date(),
        changedBy: req.user.userId,
        reason: historyReason
      });

      // Add rejection to approval history
      service.approvalHistory.push({
        action: historyAction,
        adminId: req.user.userId,
        reason: reason.trim(),
        timestamp: new Date()
      });

      await service.save();

      // Send rejection notification for pending changes
      try {
        const providerData = await User.findById(service.serviceProvider._id)
          .select('fullName businessName emailAddress');
        await sendServiceStatusUpdate(
          service,
          providerData,
          'rejected',
          reason,
          emailActionType
        );
        console.log(`✅ ${emailActionType} notification sent to provider`);
      } catch (emailError) {
        console.error(`❌ Failed to send ${emailActionType} notification:`, emailError);
      }

      return res.json({
        success: true,
        message: `Service ${actionType || ''} request rejected. Provider has been notified via email.`,
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          rejectedAt: service.rejectedAt,
          actionType: actionType
        }
      });
    }
    
    return res.status(409).json({
      success: false,
      message: 'No pending changes to reject',
      error: 'NO_PENDING_CHANGES'
    });
    
  } catch (error) {
    console.error('❌ Error rejecting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject service',
      error: 'SERVICE_REJECTION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// List all services for admin
export const listAllServicesForAdmin = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search, providerId } = req.query;

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

    let query = {};

    if (providerId) {
        query.serviceProvider = providerId;
    }
    
    if (status && ['draft', 'pending_approval', 'approved', 'inactive', 'rejected', 'deleted'].includes(status)) {
      query.status = status;
    }
    
    if (search && search.trim()) {
      query.$or = [
        { name: { $regex: search.trim(), $options: 'i' } },
        { type: { $regex: search.trim(), $options: 'i' } },
        { category: { $regex: search.trim(), $options: 'i' } }
      ];
    }

    const services = await Service.find(query)
      .populate(
        'serviceProvider',
        'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline serviceProviderId'
      )
      .sort({ createdAt: -1 })
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
    console.error('❌ Error fetching all services for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services for admin',
      error: 'ADMIN_SERVICE_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Reactivate deleted service (request approval)
export const reactivateService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({ 
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    // Check ownership
    if (service.serviceProvider._id.toString() !== req.user.userId) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied',
        error: 'ACCESS_DENIED'
      });
    }
    
    // Only allow reactivation if service is currently deleted
    if (service.status !== 'deleted') {
      return res.status(400).json({ 
        success: false,
        message: 'Service is not deleted',
        error: 'SERVICE_NOT_DELETED'
      });
    }

    service.pendingChanges = {
      actionType: 'reactivate',
      changes: {},
      reason: 'Service reactivation request',
      requestedAt: new Date(),
      requestType: 'reactivate'
    };
    
    service.approvalHistory.push({
      action: 'reactivate_requested',
      reason: 'Service reactivation request submitted',
      timestamp: new Date()
    });
    
    await service.save();
    
    // Send notification to admin with proper labeling
    try {
      const reactivateNotificationData = {
        _id: service._id,
        name: service.name,
        type: service.type,
        category: service.category,
        action: 'reactivate',
        requestType: 'Reactivate Request',
        submittedAt: new Date()
      };

      await sendServiceNotificationToAdmin(reactivateNotificationData, service.serviceProvider);
      console.log('✅ Reactivation request notification sent to admin with label: Reactivate Request');
    } catch (notificationError) {
      console.error('❌ Failed to send reactivation notification to admin:', notificationError);
    }
    
    res.json({
      success: true,
      message: 'Service reactivation request submitted for approval. You will receive an email notification once the admin reviews your request.',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        pendingReactivation: true,
        requestType: 'Reactivate Request'
      }
    });
  } catch (error) {
    console.error('❌ Error reactivating service:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error reactivating service',
      error: 'SERVICE_REACTIVATION_ERROR'
    });
  }
};

// List all approved services for customers
export const listApprovedServices = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, category, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc', providerId } = req.query;

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
    const { providerId } = req.query;
    const services = await Service.getAdminHistory(providerId);
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