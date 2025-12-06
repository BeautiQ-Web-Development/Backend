//controllers/authController.js - FIXED VERSION WITH PROPER SERVICE PROVIDER REQUEST HANDLING
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import express from 'express';
import {  
  sendResetEmail, 
  sendRejectionEmail, 
  sendApprovalEmail, 
  sendCustomerUpdateApprovalEmail, 
  sendCustomerUpdateRejectionEmail, 
  sendAccountDeletionApprovalEmail, 
  sendAccountDeletionRejectionEmail,
  sendServiceProviderUpdateApprovalEmail,
  sendServiceProviderUpdateRejectionEmail,
  sendServiceProviderDeleteApprovalEmail,
  sendServiceProviderDeleteRejectionEmail,
  sendServiceProviderRequestNotificationToAdmin
} from '../config/mailer.js';
import crypto from 'crypto';
import Service from '../models/Service.js';
import Booking from '../models/Booking.js';
import { createNotification, notifyNewCustomerRegistration } from './notificationController.js';

// Import BOTH functions from serial generator
import { generateServiceProviderSerial } from '../Utils/serialGenerator.js';

// Enhanced validation helper
const validateRegistrationData = (data, role) => {
  const errors = [];
  
  // Common validations
  if (!data.fullName || data.fullName.length < 2) {
    errors.push('Full name must be at least 2 characters');
  }
  
  if (!data.emailAddress || !/\S+@\S+\.\S+/.test(data.emailAddress)) {
    errors.push('Valid email address is required');
  }
  
  if (!data.password || data.password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  
  // Role-specific validations
  if (role === 'serviceProvider') {
    if (!data.businessName) errors.push('Business name is required');
    if (!data.city) errors.push('City is required');
    if (!data.nicNumber) errors.push('NIC number is required');
    if (!data.mobileNumber) errors.push('Mobile number is required');
  } else if (role === 'customer') {
    if (!data.nicNumber) errors.push('NIC number is required');
  }
  
  return errors;
};

export const register = async (req, res) => {
  try {
    console.log('🔄 Registration request received');
    console.log('📋 Request body keys:', Object.keys(req.body));
    console.log('📎 Files:', req.files ? Object.keys(req.files) : 'No files');
    
    const {
      fullName,
      emailAddress,
      password,
      // Common fields
      currentAddress,
      mobileNumber,
      nicNumber,
      // Service provider specific fields
      businessName,
      businessDescription,
      businessType,
      city,
      homeAddress,
      services,
      location,
      experienceYears,
      specialties,
      languages,
      policies
    } = req.body;

    // Determine role from request body, default to 'customer'
    let role = req.body.role || 'customer';
    if (req.path.includes('/register-admin')) {
      role = 'admin';
    } else if (req.path.includes('/register-customer')) {
      role = 'customer';
    } else if (req.path.includes('/register-service-provider') || req.path.includes('/register-serviceProvider')) {
      role = 'serviceProvider';
    }

    console.log('👤 Role:', role);
    console.log('📧 Email:', emailAddress);

    // CRITICAL: Check admin existence based on role
    const existingAdmin = await User.findOne({ role: 'admin' });
    
    if (role === 'admin') {
      // For admin registration, check if admin already exists
      if (existingAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin account already exists. Only one admin is allowed.',
          code: 'ADMIN_ALREADY_EXISTS',
          adminExists: true
        });
      }
    } else {
      // For customer and service provider registration, admin MUST exist first
      if (!existingAdmin) {
        return res.status(403).json({
          success: false,
          message: 'System setup incomplete. An administrator account must be created first before other users can register.',
          code: 'NO_ADMIN_EXISTS'
        });
      }
    }

    // Validate required fields
    const validationErrors = validateRegistrationData(req.body, role);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ emailAddress });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email address is already registered'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Prepare user data
    const userData = {
      fullName,
      emailAddress,
      password: hashedPassword,
      role,
      approved: (role === 'customer' || role === 'admin') ? true : false,
      isActive: true, // CRITICAL: Set isActive to true by default
      createdAt: new Date()
    };

    // Add common fields
    if (currentAddress) userData.currentAddress = currentAddress;
    if (mobileNumber) userData.mobileNumber = mobileNumber;
    if (nicNumber) userData.nicNumber = nicNumber;

    // Handle profile photo upload for ALL user types (customer, admin, serviceProvider)
    // This ensures every user can have a profile image from registration
    if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      // Store the S3 URL of the profile photo
      // multer-s3 automatically uploads to S3 and provides the URL in 'location'
      userData.profilePhoto = req.files.profilePhoto[0].location;
      console.log(`✅ Profile photo uploaded to S3 for ${role}:`, userData.profilePhoto);
    }

    // Add service provider specific fields
    if (role === 'serviceProvider') {
      // Parse services if they exist
      let parsedServices = [];
      if (typeof services === 'string') {
        try {
          parsedServices = JSON.parse(services);
        } catch (jsonErr) {
          console.warn('🚨 services JSON.parse failed, falling back to eval:', jsonErr);
          try {
            parsedServices = Function('"use strict";return (' + services + ')')();
          } catch (evalErr) {
            console.error('❌ Failed to eval services:', evalErr);
            return res.status(400).json({
              success: false,
              message: 'Invalid services format',
              error: evalErr.message
            });
          }
        }
      } else if (Array.isArray(services)) {
        parsedServices = services;
      }
      if (!Array.isArray(parsedServices)) parsedServices = [];
      
      // Parse other fields
      let parsedLocation = (typeof location === 'string' && location)
        ? JSON.parse(location) : location || {};
      let parsedSpecialties = (typeof specialties === 'string' && specialties)
        ? JSON.parse(specialties) : specialties || [];
      let parsedLanguages = (typeof languages === 'string' && languages)
        ? JSON.parse(languages) : languages || [];
      let parsedPolicies = (typeof policies === 'string' && policies)
        ? JSON.parse(policies) : policies || {};

      // Construct experience object
      const experienceData = {
        years: experienceYears ? parseInt(experienceYears, 10) : 0,
        description: businessDescription || ''
      };

      userData.businessName = businessName;
      userData.businessDescription = businessDescription;
      userData.businessType = businessType;
      userData.city = city;
      userData.homeAddress = homeAddress;
      userData.services = parsedServices;
      userData.location = parsedLocation;
      userData.experience = experienceData;
      userData.specialties = parsedSpecialties;
      userData.languages = parsedLanguages;
      userData.policies = parsedPolicies;
      userData.approvalStatus = 'pending';
      
      // Generate Service Provider ID at registration time (not at approval)
      userData.serviceProviderId = await generateServiceProviderSerial();
      console.log('✅ Generated Service Provider ID at registration:', userData.serviceProviderId);

      // Handle additional file uploads for service providers (NIC and certificates)
      // Profile photo is already handled above for all user types
      // req.files now contains S3 file objects with 'location' property (the S3 URL)
      if (req.files) {
        // If NIC front photo was uploaded, store its S3 URL
        if (req.files.nicFrontPhoto && req.files.nicFrontPhoto[0]) {
          userData.nicFrontPhoto = req.files.nicFrontPhoto[0].location;
          console.log('✅ NIC front photo uploaded to S3:', userData.nicFrontPhoto);
        }
        // If NIC back photo was uploaded, store its S3 URL
        if (req.files.nicBackPhoto && req.files.nicBackPhoto[0]) {
          userData.nicBackPhoto = req.files.nicBackPhoto[0].location;
          console.log('✅ NIC back photo uploaded to S3:', userData.nicBackPhoto);
        }
        // If certificates were uploaded, store their S3 URLs as an array
        if (req.files.certificatesPhotos && req.files.certificatesPhotos.length > 0) {
          // Map through all certificate files and extract their S3 URLs
          userData.certificatesPhotos = req.files.certificatesPhotos.map(file => file.location);
          console.log(`✅ ${userData.certificatesPhotos.length} certificate(s) uploaded to S3`);
        }
      }

      console.log('🏢 Service provider data prepared for saving');
    }

    // Create and save user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    console.log('✅ User saved successfully:', {
      id: savedUser._id,
      role: savedUser.role,
      approved: savedUser.approved,
      isActive: savedUser.isActive
    });

    // Create appropriate response message
    let message = 'User registered successfully';
    if (role === 'serviceProvider') {
      message = 'Service provider registration submitted successfully. Your application is pending admin approval.';
    } else if (role === 'admin') {
      message = 'Admin account created successfully';
    }

    // Notify admin of new customer registration - FIXED TO PREVENT DUPLICATE NOTIFICATIONS
    if (role === 'customer') {
      try {
        // Import the function from the correct controller
        const { notifyNewCustomerRegistration } = await import('./notificationController.js');
        await notifyNewCustomerRegistration(savedUser);
        console.log('✅ Admin notification sent for new customer registration');
      } catch (error) {
        console.error('❌ Failed to notify admin of new customer registration:', error);
        // Continue with registration even if notification fails
      }
    }

    // Notify admin of new service provider registration
    if (role === 'serviceProvider') {
      try {
        const { notifyNewServiceProviderRegistration } = await import('./notificationController.js');
        await notifyNewServiceProviderRegistration(savedUser);
        console.log('✅ Admin notification sent for new service provider registration');
      } catch (error) {
        console.error('❌ Failed to notify admin of new service provider registration:', error);
        // Continue with registration even if notification fails
      }
    }

    res.status(201).json({
      success: true,
      message,
      data: {
        userId: savedUser._id,
        fullName: savedUser.fullName,
        emailAddress: savedUser.emailAddress,
        role: savedUser.role,
        approved: savedUser.approved,
        isActive: savedUser.isActive
      }
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Registration failed due to server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const login = async (req, res) => {
  try {
    const { emailAddress, password, role } = req.body;
    
    console.log('🔐 Login attempt:', { emailAddress, role });

    if (!emailAddress || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, and role are required'
      });
    }

    // Find user with the specified role
    const user = await User.findOne({ emailAddress, role });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or user role'
      });
    }

    // CRITICAL FIX: Check if account is deactivated/deleted
    if (user.isActive === false) {
      console.log('🚫 Blocked login attempt for deactivated account:', {
        userId: user._id,
        email: user.emailAddress,
        role: user.role,
        isActive: user.isActive,
        deletedAt: user.deletedAt
      });
      
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support for assistance.',
        accountDeactivated: true
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if service provider is approved
    if (role === 'serviceProvider') {
      const isApproved = user.approvalStatus === 'approved' || user.approved === true;
      if (!isApproved) {
        return res.status(403).json({
          success: false,
          message: 'Your service provider account is pending admin approval',
          pendingApproval: true,
          userStatus: {
            approvalStatus: user.approvalStatus,
            approved: user.approved
          }
        });
      }
    }

    // Update user's online status
    user.isOnline = true;
    user.lastSeen = new Date();
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role,
        approved: user.approved || user.approvalStatus === 'approved',
        isActive: user.isActive
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Login successful for user:', {
      id: user._id,
      role: user.role,
      approved: user.approved || user.approvalStatus === 'approved',
      isActive: user.isActive
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
        approved: user.approved || user.approvalStatus === 'approved',
        approvalStatus: user.approvalStatus,
        isActive: user.isActive,
        profilePhoto: user.profilePhoto,
        businessName: user.businessName, // For service providers
        mobileNumber: user.mobileNumber
      }
    });

  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

export const verifyToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // CRITICAL FIX: Check if account is deactivated
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated',
        accountDeactivated: true
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
        approved: user.approved,
        isActive: user.isActive,
        profilePhoto: user.profilePhoto,
        businessName: user.businessName, // For service providers
        mobileNumber: user.mobileNumber
      }
    });

  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

// Check if admin exists in the system (public endpoint)
export const checkAdminExists = async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    
    return res.status(200).json({
      success: true,
      adminExists: !!adminExists,
      systemInitialized: !!adminExists
    });
  } catch (error) {
    console.error('Error checking admin existence:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking system status'
    });
  }
};

// Get user profile
export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // CRITICAL FIX: Check if account is deactivated
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated',
        accountDeactivated: true
      });
    }
    
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('❌ Error getting profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// FIXED: Service Provider Profile Update Request with Enhanced Logging and Admin Notification
export const requestServiceProviderUpdate = async (req, res) => {
  try {
    const userId = req.user.userId;
    const updateData = { ...req.body };
    
    console.log('🔄 Service Provider update request received:', {
      userId,
      updateFields: Object.keys(updateData),
      updateData: JSON.stringify(updateData, null, 2)
    });

    // Remove sensitive fields that shouldn't be updated this way
    delete updateData.password;
    delete updateData._id;
    delete updateData.role;
    delete updateData.approved;
    delete updateData.approvalStatus;
    delete updateData.isActive;
    delete updateData.serviceProviderId;
    
    const serviceProvider = await User.findById(userId);
    
    if (!serviceProvider) {
      console.log('❌ Service provider not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    if (serviceProvider.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider:', {
        userId,
        role: serviceProvider.role
      });
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only for service providers'
      });
    }

    // Check if account is deactivated
    if (serviceProvider.isActive === false) {
      console.log('❌ Attempt to update deactivated account:', {
        userId,
        isActive: serviceProvider.isActive,
        deletedAt: serviceProvider.deletedAt
      });
      return res.status(403).json({
        success: false,
        message: 'Cannot update deactivated account',
        accountDeactivated: true
      });
    }
    
    // CRITICAL FIX: Store update request properly in user document
    serviceProvider.pendingUpdates = {
      fields: updateData,
      requestedAt: new Date(),
      status: 'pending',
      deleteRequested: false,
      requestType: 'update'
    };
    
    // Save with proper validation
    const savedProvider = await serviceProvider.save();
    
    console.log('✅ Service Provider update request saved successfully:', {
      userId: savedProvider._id,
      businessName: savedProvider.businessName,
      hasPendingUpdates: !!savedProvider.pendingUpdates,
      pendingStatus: savedProvider.pendingUpdates?.status,
      requestType: savedProvider.pendingUpdates?.requestType,
      fieldsToUpdate: Object.keys(savedProvider.pendingUpdates?.fields || {})
    });

    // CRITICAL FIX: Send notification to admin with better error handling
    try {
      console.log('📧 Attempting to send admin notification email...');
      await sendServiceProviderRequestNotificationToAdmin(
        savedProvider, 
        'Profile Update Request',
        `Service provider ${savedProvider.businessName} has requested to update their profile information.`
      );
      console.log('✅ Admin notification email sent successfully for service provider update request');
    } catch (emailError) {
      console.error('❌ Failed to send admin notification email:', {
        error: emailError.message,
        stack: emailError.stack,
        providerId: savedProvider._id,
        businessName: savedProvider.businessName
      });
      // Don't fail the request if email fails, but log it
    }

    // Send in-app notification to admin
    try {
      const { notifyServiceProviderUpdateRequest } = await import('./notificationController.js');
      await notifyServiceProviderUpdateRequest(savedProvider, updateData);
      console.log('✅ Admin in-app notification sent for service provider update request');
    } catch (notifError) {
      console.error('❌ Failed to send in-app notification:', notifError);
      // Don't fail the request if notification fails
    }
    
    res.status(200).json({
      success: true,
      message: 'Profile update request submitted successfully. Admin has been notified and will review your request.',
      pendingUpdates: {
        status: savedProvider.pendingUpdates.status,
        requestType: savedProvider.pendingUpdates.requestType,
        requestedAt: savedProvider.pendingUpdates.requestedAt,
        fieldsCount: Object.keys(savedProvider.pendingUpdates.fields).length
      }
    });
  } catch (error) {
    console.error('❌ Error requesting service provider update:', {
      error: error.message,
      stack: error.stack,
      userId,
      updateData: Object.keys(updateData || {})
    });
    res.status(500).json({
      success: false,
      message: 'Server error while processing update request'
    });
  }
};

// FIXED: Service Provider Account Deletion Request with Enhanced Logging and Admin Notification
export const requestServiceProviderDeletion = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reason } = req.body;
    
    console.log('🗑️ Service Provider deletion request received:', {
      userId,
      reason: reason || 'No reason provided',
      reasonLength: reason ? reason.length : 0
    });

    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Deletion reason is required and must be at least 10 characters long'
      });
    }
    
    const serviceProvider = await User.findById(userId);
    
    if (!serviceProvider) {
      console.log('❌ Service provider not found for deletion:', userId);
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    if (serviceProvider.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider for deletion:', {
        userId,
        role: serviceProvider.role
      });
      return res.status(403).json({
        success: false,
        message: 'This endpoint is only for service providers'
      });
    }

    // Check if account is already deactivated
    if (serviceProvider.isActive === false) {
      console.log('❌ Account already deactivated:', {
        userId,
        isActive: serviceProvider.isActive,
        deletedAt: serviceProvider.deletedAt
      });
      return res.status(400).json({
        success: false,
        message: 'Account is already deactivated'
      });
    }
    
    // CRITICAL FIX: Store deletion request using pendingUpdates schema
    serviceProvider.pendingUpdates = {
      fields: {},
      requestedAt: new Date(),
      status: 'pending',
      deleteRequested: true,
      requestType: 'delete',
      reason: reason.trim()
    };
    
    // Save with proper validation
    const savedProvider = await serviceProvider.save();
    
    console.log('✅ Service Provider deletion request saved successfully:', {
      userId: savedProvider._id,
      businessName: savedProvider.businessName,
      deleteRequested: savedProvider.pendingUpdates?.deleteRequested,
      reason: savedProvider.pendingUpdates?.reason,
      requestedAt: savedProvider.pendingUpdates?.requestedAt,
      status: savedProvider.pendingUpdates?.status
    });

    // CRITICAL FIX: Send notification to admin with better error handling
    try {
      console.log('📧 Attempting to send admin notification email for deletion request...');
      await sendServiceProviderRequestNotificationToAdmin(
        savedProvider, 
        'Account Deletion Request',
        `Service provider ${savedProvider.businessName} has requested to delete their account. Reason: ${reason.substring(0, 100)}${reason.length > 100 ? '...' : ''}`
      );
      console.log('✅ Admin notification email sent successfully for service provider deletion request');
    } catch (emailError) {
      console.error('❌ Failed to send admin notification email for deletion:', {
        error: emailError.message,
        stack: emailError.stack,
        providerId: savedProvider._id,
        businessName: savedProvider.businessName
      });
      // Don't fail the request if email fails, but log it
    }

    // Send in-app notification to admin
    try {
      const { notifyServiceProviderDeleteRequest } = await import('./notificationController.js');
      await notifyServiceProviderDeleteRequest(savedProvider, reason.trim());
      console.log('✅ Admin in-app notification sent for service provider deletion request');
    } catch (notifError) {
      console.error('❌ Failed to send in-app notification:', notifError);
      // Don't fail the request if notification fails
    }
    
    res.status(200).json({
      success: true,
      message: 'Account deletion request submitted successfully. Admin has been notified and will review your request.',
      pendingDeletion: {
        status: savedProvider.pendingUpdates.status,
        requestType: savedProvider.pendingUpdates.requestType,
        requestedAt: savedProvider.pendingUpdates.requestedAt,
        reason: savedProvider.pendingUpdates.reason
      }
    });
  } catch (error) {
    console.error('❌ Error requesting service provider deletion:', {
      error: error.message,
      stack: error.stack,
      userId,
      reason: reason || 'No reason provided'
    });
    res.status(500).json({
      success: false,
      message: 'Server error while processing deletion request'
    });
  }
};

// Update user profile (pending admin approval) - For customers
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const updateData = { ...req.body };
    
    console.log('🔍 Customer profile update request:', {
      userId,
      updateFields: Object.keys(updateData),
      updateData
    });

    // Remove sensitive fields that shouldn't be updated this way
    delete updateData.password;
    delete updateData._id;
    delete updateData.role;
    delete updateData.approved;
    delete updateData.approvalStatus;
    delete updateData.isActive;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if account is deactivated
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update deactivated account',
        accountDeactivated: true
      });
    }
    
    // Store update request properly in user document
    user.pendingUpdates = {
      fields: updateData,
      requestedAt: new Date(),
      status: 'pending',
      deleteRequested: false,
      requestType: 'update'
    };
    
    await user.save();
    
    // Verify the save worked
    const savedUser = await User.findById(userId);
    console.log('✅ Customer pending update saved:', {
      userId: savedUser._id,
      hasPendingUpdates: !!savedUser.pendingUpdates,
      pendingStatus: savedUser.pendingUpdates?.status,
      requestType: savedUser.pendingUpdates?.requestType
    });
    
    res.status(200).json({
      success: true,
      message: 'Profile update request submitted successfully. Pending admin approval.'
    });
  } catch (error) {
    console.error('❌ Error updating customer profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Request account deletion/deactivation - For customers
export const requestAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reason } = req.body;
    
    console.log('🗑️ Customer account deletion request:', {
      userId,
      reason: reason || 'No reason provided'
    });
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if account is already deactivated
    if (user.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Account is already deactivated'
      });
    }
    
    // Store deletion request using pendingUpdates schema
    user.pendingUpdates = {
      fields: {},
      requestedAt: new Date(),
      status: 'pending',
      deleteRequested: true,
      requestType: 'delete',
      reason: reason || 'No reason provided'
    };
    
    await user.save();
    
    // Verify the deletion request was saved
    const savedUser = await User.findById(userId);
    console.log('✅ Customer deletion request saved:', {
      userId: savedUser._id,
      hasPendingUpdates: !!savedUser.pendingUpdates,
      deleteRequested: savedUser.pendingUpdates?.deleteRequested,
      requestType: savedUser.pendingUpdates?.requestType,
      reason: savedUser.pendingUpdates?.reason
    });
    
    res.status(200).json({
      success: true,
      message: 'Account deletion request submitted successfully. Pending admin review.'
    });
  } catch (error) {
    console.error('❌ Error requesting customer account deletion:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// FIXED: ADMIN - Approve Service Provider Update Request with proper email notifications
export const approveServiceProviderUpdate = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }
    
    const { providerId } = req.params;
    
    console.log('🟢 Admin approving service provider update/deletion:', { 
      providerId,
      adminId: req.user.userId 
    });
    
    const serviceProvider = await User.findById(providerId);
    if (!serviceProvider) {
      console.log('❌ Service provider not found for approval:', providerId);
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }
    
    if (serviceProvider.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider:', {
        providerId,
        role: serviceProvider.role
      });
      return res.status(400).json({
        success: false,
        message: 'User is not a service provider'
      });
    }
    
    if (!serviceProvider.pendingUpdates || serviceProvider.pendingUpdates.status !== 'pending') {
      console.log('❌ No pending updates found:', {
        providerId,
        hasPendingUpdates: !!serviceProvider.pendingUpdates,
        status: serviceProvider.pendingUpdates?.status
      });
      return res.status(400).json({
        success: false,
        message: 'No pending updates found for this service provider'
      });
    }
    
    // Determine if this is a deletion request
    const isDeletion = !!serviceProvider.pendingUpdates.deleteRequested;
    
    console.log('📋 Processing request:', {
      providerId,
      businessName: serviceProvider.businessName,
      isDeletion,
      requestType: serviceProvider.pendingUpdates.requestType,
      reason: serviceProvider.pendingUpdates.reason
    });

    if (serviceProvider.pendingUpdates.deleteRequested) {
      // CRITICAL: For account deletion, mark as INACTIVE and prevent login
      serviceProvider.isActive = false; // This prevents login
      serviceProvider.deletedAt = new Date();
      serviceProvider.deletionReason = serviceProvider.pendingUpdates.reason || 'Account deletion requested by service provider';
      
      // Add to status history
      if (!serviceProvider.statusHistory) serviceProvider.statusHistory = [];
      serviceProvider.statusHistory.push({
        status: 'deleted',
        timestamp: new Date(),
        changedBy: req.user.userId,
        reason: 'Account deletion request approved by admin'
      });
      
      console.log('🗑️ Service Provider account marked as INACTIVE:', {
        providerId: serviceProvider._id,
        businessName: serviceProvider.businessName,
        isActive: serviceProvider.isActive,
        deletedAt: serviceProvider.deletedAt,
        deletionReason: serviceProvider.deletionReason
      });
      
      // DELETE ALL S3 IMAGES ASSOCIATED WITH SERVICE PROVIDER
      try {
        const { deleteFromS3 } = await import('../config/s3.js');
        let deletedCount = 0;
        
        // Delete profile photo
        if (serviceProvider.profilePhoto && serviceProvider.profilePhoto.includes('amazonaws.com')) {
          await deleteFromS3(serviceProvider.profilePhoto);
          console.log('🗑️ Deleted profile photo from S3');
          deletedCount++;
        }
        
        // Delete NIC front photo
        if (serviceProvider.nicFrontPhoto && serviceProvider.nicFrontPhoto.includes('amazonaws.com')) {
          await deleteFromS3(serviceProvider.nicFrontPhoto);
          console.log('🗑️ Deleted NIC front photo from S3');
          deletedCount++;
        }
        
        // Delete NIC back photo
        if (serviceProvider.nicBackPhoto && serviceProvider.nicBackPhoto.includes('amazonaws.com')) {
          await deleteFromS3(serviceProvider.nicBackPhoto);
          console.log('🗑️ Deleted NIC back photo from S3');
          deletedCount++;
        }
        
        // Delete certificates photos
        if (serviceProvider.certificatesPhotos && Array.isArray(serviceProvider.certificatesPhotos)) {
          for (const certUrl of serviceProvider.certificatesPhotos) {
            if (certUrl && certUrl.includes('amazonaws.com')) {
              await deleteFromS3(certUrl);
              deletedCount++;
            }
          }
          console.log(`🗑️ Deleted ${serviceProvider.certificatesPhotos.length} certificate photo(s) from S3`);
        }
        
        console.log(`✅ Successfully deleted ${deletedCount} image(s) from S3 for service provider ${serviceProvider.businessName}`);
      } catch (s3Error) {
        console.error('❌ Error deleting S3 images for service provider:', s3Error);
        // Continue with deletion even if S3 cleanup fails
      }
      
      // Mark all services of provider as deleted and unavailable
      try {
        // Populate provider email for notifications
        const services = await Service.find({ serviceProvider: providerId })
          .populate('serviceProvider', 'emailAddress businessName');
        
        console.log(`🗑️ Marking ${services.length} services as unavailable for deleted provider ${serviceProvider.businessName}`);
        
        // Get all affected customers in one query
        const bookings = await Booking.find({
          serviceProviderId: providerId,
          status: { $ne: 'cancelled' }
        });
        
        const customerIds = [...new Set(bookings.map(b => b.customerId.toString()))];
        console.log(`📣 Found ${customerIds.length} affected customers to notify about ${services.length} unavailable services`);
        
        // Update all services in one batch
        for (const svc of services) {
          svc.status = 'deleted';
          svc.isActive = false;
          svc.availabilityStatus = 'No Longer Available';
          svc.deletedAt = new Date();
          svc.deletedBy = req.user.userId;
          svc.isPublished = false; // Ensure it's not published
          svc.isVisible = false;   // Make sure it's not visible to customers
          await svc.save();
          
          // Send individual service notifications to affected customers
          for (const customerId of customerIds) {
            await createNotification({
              sender: req.user.userId,
              receiver: customerId,
              message: `Service "${svc.name}" is no longer available as its provider has been deactivated.`,
              type: 'serviceUnavailable',
              data: {
                serviceId: svc._id,
                serviceName: svc.name,
                providerEmail: svc.serviceProvider.emailAddress,
                providerName: svc.serviceProvider.businessName,
                reason: `Provider ${serviceProvider.businessName} has been deleted from the platform.`
              }
            });
          }
        }
        console.log(`✅ Successfully updated ${services.length} services and sent notifications to ${customerIds.length} customers`);
      } catch (svcError) {
        console.error('❌ Error marking services deleted or notifying customers:', svcError);
      }
      // Notify all active customers of provider unavailability
      try {
        console.log(`📊 Status change tracked: provider account → deleted`);
        const customers = await User.find({ role: 'customer', isActive: true }).select('_id');
        console.log(`🔍 Found ${customers.length} active customers to notify about provider ${serviceProvider.businessName} unavailability`);
        
        let notificationCount = 0;
        for (const cust of customers) {
          try {
            // Using the newly added notification type
            await createNotification({
              sender: req.user.userId,
              receiver: cust._id.toString(),
              message: `Service provider "${serviceProvider.businessName}" is no longer available.`,
              type: 'providerUnavailable', // This type is now added to the Notification schema
              data: {
                providerId: serviceProvider._id,
                providerName: serviceProvider.businessName,
                reason: 'Provider account deleted',
                email: serviceProvider.emailAddress,
                businessName: serviceProvider.businessName
              }
            });
            notificationCount++;
          } catch (notifyErr) {
            console.error(`❌ Error creating notification for customer ${cust._id}:`, notifyErr);
          }
        }
        console.log(`✅ Created ${notificationCount} notifications out of ${customers.length} customers`);
      } catch (custErr) {
        console.error('❌ Error notifying customers of provider unavailability:', custErr);
      }
    } else {
      // Handle update request - Apply the pending updates
      const updates = serviceProvider.pendingUpdates.fields;
      const previousValues = {};
      
      console.log('📝 Applying profile updates:', {
        providerId: serviceProvider._id,
        businessName: serviceProvider.businessName,
        fieldsToUpdate: Object.keys(updates)
      });
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          // Store previous value for history
          previousValues[key] = serviceProvider[key];
          // Update the field
          serviceProvider[key] = updates[key];
          console.log(`📝 Updated ${key}: ${previousValues[key]} → ${updates[key]}`);
        }
      });
      
      console.log('✅ Applied service provider updates:', {
        providerId: serviceProvider._id,
        businessName: serviceProvider.businessName,
        updatedFields: Object.keys(updates),
        previousValues
      });
      
      // Send update approval email
      try {
        console.log('📧 Sending update approval email to service provider...');
        await sendServiceProviderUpdateApprovalEmail(serviceProvider, updates);
        console.log('✅ Service provider update approval email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send update approval email:', {
          error: emailError.message,
          providerId: serviceProvider._id,
          businessName: serviceProvider.businessName
        });
      }
    }
    
    // Mark the pending updates as approved
    serviceProvider.pendingUpdates.status = 'approved';
    serviceProvider.pendingUpdates.approvedAt = new Date();
    serviceProvider.pendingUpdates.approvedBy = req.user.userId;
    
    // Save first, then clear pending updates
    await serviceProvider.save();
    
    console.log('💾 Service provider saved with approval status');
    
    // Clear pending updates after successful approval
    serviceProvider.pendingUpdates = null;
    await serviceProvider.save();
    
    console.log(`✅ Service provider ${isDeletion ? 'deletion' : 'update'} approved and completed successfully`);
    
    res.status(200).json({
      success: true,
      message: isDeletion
        ? 'Account deletion request approved successfully. Service provider account has been deactivated and they have been notified.'
        : 'Profile update request approved successfully. Service provider has been notified via email.',
      serviceProvider: {
        _id: serviceProvider._id,
        businessName: serviceProvider.businessName,
        fullName: serviceProvider.fullName,
        isActive: serviceProvider.isActive,
        deletedAt: serviceProvider.deletedAt,
        deletionReason: serviceProvider.deletionReason
      }
    });
    
  } catch (error) {
    console.error('❌ Error approving service provider update:', {
      error: error.message,
      stack: error.stack,
      providerId: req.params.providerId
    });
    res.status(500).json({
      success: false,
      message: 'Server error while processing approval'
    });
  }
};

// FIXED: ADMIN - Reject Service Provider Update Request with proper email notifications
export const rejectServiceProviderUpdate = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }
    
    const { providerId } = req.params;
    const { rejectionReason } = req.body;
    
    console.log('🔴 Admin rejecting service provider update/deletion:', { 
      providerId, 
      rejectionReason: rejectionReason || 'No reason provided',
      adminId: req.user.userId
    });
    
    // Validate rejection reason
    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required and cannot be empty'
      });
    }
    
    const serviceProvider = await User.findById(providerId);
    if (!serviceProvider) {
      console.log('❌ Service provider not found for rejection:', providerId);
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }
    
    if (serviceProvider.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider:', {
        providerId,
        role: serviceProvider.role
      });
      return res.status(400).json({
        success: false,
        message: 'User is not a service provider'
      });
    }
    
    if (!serviceProvider.pendingUpdates || serviceProvider.pendingUpdates.status !== 'pending') {
      console.log('❌ No pending updates found for rejection:', {
        providerId,
        hasPendingUpdates: !!serviceProvider.pendingUpdates,
        status: serviceProvider.pendingUpdates?.status
      });
      return res.status(400).json({
        success: false,
        message: 'No pending updates found for this service provider'
      });
    }
    
    // Determine if this is a deletion request
    const isDeletion = !!serviceProvider.pendingUpdates.deleteRequested;
    
    console.log('📋 Processing rejection:', {
      providerId,
      businessName: serviceProvider.businessName,
      isDeletion,
      requestType: serviceProvider.pendingUpdates.requestType,
      rejectionReason: rejectionReason.trim()
    });
    
    // CRITICAL: DO NOT APPLY ANY CHANGES WHEN REJECTING
    // Just mark the pending updates as rejected, don't modify the original data
    
    serviceProvider.pendingUpdates.status = 'rejected';
    serviceProvider.pendingUpdates.rejectedAt = new Date();
    serviceProvider.pendingUpdates.rejectedBy = req.user.userId;
    serviceProvider.pendingUpdates.rejectionReason = rejectionReason.trim();
    
    // Add to status history
    if (!serviceProvider.statusHistory) serviceProvider.statusHistory = [];
    serviceProvider.statusHistory.push({
      status: serviceProvider.pendingUpdates.deleteRequested ? 'deletion_rejected' : 'update_rejected',
      timestamp: new Date(),
      changedBy: req.user.userId,
      reason: rejectionReason.trim()
    });
    
    console.log(`🔴 Service provider ${isDeletion ? 'deletion' : 'update'} request rejected - NO CHANGES APPLIED TO ORIGINAL DATA`);
    
    // Send notification to service provider about rejection
    try {
      console.log('📧 Sending rejection email to service provider...');
      if (serviceProvider.pendingUpdates.deleteRequested) {
        await sendServiceProviderDeleteRejectionEmail(serviceProvider, rejectionReason.trim());
        console.log('✅ Service provider deletion rejection email sent successfully');
      } else {
        await sendServiceProviderUpdateRejectionEmail(serviceProvider, rejectionReason.trim());
        console.log('✅ Service provider update rejection email sent successfully');
      }
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', {
        error: emailError.message,
        providerId: serviceProvider._id,
        businessName: serviceProvider.businessName,
        isDeletion
      });
      // Don't fail the request if email fails, but log it
    }
    
    // Save the rejection status first
    await serviceProvider.save();
    
    console.log('💾 Service provider saved with rejection status');
    
    // Clear pending updates after rejection
    serviceProvider.pendingUpdates = null;
    await serviceProvider.save();
    
    console.log(`✅ Service provider ${isDeletion ? 'deletion' : 'update'} rejected and completed successfully`);
    
    res.status(200).json({
      success: true,
      message: isDeletion
        ? 'Account deletion request rejected successfully. Service provider has been notified via email with the reason for rejection.'
        : 'Profile update request rejected successfully. Service provider has been notified via email with the reason for rejection.',
      rejectionDetails: {
        providerId: serviceProvider._id,
        businessName: serviceProvider.businessName,
        requestType: isDeletion ? 'delete' : 'update',
        rejectionReason: rejectionReason.trim(),
        rejectedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Error rejecting service provider update:', {
      error: error.message,
      stack: error.stack,
      providerId: req.params.providerId,
      rejectionReason
    });
    res.status(500).json({
      success: false,
      message: 'Server error while processing rejection'
    });
  }
};

// CRITICAL FIX: ADMIN: Approve customer update request with proper account deletion
export const approveCustomerUpdate = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }
    
    const { customerId } = req.params;
    
    console.log('🟢 Admin approving customer update/deletion:', {
      customerId,
      adminId: req.user.userId
    });
    
    const customer = await User.findById(customerId);
    if (!customer) {
      console.log('❌ Customer not found for approval:', customerId);
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    if (!customer.pendingUpdates || customer.pendingUpdates.status !== 'pending') {
      console.log('❌ No pending updates found for customer:', {
        customerId,
        hasPendingUpdates: !!customer.pendingUpdates,
        status: customer.pendingUpdates?.status
      });
      return res.status(400).json({
        success: false,
        message: 'No pending updates found for this customer'
      });
    }
    
    // Determine if this is a deletion request
    const isDeletion = !!customer.pendingUpdates.deleteRequested;
    
    console.log('📋 Processing customer request:', {
      customerId,
      customerName: customer.fullName,
      isDeletion,
      requestType: customer.pendingUpdates.requestType,
      reason: customer.pendingUpdates.reason
    });
    
    if (customer.pendingUpdates.deleteRequested) {
      // CRITICAL FIX: For account deletion, mark as INACTIVE and prevent login
      customer.isActive = false; // This prevents login
      customer.deletedAt = new Date();
      customer.deletionReason = customer.pendingUpdates.reason || 'Account deletion requested by customer';
      
      // Add to status history
      if (!customer.statusHistory) customer.statusHistory = [];
      customer.statusHistory.push({
        status: 'deleted',
        timestamp: new Date(),
        changedBy: req.user.userId,
        reason: 'Account deletion request approved by admin'
      });
      
      console.log('🗑️ Customer account marked as INACTIVE:', {
        customerId: customer._id,
        customerName: customer.fullName,
        isActive: customer.isActive,
        deletedAt: customer.deletedAt,
        deletionReason: customer.deletionReason
      });
      
      // DELETE S3 IMAGES ASSOCIATED WITH CUSTOMER
      try {
        const { deleteFromS3 } = await import('../config/s3.js');
        let deletedCount = 0;
        
        // Delete profile photo
        if (customer.profilePhoto && customer.profilePhoto.includes('amazonaws.com')) {
          await deleteFromS3(customer.profilePhoto);
          console.log('🗑️ Deleted customer profile photo from S3');
          deletedCount++;
        }
        
        // Delete NIC photo if customer has one
        if (customer.nicFrontPhoto && customer.nicFrontPhoto.includes('amazonaws.com')) {
          await deleteFromS3(customer.nicFrontPhoto);
          console.log('🗑️ Deleted customer NIC photo from S3');
          deletedCount++;
        }
        
        console.log(`✅ Successfully deleted ${deletedCount} image(s) from S3 for customer ${customer.fullName}`);
      } catch (s3Error) {
        console.error('❌ Error deleting S3 images for customer:', s3Error);
        // Continue with deletion even if S3 cleanup fails
      }
      
      // Send deletion approval email
      try {
        console.log('📧 Sending deletion approval email to customer...');
        await sendAccountDeletionApprovalEmail(customer);
        console.log('✅ Customer account deletion approval email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send deletion approval email:', {
          error: emailError.message,
          customerId: customer._id,
          customerName: customer.fullName
        });
      }
    } else {
      // Handle update request - Apply the pending updates
      const updates = customer.pendingUpdates.fields;
      const previousValues = {};
      
      console.log('📝 Applying customer profile updates:', {
        customerId: customer._id,
        customerName: customer.fullName,
        fieldsToUpdate: Object.keys(updates)
      });
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          // Store previous value for history
          previousValues[key] = customer[key];
          // Update the field
          customer[key] = updates[key];
          console.log(`📝 Updated ${key}: ${previousValues[key]} → ${updates[key]}`);
        }
      });
      
      console.log('✅ Applied customer updates:', {
        customerId: customer._id,
        customerName: customer.fullName,
        updatedFields: Object.keys(updates),
        previousValues
      });
      
      // Send update approval email
      try {
        console.log('📧 Sending update approval email to customer...');
        await sendCustomerUpdateApprovalEmail(customer, updates);
        console.log('✅ Customer profile update approval email sent successfully');
      } catch (emailError) {
        console.error('❌ Failed to send update approval email:', {
          error: emailError.message,
          customerId: customer._id,
          customerName: customer.fullName
        });
      }
    }
    
    // Mark the pending updates as approved
    customer.pendingUpdates.status = 'approved';
    customer.pendingUpdates.approvedAt = new Date();
    customer.pendingUpdates.approvedBy = req.user.userId;
    
    // Save first, then clear pending updates
    await customer.save();
    
    console.log('💾 Customer saved with approval status');
    
    // Clear pending updates after successful approval
    customer.pendingUpdates = null;
    await customer.save();
    
    console.log(`✅ Customer ${isDeletion ? 'deletion' : 'update'} approved and completed successfully`);
    
    res.status(200).json({
      success: true,
      message: isDeletion
        ? 'Account deletion request approved successfully. Customer account has been deactivated and they have been notified.'
        : 'Profile update request approved successfully. Customer has been notified via email.',
      customer: {
        _id: customer._id,
        fullName: customer.fullName,
        emailAddress: customer.emailAddress,
        isActive: customer.isActive,
        deletedAt: customer.deletedAt,
        deletionReason: customer.deletionReason
      }
    });
    
  } catch (error) {
    console.error('❌ Error approving customer update:', {
      error: error.message,
      stack: error.stack,
      customerId: req.params.customerId
    });
    res.status(500).json({
      success: false,
      message: 'Server error while processing approval'
    });
  }
};

// CRITICAL FIX: ADMIN: Reject customer update request with email notification
export const rejectCustomerUpdate = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }
    
    const { customerId } = req.params;
    const { rejectionReason } = req.body;
    
    console.log('🔴 Admin rejecting customer update/deletion:', {
      customerId,
      rejectionReason: rejectionReason || 'No reason provided',
      adminId: req.user.userId
    });
    
    // Validate rejection reason
    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required and cannot be empty'
      });
    }
    
    const customer = await User.findById(customerId);
    if (!customer) {
      console.log('❌ Customer not found for rejection:', customerId);
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    if (!customer.pendingUpdates || customer.pendingUpdates.status !== 'pending') {
      console.log('❌ No pending updates found for customer rejection:', {
        customerId,
        hasPendingUpdates: !!customer.pendingUpdates,
        status: customer.pendingUpdates?.status
      });
      return res.status(400).json({
        success: false,
        message: 'No pending updates found for this customer'
      });
    }
    
    // Determine if this is a deletion request
    const isDeletion = !!customer.pendingUpdates.deleteRequested;
    
    console.log('📋 Processing customer rejection:', {
      customerId,
      customerName: customer.fullName,
      isDeletion,
      requestType: customer.pendingUpdates.requestType,
      rejectionReason: rejectionReason.trim()
    });
    
    // CRITICAL FIX: DO NOT APPLY ANY CHANGES WHEN REJECTING
    // Just mark the pending updates as rejected, don't modify the original data
    
    customer.pendingUpdates.status = 'rejected';
    customer.pendingUpdates.rejectedAt = new Date();
    customer.pendingUpdates.rejectedBy = req.user.userId;
    customer.pendingUpdates.rejectionReason = rejectionReason.trim();
    
    // Add to status history
    if (!customer.statusHistory) customer.statusHistory = [];
    customer.statusHistory.push({
      status: customer.pendingUpdates.deleteRequested ? 'deletion_rejected' : 'update_rejected',
      timestamp: new Date(),
      changedBy: req.user.userId,
      reason: rejectionReason.trim()
    });
    
    console.log(`🔴 Customer ${isDeletion ? 'deletion' : 'update'} request rejected - NO CHANGES APPLIED TO ORIGINAL DATA`);
    
    // CRITICAL FIX: Send notification to customer about rejection
    try {
      console.log('📧 Sending rejection email to customer...');
      if (customer.pendingUpdates.deleteRequested) {
        await sendAccountDeletionRejectionEmail(customer, rejectionReason.trim());
        console.log('✅ Customer account deletion rejection email sent successfully');
      } else {
        await sendCustomerUpdateRejectionEmail(customer, rejectionReason.trim());
        console.log('✅ Customer profile update rejection email sent successfully');
      }
    } catch (emailError) {
      console.error('❌ Failed to send rejection email to customer:', {
        error: emailError.message,
        customerId: customer._id,
        customerName: customer.fullName,
        isDeletion
      });
      // Don't fail the request if email fails, but log it
    }
    
    // Save the rejection status first
    await customer.save();
    
    console.log('💾 Customer saved with rejection status');
    
    // Clear pending updates after rejection
    customer.pendingUpdates = null;
    await customer.save();
    
    console.log(`✅ Customer ${isDeletion ? 'deletion' : 'update'} rejected and completed successfully`);
    
    res.status(200).json({
      success: true,
      message: isDeletion
        ? 'Account deletion request rejected successfully. Customer has been notified via email with the reason for rejection.'
        : 'Profile update request rejected successfully. Customer has been notified via email with the reason for rejection.',
      rejectionDetails: {
        customerId: customer._id,
        customerName: customer.fullName,
        requestType: isDeletion ? 'delete' : 'update',
        rejectionReason: rejectionReason.trim(),
        rejectedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('❌ Error rejecting customer update:', {
      error: error.message,
      stack: error.stack,
      customerId: req.params.customerId,
      rejectionReason
    });
    res.status(500).json({
      success: false,
      message: 'Server error while processing rejection'
    });
  }
};

// Get customers with pending updates
export const getCustomersWithPendingUpdates = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }
    
    console.log('📊 Admin fetching customers with pending updates...');
    
    const customers = await User.find({
      role: 'customer',
      'pendingUpdates.status': 'pending'
    });
    
    const pendingUpdates = customers.map(customer => ({
      _id: customer._id,
      fullName: customer.fullName,
      emailAddress: customer.emailAddress,
      nicNumber: customer.nicNumber,
      createdAt: customer.createdAt,
      requestType: customer.pendingUpdates.deleteRequested ? 'delete' : 'update',
      requestedAt: customer.pendingUpdates.requestedAt,
      fields: customer.pendingUpdates.fields || {},
      reason: customer.pendingUpdates.reason || '',
      rejectionReason: customer.pendingUpdates.rejectionReason || ''
    }));
    
    console.log('📊 Customer pending updates found:', {
      totalCustomers: customers.length,
      updateRequests: pendingUpdates.filter(p => p.requestType === 'update').length,
      deleteRequests: pendingUpdates.filter(p => p.requestType === 'delete').length
    });
    
    res.status(200).json({
      success: true,
      count: pendingUpdates.length,
      pendingUpdates
    });
    
  } catch (error) {
    console.error('❌ Error fetching customers with pending updates:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending updates'
    });
  }
};

// FIXED: Get service providers with pending updates with enhanced logging
export const getServiceProvidersWithPendingUpdates = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }
    
    console.log('📊 Admin fetching service providers with pending updates...');
    
    const serviceProviders = await User.find({
      role: 'serviceProvider',
      'pendingUpdates.status': 'pending'
    });
    
    console.log('📊 Raw service providers with pending updates:', {
      count: serviceProviders.length,
      providers: serviceProviders.map(sp => ({
        id: sp._id,
        businessName: sp.businessName,
        hasPendingUpdates: !!sp.pendingUpdates,
        status: sp.pendingUpdates?.status,
        deleteRequested: sp.pendingUpdates?.deleteRequested,
        requestType: sp.pendingUpdates?.requestType
      }))
    });
    
    const pendingUpdates = serviceProviders.map(provider => ({
      _id: provider._id,
      fullName: provider.fullName,
      businessName: provider.businessName,
      emailAddress: provider.emailAddress,
      serviceProviderId: provider.serviceProviderId,
      createdAt: provider.createdAt,
      requestType: provider.pendingUpdates.deleteRequested ? 'delete' : 'update',
      requestedAt: provider.pendingUpdates.requestedAt,
      fields: provider.pendingUpdates.fields || {},
      reason: provider.pendingUpdates.reason || '',
      rejectionReason: provider.pendingUpdates.rejectionReason || ''
    }));
    
    console.log('📊 Service Provider pending updates processed:', {
      totalProviders: serviceProviders.length,
      updateRequests: pendingUpdates.filter(p => p.requestType === 'update').length,
      deleteRequests: pendingUpdates.filter(p => p.requestType === 'delete').length,
      pendingUpdatesData: pendingUpdates
    });
    
    res.status(200).json({
      success: true,
      count: pendingUpdates.length,
      pendingUpdates
    });
    
  } catch (error) {
    console.error('❌ Error fetching service providers with pending updates:', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pending updates'
    });
  }
};

// ADMIN: Get all customers
export const getCustomers = async (req, res) => {
  try {
    console.log('📊 Admin fetching all customers...');
    
    const customers = await User.find({ role: 'customer' })
      .select('-password')
      .sort({ createdAt: -1 });

    console.log('📊 Fetched customers for admin:', {
      total: customers.length,
      withPendingUpdates: customers.filter(c => c.pendingUpdates?.status === 'pending').length,
      activeCustomers: customers.filter(c => c.isActive !== false).length,
      deactivatedCustomers: customers.filter(c => c.isActive === false).length
    });

    res.json({
      success: true,
      customers
    });
  } catch (error) {
    console.error('❌ Error fetching customers for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
};

// FIXED: ADMIN: Get all service providers (including pending updates) with enhanced logging
export const getServiceProviders = async (req, res) => {
  try {
    // Ensure admin privileges
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized. Admin privileges required.'
      });
    }

    console.log('📊 Admin fetching all service providers...');

    const serviceProviders = await User.find({ role: 'serviceProvider' })
      .select('-password')
      .sort({ createdAt: -1 });

    console.log('📊 Fetched service providers for admin:', {
      total: serviceProviders.length,
      withPendingUpdates: serviceProviders.filter(sp => sp.pendingUpdates?.status === 'pending').length,
      activeProviders: serviceProviders.filter(sp => sp.isActive !== false).length,
      deactivatedProviders: serviceProviders.filter(sp => sp.isActive === false).length,
      approvedProviders: serviceProviders.filter(sp => sp.approvalStatus === 'approved').length,
      pendingProviders: serviceProviders.filter(sp => sp.approvalStatus === 'pending').length
    });

    res.json({
      success: true,
      providers: serviceProviders
    });
  } catch (error) {
    console.error('❌ Error fetching service providers for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service providers',
      error: error.message
    });
  }
};

// CRITICAL FIX: Forgot Password with proper error handling
export const forgotPassword = async (req, res) => {
  try {
    console.log('📧 Forgot password request received:', req.body);
    
    const { emailAddress } = req.body;
    
    if (!emailAddress) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email address is required' 
      });
    }
    
    const user = await User.findOne({ emailAddress });

    if (!user) {
      // To prevent user enumeration, we send a success response even if the user doesn't exist.
      console.log(`📧 Password reset requested for non-existent user: ${emailAddress}`);
      return res.status(200).json({ 
        success: true, 
        message: 'If a user with that email exists, a reset link has been sent.' 
      });
    }

    // Check if account is deactivated
    if (user.isActive === false) {
      console.log('🚫 Password reset attempt for deactivated account:', {
        userId: user._id,
        email: user.emailAddress,
        isActive: user.isActive,
        deletedAt: user.deletedAt
      });
      return res.status(403).json({
        success: false,
        message: 'Cannot reset password for deactivated account. Please contact support.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(20).toString('hex');
    
    // Hash token and set to database
    user.resetPasswordToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

    await user.save({ validateBeforeSave: false });

    console.log('📧 Password reset token generated for user:', {
      userId: user._id,
      email: user.emailAddress,
      tokenExpiry: new Date(user.resetPasswordExpire)
    });

    // Send email with the unhashed token
    try {
      await sendResetEmail(user.emailAddress, resetToken, user.fullName);
      console.log('✅ Password reset email sent successfully');
      res.status(200).json({ 
        success: true, 
        message: 'Password reset email sent successfully.' 
      });
    } catch (emailError) {
      console.error('❌ Failed to send password reset email:', emailError);
      // Clear the token if email fails to prevent a dangling token
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send reset email. Please try again.' 
      });
    }
  } catch (error) {
    console.error('❌ Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error during password reset process.' 
    });
  }
};

// ✅ FIXED: Reset Password with proper error handling
export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, newPassword } = req.body;
    
    // ✅ Support both 'password' and 'newPassword' field names
    const passwordToUse = password || newPassword;

    console.log('🔐 Reset password attempt:', { 
      tokenProvided: !!token, 
      passwordProvided: !!passwordToUse,
      tokenPreview: token ? token.substring(0, 10) + '...' : 'none'
    });

    // ✅ Enhanced validation
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password reset token is required in URL.' 
      });
    }

    if (!passwordToUse || passwordToUse.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 8 characters long.' 
      });
    }

    // Hash the token from URL to match database
    const resetPasswordToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    console.log('🔍 Looking for user with hashed token...');

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      console.log('❌ Invalid or expired token');
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid or expired password reset token. Please request a new reset link.' 
      });
    }

    // Check if account is deactivated
    if (user.isActive === false) {
      console.log('🚫 Password reset attempt for deactivated account:', {
        userId: user._id,
        email: user.emailAddress,
        isActive: user.isActive,
        deletedAt: user.deletedAt
      });
      return res.status(403).json({
        success: false,
        message: 'Cannot reset password for deactivated account. Please contact support.'
      });
    }

    console.log('✅ Valid reset token found for user:', user.emailAddress);

    // ✅ Hash new password and save
  user.password = await bcrypt.hash(passwordToUse, 12);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  // Bypass full validation (e.g., missing nicNumber) on password reset
  await user.save({ validateBeforeSave: false });

    console.log('✅ Password reset successful for user:', user.emailAddress);

    res.status(200).json({ 
      success: true, 
      message: 'Password has been reset successfully. You can now log in with your new password.' 
    });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while resetting password.',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ADMIN: Approve a service provider
export const approveServiceProvider = async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🟢 Admin approving service provider: ${userId}`);

    const provider = await User.findById(userId);

    if (!provider || provider.role !== 'serviceProvider') {
      return res.status(404).json({ success: false, message: 'Service provider not found' });
    }

    if (provider.approvalStatus === 'approved') {
        return res.status(400).json({ success: false, message: 'Service provider is already approved' });
    }

    // Generate a unique service provider ID if it doesn't exist
    if (!provider.serviceProviderId) {
      provider.serviceProviderId = await generateServiceProviderSerial();
    }
    
    provider.approvalStatus = 'approved';
    provider.approved = true;
    provider.approvedAt = new Date();
    provider.rejectionReason = undefined; // Clear any previous rejection reason

    await provider.save();

    console.log('✅ Service provider approved:', {
      providerId: provider._id,
      businessName: provider.businessName,
      serviceProviderId: provider.serviceProviderId
    });

    // Send approval email
    try {
      await sendApprovalEmail(provider.emailAddress, provider.businessName, provider.fullName);
      console.log('✅ Approval email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send approval email:', emailError);
    }

    res.json({ success: true, message: 'Service provider approved successfully', provider });

  } catch (error) {
    console.error('❌ Error approving service provider:', error);
    res.status(500).json({ success: false, message: 'Server error while approving provider', error: error.message });
  }
};

// ADMIN: Reject a service provider
export const rejectServiceProvider = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    console.log('🔴 Admin rejecting service provider:', { userId, reason });

    if (!reason) {
      return res.status(400).json({ success: false, message: 'Rejection reason is required' });
    }

    const provider = await User.findById(userId);

    if (!provider || provider.role !== 'serviceProvider') {
      return res.status(404).json({ success: false, message: 'Service provider not found' });
    }

    provider.approvalStatus = 'rejected';
    provider.approved = false;
    provider.rejectionReason = reason;
    provider.rejectedAt = new Date();

    await provider.save();

    console.log('✅ Service provider rejected:', {
      providerId: provider._id,
      businessName: provider.businessName,
      rejectionReason: reason
    });

    // Send rejection email
    try {
      await sendRejectionEmail(provider.emailAddress, provider.businessName, provider.fullName, reason);
      console.log('✅ Rejection email sent successfully');
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', emailError);
    }

    res.json({ success: true, message: 'Service provider rejected successfully', provider });

  } catch (error) {
    console.error('❌ Error rejecting service provider:', error);
    res.status(500).json({ success: false, message: 'Server error while rejecting provider', error: error.message });
  }
};

// ADMIN: Get pending service providers
export const getPendingServiceProviders = async (req, res) => {
  try {
    console.log('📊 Admin fetching pending service providers...');
    
    const pendingProviders = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'pending'
    }).select('-password');

    console.log('📊 Pending service providers found:', {
      count: pendingProviders.length,
      providers: pendingProviders.map(p => ({
        id: p._id,
        businessName: p.businessName,
        fullName: p.fullName,
        email: p.emailAddress
      }))
    });

    res.json({
      success: true,
      providers: pendingProviders
    });
  } catch (error) {
    console.error('❌ Error getting pending service providers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending providers', error: error.message });
  }
};

// ADMIN: Get approved service providers
export const getApprovedServiceProviders = async (req, res) => {
  try {
    console.log('📊 Admin fetching approved service providers...');
    
    const approvedProviders = await User.find({
      role: 'serviceProvider',
      approvalStatus: 'approved'
    }).select('-password');

    console.log('📊 Approved service providers found:', {
      count: approvedProviders.length,
      providers: approvedProviders.map(p => ({
        id: p._id,
        businessName: p.businessName,
        fullName: p.fullName,
        email: p.emailAddress,
        serviceProviderId: p.serviceProviderId
      }))
    });

    res.json({
      success: true,
      data: approvedProviders
    });
  } catch (error) {
    console.error('❌ Error getting approved service providers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch approved providers', error: error.message });
  }
};

//controllers/authController.js - ENHANCED getDashboardData function
export const getDashboardData = async (req, res) => {
  try {
    console.log('📊 Fetching comprehensive admin dashboard data...');
    
    // Basic user counts
    const customerCount = await User.countDocuments({ role: 'customer' });
    const serviceProviderCount = await User.countDocuments({
      role: 'serviceProvider',
      approvalStatus: 'approved'
    });
    const pendingApprovalCount = await User.countDocuments({
      role: 'serviceProvider',
      approvalStatus: 'pending'
    });
    const totalUsers = customerCount + serviceProviderCount;

    // 1. PENDING NEW SERVICE APPROVALS
    const pendingServiceApprovals = await Service.countDocuments({
      status: 'pending_approval',
      $or: [
        { pendingChanges: null },
        { pendingChanges: { $exists: false } },
        { 'pendingChanges.actionType': { $nin: ['update', 'delete'] } }
      ]
    });

    // 2. DELETED SERVICES
    const deletedServicesCount = await Service.countDocuments({
      status: 'deleted'
    });

    // 3. REASSIGN USERS (Customer and Service Provider deletion requests)
    const customerDeleteRequests = await User.countDocuments({
      role: 'customer',
      'pendingUpdates.status': 'pending',
      'pendingUpdates.deleteRequested': true
    });

    const providerDeleteRequests = await User.countDocuments({
      role: 'serviceProvider',
      'pendingUpdates.status': 'pending',
      'pendingUpdates.deleteRequested': true
    });

    const deleteRequestsData = {
      customers: customerDeleteRequests,
      serviceProviders: providerDeleteRequests
    };

    // 4. NEW SERVICE PROVIDERS (Monthly Trend - Last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get daily provider registrations for the last 30 days
    const newProviderPipeline = [
      {
        $match: {
          role: 'serviceProvider',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ];

    const newProvidersRaw = await User.aggregate(newProviderPipeline);
    
    // Format data for chart
    const newProvidersData = newProvidersRaw.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      count: item.count
    }));

    // 5. SERVICE UPDATE REQUESTS
    const serviceUpdateRequests = await Service.countDocuments({
      'pendingChanges.actionType': 'update'
    });

    // Get daily service update requests for the last 30 days
    const updateRequestsPipeline = [
      {
        $match: {
          'pendingChanges.actionType': 'update',
          'pendingChanges.requestedAt': { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$pendingChanges.requestedAt' },
            month: { $month: '$pendingChanges.requestedAt' },
            day: { $dayOfMonth: '$pendingChanges.requestedAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ];

    const serviceUpdateRequestsRaw = await Service.aggregate(updateRequestsPipeline);
    
    const serviceUpdateRequestsData = serviceUpdateRequestsRaw.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      count: item.count
    }));

    // 6. APPOINTMENTS PER DAY (Last 30 days)
    const appointmentsPipeline = [
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          status: { $in: ['pending', 'booked', 'confirmed', 'completed'] }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ];

    const appointmentsRaw = await Booking.aggregate(appointmentsPipeline);
    
    const appointmentsPerDayData = appointmentsRaw.map(item => ({
      date: `${item._id.year}-${String(item._id.month).padStart(2, '0')}-${String(item._id.day).padStart(2, '0')}`,
      count: item.count
    }));

    // Additional metrics for comprehensive dashboard
    const totalServiceUpdateRequests = await Service.countDocuments({
      'pendingChanges.actionType': 'update'
    });

    const totalDeleteRequests = await Service.countDocuments({
      'pendingChanges.actionType': 'delete'
    });

    const totalActiveServices = await Service.countDocuments({
      status: 'approved',
      isActive: true
    });

    const totalBookings = await Booking.countDocuments();
    const pendingBookings = await Booking.countDocuments({ status: 'pending' });
    const completedBookings = await Booking.countDocuments({ status: 'completed' });

    console.log('📊 Dashboard data compiled:', {
      customerCount,
      serviceProviderCount,
      pendingApprovalCount,
      totalUsers,
      pendingServiceApprovals,
      deletedServicesCount,
      deleteRequestsData,
      newProvidersDataPoints: newProvidersData.length,
      serviceUpdateRequests,
      appointmentsDataPoints: appointmentsPerDayData.length



    });

    return res.json({
      success: true,
      customerCount,
      serviceProviderCount,
      pendingApprovalCount,
      totalUsers,
      
      // Enhanced metrics
      pendingServiceApprovals,
      deletedServicesCount,
      deleteRequestsData,
      newProvidersData,
      serviceUpdateRequestsData,
      serviceUpdateRequests: totalServiceUpdateRequests,
      appointmentsPerDayData,
      
      // Additional dashboard metrics
      additionalMetrics: {
        totalActiveServices,
        totalDeleteRequests,
        totalBookings,
        pendingBookings,
        completedBookings,
        totalServiceRequests: totalServiceUpdateRequests + totalDeleteRequests
      },
      
      // Summary for quick overview
      summary: {
        totalPendingActions: pendingServiceApprovals + customerDeleteRequests + providerDeleteRequests + totalServiceUpdateRequests,
        totalServices: await Service.countDocuments(),
        activeProviders: serviceProviderCount,
        totalCustomers: customerCount
      }
    });
  } catch (err) {
    console.error('❌ Error fetching dashboard data:', err);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while fetching dashboard data',
      error: err.message 
    });
  }
};

// Logout endpoint to update online status
export const logout = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Update user's online status
    const user = await User.findById(userId);
    if (user) {
      user.isOnline = false;
      user.lastSeen = new Date();
      await user.save();
      
      console.log('👋 User logged out:', {
        id: user._id,
        email: user.emailAddress,
        role: user.role
      });
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

/**
 * Update Profile Photo - For all user types (customer, admin, serviceProvider)
 * This endpoint allows users to update their profile photo
 * The photo is uploaded to S3 and the URL is stored in the database
 * Old profile photo is deleted from S3 to save storage space
 */
export const updateProfilePhoto = async (req, res) => {
  try {
    // Extract user ID from the authenticated request
    // req.user is set by the authentication middleware
    const userId = req.user.userId;
    
    console.log('📸 Profile photo update request from user:', userId);
    
    // Check if a file was uploaded
    // multer-s3 middleware puts the uploaded file info in req.file
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No profile photo provided. Please upload an image file.'
      });
    }
    
    // Find the user in the database
    const user = await User.findById(userId);
    
    // If user doesn't exist, return error
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if account is active
    // Deactivated accounts should not be able to update their profile
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update profile photo for a deactivated account'
      });
    }
    
    // Store the old profile photo URL to delete it later
    const oldProfilePhoto = user.profilePhoto;
    
    // Get the new S3 URL from the uploaded file
    // multer-s3 stores the S3 URL in req.file.location
    const newProfilePhotoUrl = req.file.location;
    
    // Update the user's profile photo URL in the database
    user.profilePhoto = newProfilePhotoUrl;
    user.updatedAt = new Date(); // Update the timestamp
    
    // Save the updated user to the database
    await user.save();
    
    // Log success for debugging
    console.log('✅ Profile photo updated successfully:', {
      userId: user._id,
      role: user.role,
      newPhotoUrl: newProfilePhotoUrl
    });
    
    // If there was an old profile photo, delete it from S3 to save storage space
    if (oldProfilePhoto && oldProfilePhoto.includes('amazonaws.com')) {
      try {
        // Import the delete function from S3 config
        const { deleteFromS3 } = await import('../config/s3.js');
        // Delete the old photo from S3
        await deleteFromS3(oldProfilePhoto);
        console.log('🗑️ Old profile photo deleted from S3:', oldProfilePhoto);
      } catch (deleteError) {
        // If deletion fails, log the error but don't fail the request
        // The new photo is already saved, so this is not critical
        console.error('⚠️ Failed to delete old profile photo from S3:', deleteError);
      }
    }
    
    // Return success response with the new photo URL
    res.status(200).json({
      success: true,
      message: 'Profile photo updated successfully',
      data: {
        profilePhoto: newProfilePhotoUrl
      }
    });
    
  } catch (error) {
    // Log error for debugging
    console.error('❌ Error updating profile photo:', error);
    
    // Return error response
    res.status(500).json({
      success: false,
      message: 'Failed to update profile photo. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const adminUpdateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id || req.user?._id;
    const { fullName, emailAddress, mobileNumber, currentAddress } = req.body;

    console.log('🔧 Admin profile update requested', {
      requestUser: req.user,
      resolvedUserId: userId,
      providedFields: Object.keys(req.body || {})
    });

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication context missing for admin update'
      });
    }

    // Find admin user
    const admin = await User.findById(userId);
    
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    // Verify user is admin
    if (admin.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    // Check if account is deactivated
    if (admin.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Cannot update deactivated account',
        accountDeactivated: true
      });
    }

    // Update only provided fields
    if (fullName) admin.fullName = fullName.trim();
    if (emailAddress) admin.emailAddress = emailAddress.trim();
    if (mobileNumber) admin.mobileNumber = mobileNumber.trim();
    if (currentAddress) admin.currentAddress = currentAddress.trim();

    await admin.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: admin._id,
        fullName: admin.fullName,
        emailAddress: admin.emailAddress,
        mobileNumber: admin.mobileNumber,
        currentAddress: admin.currentAddress,
        profilePhoto: admin.profilePhoto, // Include profile photo in response
        role: admin.role,
        updatedAt: admin.updatedAt
      }
    });

  } catch (error) {
    console.error('❌ Admin profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update admin profile',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
};