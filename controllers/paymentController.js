// controllers/paymentController.js
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import Payment from '../models/Payment.js';
import stripe from 'stripe';

// Initialize Stripe with your secret key
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Create a transaction log function
export const logPaymentTransaction = async (booking, paymentId, status, details = {}) => {
  try {
    console.log(`📝 Logging payment transaction for booking ${booking._id}, status: ${status}`);
    
    // Make sure the booking has a paymentTransactionLog array
    if (!booking.paymentTransactionLog) {
      booking.paymentTransactionLog = [];
    }
    
    // Check if a log entry already exists for this payment
    const existingLogIndex = booking.paymentTransactionLog.findIndex(log => log.paymentId === paymentId);
    
    if (existingLogIndex > -1) {
      // Update existing log entry
      booking.paymentTransactionLog[existingLogIndex] = {
        paymentId,
        status,
        timestamp: new Date(),
        details: {
          ...booking.paymentTransactionLog[existingLogIndex].details,
          ...details
        }
      };
      console.log('Updated existing payment transaction log entry');
    } else {
      // Add new log entry
      booking.paymentTransactionLog.push({
        paymentId,
        status,
        timestamp: new Date(),
        details
      });
      console.log('Added new payment transaction log entry');
    }
    
    // Save the updated booking
    await booking.save();
    
    console.log(`✅ Payment transaction logged successfully`);
    return true;
  } catch (error) {
    console.error('❌ Error logging payment transaction:', error);
    return false;
  }
};

// Create a payment intent for Stripe
export const createPaymentIntent = async (req, res) => {
  try {
    const {
      serviceId,
      serviceName,
      customerId,
      providerId,
      date,
      slot,
      amount,
      currency = 'usd',
      serviceLocation,
      address
    } = req.body;

    // Validate required fields
    if (!serviceId || !customerId || !providerId || !date || !slot || !amount) {
      return res.status(400).json({
        success: false,
        message: 'Missing required booking information'
      });
    }
    
    // Check if serviceLocation is provided when using home service
    if (serviceLocation === 'home' && !address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required for home services'
      });
    }

    // Get service details to retrieve duration
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Compute start and end times for the booking
    const startDateTime = new Date(slot);
    const bookingDate = new Date(date);
    const dateString = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const timeString = startDateTime.toTimeString().substring(0,5);
    
    // Use service.duration (minutes) to compute end
    const endDateTime = new Date(startDateTime.getTime() + (service.duration || 0) * 60000);
    
    // Check if there's an existing booking for this customer, service, date and time
    // This prevents duplicate bookings being created during payment flow
    let booking = await Booking.findOne({
      customerId,
      serviceId,
      bookingDate: {
        $gte: new Date(`${dateString}T00:00:00.000Z`),
        $lt: new Date(`${dateString}T23:59:59.999Z`)
      },
      bookingTime: timeString,
      // Include pending bookings too, as we want to reuse them
      status: { $in: ['pending', 'confirmed'] }
    });
    
    if (booking) {
      console.log(`Found existing booking (${booking._id}) for customer ${customerId}, updating it`);
      // Update the existing booking with the latest details
      booking.totalPrice = amount;
      booking.location = serviceLocation || 'salon';
      booking.address = address || null;
      booking.updatedAt = new Date();
    } else {
      // Create a new booking record (pending payment)
      booking = new Booking({
        serviceId,
        serviceProviderId: providerId,
        customerId,
        serviceType: service.type, // Use service type from fetched service
        serviceName,
        bookingDate: bookingDate,
        bookingTime: timeString,
        start: startDateTime,
        end: endDateTime,
        duration: service.duration, // Add service duration
        totalPrice: amount,
        status: 'pending',
        paymentStatus: 'pending',
        location: serviceLocation || 'salon',
        address: address || null
      });
    }

    await booking.save();

    // Create a payment record
    const payment = new Payment({
      bookingId: booking._id,
      customerId,
      serviceId,
      serviceProviderId: providerId,
      amount,
      currency,
      paymentMethod: 'stripe',
      status: 'pending',
      transactionDetails: {
        serviceLocation,
        address: address || null
      }
    });
    
    await payment.save();
    console.log(`Created new payment record: ${payment._id} for booking: ${booking._id}`);
    
    // Create a payment intent with Stripe
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount * 100), // Stripe requires amount in cents
      currency,
      metadata: {
        paymentId: payment._id.toString(),
        bookingId: booking._id.toString(),
        serviceId,
        customerId,
        providerId
      }
    });
    
    // Update the payment record with the payment intent ID
    payment.paymentId = paymentIntent.id;
    await payment.save();

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      bookingId: booking._id,
      paymentId: payment._id
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment intent',
      error: error.message
    });
  }
};

// Import the notification controller
import { createNotification } from './notificationController.js';

// Confirm successful payment
export const confirmPayment = async (req, res) => {
  try {
    console.log("Payment confirmation request received:", req.body);
    const { paymentId, bookingId } = req.body;

    if (!paymentId || !bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID and Booking ID are required'
      });
    }

    let paymentIntent;
    
    try {
      // Handle test payment IDs with mock data
      if (paymentId.startsWith('pi_') && paymentId.length < 20) {
        console.log("Using mock payment intent for test payment ID");
        paymentIntent = { status: 'succeeded' };
      } else {
        // Verify the payment with Stripe
        paymentIntent = await stripeClient.paymentIntents.retrieve(paymentId);
      }
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({
          success: false,
          message: 'Payment has not been completed'
        });
      }
    } catch (stripeError) {
      console.error("Stripe error:", stripeError);
      
      // For development purposes, allow test payments through
      if (process.env.NODE_ENV !== 'production') {
        console.log("Development mode: Proceeding with payment confirmation despite Stripe error");
        paymentIntent = { status: 'succeeded' };
      } else {
        throw stripeError;
      }
    }

    // Update the booking status
    console.log("Looking for booking with ID:", bookingId);
    let booking;
    
    try {
      booking = await Booking.findById(bookingId);
    } catch (err) {
      console.error("Error finding booking by ID:", err);
      if (err.name === 'CastError') {
        console.log("Invalid booking ID format. This might be a mock booking ID in development mode.");
      }
    }
    
    if (!booking) {
      console.log("Booking not found, checking if this is a mock booking in development environment");
      
      // Check if we're in development mode and this might be a mock booking
      if (process.env.NODE_ENV !== 'production' && (bookingId.startsWith('mock_') || req.body.serviceId)) {
        console.log("Creating a new booking record for mock payment");
        
        // Extract necessary info from the request body
        const { 
          serviceId,
          serviceName,
          customerId,
          providerId,
          date,
          slot,
          amount,
          serviceLocation,
          address
        } = req.body;
        
        // Create a new booking if possible
        if (serviceId && customerId && providerId) {
          const service = await Service.findById(serviceId);
          const provider = await User.findById(providerId);
          const customer = await User.findById(customerId);
          
          if (!service) {
            return res.status(404).json({
              success: false,
              message: 'Service not found for mock booking creation'
            });
          }
          
          const bookingDate = date ? new Date(date) : new Date();
          const dateString = bookingDate.toISOString().split('T')[0]; // YYYY-MM-DD
          
          // Parse slot time correctly - slot is in ISO format
          const slotTime = slot ? new Date(slot) : new Date();
          const timeString = slotTime.toTimeString().substring(0,5);
          
          // Create proper start time by combining booking date with slot time
          const startTime = new Date(bookingDate);
          startTime.setHours(slotTime.getHours(), slotTime.getMinutes(), 0, 0);
          
          // Calculate end time based on duration
          const endTime = new Date(startTime.getTime() + service.duration * 60000);

          // Check for existing booking first
          booking = await Booking.findOne({
            customerId,
            serviceId,
            bookingDate: {
              $gte: new Date(`${dateString}T00:00:00.000Z`),
              $lt: new Date(`${dateString}T23:59:59.999Z`)
            },
            bookingTime: timeString
          });
          
          if (booking) {
            console.log(`Found existing booking (${booking._id}) in mock payment flow, updating it`);
            // Update the existing booking with confirmed status
            booking.status = 'confirmed';
            booking.paymentStatus = 'paid';
            booking.paymentId = paymentId;
            booking.totalPrice = amount || booking.totalPrice;
            booking.location = serviceLocation || booking.location;
            booking.address = address || booking.address;
            booking.updatedAt = new Date();
            
            // Add payment transaction log entry
            if (!booking.paymentTransactionLog) {
              booking.paymentTransactionLog = [];
            }
            
            booking.paymentTransactionLog.push({
              paymentId,
              status: 'paid',
              timestamp: new Date(),
              details: {
                amount: booking.totalPrice,
                paymentMethod: 'stripe',
                paymentSuccess: true
              }
            });
          } else {
            // Create a new booking record only if one doesn't exist
            booking = new Booking({
              serviceId,
              serviceProviderId: providerId,
              customerId,
              serviceType: service?.type || 'Service',
              serviceName: serviceName || service?.name || 'Service',
              providerName: provider ? `${provider.firstName} ${provider.lastName}` : null,
              providerEmail: provider ? provider.emailAddress : null,
              customerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
              customerEmail: customer ? customer.emailAddress : null,
              bookingDate: bookingDate,
              bookingTime: timeString,
              duration: service.duration, // Use service duration
              start: startTime,
              end: endTime,
              totalPrice: amount || 0,
              status: 'confirmed',
              paymentStatus: 'paid',
              paymentId,
              location: serviceLocation || 'salon',
              address: address || null,
              updatedAt: new Date(),
              createdAt: new Date(),
              // Add payment transaction log
              paymentTransactionLog: [{
                paymentId,
                status: 'paid',
                timestamp: new Date(),
                details: {
                  amount: amount || 0,
                  paymentMethod: 'stripe',
                  paymentSuccess: true
                }
              }]
            });
          }
          
          try {
            await booking.save();
            console.log("Saved booking in mock payment flow:", booking._id);
            
            // Create or update payment record for mock payment
            let payment = await Payment.findOne({ bookingId: booking._id });
            
            if (payment) {
              payment.status = 'completed';
              payment.paymentId = paymentId;
              payment.paymentDate = new Date();
              payment.amount = booking.totalPrice;
              payment.transactionDetails = {
                ...payment.transactionDetails,
                mockPayment: true,
                completedAt: new Date()
              };
            } else {
              // Create new payment record
              payment = new Payment({
                bookingId: booking._id,
                customerId: booking.customerId,
                serviceId: booking.serviceId,
                serviceProviderId: booking.serviceProviderId,
                amount: booking.totalPrice,
                paymentMethod: 'stripe',
                paymentId: paymentId,
                status: 'completed',
                paymentDate: new Date(),
                // Include provider and customer information for easier access
                providerName: provider ? `${provider.firstName} ${provider.lastName}` : 'Unknown Provider',
                providerEmail: provider ? provider.emailAddress : '',
                customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer',
                customerEmail: customer ? customer.emailAddress : '',
                transactionDetails: {
                  mockPayment: true,
                  completedAt: new Date(),
                  serviceName: service?.name || serviceName || 'Service'
                }
              });
            }
            
            await payment.save();
            console.log("Mock payment record saved:", payment._id);
            
          } catch (saveError) {
            console.error("Error saving booking in mock payment flow:", saveError);
            return res.status(500).json({
              success: false,
              message: 'Failed to save booking in mock payment flow',
              error: saveError.message
            });
          }
        } else {
          return res.status(404).json({
            success: false,
            message: 'Booking not found and insufficient data to create one'
          });
        }
      } else {
        return res.status(404).json({
          success: false,
          message: 'Booking not found'
        });
      }
    } else {
      // Update existing booking
      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.paymentId = paymentId;
      booking.updatedAt = new Date();
      
      // Log the transaction
      await logPaymentTransaction(booking, paymentId, 'paid', {
        amount: booking.totalPrice,
        paymentMethod: 'stripe',
        paymentSuccess: true,
        timestamp: new Date()
      });
      
      await booking.save();
      console.log("Updated existing booking:", booking._id);
      
      // Find or create a payment record
      let payment = await Payment.findOne({ bookingId: booking._id });
      
      if (payment) {
        // Update existing payment record
        payment.status = 'completed';
        payment.paymentId = paymentId;
        payment.paymentDate = new Date();
        payment.transactionDetails = {
          ...payment.transactionDetails,
          paymentSuccess: true,
          completedAt: new Date(),
          stripePaymentId: paymentId
        };
      } else {
        // Create new payment record if one doesn't exist
        payment = new Payment({
          bookingId: booking._id,
          customerId: booking.customerId,
          serviceId: booking.serviceId,
          serviceProviderId: booking.serviceProviderId,
          amount: booking.totalPrice,
          paymentMethod: 'stripe',
          paymentId: paymentId,
          status: 'completed',
          paymentDate: new Date(),
          transactionDetails: {
            paymentSuccess: true,
            completedAt: new Date(),
            stripePaymentId: paymentId
          }
        });
      }
      
      await payment.save();
      console.log("Payment record saved:", payment._id);
    }

    // Get customer and service provider details
    const customer = await User.findById(booking.customerId);
    const serviceProvider = await User.findById(booking.serviceProviderId);
    const service = await Service.findById(booking.serviceId);

      // Create notification for the service provider
      if (serviceProvider) {
        await createNotification({
          sender: booking.customerId,
          receiver: booking.serviceProviderId,
          message: `New appointment booked: ${service?.name || booking.serviceName} on ${new Date(booking.bookingDate).toLocaleDateString()} at ${booking.bookingTime}`,
          type: 'booking_confirmation',
          data: {
            bookingId: booking._id,
            serviceId: booking.serviceId,
            serviceName: booking.serviceName,
            bookingDate: booking.bookingDate,
            bookingTime: booking.bookingTime,
            location: booking.location,
            customerId: booking.customerId,
            customerEmail: customer?.emailAddress,
            customerName: customer?.fullName || 'Customer',
            customerIdNumber: customer?.customerId || 'Unknown ID',
            amount: booking.totalPrice
          }
        });
      }    // Get admin users to notify them as well
    const adminUsers = await User.find({ role: 'admin' });
    
    // Create notifications for all admin users
    for (const admin of adminUsers) {
      await createNotification({
        sender: booking.customerId,
        receiver: admin._id,
        message: `New booking confirmed: ${service?.name || booking.serviceName} with ${serviceProvider?.firstName || 'Provider'} ${serviceProvider?.lastName || ''}`,
        type: 'admin_booking_alert',
        data: {
          bookingId: booking._id,
          serviceId: booking.serviceId,
          providerId: booking.serviceProviderId,
          customerId: booking.customerId,
          amount: booking.totalPrice
        }
      });
    }

    res.status(200).json({
      success: true,
      booking
    });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message
    });
  }
};

// Get payment details for a specific booking or payment
export const getPaymentDetails = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user.userId;
    
    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: 'Booking ID is required'
      });
    }
    
    // Try to find the payment record first
    let payment = await Payment.findOne({ bookingId });
    
    // If no payment record, check if the bookingId is actually a payment ID
    if (!payment) {
      try {
        payment = await Payment.findById(bookingId);
      } catch (e) {
        // Not a valid ObjectId, continue with null payment
      }
    }
    
    // If still no payment found, look for the booking
    const booking = payment ? await Booking.findById(payment.bookingId) : await Booking.findById(bookingId);
    
    if (!booking && !payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment or booking not found'
      });
    }
    
    // For access control, use booking if available, otherwise use payment
    const recordToCheck = booking || payment;
    
    // Check if the user is authorized to access this payment information
    if (
      recordToCheck.customerId.toString() !== userId && 
      recordToCheck.serviceProviderId.toString() !== userId && 
      req.user.role !== 'admin'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to access this payment information'
      });
    }
    
    // Get additional details
    const service = await Service.findById(recordToCheck.serviceId);
    const provider = await User.findById(recordToCheck.serviceProviderId);
    const customer = await User.findById(recordToCheck.customerId);
    
    // Format payment details - prefer data from payment record when available
    const paymentDetails = {
      paymentId: payment ? payment._id : null,
      stripePaymentId: payment ? payment.paymentId : booking.paymentId,
      bookingId: booking ? booking._id : payment.bookingId,
      amount: payment ? payment.amount : booking.totalPrice,
      currency: payment ? payment.currency : 'usd',
      status: payment ? payment.status : booking.paymentStatus,
      createdAt: payment ? payment.createdAt : booking.createdAt,
      updatedAt: payment ? payment.updatedAt : booking.updatedAt,
      paymentDate: payment ? payment.paymentDate : booking.updatedAt,
      paymentMethod: payment ? payment.paymentMethod : 'stripe',
      service: {
        id: recordToCheck.serviceId,
        name: service ? service.name : (booking ? booking.serviceName : 'Unknown Service'),
        type: service ? service.type : (booking ? booking.serviceType : 'Unknown'),
        price: payment ? payment.amount : booking.totalPrice
      },
      provider: {
        id: recordToCheck.serviceProviderId,
        name: payment?.providerName || (provider ? `${provider.firstName} ${provider.lastName}` : booking?.providerName || 'Unknown Provider'),
        email: payment?.providerEmail || (provider ? provider.emailAddress : booking?.providerEmail || '')
      },
      customer: {
        id: recordToCheck.customerId,
        name: payment?.customerName || (customer ? `${customer.firstName} ${customer.lastName}` : booking?.customerName || 'Unknown Customer'),
        email: payment?.customerEmail || (customer ? customer.emailAddress : booking?.customerEmail || '')
      },
      bookingDetails: booking ? {
        date: booking.bookingDate,
        time: booking.bookingTime,
        location: booking.location,
        status: booking.status,
        address: booking.address
      } : null,
      transactionDetails: payment ? payment.transactionDetails : {},
      // Include booking payment log for backward compatibility
      paymentTransactions: booking ? booking.paymentTransactionLog || [] : []
    };
    
    res.status(200).json({
      success: true,
      payment: paymentDetails
    });
  } catch (error) {
    console.error('Get payment details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: error.message
    });
  }
};

// Get payment history for the current user
export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.userId; // Using userId from the token
    
    // Check if user exists
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get payments directly from the Payment model
    const payments = await Payment.find({
      customerId: userId
    }).sort({ paymentDate: -1 });
    
    // Get additional details for each payment
    const paymentsWithDetails = await Promise.all(
      payments.map(async (payment) => {
        const booking = await Booking.findById(payment.bookingId);
        const service = await Service.findById(payment.serviceId);
        const provider = await User.findById(payment.serviceProviderId);
        
        // Format the payment details with rich information
        return {
          paymentId: payment._id,
          stripePaymentId: payment.paymentId,
          bookingId: payment.bookingId,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          createdAt: payment.createdAt,
          updatedAt: payment.updatedAt,
          paymentDate: payment.paymentDate,
          paymentMethod: payment.paymentMethod,
          service: {
            id: payment.serviceId,
            name: service ? service.name : booking?.serviceName || 'Unknown Service',
            type: service ? service.type : booking?.serviceType || 'Unknown',
            price: payment.amount
          },
          provider: {
            id: payment.serviceProviderId,
            name: provider ? `${provider.firstName} ${provider.lastName}` : 'Unknown Provider'
          },
          bookingDetails: booking ? {
            date: booking.bookingDate,
            time: booking.bookingTime,
            location: booking.location,
            status: booking.status
          } : null,
          transactionDetails: payment.transactionDetails || {}
        };
      })
    );
    
    res.status(200).json({
      success: true,
      count: paymentsWithDetails.length,
      payments: paymentsWithDetails
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment history',
      error: error.message
    });
  }
};

// Webhook handler for Stripe events
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Verify the webhook signature
    event = stripeClient.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle specific events
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      // Update booking status
      if (paymentIntent.metadata && paymentIntent.metadata.bookingId) {
        try {
          const booking = await Booking.findById(paymentIntent.metadata.bookingId);
          if (booking) {
            booking.status = 'confirmed';
            booking.paymentStatus = 'paid';
            booking.paymentId = paymentIntent.id;
            await booking.save();
            
            // Create a payment record
            const paymentData = {
              paymentId: paymentIntent.id,
              bookingId: booking._id,
              customerId: booking.customerId,
              serviceProviderId: booking.serviceProviderId,
              serviceId: booking.serviceId,
              amount: paymentIntent.amount / 100, // Convert from cents
              currency: paymentIntent.currency,
              status: 'paid',
              paymentMethod: paymentIntent.payment_method_types ? paymentIntent.payment_method_types[0] : 'stripe',
              paymentDate: new Date(),
              transactionDetails: {
                receiptUrl: paymentIntent.charges?.data?.[0]?.receipt_url,
                paymentIntentId: paymentIntent.id,
                chargeId: paymentIntent.charges?.data?.[0]?.id,
                paymentMethodId: paymentIntent.payment_method,
                description: `Payment for booking ${booking._id}`
              }
            };
            
            // Check if payment record already exists
            const existingPayment = await Payment.findOne({ paymentId: paymentIntent.id });
            if (!existingPayment) {
              await Payment.create(paymentData);
            }
            
            // Get customer and service provider details
            const customer = await User.findById(booking.customerId);
            const serviceProvider = await User.findById(booking.serviceProviderId);
            
            // Create notification for the service provider through webhook
            if (serviceProvider) {
              await createNotification({
                sender: booking.customerId,
                receiver: booking.serviceProviderId,
                message: `New appointment booked for ${booking.serviceName} on ${new Date(booking.bookingDate).toLocaleDateString()}`,
                type: 'booking_confirmation',
                data: {
                  bookingId: booking._id,
                  serviceId: booking.serviceId,
                  serviceName: booking.serviceName,
                  bookingDate: booking.bookingDate,
                  bookingTime: booking.bookingTime,
                  customerId: booking.customerId,
                  customerEmail: customer?.emailAddress
                }
              });
            }

            // Notify admin users
            const adminUsers = await User.find({ role: 'admin' });
            for (const admin of adminUsers) {
              await createNotification({
                sender: booking.customerId,
                receiver: admin._id,
                message: `New booking confirmed: ${booking.serviceName}`,
                type: 'admin_booking_alert',
                data: {
                  bookingId: booking._id
                }
              });
            }
          }
        } catch (error) {
          console.error('Error updating booking from webhook:', error);
        }
      }
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      // Update booking status for failed payments
      if (failedPayment.metadata && failedPayment.metadata.bookingId) {
        try {
          const booking = await Booking.findById(failedPayment.metadata.bookingId);
          if (booking) {
            booking.paymentStatus = 'failed';
            await booking.save();
            
            // Create a payment record for the failed payment
            const paymentData = {
              paymentId: failedPayment.id,
              bookingId: booking._id,
              customerId: booking.customerId,
              serviceProviderId: booking.serviceProviderId,
              serviceId: booking.serviceId,
              amount: failedPayment.amount / 100, // Convert from cents
              currency: failedPayment.currency,
              status: 'failed',
              paymentMethod: failedPayment.payment_method_types ? failedPayment.payment_method_types[0] : 'stripe',
              paymentDate: new Date(),
              transactionDetails: {
                failureMessage: failedPayment.last_payment_error?.message || 'Payment processing failed',
                paymentIntentId: failedPayment.id,
                paymentMethodId: failedPayment.payment_method,
                description: `Failed payment for booking ${booking._id}`
              }
            };
            
            // Check if payment record already exists
            const existingPayment = await Payment.findOne({ paymentId: failedPayment.id });
            if (!existingPayment) {
              await Payment.create(paymentData);
            }
            
            // Notify customer about payment failure
            await createNotification({
              sender: 'system',
              receiver: booking.customerId,
              message: `Payment for ${booking.serviceName} has failed. Please try again.`,
              type: 'payment_failed',
              data: {
                bookingId: booking._id
              }
            });
          }
        } catch (error) {
          console.error('Error updating failed payment booking:', error);
        }
      }
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a response to acknowledge receipt of the event
  res.json({ received: true });
};
