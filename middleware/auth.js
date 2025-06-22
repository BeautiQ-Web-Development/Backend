import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Service from '../models/Service.js';

// Rate limiting middleware
export const rateLimit = (maxRequests, windowMs) => {
  const clients = new Map();
  
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!clients.has(clientIP)) {
      clients.set(clientIP, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const client = clients.get(clientIP);
    
    if (now > client.resetTime) {
      client.count = 1;
      client.resetTime = now + windowMs;
      return next();
    }
    
    if (client.count >= maxRequests) {
      return res.status(429).json({
        message: 'Too many requests, please try again later',
        error: 'RATE_LIMIT_EXCEEDED'
      });
    }
    
    client.count++;
    next();
  };
};

// Authentication middleware
export const protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (!token) {
      return res.status(401).json({
        message: 'Access denied. No token provided.',
        error: 'NO_TOKEN_PROVIDED'
      });
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return res.status(401).json({
          message: 'Token is invalid. User not found.',
          error: 'INVALID_TOKEN_USER_NOT_FOUND'
        });
      }
      
      req.user = {
        userId: user._id.toString(),
        role: user.role,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        approved: user.approved
      };
      
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      return res.status(401).json({
        message: 'Token is invalid.',
        error: 'INVALID_TOKEN'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      message: 'Server error during authentication',
      error: 'AUTH_SERVER_ERROR'
    });
  }
};

// Authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: 'Authentication required',
        error: 'AUTHENTICATION_REQUIRED'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role: ${roles.join(' or ')}`,
        error: 'INSUFFICIENT_PERMISSIONS',
        userRole: req.user.role,
        requiredRoles: roles
      });
    }
    
    // Additional check for service providers
    if (req.user.role === 'serviceProvider' && req.user.approved === false) {
      return res.status(403).json({
        message: 'Access denied. Service provider account not approved.',
        error: 'SERVICE_PROVIDER_NOT_APPROVED'
      });
    }
    
    next();
  };
};

// Service ownership validation middleware
export const validateServiceOwnership = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    
    console.log('Validating service ownership:', {
      serviceId,
      userId: req.user?.userId,
      userRole: req.user?.role
    });
    
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
    
    // Import Service model with proper error handling
    let Service;
    try {
      Service = (await import('../models/Service.js')).default;
    } catch (importError) {
      console.error('Error importing Service model:', importError);
      return res.status(500).json({
        message: 'Server configuration error',
        error: 'MODEL_IMPORT_ERROR'
      });
    }
    
    const service = await Service.findById(serviceId);
    
    if (!service) {
      return res.status(404).json({
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }
    
    console.log('Service found:', {
      id: service._id,
      provider: service.serviceProvider?.toString(),
      isVisibleToProvider: service.isVisibleToProvider
    });
    
    // Admin can access any service
    if (req.user.role === 'admin') {
      console.log('Admin access granted');
      return next();
    }
    
    // Service provider can only access their own services
    if (req.user.role === 'serviceProvider' && 
        service.serviceProvider.toString() === req.user.userId) {
      console.log('Service provider ownership validated');
      return next();
    }
    
    console.log('Access denied - ownership validation failed');
    return res.status(403).json({
      message: 'Access denied. You can only access your own services.',
      error: 'SERVICE_ACCESS_DENIED'
    });
    
  } catch (error) {
    console.error('Service ownership validation error:', error);
    res.status(500).json({
      message: 'Server error during service ownership validation',
      error: 'OWNERSHIP_VALIDATION_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};