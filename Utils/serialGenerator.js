//Utils/serialGenerator.js - FIXED SERVICE ID GENERATION WITH SP PREFIX
import Service from '../models/Service.js';
import User from '../models/User.js';

// FIXED: Generate Service Serial Number with SP prefix (matching your expectation)
export const generateServiceSerial = async () => {
  try {
    console.log('🔍 Generating Service ID with SP prefix...');
    
    // CRITICAL FIX: Use SP prefix for services (not S)
    // CRITICAL FIX: Find ANY service with serviceId, regardless of status
    // This ensures rejected services also get proper sequential IDs
    const lastService = await Service.findOne({
      serviceId: { $regex: /^SP\d{3}$/ } // ✅ FIXED: SP prefix, exactly 3 digits
    }).sort({ serviceId: -1 });
    
    let nextNumber = 1;
    if (lastService && lastService.serviceId) {
      console.log('🔍 Last service found:', lastService.serviceId);
      const lastNumber = parseInt(lastService.serviceId.replace('SP', ''), 10);
      nextNumber = lastNumber + 1;
    }
    
    const newServiceId = `SP${nextNumber.toString().padStart(3, '0')}`;
    console.log('✅ Generated Service ID:', newServiceId);
    return newServiceId;
    
  } catch (error) {
    console.error('❌ Error generating service serial:', error);
    // Fallback to timestamp-based ID with SP prefix
    const fallbackId = `SP${Date.now().toString().slice(-3)}`;
    console.log('⚠️ Using fallback Service ID:', fallbackId);
    return fallbackId;
  }
};

// Generate Service Provider Serial (Fixed to match SP### format)
export const generateServiceProviderSerial = async () => {
  try {
    console.log('🔍 generateServiceProviderSerial called');
    
    // Check existing service provider IDs in User model (ONLY approved ones)
    // FIXED: Using SP prefix (not SPR) to match User model validation
    const lastProvider = await User.findOne({
      role: 'serviceProvider',
      approvalStatus: 'approved',
      serviceProviderId: { $regex: /^SP\d{3}$/ } // SP followed by exactly 3 digits
    }).sort({ serviceProviderId: -1 });
    
    let nextNumber = 1;
    if (lastProvider && lastProvider.serviceProviderId) {
      const lastNumber = parseInt(lastProvider.serviceProviderId.replace('SP', ''), 10);
      nextNumber = lastNumber + 1;
    }
    
    // FIXED: Use SP prefix (not SPR) to match User model validation
    const newId = `SP${nextNumber.toString().padStart(3, '0')}`;
    console.log('✅ Generated new Provider ID:', newId);
    return newId;
    
  } catch (error) {
    console.error('❌ Error generating service provider serial:', error);
    // FIXED: Use SP prefix in fallback too
    const fallbackId = `SP${Date.now().toString().slice(-3)}`;
    console.log('⚠️ Using fallback Provider ID:', fallbackId);
    return fallbackId;
  }
};



// Get or create service provider ID (only for approved providers)
export const getOrCreateServiceProviderId = async (userId) => {
  try {
    console.log('Getting or creating service provider ID for user:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.role !== 'serviceProvider') {
      throw new Error('User is not a service provider');
    }

    if (user.approvalStatus !== 'approved') {
      console.log('Service provider not yet approved - no ID will be generated');
      return null;
    }
    
    if (user.serviceProviderId) {
      console.log('Found existing provider ID:', user.serviceProviderId);
      return user.serviceProviderId;
    }
    
    const newProviderId = await generateServiceProviderSerial();
    await User.findByIdAndUpdate(userId, { serviceProviderId: newProviderId });
    
    console.log('Created new provider ID:', newProviderId, 'for user:', userId);
    return newProviderId;
  } catch (error) {
    console.error('Error getting or creating service provider ID:', error);
    throw error;
  }
};

// Get existing service provider ID without creating new one
export const getExistingServiceProviderId = async (userId) => {
  try {
    const user = await User.findById(userId).select('serviceProviderId approvalStatus role');
    if (user && 
        user.role === 'serviceProvider' && 
        user.approvalStatus === 'approved' && 
        user.serviceProviderId && 
        user.serviceProviderId.trim() !== '') {
      return user.serviceProviderId;
    }
    return null;
  } catch (error) {
    console.error('Error getting existing service provider ID:', error);
    return null;
  }
};