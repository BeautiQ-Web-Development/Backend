// controllers/paymentController.js
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import Service from '../models/Service.js';
import Payment from '../models/Payment.js';
import stripe from 'stripe';
import mongoose from 'mongoose';

const ACTIVE_BOOKING_STATUSES = ['pending', 'booked', 'confirmed', 'completed'];

// Initialize Stripe with your secret key
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

const normalizeDateInput = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  if (typeof value === 'string') {
    if (value.includes('T')) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
    }
    return value.split(' ')[0];
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().split('T')[0];
};

const parseTimeTuple = (timeString) => {
  if (!timeString || typeof timeString !== 'string') return null;
  const trimmed = timeString.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const isoDate = new Date(trimmed);
    if (!Number.isNaN(isoDate.getTime())) {
      return [isoDate.getUTCHours(), isoDate.getUTCMinutes(), isoDate];
    }
  }
  const timeMatch = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(?:\s*(AM|PM))?$/i);
  if (!timeMatch) return null;
  let hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const period = timeMatch[3]?.toUpperCase();
  if (period) {
    if (period === 'PM' && hours < 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
  }
  return [hours, minutes, null];
};

// Helper function to store payment intent reservation data (temporary, not in DB)
const paymentIntentReservations = new Map();

// Helper function to clean old reservations (cleanup every 30 minutes)
const cleanupOldReservations = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes
  for (const [key, reservation] of paymentIntentReservations.entries()) {
    if (now - reservation.timestamp > maxAge) {
      paymentIntentReservations.delete(key);
    }
  }
};

// Clean up old reservations every 5 minutes
setInterval(cleanupOldReservations, 5 * 60 * 1000);

// Create a payment intent for Stripe
// IMPORTANT: This ONLY creates a Stripe payment intent and validates the booking slot.
// It does NOT create Booking or Payment records in the database yet.
// Those records are created in confirmPayment AFTER successful payment.
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
    
    if (serviceLocation === 'home' && !address) {
      return res.status(400).json({
        success: false,
        message: 'Address is required for home services'
      });
    }

    // Get service details
    const service = await Service.findById(serviceId);
    if (!service) {
      return res.status(404).json({
        success: false,
        message: 'Service not found'
      });
    }

    // Compute start and end times
    const normalizedDateString = normalizeDateInput(date);
    if (!normalizedDateString) {
      return res.status(400).json({
        success: false,
        message: 'Invalid booking date'
      });
    }

    let startDateTime;
    let timeString;
    
    if (slot && typeof slot === 'string' && slot.includes('T')) {
      // ISO format: parse and extract local time components
      startDateTime = new Date(slot);
      if (Number.isNaN(startDateTime.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid time slot'
        });
      }
      // Extract UTC hours and minutes from the ISO string
      const hours = startDateTime.getUTCHours();
      const minutes = startDateTime.getUTCMinutes();
      timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } else {
      // Plain time format: HH:MM
      const parsedSlot = parseTimeTuple(slot);
      if (!parsedSlot) {
        return res.status(400).json({
          success: false,
          message: 'Invalid time slot format'
        });
      }
      const [hours, minutes] = parsedSlot;
      timeString = `${(hours ?? 0).toString().padStart(2, '0')}:${(minutes ?? 0).toString().padStart(2, '0')}`;
      startDateTime = new Date(`${normalizedDateString}T${timeString}:00.000Z`);
    }

    const duration = service.duration || 60;
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    
    // Check for conflicting bookings (only booked/confirmed/completed, not pending)
    const dayStart = new Date(`${normalizedDateString}T00:00:00.000Z`);
    const dayEnd = new Date(`${normalizedDateString}T23:59:59.999Z`);

    const conflictingBookings = await Booking.find({
      serviceId: new mongoose.Types.ObjectId(serviceId),
      status: { $in: ACTIVE_BOOKING_STATUSES },
      start: { $lt: dayEnd },
      end: { $gt: dayStart }
    });

    const hasConflict = conflictingBookings.some((existing) => {
      const existingStart = new Date(existing.start);
      const existingEnd = new Date(existing.end);
      
      if (Number.isNaN(existingStart.getTime()) || Number.isNaN(existingEnd.getTime())) {
        return false;
      }

      return startDateTime < existingEnd && endDateTime > existingStart;
    });

    if (hasConflict) {
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked. Please select another time.',
        isDoubleBooking: true
      });
    }
    
    // Create a unique reservation key for this booking attempt
    const reservationKey = `${customerId}_${serviceId}_${normalizedDateString}_${timeString}`;
    
    // Store reservation data in memory (not in DB) for later use in confirmPayment
    const reservationId = 'res_' + Math.random().toString(36).substring(2, 15);
    paymentIntentReservations.set(reservationId, {
      reservationKey,
      customerId,
      serviceId,
      providerId,
      dateString: normalizedDateString,
      timeString,
      startDateTime,
      endDateTime,
      duration,
      amount,
      currency,
      serviceLocation,
      address,
      serviceName,
      service,
      timestamp: Date.now()
    });
    
    console.log(`📝 Reservation created: ${reservationId} for ${reservationKey}`);
    
    // Create Stripe payment intent
    let paymentIntent;
    
    try {
      paymentIntent = await stripeClient.paymentIntents.create({
        amount: Math.round(amount * 100),
        currency,
        metadata: {
          reservationId,
          serviceId,
          customerId,
          providerId,
          dateString: normalizedDateString,
          timeString
        }
      });
      console.log(`✨ Created new Stripe payment intent: ${paymentIntent.id}`);
    } catch (stripeError) {
      // If Stripe creation fails, create a mock intent for development
      if (process.env.NODE_ENV !== 'production') {
        console.log('🧪 Development mode: Creating mock Stripe payment intent');
        paymentIntent = {
          id: 'mock_pi_' + Math.random().toString(36).substring(2, 15),
          client_secret: 'mock_secret_' + Math.random().toString(36).substring(2, 15),
          status: 'requires_payment_method'
        };
      } else {
        throw stripeError;
      }
    }

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      reservationId // Return reservation ID so confirmPayment can retrieve the data
    });
  } catch (error) {
    console.error('❌ Payment intent creation error:', error);
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
// CRITICAL: This is where the ONLY booking and payment records are created
export const confirmPayment = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    
    console.log("💳 Payment confirmation request received:", req.body);
    const { paymentIntentId, reservationId } = req.body;

    if (!paymentIntentId || !reservationId) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Payment Intent ID and Reservation ID are required'
      });
    }

    // Retrieve the reservation data from memory
    const reservation = paymentIntentReservations.get(reservationId);
    if (!reservation) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Reservation not found or has expired. Please try again.'
      });
    }

    // Verify payment with Stripe
    let paymentIntent;
    
    try {
      if (paymentIntentId.startsWith('mock_')) {
        console.log("🧪 Using mock payment intent for test");
        paymentIntent = { status: 'succeeded' };
      } else {
        paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
      }
      
      if (paymentIntent.status !== 'succeeded') {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Payment has not been completed'
        });
      }
    } catch (stripeError) {
      console.error("❌ Stripe error:", stripeError);
      
      if (process.env.NODE_ENV !== 'production') {
        console.log("🧪 Development mode: Proceeding despite Stripe error");
        paymentIntent = { status: 'succeeded' };
      } else {
        await session.abortTransaction();
        throw stripeError;
      }
    }

    // Check for conflicting bookings AGAIN right before creating
    // This ensures no race condition where another booking was confirmed/booked
    const conflictingBookings = await Booking.find({
      serviceId: new mongoose.Types.ObjectId(reservation.serviceId),
      status: { $in: ACTIVE_BOOKING_STATUSES },
      start: { $lt: reservation.endDateTime },
      end: { $gt: reservation.startDateTime }
    }).session(session);

    if (conflictingBookings.length > 0) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'This time slot has already been booked by another customer. Please select another time.',
        isDoubleBooking: true
      });
    }

    // NOW create the ONLY booking record (with 'confirmed' status after successful payment)
    const bookingDate = new Date(`${reservation.dateString}T00:00:00.000Z`);
    
    const booking = new Booking({
      serviceId: reservation.serviceId,
      serviceProviderId: reservation.providerId,
      customerId: reservation.customerId,
      serviceType: reservation.service.type,
      serviceName: reservation.serviceName,
      bookingDate,
      bookingTime: reservation.timeString,
      start: reservation.startDateTime,
      end: reservation.endDateTime,
      duration: reservation.duration,
      totalPrice: reservation.amount,
      status: 'confirmed', // Status is 'confirmed' after successful payment
      paymentStatus: 'paid', // FINAL status - paid
      location: reservation.serviceLocation || 'salon',
      address: reservation.address || null,
      paymentId: paymentIntentId
    });
    
    await booking.save({ session });
    console.log("✅ Booking created (final):", booking._id);

    // NOW create the ONLY payment record (with 'paid' status)
    const payment = new Payment({
      bookingId: booking._id,
      customerId: reservation.customerId,
      serviceId: reservation.serviceId,
      serviceProviderId: reservation.providerId,
      amount: reservation.amount,
      currency: reservation.currency,
      paymentMethod: 'stripe',
      status: 'paid', // FINAL status - paid
      paymentId: paymentIntentId,
      paymentDate: new Date(),
      transactionDetails: {
        serviceLocation: reservation.serviceLocation,
        address: reservation.address || null,
        paymentSuccess: true,
        completedAt: new Date(),
        stripePaymentId: paymentIntentId
      }
    });
    
    await payment.save({ session });
    console.log("✅ Payment created (final):", payment._id);

    // Delete the reservation to free up memory
    paymentIntentReservations.delete(reservationId);
    console.log(`🧹 Reservation cleaned up: ${reservationId}`);

    // Commit transaction
    await session.commitTransaction();

    // Get related user data for notifications (outside transaction)
    const customer = await User.findById(booking.customerId);
    const serviceProvider = await User.findById(booking.serviceProviderId);
    const service = await Service.findById(booking.serviceId);

    // Create notification for service provider
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
    }
    
    // Notify admin users
    const adminUsers = await User.find({ role: 'admin' });
    for (const admin of adminUsers) {
      await createNotification({
        sender: booking.customerId,
        receiver: admin._id,
        message: `New booking scheduled: ${service?.name || booking.serviceName} with ${serviceProvider?.firstName || 'Provider'} ${serviceProvider?.lastName || ''}`,
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
      booking,
      payment
    });
  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Payment confirmation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to confirm payment',
      error: error.message
    });
  } finally {
    session.endSession();
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
    
    if (!payment) {
      try {
        payment = await Payment.findById(bookingId);
      } catch (e) {
        // Not a valid ObjectId
      }
    }
    
    const booking = payment ? await Booking.findById(payment.bookingId) : await Booking.findById(bookingId);
    
    if (!booking && !payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment or booking not found'
      });
    }
    
    const recordToCheck = booking || payment;
    
    // Authorization check
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
      transactionDetails: payment ? payment.transactionDetails : {}
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
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Only get completed and paid payments
    const payments = await Payment.find({
      customerId: userId,
      status: { $in: ['completed', 'paid'] } // Show both completed and paid payments
    }).sort({ paymentDate: -1 });
    
    const paymentsWithDetails = await Promise.all(
      payments.map(async (payment) => {
        const booking = await Booking.findById(payment.bookingId);
        const service = await Service.findById(payment.serviceId);
        const provider = await User.findById(payment.serviceProviderId);
        
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
    event = stripeClient.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  switch (event.type) {
    case 'payment_intent.succeeded':
      // NOTE: With the new flow, payment confirmation is handled entirely by the confirmPayment endpoint
      // Webhooks are only for recovery scenarios where confirmPayment couldn't be called
      const paymentIntent = event.data.object;
      console.log('Stripe webhook: payment_intent.succeeded', paymentIntent.id);
      // Payment confirmation is now handled by the confirmPayment endpoint
      // This webhook is a fallback for error recovery scenarios
      break;

    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('Stripe webhook: payment_intent.payment_failed', failedPayment.id);
      // Note: With new flow, failed payments don't create booking/payment records
      // Only successfully confirmed payments create records via confirmPayment endpoint
      break;

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};