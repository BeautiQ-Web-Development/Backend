// const jwt = require('jsonwebtoken');
// const User = require('./models/User');

// const protect = async (req, res, next) => {
//   try {
//     const token = req.headers.authorization?.split(' ')[1];
    
//     if (!token) {
//       return res.status(401).json({ message: 'Not authorized' });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const user = await User.findById(decoded.id).select('-password');
    
//     if (!user) {
//       return res.status(401).json({ message: 'User not found' });
//     }

//     req.user = user;
//     next();
//   } catch (error) {
//     res.status(401).json({ message: 'Not authorized' });
//   }
// };

// const authorize = (...roles) => {
//   return (req, res, next) => {
//     if (!roles.includes(req.user.role)) {
//       return res.status(403).json({ 
//         message: 'Not authorized to access this route' 
//       });
//     }
//     next();
//   };
// };

// module.exports = { protect, authorize };

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export const authorize = (roles) => {
  return (req, res, next) => {
    if (!Array.isArray(roles)) {
      roles = [roles]; // Convert to array if single role is passed
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        message: `Role (${req.user.role}) not authorized to access this route` 
      });
    }
    
    // Check if service provider is approved for provider-specific routes
    if (req.user.role === 'serviceProvider' && !req.user.approved) {
      return res.status(403).json({ 
        message: 'Your account is pending admin approval',
        pendingApproval: true
      });
    }
    
    next();
  };
};