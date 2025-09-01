//routes/services.Routes.js - FIXED VERSION
import express from 'express';
import Service from '../models/Service.js';
import {
  getProviderServices,
  getAllServicesAdmin,
  getServiceById,
  createService,
  updateService,
  deleteService, // ✅ Now exported from controller
  getPendingServiceApprovals,
  getServiceHistory,
  approveServiceChanges,
  rejectServiceChanges,
  uploadServiceImages
} from '../controllers/serviceController.js';
import { protect, authorize, rateLimit as authRateLimit } from '../middleware/authMiddleware.js';
import { requireServiceOwnership } from '../middleware/serviceMiddleware.js';
import { getAvailableSlots } from '../controllers/bookingController.js';
import expressRateLimit from 'express-rate-limit';
import User from '../models/User.js';

const router = express.Router();

// Public endpoint for stats (inline handler)
router.get('/stats', async (req, res) => {
  try {
    const customerCount = await User.countDocuments({ role: 'customer' });
    const providerCount = await User.countDocuments({ role: 'serviceProvider', approvalStatus: 'approved' });
    const serviceCount = await Service.countDocuments({ status: 'approved', isActive: true });
    res.json({ success: true, data: { customers: customerCount, providers: providerCount, services: serviceCount } });
  } catch (error) {
    console.error('Error fetching stats inline:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Specific limiter for available slots API to prevent the 429 errors
const availableSlotsRateLimiter = expressRateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit each IP to 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many slot requests, please try again after 1 minute'
});

// Apply rate limiting to all service routes
router.use(authRateLimit(200, 15 * 60 * 1000)); // 200 requests per 15 minutes

// Debug middleware to help troubleshoot issues
const debugMiddleware = (req, res, next) => {
  console.log('=== SERVICE ROUTE DEBUG ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('User from token:', req.user);
  console.log('Authorization header:', req.headers.authorization);
  console.log('========================');
  next();
};

// Public routes (no auth needed) - Must come first
router.get('/subtypes/:type', async (req, res) => {
  try {
    const { type } = req.params;
    const subtypeMap = {
      'Hairstyle': ['Bridal', 'Party', 'Engagement', 'Wedding', 'Traditional', 'Casual', 'Farewell', 'Corporate', 'Festival', 'Anniversary', 'Date Night'],
      'Haircuts': ['Layer Cut', 'Bob Cut', 'Pixie Cut', 'Fade', 'Trim', 'Bangs', 'Shag', 'Lob', 'Undercut', 'Buzz Cut', 'Wolf Cut'],
      'Hair Color': ['Highlights', 'Full Color', 'Root Touch-up', 'Balayage', 'Ombre', 'Color Correction', 'Fashion Colors', 'Gray Coverage', 'Streaks', 'Dip Dye'],
      'Nail Art': ['Bridal', 'Party', 'Engagement', 'Wedding', 'Traditional', 'French Tips', 'Gel Polish', 'Acrylic', 'Stone Art', 'Custom Design', '3D Art', 'Glitter', 'Minimalist'],
      'Manicure': ['Basic Manicure', 'Gel Manicure', 'Spa Manicure', 'French Manicure', 'Russian Manicure', 'Bridal Manicure', 'Express Manicure'],
      'Pedicure': ['Basic Pedicure', 'Spa Pedicure', 'Gel Pedicure', 'Medical Pedicure', 'Fish Pedicure', 'Bridal Pedicure', 'Express Pedicure'],
      'Makeup': ['Bridal', 'Party', 'Engagement', 'Wedding', 'Traditional', 'Farewell', 'Party Makeup', 'Natural Makeup', 'Smokey Eyes', 'Contouring', 'Editorial Makeup', 'Evening Look', 'Day Look'],
      'Bridal Makeup': ['Traditional Bridal', 'Modern Bridal', 'Reception Look', 'Engagement Makeup', 'Mehendi Look', 'Sangeet Look', 'Haldi Look'],
      'Party Makeup': ['Glamour', 'Natural', 'Bold', 'Themed Party', 'Birthday Party', 'Cocktail Look', 'Night Out'],
      'Threading': ['Eyebrow Threading', 'Upper Lip', 'Full Face', 'Chin', 'Forehead', 'Sideburns', 'Nose', 'Ear'],
      'Eyebrow Shaping': ['Basic Threading', 'Eyebrow Design', 'Tinting', 'Lamination', 'Microblading Touch-up'],
      'Facial': ['Deep Cleansing', 'Anti-Aging', 'Brightening', 'Acne Treatment', 'Hydrating', 'Gold Facial', 'Diamond Facial', 'Oxygen Facial', 'Fruit Facial'],
      'Skincare': ['Basic Cleanup', 'Deep Cleansing', 'Blackhead Removal', 'Whitening Treatment', 'Anti-Aging Treatment', 'Acne Treatment'],
      'Massage': ['Relaxation', 'Deep Tissue', 'Head Massage', 'Foot Massage', 'Aromatherapy', 'Hot Stone', 'Swedish', 'Face Massage', 'Neck & Shoulder'],
      'Saree Draping': ['Traditional Style', 'Modern Style', 'Regional Style', 'Designer Draping', 'Bengali Style', 'South Indian Style', 'Gujarati Style', 'Maharashtrian Style'],
      'Hair Extensions': ['Clip-in', 'Tape-in', 'Fusion', 'Micro-link', 'Sew-in', 'Halo Extensions', 'Temporary', 'Semi-Permanent'],
      'Keratin Treatment': ['Basic Keratin', 'Brazilian Blowout', 'Smoothing Treatment', 'Frizz Control'],
      'Hair Wash': ['Basic Wash', 'Deep Cleansing', 'Oil Treatment', 'Conditioning Treatment'],
      'Head Massage': ['Relaxation', 'Oil Massage', 'Dry Massage', 'Therapeutic', 'Stress Relief'],
      'Mehendi/Henna': ['Bridal', 'Party', 'Engagement', 'Traditional', 'Arabic Style', 'Indian Style', 'Simple Patterns', 'Intricate Designs', 'Floral', 'Geometric'],
      'Other': ['Custom Service', 'Consultation', 'Package Deal', 'Special Occasion']
    };
    
    // Set CORS headers explicitly
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    res.json({
      success: true,
      subtypes: subtypeMap[type] || []
    });
  } catch (error) {
    console.error('Error fetching subtypes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get all approved services (public) - only show approved and active services
router.get('/approved', async (req, res) => {
  try {
    const { type, category, location, minPrice, maxPrice, page = 1, limit = 10 } = req.query;
    
    // Only show approved and active services to public
    const filter = { status: 'approved', isActive: true };
    if (type)     filter.type     = type;
    if (category) filter.category = category;
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

// Get services by provider (public) - only approved services
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

// Admin Routes - Must come before parameterized routes
router.get('/admin/pending', protect, authorize('admin'), getPendingServiceApprovals);
router.get('/admin/history', protect, authorize('admin'), getServiceHistory);
// Use correct handler to fetch all services for admin
router.get('/admin/all', protect, authorize('admin'), getAllServicesAdmin);

// FIXED: Add admin approval and rejection endpoints
router.post('/admin/:serviceId/approve', protect, authorize('admin'), approveServiceChanges);
router.post('/admin/:serviceId/reject', protect, authorize('admin'), rejectServiceChanges);

// Service Provider Routes - all CUD operations require admin approval
// Alias for backward compatibility: front-end calls `/services/my-services`
router.get(
  '/my-services',
  protect,
  authorize('serviceProvider'),
  getProviderServices
);
router.get(
  '/provider/my-services',
  protect,
  authorize('serviceProvider'),
  getProviderServices
);

// Create service routes - status will be 'pending_approval' initially, requires admin approval
router.post('/', protect, authorize('serviceProvider'), uploadServiceImages, createService);
router.post('/add', protect, authorize('serviceProvider'), uploadServiceImages, createService);

// Update service routes - changes to approved services require admin approval
// ✅ FIXED: This route now works with proper middleware
router.put('/:serviceId', 
  protect, 
  debugMiddleware, // Add debug to see what's happening
  authorize('admin', 'serviceProvider'), // Allow both admin and serviceProvider
  requireServiceOwnership, // ✅ This middleware now exists
  uploadServiceImages, 
  updateService
);

// Delete service routes - deletion of approved services requires admin approval
// ✅ FIXED: deleteService is now properly exported
router.delete('/:serviceId', protect, authorize('serviceProvider'), requireServiceOwnership, deleteService);

// Individual service routes
router.get('/:serviceId', protect, getServiceById);
// New endpoint to get available slots for a service
router.get('/:serviceId/available-slots', availableSlotsRateLimiter, getAvailableSlots);

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