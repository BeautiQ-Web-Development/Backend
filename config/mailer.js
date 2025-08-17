// config/mailer.js - UPDATED WITH SERVICE PROVIDER EMAIL FUNCTIONS
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// CRITICAL FIX: Gmail Configuration Fix
const createTransporter = () => {
  // Use App Password instead of regular Gmail password
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false, // Use TLS
    auth: {
      user: process.env.EMAIL_USER || 'piranaberem14@gmail.com',
      pass: process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD // Use App Password here
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  return transporter;
};

// Test email configuration on startup
const testEmailConfig = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log('✅ Email configuration verified successfully');
  } catch (error) {
    console.error('❌ Email configuration error:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    console.log('🔧 Email setup instructions:');
    console.log('1. Enable 2-Factor Authentication on your Gmail account');
    console.log('2. Generate an App Password: https://myaccount.google.com/apppasswords');
    console.log('3. Use the App Password in EMAIL_APP_PASSWORD environment variable');
    console.log('4. Make sure EMAIL_USER is set to your Gmail address');
  }
};

// Call test on module load
testEmailConfig();

// ENHANCED: Professional Email Templates
const createEmailTemplate = (title, content, actionType = 'info') => {
  const colors = {
    success: '#4CAF50',
    error: '#F44336',
    warning: '#FF9800',
    info: '#2196F3'
  };

  const color = colors[actionType] || colors.info;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
            * { box-sizing: border-box; }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                margin: 0;
                padding: 0;
                background-color: #f8f9fa;
            }
            .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, ${color}, ${color}dd);
                color: white;
                padding: 30px 20px;
                text-align: center;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 600;
            }
            .content {
                padding: 30px 20px;
            }
            .status-badge {
                display: inline-block;
                padding: 8px 16px;
                border-radius: 20px;
                font-weight: bold;
                font-size: 14px;
                margin: 10px 0;
                background-color: ${color};
                color: white;
            }
            .info-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                background-color: #f8f9fa;
                border-radius: 8px;
                overflow: hidden;
            }
            .info-table th,
            .info-table td {
                padding: 12px 15px;
                text-align: left;
                border-bottom: 1px solid #e9ecef;
            }
            .info-table th {
                background-color: ${color};
                color: white;
                font-weight: 600;
            }
            .info-table tr:last-child td {
                border-bottom: none;
            }
            .footer {
                background-color: #003047;
                color: white;
                text-align: center;
                padding: 20px;
                font-size: 14px;
            }
            .rejection-reason {
                background-color: #ffebee;
                border-left: 4px solid #f44336;
                padding: 15px;
                margin: 15px 0;
                border-radius: 4px;
            }
            .success-message {
                background-color: #e8f5e8;
                border-left: 4px solid #4CAF50;
                padding: 15px;
                margin: 15px 0;
                border-radius: 4px;
            }
            .btn {
                display: inline-block;
                padding: 12px 24px;
                background-color: ${color};
                color: white;
                text-decoration: none;
                border-radius: 6px;
                font-weight: 600;
                margin: 10px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎀 BeautiQ Service Portal</h1>
                <p>${title}</p>
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                <p>© 2024 BeautiQ Beauty Services Platform</p>
                <p>For support, contact us at: ${process.env.ADMIN_EMAIL || 'admin@beautiq.com'}</p>
            </div>
        </div>
    </body>
    </html>
  `;
};

// NEW: Service Provider Update Approval Email
export const sendServiceProviderUpdateApprovalEmail = async (serviceProvider, approvedFields) => {
  try {
    const transporter = createTransporter();
    const subject = '✅ Profile Update Approved - BeautiQ Service Provider';
    
    const changesList = Object.entries(approvedFields)
      .map(([key, value]) => `<li><strong>${key.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${value}</li>`)
      .join('');

    const content = `
      <p>Dear ${serviceProvider.fullName},</p>
      <p>Great news! Your profile update request has been approved by our admin team.</p>
      
      <div class="success-message">
        <h3>✅ Approved Changes</h3>
        <ul style="list-style-type: none; padding: 0;">${changesList}</ul>
      </div>
      
      <p>Your updated information is now live on the BeautiQ platform and visible to customers.</p>
      
      <div style="text-align: center; margin: 20px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/service-provider-login" class="btn">Access Your Dashboard</a>
      </div>
      
      <p>Thank you for keeping your profile information current!</p>
    `;

    const htmlContent = createEmailTemplate('Profile Update Approved', content, 'success');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: serviceProvider.emailAddress,
      subject,
      html: htmlContent
    });
    
    console.log(`✅ Service provider update approval email sent to ${serviceProvider.emailAddress}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send service provider update approval email:`, error);
    throw error;
  }
};

// NEW: Service Provider Update Rejection Email
export const sendServiceProviderUpdateRejectionEmail = async (serviceProvider, reason) => {
  try {
    const transporter = createTransporter();
    const subject = '❌ Profile Update Request Rejected - BeautiQ Service Provider';

    const content = `
      <p>Dear ${serviceProvider.fullName},</p>
      <p>We regret to inform you that your recent profile update request has been rejected by our admin team.</p>
      
      <div class="rejection-reason">
        <h3>📋 Rejection Details</h3>
        <p><strong>Business Name:</strong> ${serviceProvider.businessName}</p>
        <p><strong>Provider ID:</strong> ${serviceProvider.serviceProviderId || 'Not assigned'}</p>
        <p><strong>Rejection Reason:</strong></p>
        <div style="background-color: white; padding: 12px; border-radius: 4px; margin: 10px 0; font-style: italic;">
          "${reason}"
        </div>
      </div>
      
      <p><strong>What's Next:</strong></p>
      <ul>
        <li>Review the rejection reason carefully</li>
        <li>Make necessary corrections to your profile information</li>
        <li>Resubmit your update request through your dashboard</li>
        <li>Contact support if you need clarification</li>
      </ul>
      
      <div style="text-align: center; margin: 20px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/service-provider-login" class="btn">Access Your Dashboard</a>
      </div>
    `;

    const htmlContent = createEmailTemplate('Profile Update Rejected', content, 'error');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: serviceProvider.emailAddress,
      subject,
      html: htmlContent
    });
    
    console.log(`✅ Service provider update rejection email sent to ${serviceProvider.emailAddress}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send service provider update rejection email:`, error);
    throw error;
  }
};

// NEW: Service Provider Account Deletion Approval Email
export const sendServiceProviderDeleteApprovalEmail = async (serviceProvider) => {
  try {
    const transporter = createTransporter();
    const subject = '✅ Account Deletion Approved - Thank You from BeautiQ';

    const content = `
      <p>Dear ${serviceProvider.fullName},</p>
      
      <div class="success-message">
        <h3>🙏 Thank You for Being Part of BeautiQ</h3>
        <p>Your account deletion request has been approved and processed successfully.</p>
      </div>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h4>📋 Account Details</h4>
        <p><strong>Business Name:</strong> ${serviceProvider.businessName}</p>
        <p><strong>Provider ID:</strong> ${serviceProvider.serviceProviderId || 'Not assigned'}</p>
        <p><strong>Account Status:</strong> <span style="color: #f44336; font-weight: bold;">Deactivated</span></p>
        <p><strong>Deletion Date:</strong> ${new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric', 
          hour: '2-digit', minute: '2-digit'
        })}</p>
      </div>
      
      <p>We want to express our heartfelt gratitude for the time you spent as a service provider on our platform. Your contributions helped make BeautiQ a better place for beauty enthusiasts.</p>
      
      <p><strong>Important Notes:</strong></p>
      <ul>
        <li>Your account has been permanently deactivated</li>
        <li>You will no longer be able to log in with your previous credentials</li>
        <li>All your service listings have been removed from the platform</li>
        <li>If you wish to rejoin BeautiQ in the future, you will need to register as a new service provider</li>
      </ul>
      
      <div style="background-color: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <h4>💙 We Hope to See You Again!</h4>
        <p>If you ever decide to return to BeautiQ, we would be delighted to welcome you back. Simply register as a new service provider and go through our approval process again.</p>
      </div>
      
      <p>Thank you once again for being part of our community. We wish you all the best in your future endeavors!</p>
      
      <p>Warm regards,<br>The BeautiQ Team</p>
    `;

    const htmlContent = createEmailTemplate('Thank You from BeautiQ', content, 'info');

    await transporter.sendMail({
      from: { name: 'BeautiQ Team', address: process.env.EMAIL_USER },
      to: serviceProvider.emailAddress,
      subject,
      html: htmlContent
    });
    
    console.log(`✅ Service provider deletion approval email sent to ${serviceProvider.emailAddress}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send service provider deletion approval email:`, error);
    throw error;
  }
};

// NEW: Service Provider Account Deletion Rejection Email
export const sendServiceProviderDeleteRejectionEmail = async (serviceProvider, reason) => {
  try {
    const transporter = createTransporter();
    const subject = '❌ Account Deletion Request Rejected - BeautiQ Service Provider';

    const content = `
      <p>Dear ${serviceProvider.fullName},</p>
      <p>We have reviewed your account deletion request, and unfortunately, we cannot approve it at this time.</p>
      
      <div class="rejection-reason">
        <h3>📋 Rejection Details</h3>
        <p><strong>Business Name:</strong> ${serviceProvider.businessName}</p>
        <p><strong>Provider ID:</strong> ${serviceProvider.serviceProviderId || 'Not assigned'}</p>
        <p><strong>Request Date:</strong> ${new Date().toLocaleDateString('en-US', {
          year: 'numeric', month: 'long', day: 'numeric'
        })}</p>
        <p><strong>Rejection Reason:</strong></p>
        <div style="background-color: white; padding: 12px; border-radius: 4px; margin: 10px 0; font-style: italic;">
          "${reason}"
        </div>
      </div>
      
      <p><strong>Your account remains active</strong> and you can continue using all BeautiQ services.</p>
      
      <p><strong>What's Next:</strong></p>
      <ul>
        <li>Review the rejection reason provided above</li>
        <li>Contact our support team if you need clarification</li>
        <li>Address any concerns mentioned in the rejection reason</li>
        <li>You may resubmit your deletion request later if needed</li>
      </ul>
      
      <div style="text-align: center; margin: 20px 0;">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/service-provider-login" class="btn">Access Your Dashboard</a>
        <a href="mailto:${process.env.ADMIN_EMAIL || 'support@beautiq.com'}" class="btn" style="background-color: #6c757d; margin-left: 10px;">Contact Support</a>
      </div>
    `;

    const htmlContent = createEmailTemplate('Account Deletion Request Rejected', content, 'error');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: serviceProvider.emailAddress,
      subject,
      html: htmlContent
    });
    
    console.log(`✅ Service provider deletion rejection email sent to ${serviceProvider.emailAddress}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to send service provider deletion rejection email:`, error);
    throw error;
  }
};

// NEW: Admin Notification for Service Provider Requests
export const sendServiceProviderRequestNotificationToAdmin = async (serviceProvider, requestType, description) => {
  try {
    console.log('📧 Sending service provider request notification to admin:', {
      providerId: serviceProvider._id,
      businessName: serviceProvider.businessName,
      requestType,
      description
    });
    
    const transporter = createTransporter();
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    
    let priority = 'normal';
    let actionColor = 'info';
    let urgencyLabel = '📋 Service Provider Request';
    
    if (requestType.includes('Delete') || requestType.includes('Deletion')) {
      priority = 'high';
      actionColor = 'error';
      urgencyLabel = '🔥 HIGH PRIORITY - Account Deletion Request';
    } else if (requestType.includes('Update')) {
      priority = 'normal';
      actionColor = 'warning';
      urgencyLabel = '📝 Profile Update Request';
    }

    const subject = `${urgencyLabel}: ${serviceProvider.businessName} - Admin Action Required`;

    // Service provider details table
    const providerDetails = `
      <table class="info-table">
        <thead>
          <tr>
            <th colspan="2">👤 Service Provider Information</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Request Type</strong></td>
            <td><span class="status-badge">${requestType}</span></td>
          </tr>
          <tr>
            <td><strong>Business Name</strong></td>
            <td>${serviceProvider.businessName}</td>
          </tr>
          <tr>
            <td><strong>Provider Name</strong></td>
            <td>${serviceProvider.fullName}</td>
          </tr>
          <tr>
            <td><strong>Provider ID</strong></td>
            <td>${serviceProvider.serviceProviderId || 'Not assigned'}</td>
          </tr>
          <tr>
            <td><strong>Email</strong></td>
            <td>${serviceProvider.emailAddress}</td>
          </tr>
          <tr>
            <td><strong>Phone</strong></td>
            <td>${serviceProvider.mobileNumber || 'Not provided'}</td>
          </tr>
          <tr>
            <td><strong>Business Type</strong></td>
            <td>${serviceProvider.businessType || 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>City</strong></td>
            <td>${serviceProvider.city || 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>Request Date</strong></td>
            <td>${new Date().toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric', 
              hour: '2-digit', minute: '2-digit'
            })}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Pending changes table for update requests
    const changesTable = serviceProvider.pendingUpdates?.fields && 
      Object.keys(serviceProvider.pendingUpdates.fields).length > 0 ? `
      <div style="margin: 20px 0;">
        <h3>✏️ Requested Changes</h3>
        <table class="info-table" style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color:#f0f0f0;">
              <th style="padding:8px; text-align:left;">Field</th>
              <th style="padding:8px; text-align:left;">Current Value</th>
              <th style="padding:8px; text-align:left;">Requested Value</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(serviceProvider.pendingUpdates.fields).map(field => `
            <tr>
              <td style="padding:8px; vertical-align:top;"><strong>${field}</strong></td>
              <td style="padding:8px; vertical-align:top;">${serviceProvider[field] || 'N/A'}</td>
              <td style="padding:8px; vertical-align:top;">${serviceProvider.pendingUpdates.fields[field] || 'N/A'}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    // Deletion reason for delete requests
    const deletionReason = serviceProvider.pendingUpdates?.deleteRequested && serviceProvider.pendingUpdates?.reason ? `
      <div style="margin: 20px 0;">
        <h3>🗑️ Deletion Reason</h3>
        <div style="background-color: #ffebee; padding: 15px; border-radius: 8px; border-left: 4px solid #f44336;">
          <em>"${serviceProvider.pendingUpdates.reason}"</em>
        </div>
      </div>
    ` : '';

    // Admin action buttons
    const adminActions = `
      <div style="margin: 30px 0; text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <h3>⚡ Admin Actions Required</h3>
        <p>Please review this ${requestType.toLowerCase()} and take appropriate action:</p>
        <div style="margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/service-management" 
             class="btn" 
             style="background-color: #4CAF50; margin: 0 10px;">
            ✅ Review & Approve
          </a>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/service-management" 
             class="btn" 
             style="background-color: #f44336; margin: 0 10px;">
            ❌ Review & Reject
          </a>
        </div>
        <p><small>Provider ID: ${serviceProvider._id}</small></p>
      </div>
    `;

    const emailContent = `
      <div style="margin-bottom: 20px;">
        <h2>🎯 ${urgencyLabel}</h2>
        <p>${description}</p>
      </div>
      
      ${providerDetails}
      ${changesTable}
      ${deletionReason}
      ${adminActions}
      
      <div style="margin-top: 20px; padding: 15px; background-color: #e3f2fd; border-radius: 6px;">
        <p><strong>⏰ Priority Level:</strong> ${priority.toUpperCase()}</p>
        <p><strong>📧 Provider Contact:</strong> ${serviceProvider.emailAddress}</p>
        <p><strong>📅 Request Time:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;

    const htmlContent = createEmailTemplate(
      `Admin Action Required: ${requestType}`,
      emailContent,
      actionColor
    );

    const mailOptions = {
      from: {
        name: 'BeautiQ Service Provider Notifications',
        address: process.env.EMAIL_USER || 'admin@beautiq.com'
      },
      to: adminEmail,
      subject: subject,
      html: htmlContent,
      priority: priority
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Service provider request notification sent to admin:', {
      requestType,
      providerId: serviceProvider._id,
      businessName: serviceProvider.businessName,
      providerEmail: serviceProvider.emailAddress,
      adminEmail,
      messageId: info.messageId,
      priority
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to send service provider request notification to admin:', error);
    throw new Error(`Failed to send admin notification: ${error.message}`);
  }
};

// ENHANCED: Service Status Update Email with Complete Details
export const sendServiceStatusUpdate = async (service, providerData, status, reason, emailActionType = 'update') => {
  try {
    console.log(`📧 Preparing to send service ${status} notification...`);
    
    if (!providerData?.emailAddress) {
      throw new Error('Provider email address not found');
    }

    const transporter = createTransporter();
    const isApproval = status === 'approved';
    const isRejection = status === 'rejected';
    
    // Determine email subject and action type
    let subject = `BeautiQ Service Update: ${service.name}`;
    let actionColor = 'info';
    
    if (isApproval) {
      subject = `🎉 Service Approved: ${service.name}`;
      actionColor = 'success';
    } else if (isRejection) {
      subject = `❌ Service Rejected: ${service.name}`;
      actionColor = 'error';
    }

    // Create detailed service information table
    const serviceDetails = `
      <table class="info-table">
        <thead>
          <tr>
            <th colspan="2">📋 Service Information</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Service Name</strong></td>
            <td>${service.name}</td>
          </tr>
          <tr>
            <td><strong>Service ID</strong></td>
            <td>${service.serviceId || 'Assigned upon approval'}</td>
          </tr>
          <tr>
            <td><strong>Service Type</strong></td>
            <td>${service.type}</td>
          </tr>
          <tr>
            <td><strong>Target Audience</strong></td>
            <td>${service.category}</td>
          </tr>
          <tr>
            <td><strong>Base Price</strong></td>
            <td>LKR ${service.pricing?.basePrice || 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>Duration</strong></td>
            <td>${service.duration} minutes</td>
          </tr>
          <tr>
            <td><strong>Experience Level</strong></td>
            <td>${service.experienceLevel || 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>Service Location</strong></td>
            <td>${service.serviceLocation === 'home_service' ? 'Home Service Only' : 
                  service.serviceLocation === 'salon_only' ? 'Salon Only' : 
                  service.serviceLocation === 'both' ? 'Both Home & Salon' : 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>Submission Date</strong></td>
            <td>${new Date(service.firstSubmittedAt || service.createdAt).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric', 
              hour: '2-digit', minute: '2-digit'
            })}</td>
          </tr>
          <tr>
            <td><strong>Current Status</strong></td>
            <td><span class="status-badge">${status.toUpperCase()}</span></td>
          </tr>
          <tr>
            <td><strong>Availability Status</strong></td>
            <td><span class="status-badge" style="background-color: ${isApproval ? '#4CAF50' : '#F44336'}">
              ${isApproval ? 'Available' : 'Unavailable'}
            </span></td>
          </tr>
        </tbody>
      </table>
    `;

    // Provider information table
    const providerInfo = `
      <table class="info-table">
        <thead>
          <tr>
            <th colspan="2">👤 Provider Information</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Business Name</strong></td>
            <td>${providerData.businessName || 'Not provided'}</td>
          </tr>
          <tr>
            <td><strong>Full Name</strong></td>
            <td>${providerData.fullName}</td>
          </tr>
          <tr>
            <td><strong>Email</strong></td>
            <td>${providerData.emailAddress}</td>
          </tr>
          <tr>
            <td><strong>Provider ID</strong></td>
            <td>${providerData.serviceProviderId || 'Not assigned'}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Service description
    const serviceDescription = service.description ? `
      <div style="margin: 20px 0;">
        <h3>📝 Service Description</h3>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #2196F3;">
          ${service.description}
        </div>
      </div>
    ` : '';

    // Additional service details
    const additionalDetails = `
      ${service.preparationRequired ? `
        <div style="margin: 15px 0;">
          <h4>⚠️ Preparation Required</h4>
          <div style="background-color: #fff3e0; padding: 12px; border-radius: 6px; border-left: 3px solid #ff9800;">
            ${service.preparationRequired}
          </div>
        </div>
      ` : ''}
      
      ${service.customNotes ? `
        <div style="margin: 15px 0;">
          <h4>📌 Custom Notes</h4>
          <div style="background-color: #f3e5f5; padding: 12px; border-radius: 6px; border-left: 3px solid #9c27b0;">
            ${service.customNotes}
          </div>
        </div>
      ` : ''}
      
      ${service.cancellationPolicy ? `
        <div style="margin: 15px 0;">
          <h4>🔄 Cancellation Policy</h4>
          <div style="background-color: #e3f2fd; padding: 12px; border-radius: 6px; border-left: 3px solid #2196f3;">
            ${service.cancellationPolicy}
          </div>
        </div>
      ` : ''}
    `;

    // Status-specific message
    let statusMessage = '';
    if (isApproval) {
      statusMessage = `
        <div class="success-message">
          <h3>🎉 Congratulations! Your service has been approved!</h3>
          <p>Your service "<strong>${service.name}</strong>" is now live on BeautiQ platform and available for customer bookings.</p>
          <p><strong>Service ID:</strong> ${service.serviceId}</p>
          <p><strong>Availability Status:</strong> Available</p>
          <p><strong>Next Steps:</strong></p>
          <ul>
            <li>Your service is now visible to customers</li>
            <li>You can start receiving bookings</li>
            <li>You can update your availability and manage bookings through your dashboard</li>
          </ul>
        </div>
      `;
    } else if (isRejection) {
      statusMessage = `
        <div class="rejection-reason">
          <h3>❌ Service Rejection Notice</h3>
          <p>Unfortunately, your service "<strong>${service.name}</strong>" has been rejected.</p>
          <p><strong>Service ID:</strong> ${service.serviceId}</p>
          <p><strong>Availability Status:</strong> Unavailable</p>
          <h4>📋 Rejection Reason:</h4>
          <div style="background-color: white; padding: 12px; border-radius: 4px; margin: 10px 0;">
            ${reason}
          </div>
          <p><strong>What's Next:</strong></p>
          <ul>
            <li>Review the rejection reason carefully</li>
            <li>Make necessary modifications to your service</li>
            <li>Resubmit your service for approval</li>
            <li>Contact support if you need clarification</li>
          </ul>
        </div>
      `;
    }

    // Combine all content
    const emailContent = `
      <div style="margin-bottom: 20px;">
        <p>Dear <strong>${providerData.fullName}</strong>,</p>
        <p>We're writing to inform you about an important update regarding your service submission on BeautiQ platform.</p>
      </div>
      
      ${statusMessage}
      ${serviceDetails}
      ${serviceDescription}
      ${additionalDetails}
      ${providerInfo}
      
      <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <h4>📞 Need Help?</h4>
        <p>If you have any questions or need assistance, please don't hesitate to contact our support team:</p>
        <ul>
          <li>Email: ${process.env.ADMIN_EMAIL || 'support@beautiq.com'}</li>
          <li>Login to your dashboard: <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/service-provider-login" class="btn">Access Dashboard</a></li>
        </ul>
      </div>
    `;

    const htmlContent = createEmailTemplate(
      `Service ${status.charAt(0).toUpperCase() + status.slice(1)} Notification`,
      emailContent,
      actionColor
    );

    // Send email
    const mailOptions = {
      from: {
        name: 'BeautiQ Service Portal',
        address: process.env.EMAIL_USER || 'noreply@beautiq.com'
      },
      to: providerData.emailAddress,
      subject: subject,
      html: htmlContent,
      priority: isRejection ? 'high' : 'normal'
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Service ${status} notification sent successfully:`, {
      serviceId: service._id,
      serviceName: service.name,
      providerEmail: providerData.emailAddress,
      messageId: info.messageId,
      actionType: emailActionType
    });

    return true;
  } catch (error) {
    console.error(`❌ Failed to send service ${status} notification:`, error);
    throw new Error(`Failed to send service ${status} notification: ${error.message}`);
  }
};

// Customer Profile Update Approval Email
export const sendCustomerUpdateApprovalEmail = async (customer, approvedFields) => {
  try {
    const transporter = createTransporter();
    const subject = 'Your BeautiQ Profile Update has been Approved';
    
    const changesList = Object.entries(approvedFields)
      .map(([key, value]) => `<li><strong>${key.replace(/([A-Z])/g, ' $1').trim()}:</strong> ${value}</li>`)
      .join('');

    const content = `
      <p>Dear ${customer.fullName},</p>
      <p>We're pleased to inform you that your recent profile update request has been approved. The following changes have been applied to your account:</p>
      <div class="success-message" style="background-color: #e8f5e9; border-left: 4px solid #4caf50; padding: 15px; margin: 15px 0; border-radius: 4px;">
        <ul style="list-style-type: none; padding: 0;">${changesList}</ul>
      </div>
      <p>You can view your updated profile by logging into your BeautiQ account.</p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/customer-login" class="btn">Login to Your Account</a>
    `;

    const htmlContent = createEmailTemplate('Profile Update Approved', content, 'success');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: customer.emailAddress,
      subject,
      html: htmlContent
    });
    console.log(`✅ Customer update approval email sent to ${customer.emailAddress}`);
  } catch (error) {
    console.error(`❌ Failed to send customer update approval email:`, error);
  }
};

// Customer Profile Update Rejection Email
export const sendCustomerUpdateRejectionEmail = async (customer, reason) => {
  try {
    const transporter = createTransporter();
    const subject = 'Action Required: Your BeautiQ Profile Update Request';

    const content = `
      <p>Dear ${customer.fullName},</p>
      <p>We're writing to inform you that your recent profile update request could not be approved at this time. Our admin team has provided the following reason:</p>
      <div class="rejection-reason">
        <p><strong>Rejection Reason:</strong></p>
        <p><em>${reason}</em></p>
      </div>
      <p>Please review the reason provided, make any necessary corrections, and resubmit your update request through your profile settings.</p>
      <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/customer-dashboard" class="btn">Go to Your Dashboard</a>
    `;

    const htmlContent = createEmailTemplate('Profile Update Rejected', content, 'error');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: customer.emailAddress,
      subject,
      html: htmlContent
    });
    console.log(`✅ Customer update rejection email sent to ${customer.emailAddress}`);
  } catch (error) {
    console.error(`❌ Failed to send customer update rejection email:`, error);
  }
};

// Account Deletion Approval Email
export const sendAccountDeletionApprovalEmail = async (customer) => {
  try {
    const transporter = createTransporter();
    const subject = 'Your BeautiQ Account Deletion Request has been Processed';

    const content = `
      <p>Dear ${customer.fullName},</p>
      <p>As you requested, your account on the BeautiQ platform has been deactivated. This action was approved by our admin team.</p>
      <p>We're sorry to see you go. If you change your mind in the future, you will need to create a new account.</p>
      <p>Thank you for being a part of our community.</p>
    `;

    const htmlContent = createEmailTemplate('Account Deactivated', content, 'warning');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: customer.emailAddress,
      subject,
      html: htmlContent
    });
    console.log(`✅ Account deletion approval email sent to ${customer.emailAddress}`);
  } catch (error) {
    console.error(`❌ Failed to send account deletion approval email:`, error);
  }
};

// Account Deletion Rejection Email
export const sendAccountDeletionRejectionEmail = async (customer, reason) => {
  try {
    const transporter = createTransporter();
    const subject = 'Update on Your BeautiQ Account Deletion Request';

    const content = `
      <p>Dear ${customer.fullName},</p>
      <p>We're writing to inform you that your request to delete your account could not be processed at this time. Our admin team has provided the following reason:</p>
      <div class="rejection-reason">
        <p><strong>Reason:</strong></p>
        <p><em>${reason}</em></p>
      </div>
      <p>Your account remains active. If you have any questions or wish to resolve this, please contact our support team.</p>
      <a href="mailto:${process.env.ADMIN_EMAIL || 'support@beautiq.com'}" class="btn">Contact Support</a>
    `;

    const htmlContent = createEmailTemplate('Account Deletion Request Rejected', content, 'error');

    await transporter.sendMail({
      from: { name: 'BeautiQ Support', address: process.env.EMAIL_USER },
      to: customer.emailAddress,
      subject,
      html: htmlContent
    });
    console.log(`✅ Account deletion rejection email sent to ${customer.emailAddress}`);
  } catch (error) {
    console.error(`❌ Failed to send account deletion rejection email:`, error);
  }
};

// ENHANCED: Admin notification for new services with proper labeling
export const sendServiceNotificationToAdmin = async (serviceData, providerData) => {
  try {
    console.log('📧 Sending enhanced admin notification with proper request type labeling...');
    
    const transporter = createTransporter();
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    
    // Determine request type and priority
    const requestType = serviceData.requestType || serviceData.action || 'New Service';
    const isNewService = requestType === 'New Service' || serviceData.action === 'create';
    const isUpdate = requestType === 'Update Request' || serviceData.action === 'update';
    const isDelete = requestType === 'Delete Request' || serviceData.action === 'delete';
    
    let priority = 'normal';
    let actionColor = 'info';
    let urgencyLabel = '📋 Standard Request';
    
    if (isDelete) {
      priority = 'high';
      actionColor = 'error';
      urgencyLabel = '🔥 HIGH PRIORITY - Deletion Request';
    } else if (isUpdate) {
      priority = 'normal';
      actionColor = 'warning';
      urgencyLabel = '📝 Update Request';
    } else if (isNewService) {
      priority = 'normal';
      actionColor = 'success';
      urgencyLabel = '✨ New Service Submission';
    }

    const subject = `${urgencyLabel}: ${serviceData.name} - Action Required`;

    // Service details table
    const serviceDetails = `
      <table class="info-table">
        <thead>
          <tr>
            <th colspan="2">📋 Service Details Requiring Review</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Request Type</strong></td>
            <td><span class="status-badge">${requestType}</span></td>
          </tr>
          <tr>
            <td><strong>Service Name</strong></td>
            <td>${serviceData.name}</td>
          </tr>
          <tr>
            <td><strong>Service Type</strong></td>
            <td>${serviceData.type}</td>
          </tr>
          <tr>
            <td><strong>Target Audience</strong></td>
            <td>${serviceData.category}</td>
          </tr>
          <tr>
            <td><strong>Base Price</strong></td>
            <td>LKR ${serviceData.pricing?.basePrice || serviceData.serviceDetails?.basePrice || 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>Duration</strong></td>
            <td>${serviceData.duration || serviceData.serviceDetails?.duration || 'Not specified'} minutes</td>
          </tr>
          <tr>
            <td><strong>Submitted Date</strong></td>
            <td>${new Date(serviceData.submittedAt || Date.now()).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric', 
              hour: '2-digit', minute: '2-digit'
            })}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Provider details table
    const providerDetails = `
      <table class="info-table">
        <thead>
          <tr>
            <th colspan="2">👤 Service Provider Information</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Business Name</strong></td>
            <td>${providerData.businessName || 'Not provided'}</td>
          </tr>
          <tr>
            <td><strong>Provider Name</strong></td>
            <td>${providerData.fullName}</td>
          </tr>
          <tr>
            <td><strong>Email</strong></td>
            <td>${providerData.emailAddress}</td>
          </tr>
          <tr>
            <td><strong>Phone</strong></td>
            <td>${providerData.mobileNumber || 'Not provided'}</td>
          </tr>
          <tr>
            <td><strong>Business Type</strong></td>
            <td>${providerData.businessType || 'Not specified'}</td>
          </tr>
          <tr>
            <td><strong>Provider ID</strong></td>
            <td>${providerData.serviceProviderId || 'Not assigned'}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Service description
    const serviceDescription = serviceData.description ? `
      <div style="margin: 20px 0;">
        <h3>📝 Service Description</h3>
        <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #2196F3;">
          ${serviceData.description}
        </div>
      </div>
    ` : '';

    // Proposed changes table for update requests
    const changesTable = serviceData.proposedChanges && serviceData.originalData ? `
      <div style="margin: 20px 0;">
        <h3>✏️ Proposed Changes</h3>
        <table class="info-table" style="width:100%; border-collapse: collapse;">
          <thead>
            <tr style="background-color:#f0f0f0;">
              <th style="padding:8px; text-align:left;">Field</th>
              <th style="padding:8px; text-align:left;">Current Value</th>
              <th style="padding:8px; text-align:left;">Updated Value</th>
            </tr>
          </thead>
          <tbody>
            ${Object.keys(serviceData.proposedChanges).map(field => `
            <tr>
              <td style="padding:8px; vertical-align:top;"><strong>${field}</strong></td>
              <td style="padding:8px; vertical-align:top;">${serviceData.originalData[field] || 'N/A'}</td>
              <td style="padding:8px; vertical-align:top;">${serviceData.proposedChanges[field] || 'N/A'}</td>
            </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '';

    // Action buttons
    const adminActions = `
      <div style="margin: 30px 0; text-align: center; padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
        <h3>⚡ Admin Actions Required</h3>
        <p>Please review this ${requestType.toLowerCase()} and take appropriate action:</p>
        <div style="margin: 20px 0;">
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/services" 
             class="btn" 
             style="background-color: #4CAF50; margin: 0 10px;">
            ✅ Review & Approve
          </a>
          <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/services" 
             class="btn" 
             style="background-color: #f44336; margin: 0 10px;">
            ❌ Review & Reject
          </a>
        </div>
        <p><small>Service ID: ${serviceData._id}</small></p>
      </div>
    `;

    const emailContent = `
      <div style="margin-bottom: 20px;">
        <h2>🎯 ${urgencyLabel}</h2>
        <p>A ${requestType.toLowerCase()} requires your immediate attention on the BeautiQ admin dashboard.</p>
      </div>
      
      ${serviceDetails}
      ${changesTable}
      ${serviceDescription}
      ${providerDetails}
      ${adminActions}
      
      <div style="margin-top: 20px; padding: 15px; background-color: #e3f2fd; border-radius: 6px;">
        <p><strong>⏰ Priority Level:</strong> ${priority.toUpperCase()}</p>
        <p><strong>📧 Provider Contact:</strong> ${providerData.emailAddress}</p>
        <p><strong>📅 Submission Time:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;

    const htmlContent = createEmailTemplate(
      `Admin Action Required: ${requestType}`,
      emailContent,
      actionColor
    );

    const mailOptions = {
      from: {
        name: 'BeautiQ Admin Notifications',
        address: process.env.EMAIL_USER || 'admin@beautiq.com'
      },
      to: adminEmail,
      subject: subject,
      html: htmlContent,
      priority: priority
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Enhanced admin notification sent successfully:', {
      requestType,
      serviceId: serviceData._id,
      serviceName: serviceData.name,
      providerEmail: providerData.emailAddress,
      adminEmail,
      messageId: info.messageId,
      priority
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to send admin notification:', error);
    throw new Error(`Failed to send admin notification: ${error.message}`);
  }
};

// Password reset email
export const sendResetEmail = async (email, token, name) => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    console.log(`📧 Sending password reset email to ${email} with link: ${resetUrl}`);
    
    const transporter = createTransporter();
    
    const emailContent = `
      <h3>Hello ${name || 'User'},</h3>
      <p>You requested a password reset. Click the link below to reset your password:</p>
      <div style="margin: 20px 0;">
        <a href="${resetUrl}" class="btn">Reset Password</a>
      </div>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    const htmlContent = createEmailTemplate('Password Reset Request', emailContent, 'info');
    
    const info = await transporter.sendMail({
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Password Reset Request',
      html: htmlContent
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
    const transporter = createTransporter();
    
    const emailContent = `
      <h1 style="color: #1976d2; text-align: center;">Account Approved! 🎉</h1>
      <p>Dear ${fullName},</p>
      <p>Great news! Your service provider account for "${businessName}" has been approved.</p>
      <div style="text-align: center; margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
        <p style="font-size: 18px; margin-bottom: 20px;">Click the button below to access your account:</p>
        <a href="${approvalSuccessUrl}" class="btn">Access Your Account</a>
      </div>
      <p style="margin-top: 20px;">Welcome to the BeautiQ family!</p>
    `;

    const htmlContent = createEmailTemplate('Account Approved!', emailContent, 'success');

    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'Your BeautiQ Account is Approved! 🎉',
      html: htmlContent
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
    const transporter = createTransporter();
    
    const emailContent = `
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
        <a href="${supportUrl}" class="btn">Contact Support</a>
      </div>
      <p style="color: #666; font-size: 14px; text-align: center;">
        We appreciate your interest in BeautiQ and encourage you to reapply once you've addressed our feedback.
      </p>
    `;

    const htmlContent = createEmailTemplate('Registration Status Update', emailContent, 'error');

    const mailOptions = {
      from: {
        name: 'BeautiQ Support',
        address: process.env.EMAIL_USER
      },
      to: email,
      subject: 'BeautiQ Registration Update - Action Required',
      html: htmlContent
    };

    await transporter.sendMail(mailOptions);
    console.log('✅ Rejection email sent successfully to:', email);
    return true;
  } catch (error) {
    console.error('❌ Failed to send rejection email:', error);
    throw new Error(`Failed to send rejection email: ${error.message}`);
  }
};

// Registration notification to admin
export const sendRegistrationNotificationToAdmin = async (serviceProvider) => {
  try {
    console.log('📧 Preparing admin notification email for:', serviceProvider.businessName);
    
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    console.log('📧 Sending notification to admin email:', adminEmail);
    
    const adminUrl = `${process.env.FRONTEND_URL}/admin-dashboard`;
    const transporter = createTransporter();
    
    const emailContent = `
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
        <a href="${adminUrl}" class="btn">Review in Admin Dashboard</a>
      </div>
      <p style="color: #666; font-size: 14px; text-align: center;">
        Please review and approve/reject this registration in your admin dashboard.
      </p>
    `;

    const htmlContent = createEmailTemplate('New Service Provider Registration', emailContent, 'info');

    const mailOptions = {
      from: {
        name: 'BeautiQ System',
        address: process.env.EMAIL_USER
      },
      to: adminEmail,
      subject: 'New Service Provider Registration - Action Required',
      html: htmlContent
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

// ENHANCED: Test email function
export const sendTestEmail = async () => {
  try {
    const transporter = createTransporter();
    const testEmail = process.env.ADMIN_EMAIL || 'admin@beautiq.com';
    
    const emailContent = `
      <h3>🎉 Email system is working correctly!</h3>
      <p>This is a test email to verify that the BeautiQ email notification system is properly configured.</p>
      <div style="background-color: #e8f5e8; padding: 15px; border-radius: 6px; margin: 15px 0;">
        <p><strong>✅ Configuration Status:</strong> Working</p>
        <p><strong>📧 From:</strong> ${process.env.EMAIL_USER}</p>
        <p><strong>📅 Sent At:</strong> ${new Date().toLocaleString()}</p>
      </div>
    `;

    const htmlContent = createEmailTemplate('Email System Test', emailContent, 'success');
    
    const mailOptions = {
      from: {
        name: 'BeautiQ System Test',
        address: process.env.EMAIL_USER
      },
      to: testEmail,
      subject: '✅ BeautiQ Email System Test',
      html: htmlContent
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Test email sent successfully:', info.messageId);
    return true;
  } catch (error) {
    console.error('❌ Test email failed:', error);
    return false;
  }
};

// Legacy function for backward compatibility
export const sendServiceStatusNotificationToProvider = async (service, serviceProvider, status, reason = '') => {
  console.log('⚠️ Using legacy sendServiceStatusNotificationToProvider - consider using sendServiceStatusUpdate instead');
  return await sendServiceStatusUpdate(service, serviceProvider, status, reason, 'legacy');
};

// Export configuration info
export const getEmailConfig = () => ({
  user: process.env.EMAIL_USER,
  adminEmail: process.env.ADMIN_EMAIL,
  frontendUrl: process.env.FRONTEND_URL
});

console.log('📧 Email configuration:', getEmailConfig());

export default {
  sendServiceStatusUpdate,
  sendServiceNotificationToAdmin,
  sendResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
  sendRegistrationNotificationToAdmin,
  sendTestEmail,
  getEmailConfig,
  sendServiceStatusNotificationToProvider,
  sendCustomerUpdateApprovalEmail,
  sendCustomerUpdateRejectionEmail,
  sendAccountDeletionApprovalEmail,
  sendAccountDeletionRejectionEmail,
  // NEW: Service Provider specific email functions
  sendServiceProviderUpdateApprovalEmail,
  sendServiceProviderUpdateRejectionEmail,
  sendServiceProviderDeleteApprovalEmail,
  sendServiceProviderDeleteRejectionEmail,
  sendServiceProviderRequestNotificationToAdmin
};