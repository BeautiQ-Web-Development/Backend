//middleware/authMiddleware.js - FIXED WITH ACCOUNT STATUS CHECKS
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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

// CRITICAL FIX: Authentication middleware with account status checks
export const protect = async (req, res, next) => {
  try {
    let token;

    // Check for token in Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user from token
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not found.'
      });
    }

    // CRITICAL FIX: Check if account is deactivated/deleted
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Your account has been deactivated. Please contact support.',
        error: 'ACCOUNT_DEACTIVATED',
        accountDeactivated: true
      });
    }

    // Check if serviceProvider is approved
    if (user.role === 'serviceProvider' && user.approvalStatus !== 'approved' && !user.approved) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Service provider account is not approved.',
        error: 'SERVICE_PROVIDER_NOT_APPROVED'
      });
    }

    req.user = {
      userId: user._id.toString(),
      role: user.role,
      approved: user.approved || user.approvalStatus === 'approved',
      isActive: user.isActive
    };

    console.log('Auth middleware - User authenticated:', {
      userId: req.user.userId,
      role: req.user.role,
      approved: req.user.approved,
      isActive: req.user.isActive
    });

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      message: 'Access denied. Invalid token.'
    });
  }
};

// Authorization middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. User not authenticated.'
      });
    }

    console.log('Authorization check:', {
      userRole: req.user.role,
      requiredRoles: roles,
      hasAccess: roles.includes(req.user.role),
      isActive: req.user.isActive
    });

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(', ')}. Current role: ${req.user.role}`,
        error: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Add this function to your auth.js
export const debugToken = () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      console.log('Token payload:', payload);
      return payload;
    } catch (e) {
      console.error('Invalid token format');
    }
  }
  return null;
};

// Backward compatibility aliases
export const authenticateToken = protect;
export const verifyToken = protect;
export const authorizeRole = (roles) => authorize(...roles);