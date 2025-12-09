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
    
    // ENHANCED: Check ALL existing service provider IDs in User model (regardless of status, active state, or deletion)
    // This ensures we never reuse an ID even if service providers leave the system
    
    // First approach: Check current providers (active or not, even deleted ones)
    const lastProvider = await User.findOne({
      serviceProviderId: { $regex: /^SP\d{3}$/ } // SP followed by exactly 3 digits
    }).sort({ serviceProviderId: -1 });
    
    let nextNumber = 1;
    if (lastProvider && lastProvider.serviceProviderId) {
      const lastNumber = parseInt(lastProvider.serviceProviderId.replace('SP', ''), 10);
      nextNumber = lastNumber + 1;
    } else {
      // If no service providers with IDs found, query historical records using more comprehensive approach
      const highestIdRecord = await User.aggregate([
        {
          $match: { 
            serviceProviderId: { $regex: /^SP\d{3}$/ }, // Match SP prefix with 3 digits
          }
        },
        {
          $project: {
            numericId: { 
              $toInt: { $substr: ["$serviceProviderId", 2, 3] } // Extract the numeric part
            }
          }
        },
        { $sort: { numericId: -1 } },
        { $limit: 1 }
      ]);
      
      if (highestIdRecord && highestIdRecord.length > 0 && highestIdRecord[0].numericId) {
        nextNumber = highestIdRecord[0].numericId + 1;
      }
      
      // Also check deleted providers that might have been completely removed from the system
      // by looking at services that reference providers that no longer exist
      const servicesWithDeletedProviders = await Service.find({
        serviceProviderId: { $regex: /^SP\d{3}$/ }
      }).sort({ serviceProviderId: -1 });
      
      if (servicesWithDeletedProviders && servicesWithDeletedProviders.length > 0) {
        for (const service of servicesWithDeletedProviders) {
          if (service.serviceProviderId) {
            const providerIdNum = parseInt(service.serviceProviderId.replace('SP', ''), 10);
            if (!isNaN(providerIdNum) && providerIdNum >= nextNumber) {
              nextNumber = providerIdNum + 1;
              console.log(`🔍 Found higher ID from deleted provider's service: SP${providerIdNum} → new next ID: SP${nextNumber}`);
            }
          }
        }
      }
    }
    
    // Generate new ID with SP prefix followed by 3-digit number
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

// Function to check for duplicate service provider IDs and fix them - FIXED duplicate $ne
export const checkAndFixDuplicateServiceProviderIds = async () => {
  try {
    console.log('🔍 Checking for duplicate service provider IDs...');
    
    // Find all service providers with IDs - FIXED: Use $nin instead of duplicate $ne
    const serviceProviders = await User.find({
      role: 'serviceProvider',
      serviceProviderId: { $exists: true, $nin: [null, ''] } // ✅ FIXED: Use $nin instead of duplicate $ne
    }).sort({ createdAt: 1 }); // Sort by creation date ascending
    
    if (!serviceProviders.length) {
      console.log('✅ No service providers with IDs found');
      return { checked: true, fixed: 0 };
    }
    
    console.log(`🔍 Found ${serviceProviders.length} service providers with IDs`);
    
    // Track used IDs to detect duplicates
    const usedIds = new Map();
    let fixCount = 0;
    
    for (const provider of serviceProviders) {
      const currentId = provider.serviceProviderId;
      
      // If this ID is already used by another provider, assign a new one
      if (usedIds.has(currentId)) {
        console.log(`⚠️ Found duplicate ID ${currentId} for provider ${provider._id}`);
        
        // Generate a new unique ID
        const newId = await generateServiceProviderSerial();
        
        console.log(`🔄 Reassigning provider ${provider._id} from ${currentId} to ${newId}`);
        
        // Update the provider with the new ID
        provider.serviceProviderId = newId;
        await provider.save();
        
        // Also update any services using this provider ID
        const updatedServices = await Service.updateMany(
          { serviceProvider: provider._id },
          { serviceProviderId: newId }
        );
        
        console.log(`🔄 Updated ${updatedServices.modifiedCount} services with new provider ID`);
        fixCount++;
      }
      
      // Track this ID as used
      usedIds.set(currentId, provider._id);
    }
    
    return { 
      checked: true, 
      total: serviceProviders.length,
      fixed: fixCount 
    };
    
  } catch (error) {
    console.error('❌ Error checking duplicate service provider IDs:', error);
    return { checked: false, error: error.message };
  }
};