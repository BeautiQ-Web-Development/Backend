//Utils/serialGenerator.js - COMPLETE FIXED VERSION
import Service from '../models/Service.js';
import Package from '../models/Package.js';
import User from '../models/User.js';

// In Utils/serialGenerator.js - Make sure you have this function:

export const generateServiceProviderSerial = async () => {
  try {
    console.log('🔍 generateServiceProviderSerial called');
    
    // Import User model dynamically
    const User = (await import('../models/User.js')).default;
    
    // Check existing service provider IDs in User model (ONLY approved ones)
    const lastProvider = await User.findOne({
      role: 'serviceProvider',
      approvalStatus: 'approved',
      serviceProviderId: { $regex: /^SP\d{3}$/ }
    }).sort({ serviceProviderId: -1 });
    
    let nextNumber = 1;
    if (lastProvider && lastProvider.serviceProviderId) {
      const lastNumber = parseInt(lastProvider.serviceProviderId.replace('SP', ''));
      nextNumber = lastNumber + 1;
    }
    
    // Also check Service and Package collections for existing SP IDs
    try {
      const Service = (await import('../models/Service.js')).default;
      const Package = (await import('../models/Package.js')).default;
      
      const [lastServiceSP, lastPackageSP] = await Promise.all([
        Service.findOne({
          serviceProviderId: { $regex: /^SP\d{3}$/ }
        }).sort({ serviceProviderId: -1 }),
        Package.findOne({
          serviceProviderId: { $regex: /^SP\d{3}$/ }
        }).sort({ serviceProviderId: -1 })
      ]);
      
      // Find the highest existing number across all collections
      const serviceNumber = lastServiceSP?.serviceProviderId ? 
        parseInt(lastServiceSP.serviceProviderId.replace('SP', '')) : 0;
      const packageNumber = lastPackageSP?.serviceProviderId ? 
        parseInt(lastPackageSP.serviceProviderId.replace('SP', '')) : 0;
      
      nextNumber = Math.max(nextNumber, serviceNumber + 1, packageNumber + 1);
    } catch (collectionError) {
      console.warn('Warning checking Service/Package collections:', collectionError);
      // Continue with User-based numbering
    }
    
    const newId = `SP${nextNumber.toString().padStart(3, '0')}`;
    console.log('✅ Generated new Provider ID:', newId);
    return newId;
    
  } catch (error) {
    console.error('❌ Error generating service provider serial:', error);
    // Fallback to timestamp-based ID
    const fallbackId = `SP${Date.now().toString().slice(-3)}`;
    console.log('⚠️ Using fallback ID:', fallbackId);
    return fallbackId;
  }
};

// Generate Service Serial Number
export const generateServiceSerial = async () => {
  try {
    // Get the highest existing service serial number
    const lastService = await Service.findOne({
      serviceId: { $regex: /^S\d{3}$/ }
    }).sort({ serviceId: -1 });
    
    let nextNumber = 1;
    if (lastService && lastService.serviceId) {
      const lastNumber = parseInt(lastService.serviceId.replace('S', ''));
      nextNumber = lastNumber + 1;
    }
    
    return `S${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating service serial:', error);
    // Fallback to timestamp-based ID
    return `S${Date.now().toString().slice(-3)}`;
  }
};

// Generate Package Serial Number
export const generatePackageSerial = async () => {
  try {
    // Get the highest existing package serial number
    const lastPackage = await Package.findOne({
      packageId: { $regex: /^PKG_\d{3}$/ }
    }).sort({ packageId: -1 });
    
    let nextNumber = 1;
    if (lastPackage && lastPackage.packageId) {
      const lastNumber = parseInt(lastPackage.packageId.replace('PKG_', ''));
      nextNumber = lastNumber + 1;
    }
    
    return `PKG_${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating package serial:', error);
    // Fallback to timestamp-based ID
    return `PKG_${nextNumber.toString().padStart(3, '0')}`;
  }
};

// 🔧 FIXED: Only create Provider ID for approved service providers
export const getOrCreateServiceProviderId = async (userId) => {
  try {
    console.log('Getting or creating service provider ID for user:', userId);
    
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // 🔧 CRITICAL FIX: Only generate ID for approved service providers
    if (user.role !== 'serviceProvider') {
      throw new Error('User is not a service provider');
    }

    if (user.approvalStatus !== 'approved') {
      console.log('Service provider not yet approved - no ID will be generated');
      return null; // Return null for non-approved providers
    }
    
    // If user already has a serviceProviderId, return it
    if (user.serviceProviderId) {
      console.log('Found existing provider ID:', user.serviceProviderId);
      return user.serviceProviderId;
    }
    
    // Generate new ID only for approved providers
    const newProviderId = await generateServiceProviderSerial();
    await User.findByIdAndUpdate(userId, { serviceProviderId: newProviderId });
    
    console.log('Created new provider ID:', newProviderId, 'for user:', userId);
    return newProviderId;
  } catch (error) {
    console.error('Error getting or creating service provider ID:', error);
    throw error;
  }
};

// 🔧 ENHANCED: Utility function to ensure service provider has an ID (only for approved)
// Add this debug version to your Utils/serialGenerator.js:

export const ensureServiceProviderHasId = async (userId) => {
  console.log('🔍 ensureServiceProviderHasId called with userId:', userId);
  
  try {
    console.log('🔍 Importing User model...');
    const User = (await import('../models/User.js')).default;
    
    console.log('🔍 Finding user by ID...');
    const user = await User.findById(userId);
    
    if (!user) {
      console.log('❌ User not found in ensureServiceProviderHasId');
      throw new Error('User not found');
    }

    console.log('🔍 User found:', {
      id: user._id,
      role: user.role,
      approvalStatus: user.approvalStatus,
      hasProviderId: !!user.serviceProviderId
    });

    if (user.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider');
      throw new Error('User is not a service provider');
    }

    if (user.approvalStatus !== 'approved') {
      console.log('❌ Service provider not yet approved');
      throw new Error('Cannot generate Provider ID for non-approved service provider');
    }
    
    // Check if user already has serviceProviderId
    if (user.serviceProviderId && user.serviceProviderId.trim() !== '' && user.serviceProviderId !== 'Not assigned') {
      console.log('✅ Provider already has ID:', user.serviceProviderId);
      return user.serviceProviderId;
    }
    
    console.log('🔍 Generating new Provider ID...');
    const newProviderId = await generateServiceProviderSerial();
    
    console.log('🔍 Updating user with new Provider ID...');
    await User.findByIdAndUpdate(userId, { serviceProviderId: newProviderId });
    
    console.log('✅ Assigned new provider ID:', newProviderId, 'to user:', userId);
    return newProviderId;
    
  } catch (error) {
    console.error('❌ Error in ensureServiceProviderHasId:', error);
    console.error('❌ Stack trace:', error.stack);
    throw error;
  }
};

// 🔧 NEW: Check if service provider already has ID
export const hasServiceProviderId = async (userId) => {
  try {
    const user = await User.findById(userId).select('serviceProviderId approvalStatus role');
    return !!(user && 
             user.role === 'serviceProvider' && 
             user.approvalStatus === 'approved' && 
             user.serviceProviderId && 
             user.serviceProviderId.trim() !== '');
  } catch (error) {
    console.error('Error checking if service provider has ID:', error);
    return false;
  }
};

// 🔧 NEW: Get existing service provider ID without creating new one (only for approved)
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

// 🔧 ENHANCED: Migration function to add IDs to existing records (only approved providers)
export const addMissingIds = async () => {
  try {
    console.log('Starting migration to add missing IDs...');
    
    // Add service provider IDs to approved users who don't have them
    const approvedProvidersWithoutIds = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'approved', // 🔧 CRITICAL: Only approved providers
      $or: [
        { serviceProviderId: { $exists: false } },
        { serviceProviderId: null },
        { serviceProviderId: '' }
      ]
    });
    
    console.log(`Found ${approvedProvidersWithoutIds.length} approved providers without IDs`);
    
    for (const provider of approvedProvidersWithoutIds) {
      // Use the safe function to prevent duplicates
      const providerId = await ensureServiceProviderHasId(provider._id);
      console.log(`Ensured provider ID ${providerId} for user ${provider._id}`);
    }
    
    // Add service IDs to approved services that don't have them
    const servicesWithoutIds = await Service.find({
      status: 'approved',
      $or: [
        { serviceId: { $exists: false } },
        { serviceId: null },
        { serviceId: '' }
      ]
    });
    
    console.log(`Found ${servicesWithoutIds.length} approved services without IDs`);
    
    for (const service of servicesWithoutIds) {
      const newServiceId = await generateServiceSerial();
      await Service.findByIdAndUpdate(service._id, { 
        serviceId: newServiceId,
        firstApprovedAt: service.firstApprovedAt || service.approvalDate || service.createdAt
      });
      console.log(`Added service ID ${newServiceId} to service ${service._id}`);
    }
    
    // Add package IDs to approved packages that don't have them
    const packagesWithoutIds = await Package.find({
      status: 'approved',
      $or: [
        { packageId: { $exists: false } },
        { packageId: null },
        { packageId: '' }
      ]
    });
    
    console.log(`Found ${packagesWithoutIds.length} approved packages without IDs`);
    
    for (const pkg of packagesWithoutIds) {
      const newPackageId = await generatePackageSerial();
      await Package.findByIdAndUpdate(pkg._id, { 
        packageId: newPackageId,
        firstApprovedAt: pkg.firstApprovedAt || pkg.approvedAt || pkg.createdAt
      });
      console.log(`Added package ID ${newPackageId} to package ${pkg._id}`);
    }
    
    console.log('Migration completed successfully');
    
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  }
};

// 🔧 NEW: Fix duplicate provider IDs (cleanup function)
export const fixDuplicateProviderIds = async () => {
  try {
    console.log('Starting cleanup of duplicate provider IDs...');
    
    // Find all approved service providers with their IDs
    const allProviders = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'approved', // 🔧 CRITICAL: Only approved providers
      serviceProviderId: { $exists: true, $ne: null, $ne: '' }
    }).sort({ createdAt: 1 }); // Oldest first
    
    const providerIdMap = new Map();
    const duplicates = [];
    
    // Identify duplicates
    allProviders.forEach(provider => {
      if (providerIdMap.has(provider.serviceProviderId)) {
        duplicates.push(provider);
      } else {
        providerIdMap.set(provider.serviceProviderId, provider);
      }
    });
    
    console.log(`Found ${duplicates.length} duplicate provider IDs`);
    
    // Assign new IDs to duplicates
    for (const duplicate of duplicates) {
      const newProviderId = await generateServiceProviderSerial();
      await User.findByIdAndUpdate(duplicate._id, { serviceProviderId: newProviderId });
      
      // Update all services with the old provider ID
      await Service.updateMany(
        { serviceProvider: duplicate._id },
        { serviceProviderId: newProviderId }
      );
      
      // Update all packages with the old provider ID
      await Package.updateMany(
        { serviceProvider: duplicate._id },
        { serviceProviderId: newProviderId }
      );
      
      console.log(`Fixed duplicate: User ${duplicate._id} now has provider ID ${newProviderId}`);
    }
    
    console.log('Duplicate cleanup completed successfully');
    
  } catch (error) {
    console.error('Error fixing duplicate provider IDs:', error);
    throw error;
  }
};