// Add these routes to your auth routes in the backend

// Get user counts for admin dashboard
router.get('/user-counts', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const customers = await User.countDocuments({ role: 'customer' });
    const serviceProviders = await User.countDocuments({ role: 'serviceProvider' });
    const pendingProviders = await User.countDocuments({ 
      role: 'serviceProvider', 
      approvalStatus: 'pending' 
    });
    const approvedProviders = await User.countDocuments({ 
      role: 'serviceProvider', 
      approvalStatus: 'approved' 
    });
    const totalUsers = customers + serviceProviders;

    res.json({
      success: true,
      counts: {
        customers,
        serviceProviders,
        pendingProviders,
        approvedProviders,
        totalUsers
      }
    });
  } catch (error) {
    console.error('Get user counts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user counts',
      error: error.message
    });
  }
});

// Get pending service providers for admin dashboard
router.get('/pending-service-providers', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const pendingProviders = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'pending'
    }).select('-password');

    res.json({
      success: true,
      providers: pendingProviders
    });
  } catch (error) {
    console.error('Get pending providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending providers',
      error: error.message
    });
  }
});

// Get approved service providers for customer browsing
router.get('/approved-service-providers', async (req, res) => {
  try {
    const approvedProviders = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'approved'
    }).select('-password');

    res.json({
      success: true,
      providers: approvedProviders
    });
  } catch (error) {
    console.error('Get approved providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get approved providers',
      error: error.message
    });
  }
});

// Approve service provider
router.put('/approve-provider/:providerId', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const provider = await User.findById(providerId);
    if (!provider) {
      return res.status(404).json({
        success: false,
        message: 'Provider not found'
      });
    }

    if (provider.role !== 'serviceProvider') {
      return res.status(400).json({
        success: false,
        message: 'User is not a service provider'
      });
    }

    provider.approvalStatus = 'approved';
    await provider.save();

    res.json({
      success: true,
      message: 'Service provider approved successfully',
      provider: {
        id: provider._id,
        businessName: provider.businessName,
        fullName: provider.fullName,
        approvalStatus: provider.approvalStatus
      }
    });
  } catch (error) {
    console.error('Approve provider error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve provider',
      error: error.message
    });
  }
});