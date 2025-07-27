//controllers/authController.js - CLEAN VERSION WITHOUT DUPLICATES
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import express from 'express';
import { transporter, sendResetEmail, sendRejectionEmail, sendApprovalEmail } from '../config/mailer.js';

// 🔧 CRITICAL FIX: Import BOTH functions from serial generator
import { ensureServiceProviderHasId, generateServiceProviderSerial } from '../Utils/serialGenerator.js';

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
  }
  
  return errors;
};

export const register = async (req, res) => {
  try {
    console.log('Registration request received');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Files:', req.files ? Object.keys(req.files) : 'No files');
    
    const {
      fullName,
      emailAddress,
      password,
      // Common fields
      currentAddress,
      mobileNumber,
      // Service provider specific fields
      businessName,
      businessDescription,
      businessType,
      city,
      homeAddress,
      nicNumber,
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

    console.log('Role:', role);
    console.log('Email:', emailAddress);

    // For admin registration, check if admin already exists
    if (role === 'admin') {
      const existingAdmin = await User.findOne({ role: 'admin' });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Admin account already exists. Only one admin is allowed.',
          adminExists: true
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
      createdAt: new Date()
    };

    // Add common fields
    if (currentAddress) userData.currentAddress = currentAddress;
    if (mobileNumber) userData.mobileNumber = mobileNumber;

    // Add service provider specific fields
    if (role === 'serviceProvider') {
      // Parse services if they exist
      let parsedServices = [];
      if (typeof services === 'string') {
        try {
          parsedServices = JSON.parse(services);
        } catch (jsonErr) {
          console.warn('services JSON.parse failed, falling back to eval:', jsonErr);
          try {
            parsedServices = Function('"use strict";return (' + services + ')')();
          } catch (evalErr) {
            console.error('Failed to eval services:', evalErr);
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
      userData.nicNumber = nicNumber;
      userData.services = parsedServices;
      userData.location = parsedLocation;
      userData.experience = experienceData;
      userData.specialties = parsedSpecialties;
      userData.languages = parsedLanguages;
      userData.policies = parsedPolicies;
      userData.approvalStatus = 'pending';

      // Handle file uploads safely
      if (req.files) {
        if (req.files.profilePhoto && req.files.profilePhoto[0]) {
          userData.profilePhoto = req.files.profilePhoto[0].filename;
        }
        if (req.files.nicFrontPhoto && req.files.nicFrontPhoto[0]) {
          userData.nicFrontPhoto = req.files.nicFrontPhoto[0].filename;
        }
        if (req.files.nicBackPhoto && req.files.nicBackPhoto[0]) {
          userData.nicBackPhoto = req.files.nicBackPhoto[0].filename;
        }
        if (req.files.certificatesPhotos && req.files.certificatesPhotos.length > 0) {
          userData.certificatesPhotos = req.files.certificatesPhotos.map(file => file.filename);
        }
      }

      console.log('Service provider data prepared for saving');
    }

    // Create and save user
    const newUser = new User(userData);
    const savedUser = await newUser.save();

    console.log('User saved successfully:', {
      id: savedUser._id,
      role: savedUser.role,
      approved: savedUser.approved
    });

    // Create appropriate response message
    let message = 'User registered successfully';
    if (role === 'serviceProvider') {
      message = 'Service provider registration submitted successfully. Your application is pending admin approval.';
    } else if (role === 'admin') {
      message = 'Admin account created successfully';
    }

    res.status(201).json({
      success: true,
      message,
      data: {
        userId: savedUser._id,
        fullName: savedUser.fullName,
        emailAddress: savedUser.emailAddress,
        role: savedUser.role,
        approved: savedUser.approved
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    console.error('Error stack:', error.stack);
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
    
    console.log('Login attempt:', { emailAddress, role });

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

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role,
        approved: user.approved || user.approvalStatus === 'approved'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', {
      id: user._id,
      role: user.role,
      approved: user.approved || user.approvalStatus === 'approved'
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
        approvalStatus: user.approvalStatus
      }
    });

  } catch (error) {
    console.error('Login error:', error);
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

    res.json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
        approved: user.approved
      }
    });

  } catch (error) {
    console.error('Token verification error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving profile',
      error: error.message
    });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { emailAddress } = req.body;
    if (!emailAddress) {
      return res.status(400).json({ success: false, message: 'Email address is required' });
    }

    const user = await User.findOne({ emailAddress });
    if (!user) {
      console.log(`Password reset requested for non-existent user: ${emailAddress}`);
      return res.json({ success: true, message: 'If a user with that email exists, a password reset link has been sent.' });
    }

    // Generate a reset token
    const resetToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Use the helper to send the email
    await sendResetEmail(user.emailAddress, resetToken, user.fullName);

    console.log(`Password reset email sent to ${emailAddress}`);

    res.json({ success: true, message: 'If a user with that email exists, a password reset link has been sent.' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing forgot password request',
      error: error.message
    });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    // Verify the token and get the user ID
    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    
    // Find the user by the ID from the token
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token: User not found'
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully',
      userRole: user.role
    });

  } catch (error) {
    console.error('Reset password error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token. Please request a new one.',
        error: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error resetting password',
      error: error.message
    });
  }
};

export const getUserCounts = async (req, res) => {
  try {
    const customers = await User.countDocuments({ role: 'customer' });
    const serviceProviders = await User.countDocuments({ 
      role: 'serviceProvider',
      approvalStatus: 'approved'
    });
    const pendingApprovals = await User.countDocuments({ 
      role: 'serviceProvider',
      approvalStatus: 'pending'
    });
    const totalUsers = await User.countDocuments();

    res.json({
      success: true,
      data: {
        customers,
        serviceProviders,
        pendingApprovals,
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
};

export const getPendingServiceProviders = async (req, res) => {
  try {
    const pendingProviders = await User.find({ 
      role: 'serviceProvider',
      approvalStatus: 'pending'
    }).select('-password -resetToken -resetTokenExpiry');

    res.json({
      success: true,
      data: pendingProviders,
      providers: pendingProviders
    });
  } catch (error) {
    console.error('Get pending service providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get pending service providers',
      error: error.message
    });
  }
};

export const getApprovedServiceProviders = async (req, res) => {
  try {
    const { providerId } = req.query;
    let query = { 
      role: 'serviceProvider',
      approvalStatus: 'approved'
    };

    if (providerId) {
      query._id = providerId;
    }

    const approvedProviders = await User.find(query)
      .select('-password -resetToken -resetTokenExpiry')
      .select('+businessDescription +experienceYears +specialties +languages +policies +location +nicNumber +mobileNumber +homeAddress +currentAddress +businessType')
      .lean();

    res.json({
      success: true,
      data: approvedProviders,
      providers: approvedProviders
    });
  } catch (error) {
    console.error('Get approved service providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get approved service providers',
      error: error.message,
      data: [],
      providers: []
    });
  }
};

// In controllers/authController.js - Replace approveServiceProvider with this FIXED version:

export const approveServiceProvider = async (req, res) => {
  try {
    console.log('🔍 APPROVE PROVIDER DEBUG - Start');
    console.log('🔍 Request params:', req.params);
    console.log('🔍 User from token:', req.user);

    // Handle different parameter names from different routes
    const { userId, requestId, providerId } = req.params;
    const providerIdToApprove = userId || requestId || providerId;
    
    console.log('🔍 Extracted Provider ID to approve:', providerIdToApprove);

    if (!providerIdToApprove) {
      console.log('❌ No provider ID provided in any parameter');
      return res.status(400).json({
        success: false,
        message: 'Provider ID is required'
      });
    }

    // Validate ObjectId format
    if (!providerIdToApprove.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('❌ Invalid ObjectId format:', providerIdToApprove);
      return res.status(400).json({
        success: false,
        message: 'Invalid provider ID format'
      });
    }
    
    console.log('🔍 Finding provider in database...');
    const user = await User.findById(providerIdToApprove);
    
    if (!user) {
      console.log('❌ Provider not found in database');
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    console.log('✅ Provider found:', {
      id: user._id,
      name: user.fullName,
      businessName: user.businessName,
      role: user.role,
      currentStatus: user.approvalStatus,
      hasProviderId: !!user.serviceProviderId
    });

    if (user.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider');
      return res.status(400).json({
        success: false,
        message: 'User is not a service provider'
      });
    }

    if (user.approvalStatus === 'approved') {
      console.log('⚠️ Provider already approved');
      return res.status(400).json({
        success: false,
        message: 'Service provider is already approved',
        data: {
          id: user._id,
          businessName: user.businessName,
          fullName: user.fullName,
          approvalStatus: user.approvalStatus,
          serviceProviderId: user.serviceProviderId
        }
      });
    }

    // 🔧 CRITICAL FIX: Generate Provider ID BEFORE setting approval status
    console.log('🔍 Generating Provider ID...');
    let newProviderId;
    
    try {
      // Check if user already has a Provider ID
      if (user.serviceProviderId && 
          user.serviceProviderId.trim() !== '' && 
          user.serviceProviderId !== 'Not assigned') {
        console.log('✅ Provider already has ID:', user.serviceProviderId);
        newProviderId = user.serviceProviderId;
      } else {
        // Generate new Provider ID directly (without using ensureServiceProviderHasId)
        console.log('🔍 Generating new Provider ID...');
        newProviderId = await generateServiceProviderSerial();
        console.log('✅ Generated new Provider ID:', newProviderId);
      }
    } catch (providerIdError) {
      console.error('❌ Error generating Provider ID:', providerIdError);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate Provider ID',
        error: providerIdError.message
      });
    }

    // 🔧 NOW update approval status AND Provider ID together
    console.log('🔍 Updating user approval status...');
    try {
      user.approvalStatus = 'approved';
      user.approved = true;
      user.serviceProviderId = newProviderId;
      user.approvedAt = new Date();
      user.approvedBy = req.user.userId;
      
      const savedUser = await user.save();
      console.log('✅ User updated successfully with Provider ID:', newProviderId);
    } catch (saveError) {
      console.error('❌ Error saving user:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Failed to save user approval',
        error: saveError.message
      });
    }

    // 🔧 Update existing services and packages
    console.log('🔍 Updating existing services and packages...');
    try {
      // Import models dynamically to avoid circular dependencies
      const Service = (await import('../models/Service.js')).default;
      const Package = (await import('../models/Package.js')).default;

      // Update all services created by this provider
      const serviceUpdateResult = await Service.updateMany(
        { serviceProvider: providerIdToApprove },
        { 
          serviceProviderId: newProviderId,
          lastUpdatedAt: new Date()
        }
      );
      console.log(`✅ Updated ${serviceUpdateResult.modifiedCount} services with Provider ID: ${newProviderId}`);

      // Update all packages created by this provider
      const packageUpdateResult = await Package.updateMany(
        { serviceProvider: providerIdToApprove },
        { 
          serviceProviderId: newProviderId,
          lastUpdatedAt: new Date()
        }
      );
      console.log(`✅ Updated ${packageUpdateResult.modifiedCount} packages with Provider ID: ${newProviderId}`);

      // Also fix any "Not assigned" entries
      const serviceNotAssignedResult = await Service.updateMany(
        { 
          serviceProvider: providerIdToApprove,
          serviceProviderId: 'Not assigned'
        },
        { serviceProviderId: newProviderId }
      );
      console.log(`✅ Fixed ${serviceNotAssignedResult.modifiedCount} services with 'Not assigned' Provider ID`);

      const packageNotAssignedResult = await Package.updateMany(
        { 
          serviceProvider: providerIdToApprove,
          serviceProviderId: 'Not assigned'
        },
        { serviceProviderId: newProviderId }
      );
      console.log(`✅ Fixed ${packageNotAssignedResult.modifiedCount} packages with 'Not assigned' Provider ID`);

    } catch (updateError) {
      console.error('⚠️ Failed to update services/packages:', updateError);
      // Don't fail the approval process, but log the error
    }

    // Send approval email
    console.log('🔍 Sending approval email...');
    try {
      await sendApprovalEmail(
        user.emailAddress, 
        user.businessName || user.fullName, 
        user.fullName
      );
      console.log('✅ Approval email sent');
    } catch (emailError) {
      console.error('⚠️ Failed to send approval email:', emailError);
      // Don't fail the approval process for email issues
    }

    console.log('🎉 Provider approval completed successfully');

    res.json({
      success: true,
      message: 'Service provider approved successfully',
      data: {
        id: user._id,
        businessName: user.businessName,
        fullName: user.fullName,
        approvalStatus: user.approvalStatus,
        serviceProviderId: newProviderId,
        approvedAt: user.approvedAt
      }
    });

  } catch (error) {
    console.error('❌ APPROVE PROVIDER ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to approve service provider',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


export const rejectServiceProvider = async (req, res) => {
  try {
    console.log('🔍 REJECT PROVIDER DEBUG - Start');
    console.log('🔍 Request params:', req.params);
    console.log('🔍 Request body:', req.body);

    // Handle different parameter names from different routes
    const { userId, requestId, providerId } = req.params;
    const { reason } = req.body;
    const providerIdToReject = userId || requestId || providerId;
    
    console.log('🔍 Extracted Provider ID to reject:', providerIdToReject);
    console.log('🔍 Rejection reason:', reason);

    if (!providerIdToReject) {
      console.log('❌ No provider ID provided');
      return res.status(400).json({
        success: false,
        message: 'Provider ID is required'
      });
    }

    // Validate ObjectId format
    if (!providerIdToReject.match(/^[0-9a-fA-F]{24}$/)) {
      console.log('❌ Invalid ObjectId format:', providerIdToReject);
      return res.status(400).json({
        success: false,
        message: 'Invalid provider ID format'
      });
    }
    
    console.log('🔍 Finding provider in database...');
    const providerRequest = await User.findById(providerIdToReject);
    
    if (!providerRequest) {
      console.log('❌ Provider not found in database');
      return res.status(404).json({
        success: false,
        message: 'Provider request not found'
      });
    }

    console.log('✅ Provider found:', {
      id: providerRequest._id,
      name: providerRequest.fullName,
      businessName: providerRequest.businessName,
      role: providerRequest.role,
      currentStatus: providerRequest.approvalStatus
    });

    if (providerRequest.role !== 'serviceProvider') {
      console.log('❌ User is not a service provider');
      return res.status(400).json({
        success: false,
        message: 'User is not a service provider'
      });
    }

    // Update rejection status
    console.log('🔍 Updating rejection status...');
    providerRequest.approvalStatus = 'rejected';
    providerRequest.rejectionReason = reason || 'Application did not meet requirements';
    providerRequest.rejectedAt = new Date();
    providerRequest.rejectedBy = req.user.userId;
    
    await providerRequest.save();
    console.log('✅ Provider rejected successfully');

    // Send rejection email
    console.log('🔍 Sending rejection email...');
    try {
      await sendRejectionEmail(
        providerRequest.emailAddress, 
        providerRequest.businessName || providerRequest.fullName,
        providerRequest.fullName,
        reason || 'Application did not meet requirements'
      );
      console.log('✅ Rejection email sent');
    } catch (emailError) {
      console.error('⚠️ Failed to send rejection email:', emailError);
    }

    console.log('🎉 Provider rejection completed successfully');

    res.json({
      success: true,
      message: 'Service provider request rejected successfully',
      data: {
        id: providerRequest._id,
        businessName: providerRequest.businessName,
        fullName: providerRequest.fullName,
        approvalStatus: providerRequest.approvalStatus
      }
    });
  } catch (error) {
    console.error('❌ REJECT PROVIDER ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to reject provider request',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Export the reject function for use in notification routes
export { rejectServiceProvider as rejectServiceProviderRequest };