import User from '../models/User.js';
import Service from '../models/Service.js';

// Controller to fetch counts for customers, providers, and services
export const getStats = async (req, res) => {
  try {
    const customerCount = await User.countDocuments({ role: 'customer' });
    const providerCount = await User.countDocuments({ role: 'serviceProvider', approvalStatus: 'approved' });
    const serviceCount = await Service.countDocuments({ status: 'approved', isActive: true });

    res.json({
      success: true,
      data: {
        customers: customerCount,
        providers: providerCount,
        services: serviceCount
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
