// // middleware/serviceMiddleware.js - MISSING FILE
// import Service from '../models/Service.js';

// export const requireServiceOwnership = async (req, res, next) => {
//   try {
//     const { serviceId } = req.params;
//     const userId = req.user.userId;

//     if (!serviceId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Service ID is required',
//         error: 'SERVICE_ID_REQUIRED'
//       });
//     }

//     const service = await Service.findById(serviceId);
    
//     if (!service) {
//       return res.status(404).json({
//         success: false,
//         message: 'Service not found',
//         error: 'SERVICE_NOT_FOUND'
//       });
//     }

//     // Check if user owns this service or is admin
//     if (req.user.role === 'admin' || service.serviceProvider.toString() === userId) {
//       req.service = service; // Attach service to request for use in controller
//       next();
//     } else {
//       return res.status(403).json({
//         success: false,
//         message: 'You can only access your own services',
//         error: 'ACCESS_DENIED'
//       });
//     }
//   } catch (error) {
//     console.error('Service ownership middleware error:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Error verifying service ownership',
//       error: 'MIDDLEWARE_ERROR'
//     });
//   }
// };

// middleware/serviceMiddleware.js - COMPLETE SERVICE MIDDLEWARE
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

// Enhanced middleware for admin actions
export const requireAdminServiceAccess = async (req, res, next) => {
  try {
    const { serviceId } = req.params;

    if (!serviceId) {
      return res.status(400).json({
        success: false,
        message: 'Service ID is required',
        error: 'SERVICE_ID_REQUIRED'
      });
    }

    // Validate service ID format
    if (!serviceId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid service ID format',
        error: 'INVALID_SERVICE_ID_FORMAT'
      });
    }

    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        error: 'ADMIN_ACCESS_REQUIRED'
      });
    }

    const service = await Service.findById(serviceId)
      .populate('serviceProvider', 'fullName businessName emailAddress');
    
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found',
        error: 'SERVICE_NOT_FOUND'
      });
    }

    req.service = service; // Attach service to request
    next();
  } catch (error) {
    console.error('Admin service access middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying admin service access',
      error: 'MIDDLEWARE_ERROR'
    });
  }
};

// Middleware to validate service status for actions
export const validateServiceActionability = async (req, res, next) => {
  try {
    const service = req.service; // Should be set by previous middleware
    
    if (!service) {
      return res.status(500).json({
        success: false,
        message: 'Service not found in request context',
        error: 'SERVICE_CONTEXT_MISSING'
      });
    }

    const { action } = req.body;
    const isApprovalAction = req.path.includes('/approve');
    const isRejectionAction = req.path.includes('/reject');

    // Check if service can be acted upon
    const canApprove = (service.status === 'pending_approval' && !service.pendingChanges) || 
                      (service.pendingChanges && ['update', 'delete', 'reactivate'].includes(service.pendingChanges.actionType));
    
    const canReject = canApprove; // Same conditions for rejection

    if (isApprovalAction && !canApprove) {
      return res.status(409).json({
        success: false,
        message: 'This service cannot be approved in its current state',
        error: 'SERVICE_NOT_APPROVABLE',
        details: {
          currentStatus: service.status,
          hasPendingChanges: !!service.pendingChanges,
          pendingAction: service.pendingChanges?.actionType
        }
      });
    }

    if (isRejectionAction && !canReject) {
      return res.status(409).json({
        success: false,
        message: 'This service cannot be rejected in its current state',
        error: 'SERVICE_NOT_REJECTABLE',
        details: {
          currentStatus: service.status,
          hasPendingChanges: !!service.pendingChanges,
          pendingAction: service.pendingChanges?.actionType
        }
      });
    }

    next();
  } catch (error) {
    console.error('Service actionability validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating service actionability',
      error: 'ACTIONABILITY_VALIDATION_ERROR'
    });
  }
};

// Middleware to prevent duplicate actions
export const preventDuplicateActions = async (req, res, next) => {
  try {
    const { serviceId } = req.params;
    const userId = req.user.userId;
    const isApprovalAction = req.path.includes('/approve');
    const isRejectionAction = req.path.includes('/reject');

    // Create a unique key for this action
    const actionKey = `${serviceId}_${userId}_${isApprovalAction ? 'approve' : 'reject'}`;

    // In a production environment, you'd use Redis or similar for this
    // For now, we'll use a simple in-memory store with cleanup
    if (!global.activeActions) {
      global.activeActions = new Map();
    }

    // Check if action is already in progress
    if (global.activeActions.has(actionKey)) {
      return res.status(429).json({
        success: false,
        message: 'This action is already in progress. Please wait.',
        error: 'DUPLICATE_ACTION_PREVENTED'
      });
    }

    // Mark action as in progress
    global.activeActions.set(actionKey, Date.now());

    // Clean up after response
    const originalSend = res.send;
    res.send = function(data) {
      global.activeActions.delete(actionKey);
      originalSend.call(this, data);
    };

    // Clean up after 30 seconds (safety net)
    setTimeout(() => {
      global.activeActions.delete(actionKey);
    }, 30000);

    next();
  } catch (error) {
    console.error('Duplicate action prevention error:', error);
    next(); // Don't block the request if this fails
  }
};

// Middleware to validate rejection reason
export const validateRejectionReason = (req, res, next) => {
  try {
    const { reason } = req.body;
    const isRejectionAction = req.path.includes('/reject');

    if (isRejectionAction) {
      if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'A detailed rejection reason is required (minimum 10 characters)',
          error: 'INVALID_REJECTION_REASON'
        });
      }

      if (reason.trim().length > 500) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is too long (maximum 500 characters)',
          error: 'REJECTION_REASON_TOO_LONG'
        });
      }

      // Sanitize the reason
      req.body.reason = reason.trim();
    }

    next();
  } catch (error) {
    console.error('Rejection reason validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating rejection reason',
      error: 'REJECTION_VALIDATION_ERROR'
    });
  }
};

// Combined middleware for admin service actions
export const adminServiceActionMiddleware = [
  requireAdminServiceAccess,
  validateServiceActionability,
  preventDuplicateActions,
  validateRejectionReason
];

// Middleware to log service actions for audit
export const logServiceAction = (action) => {
  return (req, res, next) => {
    const originalSend = res.send;
    res.send = function(data) {
      try {
        const service = req.service;
        const user = req.user;
        
        console.log(`📊 Service Action Log:`, {
          action: action,
          serviceId: service?._id,
          serviceName: service?.name,
          serviceStatus: service?.status,
          adminId: user?.userId,
          adminEmail: user?.email,
          timestamp: new Date().toISOString(),
          success: JSON.parse(data)?.success || false,
          reason: req.body?.reason
        });
      } catch (error) {
        console.error('Service action logging error:', error);
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

export default {
  requireServiceOwnership,
  requireAdminServiceAccess,
  validateServiceActionability,
  preventDuplicateActions,
  validateRejectionReason,
  adminServiceActionMiddleware,
  logServiceAction
};