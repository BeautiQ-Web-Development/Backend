// middleware/serviceMiddleware.js - MISSING FILE
import Service from '../models/Service.js';

export const requireServiceOwnership = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.userId;

    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required',
        error: 'SERVICE_ID_REQUIRED'
      });
    }

    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }

    // Check if user owns this service or is admin
    if (req.user.role === 'admin' || service.serviceProvider.toString() === userId) {
      req.service = service; // Attach service to request for use in controller
      next();
    } else {
      return res.status(403).json({
        success: false,
        message: 'You can only access your own services',
        error: 'ACCESS_DENIED'
      });
    }
  } catch (error) {
    console.error('Service ownership middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying service ownership',
      error: 'MIDDLEWARE_ERROR'
    });
  }
};