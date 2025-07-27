//controllers/serviceController.js - COMPLETE VERSION WITH ALL EXPORTS
import Service from '../models/Service.js';
import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { addServiceNotification } from '../config/notifications.js';
import { sendServiceNotificationToAdmin } from '../config/mailer.js';
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
  
  console.log('Validating service data:', {
    name: data.name || data.serviceName,
    nameLength: (data.name || data.serviceName)?.length,
    description: data.description || data.detailedDescription,
    descriptionLength: (data.description || data.detailedDescription)?.length,
    type: data.type || data.serviceType,
    category: data.category || data.targetAudience,
    pricing: data.pricing
  });
  
  // Handle both frontend field names and backend field names
  const serviceName = data.name || data.serviceName;
  const serviceDescription = data.description || data.detailedDescription;
  const serviceType = data.type || data.serviceType;
  const serviceCategory = data.category || data.targetAudience;
  
  if (!isUpdate || serviceName !== undefined) {
    if (!serviceName || typeof serviceName !== 'string' || serviceName.trim().length < 2) {
      errors.push('Service name must be at least 2 characters long');
    }
    if (serviceName && serviceName.length > 100) {
      errors.push('Service name cannot exceed 100 characters');
    }
  }
  
  if (!isUpdate || serviceType !== undefined) {
    const validTypes = [
      'Hairstyle', 'Haircuts', 'Hair Color', 'Nail Art', 'Manicure', 'Pedicure',
      'Makeup', 'Bridal Makeup', 'Party Makeup', 'Threading', 'Eyebrow Shaping',
      'Facial', 'Skincare', 'Massage', 'Saree Draping', 'Hair Extensions',
      'Keratin Treatment', 'Hair Wash', 'Head Massage', 'Mehendi/Henna', 'Other'
    ];
    if (!serviceType || !validTypes.includes(serviceType)) {
      errors.push('Invalid service type');
    }
  }
  
  if (!isUpdate || serviceCategory !== undefined) {
    const validCategories = ['Kids', 'Women', 'Men', 'Unisex'];
    if (!serviceCategory || !validCategories.includes(serviceCategory)) {
      errors.push('Invalid service category');
    }
  }
  
  if (!isUpdate || serviceDescription !== undefined) {
    if (!serviceDescription || typeof serviceDescription !== 'string') {
      errors.push('Service description is required');
    } else {
      const trimmedDescription = serviceDescription.trim();
      if (trimmedDescription.length < 5) {
        errors.push('Service description must be at least 5 characters long');
      } else if (trimmedDescription.length > 2000) {
        errors.push('Service description cannot exceed 2000 characters');
      }
    }
  }
  
  // Handle pricing validation for both formats
  const pricing = data.pricing || { basePrice: data.basePrice };
  if (!isUpdate || pricing !== undefined) {
    if (!pricing || typeof pricing !== 'object') {
      errors.push('Pricing information is required');
    } else {
      const basePrice = pricing.basePrice || data.basePrice;
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
  
  console.log('Validation errors:', errors);
  return errors;
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

    console.log('Fetching provider services with query:', query);

    const services = await Service.find(query)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city averageRating reviewCount isOnline serviceProviderId')
      .sort({ createdAt: -1 });

    console.log(`Found ${services.length} services for provider ${req.user.userId}`);

    // Ensure serviceProvider is always populated
    const servicesWithProvider = services.map(service => {
      if (!service.serviceProvider) {
        console.warn(`Service ${service._id} missing serviceProvider data`);
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
    console.error('Error fetching provider services:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch services',
      error: 'SERVICE_FETCH_ERROR'
    });
  }
};

// Get all services for admin with proper population
export const getAllServicesAdmin = async (req, res) => {
  try {
    console.log('Admin fetching all services...');
    
    const services = await Service.find({})
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline serviceProviderId')
      .sort({ createdAt: -1 });

    console.log(`Found ${services.length} total services for admin`);

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
    console.error('Error fetching services for admin:', error);
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
        message: 'Service ID is required',
        error: 'SERVICE_ID_REQUIRED'
      });
    }

    if (!serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
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
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    // Check access permissions - only service provider or admin can view pending services
    const canAccess = req.user.role === 'admin' || 
                     service.serviceProvider._id.toString() === req.user.userId ||
                     (service.status === 'approved' && req.user.role === 'customer');
    
    if (!canAccess) {
      return res.status(403).json({
        message: 'Access denied. You can only view approved services or your own services.',
        error: 'SERVICE_ACCESS_DENIED'
      });
    }
    
    res.json({
      success: true,
      service
    });
  } catch (error) {
    console.error('Error fetching service:', error);
    res.status(500).json({
      message: 'Failed to fetch service details',
      error: 'SERVICE_DETAIL_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Create new service (pending approval)
export const createService = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        message: 'User authentication required',
        error: 'USER_NOT_AUTHENTICATED'
      });
    }

    console.log('Create service request - User ID:', req.user.userId);
    console.log('Create service request body:', req.body);

    const serviceData = { ...req.body };

    // Enhanced field mapping to handle both frontend formats
    const mappedServiceData = {
      name: serviceData.serviceName || serviceData.name || '',
      type: serviceData.serviceType || serviceData.type || '',
      serviceSubType: serviceData.serviceSubType || '',
      category: serviceData.targetAudience || serviceData.category || '',
      description: serviceData.detailedDescription || serviceData.description || '',
      pricing: serviceData.pricing ? 
        (typeof serviceData.pricing === 'string' ? JSON.parse(serviceData.pricing) : serviceData.pricing) :
        {
          basePrice: serviceData.basePrice || 0,
          priceType: serviceData.priceType || 'fixed'
        },
      duration: serviceData.duration || 60,
      experienceLevel: serviceData.experienceLevel || 'beginner',
      serviceLocation: serviceData.serviceLocation || 'both',
      preparationRequired: serviceData.preparationRequired || '',
      customNotes: serviceData.customNotes || '',
      cancellationPolicy: serviceData.cancellationPolicy || '24 hours notice required',
      minLeadTime: serviceData.minLeadTime || 2,
      maxLeadTime: serviceData.maxLeadTime || 30,
      availability: serviceData.availability ? 
        (typeof serviceData.availability === 'string' ? JSON.parse(serviceData.availability) : serviceData.availability) :
        {
          days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          timeSlots: [{ start: '09:00', end: '18:00' }]
        }
    };

    // Validate service data
    const validationErrors = validateServiceData(mappedServiceData);
    if (validationErrors.length > 0) {
      console.log('Validation errors found:', validationErrors);
      return res.status(400).json({
        message: 'Validation errors found',
        error: 'VALIDATION_ERROR',
        details: validationErrors
      });
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

    // Get Provider ID only if approved, otherwise leave blank
    let providerSerial = null;
    try {
      providerSerial = await getExistingServiceProviderId(req.user.userId);
      if (!providerSerial) {
        console.log('Service provider not yet approved or has no Provider ID - service will be created without Provider ID');
      }
    } catch (error) {
      console.warn('Could not get provider ID - service will be created without Provider ID:', error.message);
    }

    const finalServiceData = {
      serviceProvider: req.user.userId,
      serviceProviderId: providerSerial || 'Not assigned',
      name: mappedServiceData.name.trim(),
      type: mappedServiceData.type,
      serviceSubType: mappedServiceData.serviceSubType || '',
      category: mappedServiceData.category,
      description: mappedServiceData.description.trim(),
      pricing: {
        basePrice: parseFloat(mappedServiceData.pricing.basePrice) || 0,
        priceType: mappedServiceData.pricing.priceType || 'fixed',
        variations: Array.isArray(mappedServiceData.pricing.variations) ? mappedServiceData.pricing.variations : [],
        addOns: Array.isArray(mappedServiceData.pricing.addOns) ? mappedServiceData.pricing.addOns : []
      },
      duration: parseInt(mappedServiceData.duration) || 60,
      experienceLevel: mappedServiceData.experienceLevel || 'beginner',
      serviceLocation: mappedServiceData.serviceLocation || 'both',
      preparationRequired: mappedServiceData.preparationRequired?.trim() || '',
      customNotes: mappedServiceData.customNotes?.trim() || '',
      cancellationPolicy: mappedServiceData.cancellationPolicy?.trim() || '24 hours notice required',
      minLeadTime: Math.max(1, parseInt(mappedServiceData.minLeadTime) || 2),
      maxLeadTime: Math.min(365, parseInt(mappedServiceData.maxLeadTime) || 30),
      availability: mappedServiceData.availability,
      images,
      status: 'pending_approval',
      isActive: false,
      isVisibleToProvider: true,
      firstSubmittedAt: new Date(),
      availabilityStatus: 'Available'
    };

    console.log('Final service data - serviceProvider field:', finalServiceData.serviceProvider);
    console.log('Final service data to save:', finalServiceData);

    const service = new Service(finalServiceData);
    
    // Add to approval history
    service.approvalHistory.push({
      action: 'create',
      reason: 'New service creation request',
      timestamp: new Date(),
      previousData: null
    });
    
    // Save the service
    const savedService = await service.save();
    
    console.log('Service saved successfully:');
    console.log('- Service ID:', savedService._id);
    console.log('- Service Provider:', savedService.serviceProvider);
    console.log('- Service Name:', savedService.name);
    console.log('- Status:', savedService.status);
    
    // Get service provider details for notification
    const serviceProviderForNotification = await User.findById(req.user.userId).select('fullName businessName emailAddress');
    
    // Add notification for admin
    try {
      addServiceNotification({
        _id: service._id,
        name: service.name,
        type: service.type,
        status: service.status,
        serviceProvider: serviceProviderForNotification
      }, 'created');
      console.log('Service notification added for admin');
    } catch (notificationError) {
      console.error('Failed to add service notification:', notificationError);
    }
    
    res.status(201).json({
      success: true,
      message: 'Service created and submitted for approval',
      service: {
        id: savedService._id,
        name: savedService.name,
        status: savedService.status,
        serviceProvider: savedService.serviceProvider,
        createdAt: savedService.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating service:', error);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Service validation failed',
        error: 'MONGOOSE_VALIDATION_ERROR',
        details: validationErrors
      });
    }

    res.status(500).json({
      message: 'Failed to create service',
      error: 'SERVICE_CREATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update service - handle pending changes properly
export const updateService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const updateData = req.body;
    const userId = req.user.userId;

    console.log(`Service provider ${userId} updating service ${serviceId}`);
    console.log('Update data received:', updateData);

    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }

    // Check if user owns this service
    if (service.serviceProvider.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own services',
        error: 'ACCESS_DENIED'
      });
    }

    // Check if service is already approved before requiring admin approval
    if (service.status === 'approved') {
      service.pendingChanges = {
        actionType: 'update',
        changes: updateData,
        reason: 'Service update requested by provider',
        requestedAt: new Date(),
        requestType: 'update',
        originalData: {
          name: service.name,
          type: service.type,
          category: service.category,
          description: service.description,
          pricing: service.pricing
        }
      };
      // Don't change status to pending_approval, keep as approved with pending changes
      await service.save();
      
      return res.json({
        success: true,
        message: 'Successfully submitted. Please wait for admin response.',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          hasPendingChanges: true
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
    
    // Record in history
    service.approvalHistory.push({
      action: 'update_requested',
      reason: 'Service update request submitted',
      timestamp: new Date()
    });
    
    await service.save();
    
    return res.json({
      success: true,
      message: 'Service update submitted for admin approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        hasPendingChanges: true,
        pendingChanges: service.pendingChanges
      }
    });

  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update service',
      error: 'SERVICE_UPDATE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Delete service - handle pending changes properly
export const deleteService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.userId;

    console.log(`Service provider ${userId} requesting deletion of service ${serviceId}`);

    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }

    // Check if user owns this service
    if (service.serviceProvider.toString() !== userId) {
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
        changes: null,
        reason: 'Service deletion requested by provider',
        requestedAt: new Date(),
        requestType: 'delete'
      };
      
      // Don't actually delete until admin approves
      service.availabilityStatus = 'No Longer Available';
      service.isVisibleToProvider = false; // Hide from provider until admin processes
      
      await service.save();
      
      return res.json({
        success: true,
        message: 'Successfully submitted. Please wait for admin response.',
        service: { id: service._id, pendingDeletion: true }
      });
    }

    // For non-approved services, delete immediately
    service.status = 'deleted';
    service.deletedAt = new Date();
    service.isActive = false;
    service.isVisibleToProvider = false;
    
    // Record in approval history
    service.approvalHistory.push({
      action: 'delete_requested',
      reason: 'Service deletion request submitted',
      timestamp: new Date()
    });
    
    await service.save();
    
    return res.json({
      success: true,
      message: 'Service deletion request submitted for admin approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        pendingDeletion: true
      }
    });

  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete service',
      error: 'SERVICE_DELETE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ADMIN FUNCTIONS

// Get all pending service approvals
export const getPendingServiceApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    console.log('Fetching pending services for admin...');

    // Query for ALL types of pending services
    const pendingQuery = {
      $or: [
        { status: 'pending_approval' }, // New services waiting for approval
        { 
          pendingChanges: { $exists: true, $ne: null },
          status: { $in: ['approved', 'pending_approval'] } // Existing services with pending changes
        }
      ]
    };

    console.log('Pending services query:', JSON.stringify(pendingQuery, null, 2));

    const pendingServices = await Service.find(pendingQuery)
      .populate('serviceProvider', 'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline serviceProviderId')
      .populate('approvalHistory.adminId', 'fullName')
      .sort({ createdAt: -1, updatedAt: -1 })
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const totalPending = await Service.countDocuments(pendingQuery);

    // Enhanced debugging and categorization with better provider info
    const servicesWithDebugInfo = pendingServices.map(service => {
      const isNewService = service.status === 'pending_approval' && !service.pendingChanges;
      const hasChanges = !!service.pendingChanges;
      const requestType = service.pendingChanges?.actionType || service.pendingChanges?.requestType || 'create';
      
      return {
        ...service,
        requestType,
        isNewService,
        hasChanges,
        serviceProvider: service.serviceProvider || {
          _id: 'unknown',
          fullName: 'Unknown Provider',
          businessName: 'Unknown Business',
          emailAddress: 'unknown@email.com'
        },
        debugInfo: {
          status: service.status,
          hasPendingChanges: hasChanges,
          pendingActionType: service.pendingChanges?.actionType,
          createdAt: service.createdAt,
          updatedAt: service.updatedAt
        }
      };
    });

    console.log(`Found ${totalPending} pending services:`);
    servicesWithDebugInfo.forEach((s, index) => {
      console.log(`${index + 1}. ${s.name} - Status: ${s.status}, Type: ${s.requestType}, Provider: ${s.serviceProvider?.fullName || 'Unknown'}`);
    });

    res.json({
      success: true,
      pendingServices: servicesWithDebugInfo,
      totalPending,
      pagination: {
        currentPage: pageNum,
        totalPages: Math.ceil(totalPending / limitNum),
        totalPending,
        hasNextPage: pageNum < Math.ceil(totalPending / limitNum),
        hasPrevPage: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending service approvals',
      error: 'PENDING_APPROVALS_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get service history for admin (including deleted)
export const getServiceHistory = async (req, res) => {
  try {
    const { providerId } = req.query;
    const services = await Service.getAdminHistory(providerId);
    res.json({ services });
  } catch (error) {
    console.error('Error fetching service history:', error);
    res.status(500).json({ message: 'Server error fetching service history' });
  }
};

// Approve service changes - handle both new services and updates
export const approveServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    console.log(`Admin approving service ${serviceId} with reason:`, reason);
    
    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress serviceProviderId');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('Service before approval:', { 
      id: service._id, 
      name: service.name, 
      status: service.status,
      isActive: service.isActive,
      hasPendingChanges: !!service.pendingChanges,
      currentProviderId: service.serviceProviderId
    });
    
    // Handle new service approval (first time approval)
    if (service.status === 'pending_approval' && !service.pendingChanges) {
      service.status = 'approved';
      service.isActive = true;
      service.approvalDate = new Date();

      // Always generate service ID on first approval
      if (!service.serviceId) {
        service.serviceId = await generateServiceSerial();
      }

      // Update serviceProviderId from the approved provider
      if (service.serviceProvider && service.serviceProvider.serviceProviderId) {
        service.serviceProviderId = service.serviceProvider.serviceProviderId;
        console.log('Updated service with Provider ID:', service.serviceProvider.serviceProviderId);
      } else {
        console.warn('Service provider does not have a Provider ID yet');
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
      
      // Add approval to history
      service.approvalHistory.push({
        action: 'approved',
        adminId: req.user.userId,
        reason: reason || 'Service approved by admin',
        timestamp: new Date()
      });
      
      await service.save();
      
      console.log('Service after approval:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive,
        serviceId: service.serviceId,
        serviceProviderId: service.serviceProviderId
      });
      
      return res.json({
        success: true,
        message: 'Service approved successfully',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          isActive: service.isActive,
          serviceId: service.serviceId,
          approvedAt: new Date()
        }
      });
    }
    
    // Handle services with pending changes (updates)
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
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'update_approved',
          adminId: req.user.userId,
          reason: reason || 'Service updates approved by admin',
          timestamp: new Date(),
          previousData: originalData,
          appliedChanges: changes
        });
        
      } else if (actionType === 'delete') {
        // Handle deletion approval
        service.status = 'deleted';
        service.isActive = false;
        service.availabilityStatus = 'No Longer Available';
        service.deletedAt = new Date();
        service.deletedBy = req.user.userId;
        service.isVisibleToProvider = false;
        
        // Clear pending changes
        service.pendingChanges = null;
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'delete_approved',
          adminId: req.user.userId,
          reason: reason || 'Service deletion approved by admin',
          timestamp: new Date()
        });
        
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
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'reactivate_approved',
          adminId: req.user.userId,
          reason: reason || 'Service reactivation approved by admin',
          timestamp: new Date()
        });
      }
      
      await service.save();
      
      console.log('Service changes approved:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive,
        actionType
      });
      
      return res.json({
        success: true,
        message: `Service ${actionType} approved successfully`,
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
    console.error('Error approving service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve service',
      error: 'SERVICE_APPROVAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Reject service changes
export const rejectServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    console.log(`Admin rejecting service ${serviceId} with reason:`, reason);
    
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
    
    console.log('Service before rejection:', { 
      id: service._id, 
      name: service.name, 
      status: service.status,
      isActive: service.isActive
    });
    
    // Direct status update for new services
    if (service.status === 'pending_approval') {
      service.status = 'rejected';
      service.isActive = false;
      service.rejectedAt = new Date();
      service.rejectedBy = req.user.userId;
      service.rejectionReason = reason.trim();
      
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
      
      console.log('Service after rejection:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive
      });
      
      return res.json({
        success: true,
        message: 'Service rejected',
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
      await service.rejectChanges(req.user.userId, reason.trim());
      
      return res.json({
        success: true,
        message: 'Service changes rejected',
        service: {
          id: service._id,
          name: service.name,
          status: service.status,
          rejectedAt: new Date()
        }
      });
    }
    
    return res.status(409).json({
      success: false,
      message: 'No pending changes to reject',
      error: 'NO_PENDING_CHANGES'
    });
    
  } catch (error) {
    console.error('Error rejecting service:', error);
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

    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        message: 'Page number must be a positive integer',
        error: 'INVALID_PAGE_NUMBER'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        message: 'Limit must be between 1 and 100',
        error: 'INVALID_LIMIT'
      });
    }

    // Build query
    let query = {};

    if (providerId) {
        query.serviceProvider = providerId;
    }
    
    if (status && ['draft', 'pending_approval', 'active', 'inactive', 'rejected'].includes(status)) {
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
        'fullName businessName emailAddress mobileNumber businessType city currentAddress averageRating reviewCount isOnline'
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
    console.error('Error fetching all services for admin:', error);
    res.status(500).json({
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
    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    // Check ownership
    if (service.serviceProvider.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // Only allow reactivation if service is currently hidden
    if (service.isVisibleToProvider) {
      return res.status(400).json({ message: 'Service is already active' });
    }

    await service.requestApproval('reactivate', {}, 'Service reactivation request');
    
    res.json({
      message: 'Service reactivation submitted for approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status
      }
    });
  } catch (error) {
    console.error('Error reactivating service:', error);
    res.status(500).json({ message: 'Server error reactivating service' });
  }
};

// List all approved services for customers
export const listApprovedServices = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, type, category, minPrice, maxPrice, sortBy = 'createdAt', sortOrder = 'desc', providerId } = req.query;

    // Validate pagination parameters
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({ message: 'Page number must be a positive integer', error: 'INVALID_PAGE_NUMBER' });
    }
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({ message: 'Limit must be between 1 and 100', error: 'INVALID_LIMIT' });
    }

    // Build query
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

    // Sorting
    const sortOptions = {};
    const validSortBy = ['createdAt', 'name', 'pricing.basePrice', 'duration'];
    if (validSortBy.includes(sortBy)) {
      sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOptions['createdAt'] = -1; // Default sort
    }

    const services = await Service.find(query)
      .populate('serviceProvider', 'businessName')
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
    console.error('Error fetching approved services:', error);
    res.status(500).json({
      message: 'Failed to fetch approved services',
      error: 'APPROVED_SERVICE_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// controllers/serviceController.js - CRITICAL UPDATES
// Add this function to sync provider IDs when a provider gets approved

export const syncServiceProviderIds = async (userId, newProviderId) => {
  try {
    console.log(`🔄 Syncing Provider IDs for user ${userId} to ${newProviderId}`);
    
    // Update all services for this provider
    const serviceUpdateResult = await Service.updateMany(
      { serviceProvider: userId },
      { serviceProviderId: newProviderId }
    );
    
    console.log(`✅ Updated ${serviceUpdateResult.modifiedCount} services with Provider ID: ${newProviderId}`);
    
    return serviceUpdateResult;
  } catch (error) {
    console.error('Error syncing service provider IDs:', error);
    throw error;
  }
};

// Update the approveServiceChanges function with better Provider ID handling
export const approveServiceChangesFixed = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    console.log(`Admin approving service ${serviceId} with reason:`, reason);
    
    const service = await Service.findById(serviceId).populate('serviceProvider', 'fullName businessName emailAddress serviceProviderId approvalStatus');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('Service before approval:', { 
      id: service._id, 
      name: service.name, 
      status: service.status,
      isActive: service.isActive,
      hasPendingChanges: !!service.pendingChanges,
      currentProviderId: service.serviceProviderId,
      providerApprovalStatus: service.serviceProvider?.approvalStatus
    });
    
    // 🔧 CRITICAL FIX: Check if provider is approved before proceeding
    if (service.serviceProvider.approvalStatus !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve service - service provider is not yet approved',
        error: 'PROVIDER_NOT_APPROVED'
      });
    }
    
    // Handle new service approval (first time approval)
    if (service.status === 'pending_approval' && !service.pendingChanges) {
      service.status = 'approved';
      service.isActive = true;
      service.approvalDate = new Date();

      // Always generate service ID on first approval
      if (!service.serviceId) {
        service.serviceId = await generateServiceSerial();
      }

      // 🔧 CRITICAL FIX: Always update serviceProviderId from approved provider
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
      
      // Add approval to history
      service.approvalHistory.push({
        action: 'approved',
        adminId: req.user.userId,
        reason: reason || 'Service approved by admin',
        timestamp: new Date()
      });
      
      await service.save();
      
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
        message: 'Service approved successfully',
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
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'update_approved',
          adminId: req.user.userId,
          reason: reason || 'Service updates approved by admin',
          timestamp: new Date(),
          previousData: originalData,
          appliedChanges: changes
        });
        
      } else if (actionType === 'delete') {
        // Handle deletion approval
        service.status = 'deleted';
        service.isActive = false;
        service.availabilityStatus = 'No Longer Available';
        service.deletedAt = new Date();
        service.deletedBy = req.user.userId;
        service.isVisibleToProvider = false;
        
        // Clear pending changes
        service.pendingChanges = null;
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'delete_approved',
          adminId: req.user.userId,
          reason: reason || 'Service deletion approved by admin',
          timestamp: new Date()
        });
        
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
        
        // Add to approval history
        service.approvalHistory.push({
          action: 'reactivate_approved',
          adminId: req.user.userId,
          reason: reason || 'Service reactivation approved by admin',
          timestamp: new Date()
        });
      }
      
      await service.save();
      
      console.log('✅ Service changes approved:', { 
        id: service._id, 
        name: service.name, 
        status: service.status,
        isActive: service.isActive,
        actionType
      });
      
      return res.json({
        success: true,
        message: `Service ${actionType} approved successfully`,
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
    console.error('Error approving service:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve service',
      error: 'SERVICE_APPROVAL_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};