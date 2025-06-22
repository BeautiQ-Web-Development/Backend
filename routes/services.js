import express from 'express';
import multer from 'multer';
import Service from '../models/Service.js';
import {
  getProviderServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  reactivateService,
  getPendingServiceApprovals,
  getServiceHistory,
  approveServiceChanges,
  rejectServiceChanges,
  uploadServiceImages
} from '../controllers/serviceController.js';
import { protect, authorize, validateServiceOwnership, rateLimit } from '../middleware/auth.js';

const router = express.Router();

// Apply rate limiting to all service routes
router.use(rateLimit(200, 15 * 60 * 1000)); // 200 requests per 15 minutes

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          message: 'File too large. Maximum size is 5MB per file.',
          error: 'FILE_TOO_LARGE'
        });
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          message: 'Too many files. Maximum 5 images allowed.',
          error: 'TOO_MANY_FILES'
        });
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          message: 'Unexpected file field.',
          error: 'UNEXPECTED_FILE'
        });
      default:
        return res.status(400).json({
          message: 'File upload error.',
          error: err.code
        });
    }
  }
  next(err);
};

// Service Provider Routes
router.get('/my-services', protect, authorize('serviceProvider'), getProviderServices);
router.get('/:serviceId', protect, getServiceById); // Remove validateServiceOwnership temporarily
router.post('/', protect, authorize('serviceProvider'), uploadServiceImages, handleMulterError, createService);
router.put('/:serviceId', protect, authorize('serviceProvider'), uploadServiceImages, handleMulterError, updateService); // Remove validateServiceOwnership temporarily
router.delete('/:serviceId', protect, authorize('serviceProvider'), validateServiceOwnership, deleteService);
router.post('/:serviceId/reactivate', protect, authorize('serviceProvider'), validateServiceOwnership, reactivateService);

// Admin Routes
router.get('/admin/pending', protect, authorize('admin'), getPendingServiceApprovals);
router.get('/admin/history', protect, authorize('admin'), getServiceHistory);
router.post('/admin/:serviceId/approve', protect, authorize('admin'), approveServiceChanges);
router.post('/admin/:serviceId/reject', protect, authorize('admin'), rejectServiceChanges);

// Get all approved services (public)
router.get('/approved', async (req, res) => {
  try {
    const { serviceType, targetAudience, location, minPrice, maxPrice, page = 1, limit = 10 } = req.query;
    
    const filter = { status: 'approved', isActive: true };
    
    if (serviceType) filter.serviceType = serviceType;
    if (targetAudience) filter.targetAudience = targetAudience;
    if (minPrice || maxPrice) {
      filter['pricing.basePrice'] = {};
      if (minPrice) filter['pricing.basePrice'].$gte = Number(minPrice);
      if (maxPrice) filter['pricing.basePrice'].$lte = Number(maxPrice);
    }
    
    const services = await Service.find(filter)
      .populate('serviceProvider', 'businessName fullName location averageRating reviewCount isOnline')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Service.countDocuments(filter);
    
    res.json({
      success: true,
      data: services,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get services by provider
router.get('/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const services = await Service.find({
      serviceProvider: providerId,
      status: 'approved',
      isActive: true
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get service provider's own services
router.get('/my-services', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const services = await Service.find({
      serviceProvider: req.user.userId,
      isVisibleToProvider: true
    }).sort({ createdAt: -1 });
    
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Add new service
router.post('/add', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const serviceData = {
      ...req.body,
      serviceProvider: req.user.userId
    };
    
    const service = new Service(serviceData);
    await service.save();
    
    res.status(201).json({
      success: true,
      message: 'Service added successfully and is pending approval',
      data: service
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Update service
router.put('/:serviceId', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const service = await Service.findOne({
      _id: serviceId,
      serviceProvider: req.user.userId
    });
    
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    // Reset approval status if significant changes are made
    const significantFields = ['serviceName', 'serviceType', 'pricing.basePrice'];
    const hasSignificantChanges = significantFields.some(field => {
      const [parent, child] = field.split('.');
      if (child) {
        return req.body[parent] && req.body[parent][child] !== service[parent][child];
      }
      return req.body[field] !== service[field];
    });
    
    if (hasSignificantChanges && service.status === 'approved') {
      req.body.status = 'pending_approval';
    }
    
    Object.assign(service, req.body);
    await service.save();
    
    res.json({
      success: true,
      message: hasSignificantChanges ? 'Service updated and is pending re-approval' : 'Service updated successfully',
      data: service
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete service (soft delete)
router.delete('/:serviceId', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const service = await Service.findOne({
      _id: serviceId,
      serviceProvider: req.user.userId
    });
    
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    service.isActive = false;
    service.isVisibleToProvider = false;
    await service.save();
    
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin routes for service approval
router.get('/pending-approval', protect, authorize('admin'), async (req, res) => {
  try {
    const services = await Service.find({ status: 'pending_approval' })
      .populate('serviceProvider', 'businessName fullName emailAddress mobileNumber')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/approve/:serviceId', protect, authorize('admin'), async (req, res) => {
  try {
    const { serviceId } = req.params;
    
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    service.status = 'approved';
    service.approvalDate = new Date();
    await service.save();
    
    res.json({ success: true, message: 'Service approved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.put('/reject/:serviceId', protect, authorize('admin'), async (req, res) => {
  try {
    const { serviceId } = req.params;
    const { reason } = req.body;
    
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    
    service.status = 'rejected';
    service.rejectionReason = reason;
    await service.save();
    
    res.json({ success: true, message: 'Service rejected successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin routes
// Get all services pending approval
router.get('/admin/pending', protect, authorize('admin'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const pendingServices = await Service.find({ 
      status: 'pending_approval',
      isVisibleToProvider: true
    }).populate('serviceProvider', 'businessName fullName emailAddress');
    
    res.json({ pendingServices });
  } catch (error) {
    console.error('Get pending services error:', error);
    res.status(500).json({ message: 'Error fetching pending services', error: error.message });
  }
});

// Get all services history for admin
router.get('/admin/history', protect, authorize('admin'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const services = await Service.find({})
      .populate('serviceProvider', 'businessName fullName emailAddress')
      .sort({ updatedAt: -1 });
    
    res.json({ services });
  } catch (error) {
    console.error('Get service history error:', error);
    res.status(500).json({ message: 'Error fetching service history', error: error.message });
  }
});

// Admin approve service
router.post('/admin/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'approved',
        pendingChanges: null,
        approvedAt: new Date(),
        approvedBy: req.user.id
      },
      { new: true }
    );
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json({ message: 'Service approved successfully', service });
  } catch (error) {
    console.error('Approve service error:', error);
    res.status(500).json({ message: 'Error approving service', error: error.message });
  }
});

// Admin reject service
router.post('/admin/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    
    const { reason } = req.body;
    
    const service = await Service.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'rejected',
        pendingChanges: null,
        rejectedAt: new Date(),
        rejectedBy: req.user.id,
        rejectionReason: reason || 'Service rejected by admin'
      },
      { new: true }
    );
    
    if (!service) {
      return res.status(404).json({ message: 'Service not found' });
    }
    
    res.json({ message: 'Service rejected successfully', service });
  } catch (error) {
    console.error('Reject service error:', error);
    res.status(500).json({ message: 'Error rejecting service', error: error.message });
  }
});

// Serve service images with error handling
router.use('/images', (req, res, next) => {
  express.static('uploads/services')(req, res, (err) => {
    if (err) {
      return res.status(404).json({
        message: 'Image not found',
        error: 'IMAGE_NOT_FOUND'
      });
    }
    next();
  });
});

export default router;
