import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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
      role = 'customer',
      // Service provider specific fields
      businessName,
      businessDescription,
      businessType,
      city,
      currentAddress,
      homeAddress,
      mobileNumber,
      nicNumber,
      services,
      location,
      experience,
      specialties,
      languages,
      policies
    } = req.body;

    console.log('Role:', role);
    console.log('Email:', emailAddress);

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
      approved: role === 'customer' ? true : false, // Service providers need approval
      createdAt: new Date()
    };

    // Add service provider specific fields
    if (role === 'serviceProvider') {
      // Parse JSON fields if they're strings
      let parsedServices = [];
      let parsedLocation = {};
      let parsedExperience = {};
      let parsedSpecialties = [];
      let parsedLanguages = [];
      let parsedPolicies = {};

      try {
        parsedServices = typeof services === 'string' ? JSON.parse(services) : services || [];
        parsedLocation = typeof location === 'string' ? JSON.parse(location) : location || {};
        parsedExperience = typeof experience === 'string' ? JSON.parse(experience) : experience || {};
        parsedSpecialties = typeof specialties === 'string' ? JSON.parse(specialties) : specialties || [];
        parsedLanguages = typeof languages === 'string' ? JSON.parse(languages) : languages || [];
        parsedPolicies = typeof policies === 'string' ? JSON.parse(policies) : policies || {};
      } catch (parseError) {
        console.error('Error parsing JSON fields:', parseError);
        return res.status(400).json({
          success: false,
          message: 'Invalid JSON data in request'
        });
      }

      userData.businessName = businessName;
      userData.businessDescription = businessDescription;
      userData.businessType = businessType;
      userData.city = city;
      userData.currentAddress = currentAddress;
      userData.homeAddress = homeAddress;
      userData.mobileNumber = mobileNumber;
      userData.nicNumber = nicNumber;
      userData.services = parsedServices;
      userData.location = parsedLocation;
      userData.experience = parsedExperience;
      userData.specialties = parsedSpecialties;
      userData.languages = parsedLanguages;
      userData.policies = parsedPolicies;

      // Handle file uploads
      if (req.files) {
        if (req.files.profilePhoto) {
          userData.profilePhoto = req.files.profilePhoto[0].filename;
        }
        if (req.files.nicFrontPhoto) {
          userData.nicFrontPhoto = req.files.nicFrontPhoto[0].filename;
        }
        if (req.files.nicBackPhoto) {
          userData.nicBackPhoto = req.files.nicBackPhoto[0].filename;
        }
        if (req.files.certificatesPhotos) {
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

    // For service providers, log that they need admin approval
    if (role === 'serviceProvider') {
      console.log('Service provider registration saved - pending admin approval');
    }

    res.status(201).json({
      success: true,
      message: role === 'serviceProvider' 
        ? 'Service provider registration submitted successfully. Your application is pending admin approval.'
        : 'User registered successfully',
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
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
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
    if (role === 'serviceProvider' && !user.approved) {
      return res.status(403).json({
        success: false,
        message: 'Your service provider account is pending admin approval',
        pendingApproval: true
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id,
        role: user.role,
        approved: user.approved
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for user:', user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        emailAddress: user.emailAddress,
        role: user.role,
        approved: user.approved
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

export const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.resetToken !== resetToken) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    if (user.resetTokenExpiry && Date.now() > user.resetTokenExpiry) {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired'
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password and clear reset token
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully'
    });

  } catch (error) {
    console.error('Reset password error:', error);
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
      role: 'service_provider', 
      approved: true 
    });
    const pendingApprovals = await User.countDocuments({ 
      role: 'service_provider', 
      approved: false 
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
      role: 'service_provider', 
      approved: false 
    }).select('-password -resetToken -resetTokenExpiry');

    res.json({
      success: true,
      data: pendingProviders
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
    const approvedProviders = await User.find({ 
      role: 'service_provider', 
      approved: true 
    }).select('-password -resetToken -resetTokenExpiry');

    res.json({
      success: true,
      data: approvedProviders
    });
  } catch (error) {
    console.error('Get approved service providers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get approved service providers',
      error: error.message
    });
  }
};

export const approveServiceProvider = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Service provider not found'
      });
    }

    if (user.role !== 'service_provider') {
      return res.status(400).json({
        success: false,
        message: 'User is not a service provider'
      });
    }

    user.approved = true;
    await user.save();

    res.json({
      success: true,
      message: 'Service provider approved successfully',
      data: user
    });
  } catch (error) {
    console.error('Approve service provider error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve service provider',
      error: error.message
    });
  }
};