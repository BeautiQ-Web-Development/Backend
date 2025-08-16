//controllers/authController.js - COMPLETELY FIXED VERSION WITH PROPER ACCOUNT DELETION
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
  sendAccountDeletionRejectionEmail 
} from '../config/mailer.js';
import crypto from 'crypto';

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
      isActive: true, // CRITICAL: Set isActive to true by default
      createdAt: new Date()
    };

    // Add common fields
    if (currentAddress) userData.currentAddress = currentAddress;
    if (mobileNumber) userData.mobileNumber = mobileNumber;
    if (nicNumber) userData.nicNumber = nicNumber;

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

    // CRITICAL FIX: Check if account is deactivated/deleted
    if (user.isActive === false) {
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

    console.log('Login successful for user:', {
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
        isActive: user.isActive
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
        isActive: user.isActive
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
    console.error('Error getting profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// Update user profile (pending admin approval)
export const updateProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const updateData = { ...req.body };
    
    console.log('🔍 Profile update request:', {
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
    console.log('✅ Pending update saved:', {
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
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// // Request account deletion/deactivation
// export const requestAccountDeletion = async (req, res) => {
//   try {
//     const userId = req.user.userId;
//     const { reason } = req.body;
    
//     console.log('🗑️ Account deletion request:', {
//       userId,
//       reason: reason || 'No reason provided'
//     });
    
//     const user = await User.findById(userId);
    
//     if (!user) {
//       return res.status(404).json({
//         success: false,
//         message: 'User not found'
//       });
//     }

//     // Check if account is already deactivated
//     if (user.isActive === false) {
//       return res.status(400).json({
//         success: false,
//         message: 'Account is already deactivated'
//       });
//     }
    
//     // Store deletion request using pendingUpdates schema
//     user.pendingUpdates = {
//       fields: {},
//       requestedAt: new Date(),
//       status: 'pending',
//       deleteRequested: true,
//       requestType: 'delete',
//       reason: reason || 'No reason provided'
//     };
    
//     await user.save();
    
//     // Verify the deletion request was saved
//     const savedUser = await User.findById(userId);
//     console.log('✅ Deletion request saved:', {
//       userId: savedUser._id,
//       hasPendingUpdates: !!savedUser.pendingUpdates,
//       deleteRequested: savedUser.pendingUpdates?.deleteRequested,
//       requestType: savedUser.pendingUpdates?.requestType,
//       reason: savedUser.pendingUpdates?.reason
//     });
    
//     res.status(200).json({
//       success: true,
//       message: 'Account deletion request submitted successfully. Pending admin review.'
//     });
//   } catch (error) {
//     console.error('Error requesting account deletion:', error);
//     res.status(500).json({
//       success: false,
//       message: 'Server error'
//     });
//   }
// };

// Request account deletion/deactivation
export const requestAccountDeletion = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { reason } = req.body;
    
    console.log('🗑️ Account deletion request:', {
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
    console.log('✅ Deletion request saved:', {
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
    console.error('Error requesting account deletion:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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
    
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    if (!customer.pendingUpdates || customer.pendingUpdates.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'No pending updates found for this customer'
      });
    }
    
    // Determine if this is a deletion request
    const isDeletion = !!customer.pendingUpdates.deleteRequested;
    
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
      
      console.log('🗑️ Account marked as INACTIVE:', {
        customerId: customer._id,
        isActive: customer.isActive,
        deletedAt: customer.deletedAt,
        deletionReason: customer.deletionReason
      });
      
      // Send deletion approval email
      try {
        await sendAccountDeletionApprovalEmail(customer);
        console.log('✅ Account deletion approval email sent');
      } catch (emailError) {
        console.error('❌ Failed to send deletion approval email:', emailError);
      }
    } else {
      // Handle update request - Apply the pending updates
      const updates = customer.pendingUpdates.fields;
      const previousValues = {};
      
      Object.keys(updates).forEach(key => {
        if (updates[key] !== undefined) {
          // Store previous value for history
          previousValues[key] = customer[key];
          // Update the field
          customer[key] = updates[key];
        }
      });
      
      // Send update approval email
      try {
        await sendCustomerUpdateApprovalEmail(customer, updates);
        console.log('✅ Profile update approval email sent');
      } catch (emailError) {
        console.error('❌ Failed to send update approval email:', emailError);
      }
    }
    
    // Mark the pending updates as approved
    customer.pendingUpdates.status = 'approved';
    customer.pendingUpdates.approvedAt = new Date();
    customer.pendingUpdates.approvedBy = req.user.userId;
    
    // Save first, then clear pending updates
    await customer.save();
    
    // Clear pending updates after successful approval
    customer.pendingUpdates = null;
    await customer.save();
    
    console.log(`✅ Customer ${isDeletion ? 'deletion' : 'update'} approved successfully`);
    
    res.status(200).json({
      success: true,
      message: isDeletion
        ? 'Account deletion request approved successfully. Customer account has been deactivated.'
        : 'Profile update request approved successfully',
      customer: customer
    });
    
  } catch (error) {
    console.error('Error approving customer update:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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
    
    // Validate rejection reason
    if (!rejectionReason || rejectionReason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }
    
    const customer = await User.findById(customerId);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }
    
    if (!customer.pendingUpdates || customer.pendingUpdates.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'No pending updates found for this customer'
      });
    }
    
    // Determine if this is a deletion request
    const isDeletion = !!customer.pendingUpdates.deleteRequested;
    
    // CRITICAL FIX: DO NOT APPLY ANY CHANGES WHEN REJECTING
    // Just mark the pending updates as rejected, don't modify the original data
    
    customer.pendingUpdates.status = 'rejected';
    customer.pendingUpdates.rejectedAt = new Date();
    customer.pendingUpdates.rejectedBy = req.user.userId;
    customer.pendingUpdates.rejectionReason = rejectionReason;
    
    // Add to status history
    if (!customer.statusHistory) customer.statusHistory = [];
    customer.statusHistory.push({
      status: customer.pendingUpdates.deleteRequested ? 'deletion_rejected' : 'update_rejected',
      timestamp: new Date(),
      changedBy: req.user.userId,
      reason: rejectionReason
    });
    
    // CRITICAL FIX: Send notification to customer about rejection
    try {
      if (customer.pendingUpdates.deleteRequested) {
        await sendAccountDeletionRejectionEmail(customer, rejectionReason);
        console.log('✅ Account deletion rejection email sent');
      } else {
        await sendCustomerUpdateRejectionEmail(customer, rejectionReason);
        console.log('✅ Profile update rejection email sent');
      }
    } catch (emailError) {
      console.error('❌ Failed to send rejection email:', emailError);
      // Don't fail the request if email fails, but log it
    }
    
    // Save the rejection status first
    await customer.save();
    
    // Clear pending updates after rejection
    customer.pendingUpdates = null;
    await customer.save();
    
    console.log(`✅ Customer ${isDeletion ? 'deletion' : 'update'} rejected successfully - NO CHANGES APPLIED`);
    
    res.status(200).json({
      success: true,
      message: isDeletion
        ? 'Account deletion request rejected successfully. Customer has been notified via email.'
        : 'Profile update request rejected successfully. Customer has been notified via email.',
      customer: customer
    });
    
  } catch (error) {
    console.error('Error rejecting customer update:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
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
      reason: customer.pendingUpdates.reason || ''
    }));
    
    console.log('📊 Pending updates found:', {
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
    console.error('Error fetching customers with pending updates:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};

// ADMIN: Get all customers
export const getCustomers = async (req, res) => {
  try {
    const customers = await User.find({ role: 'customer' })
      .select('-password')
      .sort({ createdAt: -1 });

    console.log('📊 Fetched customers:', {
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
    console.error('Error fetching customers for admin:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers',
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
      console.log(`Password reset requested for non-existent user: ${emailAddress}`);
      return res.status(200).json({ 
        success: true, 
        message: 'If a user with that email exists, a reset link has been sent.' 
      });
    }

    // Check if account is deactivated
    if (user.isActive === false) {
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

// // CRITICAL FIX: Reset Password with proper token handling
// export const resetPassword = async (req, res) => {
//   try {
//     const { token } = req.params;
//     const { password } = req.body;

//     console.log('🔐 Reset password attempt:', { 
//       tokenProvided: !!token, 
//       passwordProvided: !!password 
//     });

//     if (!password || password.length < 8) {
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Password must be at least 8 characters long.' 
//       });
//     }

//     // Hash the token from the URL to match the one in the database
//     const resetPasswordToken = crypto
//       .createHash('sha256')
//       .update(token)
//       .digest('hex');

//     const user = await User.findOne({
//       resetPasswordToken,
//       resetPasswordExpire: { $gt: Date.now() },
//     });

//     if (!user) {
//       console.log('❌ Invalid or expired token');
//       return res.status(400).json({ 
//         success: false, 
//         message: 'Invalid or expired password reset token.' 
//       });
//     }

//     // Check if account is deactivated
//     if (user.isActive === false) {
//       return res.status(403).json({
//         success: false,
//         message: 'Cannot reset password for deactivated account. Please contact support.'
//       });
//     }

//     console.log('✅ Valid reset token found for user:', user.emailAddress);

//     // Set new password
//     user.password = await bcrypt.hash(password, 10);
//     user.resetPasswordToken = undefined;
//     user.resetPasswordExpire = undefined;
//     await user.save();

//     console.log('✅ Password reset successful for user:', user.emailAddress);

//     res.status(200).json({ 
//       success: true, 
//       message: 'Password has been reset successfully.' 
//     });
//   } catch (error) {
//     console.error('❌ Reset password error:', error);
//     res.status(500).json({ 
//       success: false, 
//       message: 'Server error while resetting password.' 
//     });
//   }
// };

// ✅ FIX 3: Update authController.js (backend)
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
    await user.save();

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
    console.log(`Admin approving service provider: ${userId}`);

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

    // Send approval email
    try {
      await sendApprovalEmail(provider.emailAddress, provider.businessName, provider.fullName);
    } catch (emailError) {
      console.error('Failed to send approval email:', emailError);
    }

    res.json({ success: true, message: 'Service provider approved successfully', provider });

  } catch (error) {
    console.error('Error approving service provider:', error);
    res.status(500).json({ success: false, message: 'Server error while approving provider', error: error.message });
  }
};

// ADMIN: Reject a service provider
export const rejectServiceProvider = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

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

    // Send rejection email
    try {
      await sendRejectionEmail(provider.emailAddress, provider.businessName, provider.fullName, reason);
    } catch (emailError) {
      console.error('Failed to send rejection email:', emailError);
    }

    res.json({ success: true, message: 'Service provider rejected successfully', provider });

  } catch (error) {
    console.error('Error rejecting service provider:', error);
    res.status(500).json({ success: false, message: 'Server error while rejecting provider', error: error.message });
  }
};

// ADMIN: Get pending service providers
export const getPendingServiceProviders = async (req, res) => {
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
    console.error('Error getting pending service providers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending providers', error: error.message });
  }
};

// ADMIN: Get approved service providers
export const getApprovedServiceProviders = async (req, res) => {
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
    console.error('Error getting approved service providers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch approved providers', error: error.message });
  }
};