// middleware/feedbackMiddleware.js

/**
 * Middleware to validate feedback query parameters
 */
export const validateFeedbackQuery = (req, res, next) => {
  const { sentiment, rating, limit, page } = req.query;

  // Validate sentiment
  if (sentiment) {
    const validSentiments = ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED', 'positive', 'negative', 'neutral', 'mixed'];
    if (!validSentiments.includes(sentiment)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid sentiment value. Must be one of: POSITIVE, NEGATIVE, NEUTRAL, MIXED',
      });
    }
  }

  // Validate rating
  if (rating) {
    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rating value. Must be between 1 and 5',
      });
    }
  }

  // Validate limit
  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid limit value. Must be between 1 and 100',
      });
    }
  }

  // Validate page
  if (page) {
    const pageNum = parseInt(page);
    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page value. Must be greater than 0',
      });
    }
  }

  next();
};

/**
 * Middleware to validate date parameters
 */
export const validateDateParams = (req, res, next) => {
  const { startDate, endDate } = req.query;

  if (startDate) {
    const start = new Date(startDate);
    if (isNaN(start.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid startDate format. Use ISO date format (YYYY-MM-DD)',
      });
    }
  }

  if (endDate) {
    const end = new Date(endDate);
    if (isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid endDate format. Use ISO date format (YYYY-MM-DD)',
      });
    }
  }

  // Validate date range
  if (startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'startDate must be before endDate',
      });
    }
  }

  next();
};

/**
 * Middleware to check if user can access feedback
 * Customers can only see their own feedback
 * Providers can only see feedback for their services
 * Admins can see all feedback
 */
export const checkFeedbackAccess = (req, res, next) => {
  try {
    const user = req.user; // Assuming user is attached by auth middleware

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const { customerId, providerId } = req.params;

    // Admin can access everything
    if (user.role === 'admin') {
      return next();
    }

    // Customer can only access their own feedback
    if (user.role === 'customer') {
      if (customerId && customerId !== user._id.toString() && customerId !== user.customerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view your own feedback',
        });
      }
      // Allow if no specific customer is requested (will be filtered in controller)
      return next();
    }

    // Provider can only access feedback for their services
    if (user.role === 'serviceProvider') {
      if (providerId && providerId !== user._id.toString() && providerId !== user.providerId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. You can only view feedback for your services',
        });
      }
      // Allow if no specific provider is requested (will be filtered in controller)
      return next();
    }

    // Default deny
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  } catch (error) {
    console.error('❌ Error in checkFeedbackAccess middleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Authorization check failed',
    });
  }
};

/**
 * Middleware to validate ObjectId parameters
 */
export const validateObjectId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];

    if (!id) {
      return res.status(400).json({
        success: false,
        message: `${paramName} is required`,
      });
    }

    // Simple ObjectId validation (24 hex characters)
    const objectIdRegex = /^[a-fA-F0-9]{24}$/;
    if (!objectIdRegex.test(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid ${paramName} format`,
      });
    }

    next();
  };
};

/**
 * Middleware to sanitize feedback data before processing
 */
export const sanitizeFeedbackData = (req, res, next) => {
  if (req.body.feedback) {
    // Remove any HTML tags
    req.body.feedback = req.body.feedback.replace(/<[^>]*>/g, '');
    
    // Trim whitespace
    req.body.feedback = req.body.feedback.trim();
    
    // Limit length
    if (req.body.feedback.length > 5000) {
      req.body.feedback = req.body.feedback.substring(0, 5000);
    }
  }

  if (req.body.rating) {
    req.body.rating = parseInt(req.body.rating);
    if (isNaN(req.body.rating) || req.body.rating < 1 || req.body.rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rating. Must be between 1 and 5',
      });
    }
  }

  next();
};

/**
 * Middleware to check feedback collection initialization
 */
export const checkFeedbackCollectionInit = (req, res, next) => {
  // This is a placeholder - actual check will be in routes
  // The collection reference is passed from server.js
  next();
};

/**
 * Middleware to log feedback access
 */
export const logFeedbackAccess = (req, res, next) => {
  const { method, path, ip } = req;
  const user = req.user ? req.user.email : 'anonymous';
  
  console.log(`📊 Feedback API: ${method} ${path} | User: ${user} | IP: ${ip}`);
  
  next();
};

/**
 * Middleware to cache feedback statistics
 * Simple in-memory cache with TTL
 */
const statsCache = {
  data: null,
  timestamp: null,
  ttl: 5 * 60 * 1000, // 5 minutes
};

export const cacheFeedbackStats = (req, res, next) => {
  // Check if we're requesting stats
  if (req.path !== '/stats') {
    return next();
  }

  // Check if cache is valid
  if (statsCache.data && statsCache.timestamp) {
    const now = Date.now();
    if (now - statsCache.timestamp < statsCache.ttl) {
      console.log('✅ Returning cached feedback stats');
      return res.status(200).json({
        success: true,
        data: statsCache.data,
        cached: true,
      });
    }
  }

  // Store original res.json
  const originalJson = res.json;

  // Override res.json to cache the response
  res.json = function (data) {
    if (data.success && data.data) {
      statsCache.data = data.data;
      statsCache.timestamp = Date.now();
      console.log('💾 Cached feedback stats');
    }
    // Call original json method
    originalJson.call(this, data);
  };

  next();
};

/**
 * Middleware to validate trend period parameter
 */
export const validateTrendPeriod = (req, res, next) => {
  const { period } = req.query;

  if (period) {
    const validPeriods = ['week', 'month', 'year'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid period. Must be one of: week, month, year',
      });
    }
  }

  next();
};

export default {
  validateFeedbackQuery,
  validateDateParams,
  checkFeedbackAccess,
  validateObjectId,
  sanitizeFeedbackData,
  checkFeedbackCollectionInit,
  logFeedbackAccess,
  cacheFeedbackStats,
  validateTrendPeriod,
};