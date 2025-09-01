// routes/payment.Routes.js
import express from 'express';
import { 
  createPaymentIntent, 
  confirmPayment, 
  getPaymentHistory, 
  getPaymentDetails,
  handleStripeWebhook 
} from '../controllers/paymentController.js';
import { protect as authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

// Create a payment intent for Stripe
router.post('/create-payment-intent', authMiddleware, createPaymentIntent);

// Confirm successful payment
router.post('/confirm', authMiddleware, confirmPayment);

// Get payment history for current user
router.get('/history', authMiddleware, getPaymentHistory);

// Get details for a specific payment
router.get('/details/:bookingId', authMiddleware, getPaymentDetails);

// Stripe webhook endpoint (no auth required, Stripe authenticates via signature)
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

export default router;
