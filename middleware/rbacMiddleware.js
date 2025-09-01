/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * This middleware provides role-based access control functionality for API endpoints.
 * It can be used independently of the JWT authentication middleware when needed.
 */

import User from '../models/User.js';
import jwt from 'jsonwebtoken';

/**
 * RBAC middleware for controlling access based on user roles
 * 
 * @param {Array} allowedRoles - Array of role strings that are allowed to access the route
 * @returns {Function} Express middleware function
 */
const rbac = (allowedRoles = []) => {
  return async (req, res, next) => {
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
      const user = await User.findById(decoded.userId).select('_id role isActive approvalStatus');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }

      // Check if account is active
      if (user.isActive === false) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Your account has been deactivated.'
        });
      }

      // Check if user role is in allowed roles
      if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(', ')}. Current role: ${user.role}`
        });
      }

      // Add user info to request object
      req.user = {
        userId: user._id.toString(),
        role: user.role,
        isActive: user.isActive
      };

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token.'
      });
    }
  };
};

export default rbac;
