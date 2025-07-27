// middleware/packageMiddleware.js - ENHANCED with better error handling
import Package from '../models/Package.js';

// Enhanced middleware to check if user owns the package
export const requirePackageOwnership = async (req, res, next) => {
  try {
    const packageId = req.params.packageId || req.params.id;
    const userId = req.user?.userId;

    console.log('🔍 Checking package ownership:', { packageId, userId });

    // Validate inputs
    if (!packageId) {
      return res.status(400).json({
        success: false,
        message: 'Package ID is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User authentication required'
      });
    }

    // Validate ObjectId format
    if (!packageId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }

    let package_;
    try {
      package_ = await Package.findById(packageId).lean();
    } catch (dbError) {
      console.error('❌ Database error in package ownership check:', dbError);
      return res.status(500).json({
        success: false,
        message: 'Database error while checking package ownership'
      });
    }
    
    if (!package_) {
      console.log('❌ Package not found:', packageId);
      return res.status(404).json({
        success: false,
        message: 'Package not found'
      });
    }

    // Check if user owns this package
    const packageOwnerId = package_.serviceProvider?.toString() || package_.serviceProvider;
    if (packageOwnerId !== userId) {
      console.log('❌ Package ownership check failed:', {
        packageId,
        packageOwner: packageOwnerId,
        requestingUser: userId
      });
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to modify this package'
      });
    }

    console.log('✅ Package ownership verified');
    
    // Re-fetch with full document for modification operations
    try {
      const fullPackage = await Package.findById(packageId);
      req.package = fullPackage; // Attach package to request for further use
    } catch (refetchError) {
      console.error('❌ Error refetching package:', refetchError);
      return res.status(500).json({
        success: false,
        message: 'Error accessing package data'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Package ownership check error:', error);
    
    // Handle specific error types
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid package ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to verify package ownership',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Enhanced middleware to check if package can be modified
export const requireModifiablePackage = async (req, res, next) => {
  try {
    const package_ = req.package; // Should be set by requirePackageOwnership

    if (!package_) {
      return res.status(500).json({
        success: false,
        message: 'Package data not found in request. Please ensure proper middleware order.'
      });
    }

    console.log('🔍 Checking if package can be modified:', {
      packageId: package_._id,
      status: package_.status,
      hasPendingChanges: !!package_.pendingChanges,
      pendingType: package_.pendingChanges?.requestType
    });

    // Check if package is in a state that allows modification
    if (package_.status === 'deleted') {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify deleted packages'
      });
    }

    // Special handling for packages with pending changes
    if (package_.pendingChanges) {
      const pendingType = package_.pendingChanges.requestType;
      
      if (pendingType === 'delete') {
        return res.status(400).json({
          success: false,
          message: 'This package has a pending deletion request. Please wait for admin approval or contact admin to cancel the deletion request.',
          hasPendingChanges: true,
          pendingRequestType: 'delete'
        });
      }
      
      // For update requests, we can proceed but warn the user
      if (pendingType === 'update') {
        console.log('⚠️ Package has pending update changes, proceeding with new modification');
        // This will overwrite the existing pending changes
      }
    }

    console.log('✅ Package can be modified');
    next();
  } catch (error) {
    console.error('❌ Package modifiability check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify package can be modified',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// New middleware to validate package data
export const validatePackageData = (req, res, next) => {
  try {
    const {
      packageName,
      packageType,
      targetAudience,
      packageDescription,
      totalPrice,
      totalDuration
    } = req.body;

    const errors = [];

    // Required field validation
    if (!packageName?.trim()) {
      errors.push('Package name is required');
    } else if (packageName.trim().length < 2) {
      errors.push('Package name must be at least 2 characters long');
    }

    if (!packageType) {
      errors.push('Package type is required');
    } else if (!['bridal', 'party', 'wedding', 'festival', 'custom'].includes(packageType)) {
      errors.push('Invalid package type');
    }

    if (!targetAudience) {
      errors.push('Target audience is required');
    } else if (!['Women', 'Men', 'Kids', 'Unisex'].includes(targetAudience)) {
      errors.push('Invalid target audience');
    }

    if (!packageDescription?.trim()) {
      errors.push('Package description is required');
    } else if (packageDescription.trim().length < 10) {
      errors.push('Package description must be at least 10 characters long');
    }

    // Numeric validation
    const price = parseFloat(totalPrice);
    if (!totalPrice || isNaN(price) || price <= 0) {
      errors.push('Valid total price is required');
    }

    const duration = parseInt(totalDuration);
    if (!totalDuration || isNaN(duration) || duration < 30 || duration > 1200) {
      errors.push('Package duration must be between 30 and 1200 minutes');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    next();
  } catch (error) {
    console.error('❌ Package data validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Validation error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};