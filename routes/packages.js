import express from 'express';
import Package from '../models/Package.js';
import Service from '../models/Service.js';
import { protect, authorize } from '../middleware/auth.js';

const router = express.Router();

// Create a new package
router.post('/', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    // Validate that all included services belong to the provider
    const serviceIds = req.body.includedServices.map(item => item.service);
    const userServices = await Service.find({
      _id: { $in: serviceIds },
      serviceProvider: req.user.userId,
      status: 'approved',
      isActive: true
    });
    
    if (userServices.length !== serviceIds.length) {
      return res.status(400).json({
        success: false,
        message: 'One or more services are not available or do not belong to you'
      });
    }
    
    const pkg = new Package({
      ...req.body,
      serviceProvider: req.user.userId,
      status: 'pending_approval'
    });

    await pkg.save();
    res.status(201).json({
      success: true,
      message: 'Package created successfully and is pending approval',
      data: pkg
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Get all packages for a service provider
router.get('/provider', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const packages = await Package.find({ 
      serviceProvider: req.user.userId,
      isVisibleToProvider: true 
    })
    .populate('includedServices.service', 'serviceName serviceType duration pricing.basePrice')
    .sort({ createdAt: -1 });
    
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all approved packages for customers
router.get('/approved', async (req, res) => {
  try {
    const { category, location, priceRange, serviceProvider } = req.query;
    
    let filter = { 
      status: 'approved',
      isActive: true,
      isVisibleToProvider: true
    };
    
    if (category) filter.category = category;
    if (serviceProvider) filter.serviceProvider = serviceProvider;
    
    const packages = await Package.find(filter)
      .populate('serviceProvider', 'businessName fullName location')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get package by ID
router.get('/:id', async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id)
      .populate('serviceProvider', 'businessName fullName location contactInfo');
    
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    
    res.json({ success: true, data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Update package
router.put('/:id', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    
    // Check if user owns the package
    if (pkg.serviceProvider.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this package' });
    }
    
    // If package is approved and being modified, set status to pending
    if (pkg.status === 'approved') {
      req.body.status = 'pending_approval';
      req.body.pendingChanges = {
        requestType: 'update',
        submittedAt: new Date(),
        reason: 'Package updated by provider'
      };
    }
    
    const updatedPkg = await Package.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Package updated successfully',
      data: updatedPkg
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Delete package (soft delete - hide from provider)
router.delete('/:id', protect, authorize('serviceProvider'), async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    
    // Check if user owns the package
    if (pkg.serviceProvider.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this package' });
    }
    
    // Soft delete - mark as not visible to provider
    const updatedPkg = await Package.findByIdAndUpdate(
      req.params.id,
      { 
        isVisibleToProvider: false,
        isActive: false,
        status: 'deleted',
        pendingChanges: {
          requestType: 'delete',
          submittedAt: new Date(),
          reason: 'Package deleted by provider'
        }
      },
      { new: true }
    );
    
    res.json({ success: true, message: 'Package deleted successfully', data: updatedPkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin routes
// Get all packages pending approval
router.get('/admin/pending', protect, authorize('admin'), async (req, res) => {
  try {
    const pendingPackages = await Package.find({ 
      status: 'pending_approval',
      isVisibleToProvider: true
    })
    .populate('serviceProvider', 'businessName fullName emailAddress');
    
    res.json({ success: true, data: pendingPackages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all packages history for admin
router.get('/admin/history', protect, authorize('admin'), async (req, res) => {
  try {
    const packages = await Package.find({})
      .populate('serviceProvider', 'businessName fullName emailAddress')
      .sort({ updatedAt: -1 });
    
    res.json({ success: true, data: packages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin approve package
router.post('/admin/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const pkg = await Package.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'approved',
        pendingChanges: null,
        approvedAt: new Date(),
        approvedBy: req.user.userId
      },
      { new: true }
    );
    
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    
    res.json({ success: true, message: 'Package approved successfully', data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin reject package
router.post('/admin/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const { reason } = req.body;
    
    const pkg = await Package.findByIdAndUpdate(
      req.params.id,
      { 
        status: 'rejected',
        pendingChanges: null,
        rejectedAt: new Date(),
        rejectedBy: req.user.userId,
        rejectionReason: reason || 'Package rejected by admin'
      },
      { new: true }
    );
    
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }
    
    res.json({ success: true, message: 'Package rejected successfully', data: pkg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;