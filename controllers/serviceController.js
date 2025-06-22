import Service from '../models/Service.js';
import User from '../models/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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
    name: data.name,
    nameLength: data.name?.length,
    description: data.description,
    descriptionLength: data.description?.length,
    type: data.type,
    category: data.category,
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
      'Hairstyle', 'Haircuts', 'Hair Color', 'Nail Art', 'Manicure', 'Pedicure',
      'Makeup', 'Bridal Makeup', 'Party Makeup', 'Threading', 'Eyebrow Shaping',
      'Facial', 'Skincare', 'Massage', 'Saree Draping', 'Hair Extensions',
      'Keratin Treatment', 'Hair Wash', 'Head Massage', 'Other'
    ];
    if (!data.type || !validTypes.includes(data.type)) {
      errors.push('Invalid service type');
    }
  }
  
  if (!isUpdate || data.category !== undefined) {
    const validCategories = ['Kids', 'Women', 'Men', 'Unisex', 'Bridal', 'Party', 'Traditional', 'Casual'];
    if (!data.category || !validCategories.includes(data.category)) {
      errors.push('Invalid service category');
    }
  }
  
  if (!isUpdate || data.description !== undefined) {
    // More lenient description validation - check if description exists and has meaningful content
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
  
  if (!isUpdate || data.pricing !== undefined) {
    if (!data.pricing || typeof data.pricing !== 'object') {
      errors.push('Pricing information is required');
    } else {
      if (!data.pricing.basePrice || isNaN(parseFloat(data.pricing.basePrice)) || parseFloat(data.pricing.basePrice) <= 0) {
        errors.push('Valid base price is required (must be greater than 0)');
      }
      const basePrice = parseFloat(data.pricing.basePrice);
      if (basePrice > 1000000) {
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

// Get all services for a service provider (visible only)
export const getProviderServices = async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        message: 'User authentication required',
        error: 'USER_NOT_AUTHENTICATED'
      });
    }

    const { page = 1, limit = 10, status, search } = req.query;
    
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
    let query = { serviceProvider: req.user.userId, isVisibleToProvider: true };
    
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
    console.error('Error fetching provider services:', error);
    res.status(500).json({
      message: 'Failed to fetch services',
      error: 'SERVICE_FETCH_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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

    // Validate MongoDB ObjectId format
    if (!serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: 'Invalid service ID format',
        error: 'INVALID_SERVICE_ID_FORMAT'
      });
    }

    const service = await Service.findById(serviceId)
      .populate('serviceProvider', 'fullName businessName emailAddress')
      .populate('approvalHistory.adminId', 'fullName')
      .lean();
    
    if (!service) {
      return res.status(404).json({
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    // Check access permissions
    const canAccess = req.user.role === 'admin' || 
                     service.serviceProvider._id.toString() === req.user.userId;
    
    if (!canAccess) {
      return res.status(403).json({
        message: 'Access denied. You can only view your own services.',
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

    const serviceData = { ...req.body };

    // Parse JSON strings if needed
    try {
      if (typeof serviceData.pricing === 'string') {
        serviceData.pricing = JSON.parse(serviceData.pricing);
      }
      if (typeof serviceData.availability === 'string') {
        serviceData.availability = JSON.parse(serviceData.availability);
      }
      if (typeof serviceData.tags === 'string') {
        serviceData.tags = JSON.parse(serviceData.tags);
      }
    } catch (parseError) {
      return res.status(400).json({
        message: 'Invalid JSON data provided',
        error: 'JSON_PARSE_ERROR',
        details: parseError.message
      });
    }

    // Validate service data
    const validationErrors = validateServiceData(serviceData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        message: 'Validation errors found',
        error: 'VALIDATION_ERROR',
        details: validationErrors
      });
    }

    // Check if user has reached service limit (e.g., 50 services max)
    const existingServicesCount = await Service.countDocuments({
      serviceProvider: req.user.userId,
      isVisibleToProvider: true
    });

    if (existingServicesCount >= 50) {
      return res.status(400).json({
        message: 'Maximum service limit reached (50 services)',
        error: 'SERVICE_LIMIT_EXCEEDED'
      });
    }

    // Process uploaded images with error handling
    let images = [];
    if (req.files && req.files.length > 0) {
      try {
        images = req.files.map(file => ({
          url: `/uploads/services/${file.filename}`,
          description: '',
          isPrimary: false
        }));
        
        if (images.length > 0) {
          images[0].isPrimary = true;
        }
      } catch (fileError) {
        console.error('File processing error:', fileError);
        return res.status(400).json({
          message: 'Error processing uploaded images',
          error: 'FILE_PROCESSING_ERROR'
        });
      }
    }

    // Create service data object
    const finalServiceData = {
      serviceProvider: req.user.userId,
      name: serviceData.name?.trim(),
      type: serviceData.type,
      category: serviceData.category,
      description: serviceData.description?.trim(),
      pricing: {
        basePrice: parseFloat(serviceData.pricing.basePrice),
        priceType: serviceData.pricing.priceType || 'fixed',
        variations: serviceData.pricing.variations || [],
        addOns: serviceData.pricing.addOns || []
      },
      duration: parseInt(serviceData.duration) || 60,
      experienceLevel: serviceData.experienceLevel || 'beginner',
      serviceLocation: serviceData.serviceLocation || 'both',
      preparationRequired: serviceData.preparationRequired?.trim() || '',
      customNotes: serviceData.customNotes?.trim() || '',
      cancellationPolicy: serviceData.cancellationPolicy?.trim() || '24 hours notice required',
      minLeadTime: Math.max(1, parseInt(serviceData.minLeadTime) || 2),
      maxLeadTime: Math.min(365, parseInt(serviceData.maxLeadTime) || 30),
      availability: serviceData.availability || {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        timeSlots: [{ start: '09:00', end: '18:00' }]
      },
      images,
      tags: serviceData.tags || [],
      status: 'pending_approval'
    };

    const service = new Service(finalServiceData);
    await service.requestApproval('create', finalServiceData, 'New service creation request');
    
    res.status(201).json({
      success: true,
      message: 'Service created and submitted for approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        createdAt: service.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating service:', error);
    
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

// Update service (pending approval)
export const updateService = async (req, res) => {
  try {
    console.log('Service update request received:', {
      serviceId: req.params.serviceId,
      userId: req.user?.userId,
      bodyKeys: Object.keys(req.body),
      bodyData: req.body
    });

    const { serviceId } = req.params;
    
    if (!serviceId || !serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      console.error('Invalid service ID format:', serviceId);
      return res.status(400).json({
        message: 'Valid service ID is required',
        error: 'INVALID_SERVICE_ID'
      });
    }

    if (!req.user || !req.user.userId) {
      console.error('No user in request');
      return res.status(401).json({
        message: 'User authentication required',
        error: 'USER_NOT_AUTHENTICATED'
      });
    }

    const service = await Service.findById(serviceId);
    
    if (!service) {
      console.error('Service not found:', serviceId);
      return res.status(404).json({
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('Service found:', {
      id: service._id,
      provider: service.serviceProvider,
      requestUser: req.user.userId
    });

    // Check ownership
    if (service.serviceProvider.toString() !== req.user.userId) {
      console.error('Ownership check failed:', {
        serviceProvider: service.serviceProvider.toString(),
        userId: req.user.userId
      });
      return res.status(403).json({
        message: 'Access denied. You can only update your own services.',
        error: 'SERVICE_UPDATE_ACCESS_DENIED'
      });
    }
    
    // Check if service has pending changes
    if (service.pendingChanges) {
      console.error('Service has pending changes:', service.pendingChanges.requestType);
      return res.status(409).json({
        message: 'Service has pending changes awaiting approval. Cannot submit new changes.',
        error: 'PENDING_CHANGES_EXIST',
        pendingRequestType: service.pendingChanges.requestType
      });
    }

    const updateData = { ...req.body };
    console.log('Raw update data received:', updateData);

    // Clean and validate the incoming data
    const cleanedUpdateData = {
      name: updateData.name?.toString().trim() || '',
      type: updateData.type?.toString().trim() || '',
      category: updateData.category?.toString().trim() || '',
      description: updateData.description?.toString().trim() || '',
      pricing: updateData.pricing || {},
      duration: updateData.duration,
      experienceLevel: updateData.experienceLevel?.toString().trim() || 'beginner',
      serviceLocation: updateData.serviceLocation?.toString().trim() || 'both',
      preparationRequired: updateData.preparationRequired?.toString().trim() || '',
      customNotes: updateData.customNotes?.toString().trim() || '',
      cancellationPolicy: updateData.cancellationPolicy?.toString().trim() || '24 hours notice required',
      minLeadTime: updateData.minLeadTime,
      maxLeadTime: updateData.maxLeadTime,
      availability: updateData.availability || service.availability
    };

    console.log('Cleaned update data:', cleanedUpdateData);

    // Validate update data
    const validationErrors = validateServiceData(cleanedUpdateData, true);
    if (validationErrors.length > 0) {
      console.error('Validation errors:', validationErrors);
      return res.status(400).json({
        message: 'Update validation failed',
        error: 'VALIDATION_ERROR',
        details: validationErrors
      });
    }

    // Prepare the update data with proper structure and fallbacks
    const preparedUpdateData = {
      name: cleanedUpdateData.name || service.name,
      type: cleanedUpdateData.type || service.type,
      category: cleanedUpdateData.category || service.category,
      description: cleanedUpdateData.description || service.description,
      pricing: {
        basePrice: parseFloat(cleanedUpdateData.pricing?.basePrice) || service.pricing?.basePrice || 0,
        priceType: cleanedUpdateData.pricing?.priceType || service.pricing?.priceType || 'fixed',
        variations: Array.isArray(cleanedUpdateData.pricing?.variations) ? 
          cleanedUpdateData.pricing.variations
            .filter(v => v.name && v.price)
            .map(v => ({
              name: v.name.toString().trim(),
              price: parseFloat(v.price) || 0,
              description: v.description?.toString().trim() || ''
            })) : (service.pricing?.variations || []),
        addOns: Array.isArray(cleanedUpdateData.pricing?.addOns) ?
          cleanedUpdateData.pricing.addOns
            .filter(a => a.name && a.price)
            .map(a => ({
              name: a.name.toString().trim(),
              price: parseFloat(a.price) || 0,
              description: a.description?.toString().trim() || ''
            })) : (service.pricing?.addOns || [])
      },
      duration: Math.max(15, Math.min(600, parseInt(cleanedUpdateData.duration) || service.duration || 60)),
      experienceLevel: cleanedUpdateData.experienceLevel || service.experienceLevel || 'beginner',
      serviceLocation: cleanedUpdateData.serviceLocation || service.serviceLocation || 'both',
      preparationRequired: cleanedUpdateData.preparationRequired || service.preparationRequired || '',
      customNotes: cleanedUpdateData.customNotes || service.customNotes || '',
      cancellationPolicy: cleanedUpdateData.cancellationPolicy || service.cancellationPolicy || '24 hours notice required',
      minLeadTime: Math.max(1, parseInt(cleanedUpdateData.minLeadTime) || service.minLeadTime || 2),
      maxLeadTime: Math.min(365, parseInt(cleanedUpdateData.maxLeadTime) || service.maxLeadTime || 30),
      availability: cleanedUpdateData.availability || service.availability || {
        days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        timeSlots: [{ start: '09:00', end: '18:00' }]
      }
    };

    console.log('Prepared update data:', preparedUpdateData);

    // Final validation on prepared data
    const finalValidationErrors = validateServiceData(preparedUpdateData, true);
    if (finalValidationErrors.length > 0) {
      console.error('Final validation errors:', finalValidationErrors);
      return res.status(400).json({
        message: 'Final validation failed',
        error: 'FINAL_VALIDATION_ERROR',
        details: finalValidationErrors
      });
    }

    // Process new images if uploaded
    if (req.files && req.files.length > 0) {
      try {
        const newImages = req.files.map(file => ({
          url: `/uploads/services/${file.filename}`,
          description: '',
          isPrimary: false
        }));
        
        // Merge with existing images
        preparedUpdateData.images = [...(service.images || []), ...newImages];
        
        // Ensure at least one primary image
        if (preparedUpdateData.images.length > 0 && !preparedUpdateData.images.some(img => img.isPrimary)) {
          preparedUpdateData.images[0].isPrimary = true;
        }
      } catch (fileError) {
        console.error('File processing error:', fileError);
        return res.status(400).json({
          message: 'Error processing uploaded images',
          error: 'FILE_PROCESSING_ERROR'
        });
      }
    }

    // Store current service data as previousData for comparison
    const previousData = {
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
      availability: service.availability,
      images: service.images
    };

    // Set the pending changes
    service.pendingChanges = {
      ...preparedUpdateData,
      requestedAt: new Date(),
      requestType: 'update'
    };

    // Add to approval history
    service.approvalHistory.push({
      action: 'update',
      reason: 'Service update request',
      timestamp: new Date(),
      previousData: previousData
    });

    console.log('Saving service with pending changes...');
    await service.save();

    console.log('Service update request saved successfully');
    
    res.json({
      success: true,
      message: 'Service update submitted for approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        updatedAt: service.updatedAt,
        hasPendingChanges: true,
        pendingRequestType: 'update'
      }
    });
  } catch (error) {
    console.error('Error updating service:', error);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        message: 'Service validation failed',
        error: 'MONGOOSE_VALIDATION_ERROR',
        details: validationErrors
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        message: 'Invalid service ID format',
        error: 'INVALID_SERVICE_ID_FORMAT'
      });
    }

    res.status(500).json({
      message: 'Failed to update service',
      error: 'SERVICE_UPDATE_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Delete service (soft delete - hide from provider, keep for admin)
export const deleteService = async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    if (!serviceId || !serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: 'Valid service ID is required',
        error: 'INVALID_SERVICE_ID'
      });
    }

    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    // Check ownership
    if (service.serviceProvider.toString() !== req.user.userId) {
      return res.status(403).json({
        message: 'Access denied. You can only delete your own services.',
        error: 'SERVICE_DELETE_ACCESS_DENIED'
      });
    }
    
    // Check if already deleted
    if (!service.isVisibleToProvider) {
      return res.status(409).json({
        message: 'Service already deleted',
        error: 'SERVICE_ALREADY_DELETED'
      });
    }

    // Check if service has active bookings (if booking system exists)
    // This would be implemented when booking system is added

    await service.requestApproval('delete', {}, 'Service deletion request');
    
    res.json({
      success: true,
      message: 'Service deletion submitted for approval',
      service: {
        id: service._id,
        name: service.name,
        status: service.status
      }
    });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({
      message: 'Failed to delete service',
      error: 'SERVICE_DELETE_ERROR',
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

// ADMIN FUNCTIONS

// Get all pending service approvals
export const getPendingServiceApprovals = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

    const pendingServices = await Service.find({
      $or: [
        { status: 'pending_approval' },
        { pendingChanges: { $exists: true } }
      ]
    })
    .populate('serviceProvider', 'fullName businessName emailAddress')
    .sort({ updatedAt: -1 })
    .limit(limitNum)
    .skip((pageNum - 1) * limitNum)
    .lean();

    const totalPending = await Service.countDocuments({
      $or: [
        { status: 'pending_approval' },
        { pendingChanges: { $exists: true } }
      ]
    });

    res.json({
      success: true,
      pendingServices,
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

// Approve service changes
export const approveServiceChanges = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    if (!serviceId || !serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: 'Valid service ID is required',
        error: 'INVALID_SERVICE_ID'
      });
    }
    
    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    if (!service.pendingChanges) {
      return res.status(409).json({
        message: 'No pending changes to approve',
        error: 'NO_PENDING_CHANGES'
      });
    }
    
    await service.approveChanges(req.user.userId, reason || 'Approved by admin');
    
    res.json({
      success: true,
      message: 'Service changes approved successfully',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        approvedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error approving service:', error);
    res.status(500).json({
      message: 'Failed to approve service changes',
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
    
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({
        message: 'Rejection reason is required (minimum 5 characters)',
        error: 'REJECTION_REASON_REQUIRED'
      });
    }
    
    if (!serviceId || !serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        message: 'Valid service ID is required',
        error: 'INVALID_SERVICE_ID'
      });
    }
    
    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    if (!service.pendingChanges) {
      return res.status(409).json({
        message: 'No pending changes to reject',
        error: 'NO_PENDING_CHANGES'
      });
    }
    
    await service.rejectChanges(req.user.userId, reason.trim());
    
    res.json({
      success: true,
      message: 'Service changes rejected',
      service: {
        id: service._id,
        name: service.name,
        status: service.status,
        rejectedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error rejecting service:', error);
    res.status(500).json({
      message: 'Failed to reject service changes',
      error: 'SERVICE_REJECTION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
