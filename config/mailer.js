import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

console.log('📧 Email configuration:', {
  user: process.env.EMAIL_USER,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@beautiq.com',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
});

// Export the transporter
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS.trim() // Ensure no whitespace
  }
});

// Add verification with error handling
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Email configuration error:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
  } else {
    console.log('✅ Email server is ready to send emails');
  }
});

// ENHANCED: Service notification to admin with detailed request type information
export const sendServiceNotificationToAdmin = async (service, serviceProvider) => {
  try {
    const action = service.action || 'create';
    const requestType = service.requestType || 'New Service';
    
    // Enhanced action text mapping
    const actionConfig = {
      'create': {
        title: '🆕 New Service Submission',
        description: 'A new service has been submitted for approval',
        color: '#4caf50',
        priority: 'NORMAL',
        urgency: 'Standard Review'
      },
      'update': {
        title: '📝 Service Update Request',
        description: 'A service provider has submitted changes to an existing service',
        color: '#ff9800',
        priority: 'MEDIUM',
        urgency: 'Update Review Required'
      },
      'delete': {
        title: '🗑️ Service Deletion Request',
        description: 'A service provider has requested to delete a service',
        color: '#f44336',
        priority: 'HIGH',
        urgency: 'Deletion Approval Needed'
      },
      'reactivate': {
        title: '🔄 Service Reactivation Request',
        description: 'A service provider wants to reactivate a deleted service',
        color: '#2196f3',
        priority: 'MEDIUM',
        urgency: 'Reactivation Review'
      }
    };
    
    const config = actionConfig[action] || actionConfig['create'];
    
    console.log(`📧 Preparing enhanced admin notification for ${action} - ${requestType}:`, service.name);
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    console.log('📧 Sending enhanced notification to admin email:', adminEmail);
    
    const adminUrl = `${process.env.FRONTEND_URL}/admin/service-management`;
    
    // Enhanced service details formatting
    const formatServiceDetails = () => {
      const baseDetails = [
        { label: 'Service Name', value: service.name, highlight: true },
        { label: 'Service Type', value: service.type },
        { label: 'Target Audience', value: service.category },
        { label: 'Request Type', value: requestType, highlight: true, color: config.color }
      ];
      
      if (service.pricing?.basePrice) {
        baseDetails.push({
          label: 'Base Price',
          value: `LKR ${service.pricing.basePrice.toLocaleString()}`,
          highlight: true
        });
      }
      
      if (service.duration) {
        baseDetails.push({
          label: 'Duration',
          value: `${service.duration} minutes`
        });
      }
      
      baseDetails.push(
        { label: 'Provider Business', value: serviceProvider.businessName || serviceProvider.fullName },
        { label: 'Provider Email', value: serviceProvider.emailAddress },
        { label: 'Submission Time', value: new Date().toLocaleString() },
        { label: 'Priority Level', value: config.priority, color: config.color, highlight: true }
      );
      
      return baseDetails;
    };
    
    const serviceDetails = formatServiceDetails();
    
    const mailOptions = {
      from: {
        name: 'BeautiQ Admin System',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: `🚨 ${config.title} - ${requestType} - ACTION REQUIRED`,
      html: `
        <div style="max-width: 700px; margin: 0 auto; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8f9fa;">
          
          <!-- Header with Action Type -->
          <div style="background: linear-gradient(135deg, ${config.color} 0%, ${config.color}dd 100%); 
                      padding: 30px 40px; 
                      text-align: center; 
                      color: white;
                      box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <div style="font-size: 48px; margin-bottom: 15px;">
              ${action === 'create' ? '🆕' : action === 'update' ? '📝' : action === 'delete' ? '🗑️' : '🔄'}
            </div>
            <h1 style="margin: 0; font-size: 32px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">
              ${config.title}
            </h1>
            <div style="margin-top: 15px; padding: 10px 20px; 
                        background: rgba(255,255,255,0.2); 
                        border-radius: 25px; 
                        display: inline-block;">
              <span style="font-size: 18px; font-weight: 600;">${config.urgency}</span>
            </div>
          </div>

          <!-- Request Type Label Banner -->
          <div style="background: linear-gradient(90deg, #fff 0%, ${config.color}15 50%, #fff 100%); 
                      padding: 20px; 
                      text-align: center; 
                      border-left: 5px solid ${config.color};">
            <h2 style="margin: 0; color: ${config.color}; font-size: 24px; font-weight: 700;">
              📋 REQUEST TYPE: ${requestType.toUpperCase()}
            </h2>
            <p style="margin: 8px 0 0 0; color: #666; font-size: 16px;">${config.description}</p>
          </div>

          <!-- Service Details Section -->
          <div style="background: white; padding: 30px; margin: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <h3 style="color: #333; margin: 0 0 25px 0; font-size: 20px; border-bottom: 3px solid ${config.color}; padding-bottom: 10px;">
              📊 Service Details & Provider Information
            </h3>
            
            <div style="display: grid; gap: 15px;">
              ${serviceDetails.map(detail => `
                <div style="display: flex; 
                            padding: 12px 0; 
                            border-bottom: 1px solid #eee;
                            ${detail.highlight ? `background: linear-gradient(90deg, ${detail.color || config.color}08 0%, transparent 100%);` : ''}">
                  <div style="font-weight: 600; 
                              color: #555; 
                              width: 180px; 
                              flex-shrink: 0;
                              padding-right: 15px;">${detail.label}:</div>
                  <div style="color: ${detail.color || '#333'}; 
                              font-weight: ${detail.highlight ? '700' : '400'};
                              ${detail.highlight ? `background: ${detail.color || config.color}15; padding: 4px 8px; border-radius: 4px; display: inline-block;` : ''}">${detail.value}</div>
                </div>
              `).join('')}
            </div>
            
            ${service.description ? `
            <div style="margin-top: 25px; 
                        padding: 20px; 
                        background: #f8f9fa; 
                        border-radius: 8px;
                        border-left: 4px solid ${config.color};">
              <h4 style="margin: 0 0 10px 0; color: #333;">📝 Service Description:</h4>
              <p style="margin: 0; line-height: 1.6; color: #555;">${service.description}</p>
            </div>
            ` : ''}
            
            ${service.serviceDetails ? `
            <div style="margin-top: 20px; 
                        padding: 15px; 
                        background: #fff3e0; 
                        border-radius: 8px;
                        border: 1px solid #ffcc02;">
              <h4 style="margin: 0 0 15px 0; color: #e65100;">🔍 Additional Details:</h4>
              <div style="display: grid; gap: 8px;">
                ${service.serviceDetails.preparationRequired ? `
                <div><strong>Preparation Required:</strong> ${service.serviceDetails.preparationRequired}</div>
                ` : ''}
                ${service.serviceDetails.customNotes ? `
                <div><strong>Special Notes:</strong> ${service.serviceDetails.customNotes}</div>
                ` : ''}
                ${service.serviceDetails.cancellationPolicy ? `
                <div><strong>Cancellation Policy:</strong> ${service.serviceDetails.cancellationPolicy}</div>
                ` : ''}
              </div>
            </div>
            ` : ''}
          </div>

          <!-- Action Required Section -->
          <div style="background: ${config.color}; 
                      color: white; 
                      padding: 25px 30px; 
                      text-align: center;">
            <h3 style="margin: 0 0 20px 0; font-size: 22px;">🚨 ADMIN ACTION REQUIRED</h3>
            <p style="margin: 0 0 25px 0; font-size: 16px; line-height: 1.5;">
              This ${requestType.toLowerCase()} requires your immediate attention. 
              Please review the details above and take appropriate action.
            </p>
            
            <div style="margin-bottom: 25px;">
              <a href="${adminUrl}" 
                 style="background: white; 
                        color: ${config.color}; 
                        padding: 15px 35px; 
                        text-decoration: none; 
                        border-radius: 8px;
                        font-size: 18px;
                        font-weight: 700;
                        display: inline-block;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                        transition: all 0.3s ease;">
                🔍 Review in Admin Dashboard
              </a>
            </div>
            
            <div style="background: rgba(255,255,255,0.15); 
                        padding: 15px; 
                        border-radius: 8px; 
                        margin-top: 20px;">
              <p style="margin: 0; font-size: 14px; font-style: italic;">
                ⏰ Timely response helps maintain service quality and provider satisfaction.
                ${action === 'delete' ? ' Deletion requests should be handled with extra care.' : ''}
                ${action === 'update' ? ' Compare changes carefully before approving.' : ''}
              </p>
            </div>
          </div>

          <!-- Provider Information Section -->
          <div style="background: #f8f9fa; 
                      padding: 25px 30px; 
                      border-top: 3px solid ${config.color};">
            <h4 style="margin: 0 0 15px 0; color: #333;">👤 Service Provider Information</h4>
            <div style="background: white; 
                        padding: 15px; 
                        border-radius: 6px; 
                        border-left: 4px solid ${config.color};">
              <div style="display: grid; gap: 8px;">
                <div><strong>Business Name:</strong> ${serviceProvider.businessName || serviceProvider.fullName}</div>
                <div><strong>Contact Email:</strong> ${serviceProvider.emailAddress}</div>
                ${serviceProvider.mobileNumber ? `<div><strong>Phone:</strong> ${serviceProvider.mobileNumber}</div>` : ''}
                ${serviceProvider.businessType ? `<div><strong>Business Type:</strong> ${serviceProvider.businessType}</div>` : ''}
                ${serviceProvider.city ? `<div><strong>Location:</strong> ${serviceProvider.city}</div>` : ''}
                ${serviceProvider.serviceProviderId ? `<div><strong>Provider ID:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 3px;">${serviceProvider.serviceProviderId}</code></div>` : ''}
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div style="background: #333; 
                      color: #ccc; 
                      padding: 20px 30px; 
                      text-align: center; 
                      font-size: 14px;">
            <p style="margin: 0 0 10px 0;">
              This is an automated notification from the BeautiQ Admin System
            </p>
            <p style="margin: 0; font-size: 12px; opacity: 0.8;">
              Please do not reply to this email. Use the admin dashboard for all actions.
            </p>
          </div>
        </div>
      `
    };

    console.log('📧 Sending enhanced service notification email...');
    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Enhanced service notification email sent successfully:', result.messageId);
    console.log('📧 Email sent with request type label:', requestType);
    return true;
  } catch (error) {
    console.error('❌ Failed to send enhanced service notification email:', error);
    console.error('❌ Error details:', {
      name: error.name,
      message: error.message,
      code: error.code
    });
    throw new Error(`Failed to send service notification email: ${error.message}`);
  }
};

// Password reset email
export const sendResetEmail = async (email, token, name) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    console.log(`📧 Sending password reset email to ${email} with link: ${resetUrl}`);
    
    const info = await transporter.sendMail({
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1976d2;">Hello ${name || 'User'},</h1>
          <p>You requested a password reset. Click the link below to reset your password:</p>
          <div style="margin: 20px 0;">
            <a href="${resetUrl}" style="background-color: #1976d2; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Reset Password
            </a>
          </div>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    });
    
    console.log('✅ Password reset email sent successfully. Message ID:', info.messageId);
    return info;
  } catch (error) {
    console.error(`❌ Failed to send password reset email to ${email}:`, error);
    throw error;
  }
};

// Service provider approval email
export const sendApprovalEmail = async (email, businessName, fullName) => {
  try {
    const approvalSuccessUrl = `${process.env.FRONTEND_URL}/service-provider-approval-success`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Your BeautiQ Account is Approved! 🎉',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1976d2; text-align: center;">Account Approved! 🎉</h1>
          <p>Dear ${fullName},</p>
          <p>Great news! Your service provider account for "${businessName}" has been approved.</p>
          <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
            <p style="font-size: 18px; margin-bottom: 20px;">Click the button below to access your account:</p>
            <a href="${approvalSuccessUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Access Your Account
            </a>
          </div>
          <p style="margin-top: 20px;">Welcome to the BeautiQ family!</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('❌ Email sending error:', error);
    throw new Error(`Failed to send approval email: ${error.message}`);
  }
};

// Service provider rejection email
export const sendRejectionEmail = async (email, businessName, fullName, reason) => {
  try {
    const supportUrl = `${process.env.FRONTEND_URL}/contact-support`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'BeautiQ Registration Update - Action Required',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #d32f2f; text-align: center;">Registration Status Update</h1>
          <p>Dear ${fullName},</p>
          <p>Thank you for your interest in joining BeautiQ as a service provider.</p>
          <div style="background-color: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
            <p><strong>Unfortunately, we are unable to approve your application for "${businessName}" at this time.</strong></p>
            <p><strong>Reason:</strong> ${reason}</p>
          </div>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #1976d2; margin-top: 0;">What you can do:</h3>
            <ul style="line-height: 1.6;">
              <li>Review our service provider requirements</li>
              <li>Update your credentials or documentation</li>
              <li>Reapply after addressing the mentioned concerns</li>
              <li>Contact our support team for clarification</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${supportUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 14px 28px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Contact Support
            </a>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center;">
            We appreciate your interest in BeautiQ and encourage you to reapply once you've addressed our feedback.
          </p>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 30px;">
            This is an automated message from BeautiQ. Please do not reply to this email.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Rejection email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('❌ Failed to send rejection email:', error);
    throw new Error(`Failed to send rejection email: ${error.message}`);
  }
};

// ENHANCED: Comprehensive Service Status Update Email
export const sendServiceStatusUpdate = async (service, serviceProvider, status, reason = '', actionType = 'status_change') => {
  try {
    const statusMessages = {
      approved: {
        subject: '✅ Service Approved',
        heading: 'Your service has been approved!',
        message: 'Congratulations! Your service is now live and available for bookings.',
        color: '#4caf50',
        icon: '✅'
      },
      rejected: {
        subject: '❌ Service Rejected',
        heading: 'Service requires changes',
        message: 'Your service submission needs some adjustments before approval.',
        color: '#f44336',
        icon: '❌'
      },
      deleted: {
        subject: '🗑️ Service Deletion Approved',
        heading: 'Service deletion completed',
        message: 'Your service has been successfully removed from the platform.',
        color: '#ff9800',
        icon: '🗑️'
      }
    };

    const config = statusMessages[status] || statusMessages.approved;
    const serviceUrl = `${process.env.FRONTEND_URL}/service-provider/services`;
    
    // Enhanced action type descriptions
    const getActionTypeDescription = () => {
      switch(actionType) {
        case 'approval':
          return 'Your new service submission has been reviewed and approved.';
        case 'update_approval':
          return 'Your service update request has been reviewed and approved.';
        case 'deletion_approval':
          return 'Your service deletion request has been reviewed and approved.';
        case 'reactivation_approval':
          return 'Your service reactivation request has been reviewed and approved.';
        case 'rejection':
          return 'Your service submission has been reviewed but requires changes.';
        case 'update_rejection':
          return 'Your service update request has been reviewed but was not approved.';
        case 'deletion_rejection':
          return 'Your service deletion request has been reviewed but was not approved.';
        default:
          return 'Your service status has been updated.';
      }
    };

    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: serviceProvider.emailAddress,
      subject: `${config.subject} - ${service.name}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, ${config.color}, ${config.color}dd); padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 48px; margin-bottom: 10px;">${config.icon}</div>
            <h1 style="color: white; margin: 0; font-size: 28px; text-shadow: 0 2px 4px rgba(0,0,0,0.3);">${config.heading}</h1>
            <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 16px;">${getActionTypeDescription()}</p>
          </div>
          
          <!-- Service Details -->
          <div style="background-color: white; padding: 25px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-top: 0; border-bottom: 2px solid ${config.color}; padding-bottom: 10px;">Service Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555; width: 35%;">Service Name:</td>
                <td style="padding: 12px 0; color: #333; font-weight: 600;">${service.name}</td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Service ID:</td>
                <td style="padding: 12px 0; color: #333;">
                  ${service.serviceId ? `<span style="background-color: #e8f5e8; padding: 4px 8px; border-radius: 4px; font-family: monospace;">${service.serviceId}</span>` : 'Will be assigned upon approval'}
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Service Type:</td>
                <td style="padding: 12px 0; color: #333;">${service.type}</td>
              </tr>
              ${service.category ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Category:</td>
                <td style="padding: 12px 0; color: #333;">${service.category}</td>
              </tr>
              ` : ''}
              ${service.pricing?.basePrice ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Base Price:</td>
                <td style="padding: 12px 0; color: #333; font-weight: 600;">LKR ${service.pricing.basePrice.toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.duration ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Duration:</td>
                <td style="padding: 12px 0; color: #333;">${service.duration} minutes</td>
              </tr>
              ` : ''}
              ${service.createdAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Submitted At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.createdAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.firstApprovedAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">First Approved At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.firstApprovedAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.lastUpdatedAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Last Updated At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.lastUpdatedAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.deletedAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Deleted At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.deletedAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.createdAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Submitted At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.createdAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.firstApprovedAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">First Approved At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.firstApprovedAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.lastUpdatedAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Last Updated At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.lastUpdatedAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              ${service.deletedAt ? `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Deleted At:</td>
                <td style="padding: 12px 0; color: #333;">${new Date(service.deletedAt).toLocaleString()}</td>
              </tr>
              ` : ''}
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Current Status:</td>
                <td style="padding: 12px 0;">
                  <span style="background-color: ${config.color}; color: white; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; text-transform: uppercase;">
                    ${status}
                  </span>
                </td>
              </tr>
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 12px 0; font-weight: bold; color: #555;">Action Date:</td>
                <td style="padding: 12px 0; color: #333;">${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</td>
              </tr>
              ${reason ? `
              <tr>
                <td style="padding: 12px 0; font-weight: bold; color: #555; vertical-align: top;">Admin Comments:</td>
                <td style="padding: 12px 0; color: #333; background-color: #f8f9fa; padding: 10px; border-radius: 4px; border-left: 3px solid ${config.color};">
                  "${reason}"
                </td>
              </tr>
              ` : ''}
            </table>
          </div>

          <!-- Action Button -->
          <div style="text-align: center; margin: 30px 0;">
            <a href="${serviceUrl}" 
               style="background-color: ${config.color}; 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      font-weight: bold;
                      display: inline-block;
                      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                      transition: all 0.3s ease;">
              Manage Your Services
            </a>
          </div>

          <!-- Status-specific Information -->
          <div style="background-color: ${status === 'approved' ? '#e8f5e8' : status === 'rejected' ? '#ffebee' : '#fff3e0'}; 
                      padding: 20px; 
                      border-radius: 8px; 
                      border-left: 4px solid ${config.color};
                      margin-bottom: 20px;">
            <h3 style="margin-top: 0; color: ${config.color};">What happens next?</h3>
            <p style="margin: 0; line-height: 1.6; color: #555;">
              ${status === 'approved' 
                ? `Your service is now live on the BeautiQ platform! Customers can discover and book your "${service.name}" service. You can track bookings and manage your service in your provider dashboard.`
                : status === 'rejected'
                ? `Please review the admin comments above and make the necessary changes to your service. You can then resubmit your service for approval through your provider dashboard.`
                : status === 'deleted'
                ? `Your service has been removed from the platform and is no longer available for booking. The service record is preserved in your dashboard for historical reference.`
                : config.message
              }
            </p>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding: 20px; border-top: 1px solid #eee; color: #666;">
            <p style="margin: 0; font-size: 14px;">
              Thank you for being part of the BeautiQ community!
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">
              This is an automated message from BeautiQ. Please do not reply to this email.
            </p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Service ${status} notification sent successfully to ${serviceProvider.emailAddress}:`, result.messageId);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send service ${status} notification:`, error);
    throw new Error(`Failed to send service ${status} notification: ${error.message}`);
  }
};

// Registration notification to admin
export const sendRegistrationNotificationToAdmin = async (serviceProvider) => {
  try {
    console.log('📧 Preparing admin notification email for:', serviceProvider.businessName);
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    console.log('📧 Sending notification to admin email:', adminEmail);
    
    const adminUrl = `${process.env.FRONTEND_URL}/admin-dashboard`;
    
    const mailOptions = {
      from: {
        name: 'BeautiQ System',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: 'New Service Provider Registration - Action Required',
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif;">
          <h1 style="color: #1976d2; text-align: center;">New Service Provider Registration</h1>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>A new service provider has registered and is awaiting your approval:</strong></p>
            <ul style="line-height: 1.6;">
              <li><strong>Business Name:</strong> ${serviceProvider.businessName}</li>
              <li><strong>Owner:</strong> ${serviceProvider.fullName}</li>
              <li><strong>Email:</strong> ${serviceProvider.emailAddress}</li>
              <li><strong>Phone:</strong> ${serviceProvider.mobileNumber}</li>
              <li><strong>Business Type:</strong> ${serviceProvider.businessType}</li>
              <li><strong>Services Count:</strong> ${serviceProvider.services?.length || 0}</li>
              <li><strong>Registration Date:</strong> ${new Date().toLocaleDateString()}</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${adminUrl}" 
               style="background-color: #1976d2; 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 8px;
                      font-size: 16px;
                      display: inline-block;">
              Review in Admin Dashboard
            </a>
          </div>
          <p style="color: #666; font-size: 14px; text-align: center;">
            Please review and approve/reject this registration in your admin dashboard.
          </p>
        </div>
      `
    };

    console.log('📧 Sending email with options:', {
      to: mailOptions.to,
      subject: mailOptions.subject,
      from: mailOptions.from
    });

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Admin notification email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('❌ Detailed email sending error:', error);
    throw new Error(`Failed to send admin notification email: ${error.message}`);
  }
};

// Legacy function for backward compatibility
export const sendServiceStatusNotificationToProvider = async (service, serviceProvider, status, reason = '') => {
  console.log('⚠️ Using legacy sendServiceStatusNotificationToProvider - consider using sendServiceStatusUpdate instead');
  return await sendServiceStatusUpdate(service, serviceProvider, status, reason, 'legacy');
};

// Export all functions (this is the key fix)
export default {
  transporter,
  sendServiceNotificationToAdmin,
  sendResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendServiceStatusUpdate,
  sendRegistrationNotificationToAdmin,
  sendServiceStatusNotificationToProvider
};