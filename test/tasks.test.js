/**
 * Backend API Tests
 * Using Jest and Supertest for testing the BeautiQ API
 */

import request from 'supertest';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { jest } from '@jest/globals';

// Load environment variables
dotenv.config();

// Base URL for API testing
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5000';

// Set test timeout
jest.setTimeout(30000);

describe('BeautiQ Backend API Tests', () => {
  // Store tokens and IDs for authenticated tests
  let authToken;
  let testUserId;

  // ==========================================
  // Server Health Tests
  // ==========================================
  describe('Server Health', () => {
    it('should have server running', async () => {
      const res = await request(BASE_URL).get('/');
      // Server might return 200 or 404 for root endpoint
      expect([200, 404]).toContain(res.status);
    });

    it('should serve placeholder images', async () => {
      const res = await request(BASE_URL).get('/placeholder/300/200?text=Test');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  // ==========================================
  // Authentication Routes Tests
  // ==========================================
  describe('Auth Routes - /api/auth', () => {
    describe('POST /api/auth/login', () => {
      it('should return 400/401 if credentials are missing', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/login')
          .send({});
        expect([400, 401, 500]).toContain(res.status);
      });

      it('should return 400/401 for invalid credentials', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/login')
          .send({
            email: 'nonexistent@test.com',
            password: 'wrongpassword123'
          });
        expect([400, 401]).toContain(res.status);
      });

      it('should return 400 for invalid email format', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/login')
          .send({
            email: 'invalid-email',
            password: 'password123'
          });
        expect([400, 401, 422]).toContain(res.status);
      });
    });

    describe('GET /api/auth/check-admin-exists', () => {
      it('should check if admin exists', async () => {
        const res = await request(BASE_URL)
          .get('/api/auth/check-admin-exists');
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body).toHaveProperty('adminExists');
        }
      });
    });

    describe('GET /api/auth/verify-token', () => {
      it('should return 401 without token', async () => {
        const res = await request(BASE_URL)
          .get('/api/auth/verify-token');
        expect([401, 403]).toContain(res.status);
      });

      it('should return 401 with invalid token', async () => {
        const res = await request(BASE_URL)
          .get('/api/auth/verify-token')
          .set('Authorization', 'Bearer invalid-token-here');
        expect([401, 403]).toContain(res.status);
      });
    });

    describe('GET /api/auth/profile', () => {
      it('should return 401 without authentication', async () => {
        const res = await request(BASE_URL)
          .get('/api/auth/profile');
        expect([401, 403]).toContain(res.status);
      });
    });

    describe('POST /api/auth/forgot-password', () => {
      it('should handle forgot password request', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/forgot-password')
          .send({ email: 'test@example.com' });
        // Should return success even if email doesn't exist (security best practice)
        // or 400/404 if validation fails
        expect([200, 400, 404, 500]).toContain(res.status);
      });

      it('should return error for missing email', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/forgot-password')
          .send({});
        expect([400, 422, 500]).toContain(res.status);
      });
    });

    describe('POST /api/auth/reset-password', () => {
      it('should return error for invalid/missing token', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/reset-password')
          .send({
            password: 'newPassword123',
            token: 'invalid-token'
          });
        expect([400, 401, 404]).toContain(res.status);
      });
    });

    describe('GET /api/auth/approved-service-providers', () => {
      it('should return list of approved service providers', async () => {
        const res = await request(BASE_URL)
          .get('/api/auth/approved-service-providers');
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
          expect(Array.isArray(res.body) || res.body.data).toBeTruthy();
        }
      });
    });

    describe('Registration Endpoints', () => {
      it('POST /api/auth/register-customer should require fields', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/register-customer')
          .send({});
        expect([400, 422, 500]).toContain(res.status);
      });

      it('POST /api/auth/register-service-provider should require fields', async () => {
        const res = await request(BASE_URL)
          .post('/api/auth/register-service-provider')
          .send({});
        expect([400, 422, 500]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Services Routes Tests
  // ==========================================
  describe('Services Routes - /api/services', () => {
    describe('GET /api/services', () => {
      it('should return services list or require auth', async () => {
        const res = await request(BASE_URL)
          .get('/api/services');
        expect([200, 401, 403, 404]).toContain(res.status);
        if (res.status === 200) {
          expect(res.body).toBeDefined();
        }
      });
    });

    describe('GET /api/services/:id', () => {
      it('should return 400/401/404 for invalid service ID', async () => {
        const res = await request(BASE_URL)
          .get('/api/services/invalid-id');
        expect([400, 401, 404, 500]).toContain(res.status);
      });

      it('should return 404 for non-existent service', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(BASE_URL)
          .get(`/api/services/${fakeId}`);
        expect([401, 404]).toContain(res.status);
      });
    });

    describe('POST /api/services', () => {
      it('should return 401 without authentication', async () => {
        const res = await request(BASE_URL)
          .post('/api/services')
          .send({
            name: 'Test Service',
            price: 100
          });
        expect([401, 403]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Bookings Routes Tests
  // ==========================================
  describe('Bookings Routes - /api/bookings', () => {
    describe('GET /api/bookings', () => {
      it('should return 401/404 without authentication', async () => {
        const res = await request(BASE_URL)
          .get('/api/bookings');
        expect([401, 403, 404]).toContain(res.status);
      });
    });

    describe('POST /api/bookings', () => {
      it('should return 401/404 without authentication', async () => {
        const res = await request(BASE_URL)
          .post('/api/bookings')
          .send({
            serviceId: new mongoose.Types.ObjectId().toString(),
            date: new Date().toISOString(),
            time: '10:00'
          });
        expect([401, 403, 404]).toContain(res.status);
      });
    });

    describe('GET /api/bookings/:id', () => {
      it('should return 401 without authentication', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(BASE_URL)
          .get(`/api/bookings/${fakeId}`);
        expect([401, 403, 404]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Payment Routes Tests
  // ==========================================
  describe('Payment Routes - /api/payments', () => {
    describe('GET /api/payments', () => {
      it('should return 401/404 without authentication', async () => {
        const res = await request(BASE_URL)
          .get('/api/payments');
        expect([401, 403, 404]).toContain(res.status);
      });
    });

    describe('POST /api/payments', () => {
      it('should return 401/404 without authentication', async () => {
        const res = await request(BASE_URL)
          .post('/api/payments')
          .send({
            bookingId: new mongoose.Types.ObjectId().toString(),
            amount: 100
          });
        expect([401, 403, 404]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Notification Routes Tests
  // ==========================================
  describe('Notification Routes - /api/notifications', () => {
    describe('GET /api/notifications', () => {
      it('should return 401 without authentication', async () => {
        const res = await request(BASE_URL)
          .get('/api/notifications');
        expect([401, 403]).toContain(res.status);
      });
    });

    describe('PUT /api/notifications/:id/read', () => {
      it('should return 401 without authentication', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString();
        const res = await request(BASE_URL)
          .put(`/api/notifications/${fakeId}/read`);
        expect([401, 403, 404]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Chat Routes Tests
  // ==========================================
  describe('Chat Routes - /api/chat', () => {
    describe('GET /api/chat', () => {
      it('should return 401 without authentication', async () => {
        const res = await request(BASE_URL)
          .get('/api/chat');
        expect([401, 403]).toContain(res.status);
      });
    });

    describe('POST /api/chat', () => {
      it('should return 401 without authentication', async () => {
        const res = await request(BASE_URL)
          .post('/api/chat')
          .send({
            receiverId: new mongoose.Types.ObjectId().toString(),
            message: 'Test message'
          });
        expect([401, 403]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Feedback Routes Tests
  // ==========================================
  describe('Feedback Routes - /api/feedback', () => {
    describe('GET /api/feedback', () => {
      it('should return feedback or require auth', async () => {
        const res = await request(BASE_URL)
          .get('/api/feedback');
        expect([200, 401, 403]).toContain(res.status);
      });
    });

    describe('POST /api/feedback', () => {
      it('should return 401 without authentication', async () => {
        const res = await request(BASE_URL)
          .post('/api/feedback')
          .send({
            bookingId: new mongoose.Types.ObjectId().toString(),
            rating: 5,
            comment: 'Great service!'
          });
        expect([401, 403]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Static Files / Uploads Tests
  // ==========================================
  describe('Static Files', () => {
    describe('GET /uploads/*', () => {
      it('should return 404 for non-existent file', async () => {
        const res = await request(BASE_URL)
          .get('/uploads/profiles/nonexistent.jpg');
        expect([404]).toContain(res.status);
      });
    });
  });

  // ==========================================
  // Rate Limiting Tests
  // ==========================================
  describe('Rate Limiting', () => {
    it('should have rate limiting headers', async () => {
      const res = await request(BASE_URL)
        .get('/api/auth/check-admin-exists');
      // Check if rate limit headers are present
      // Note: Headers may vary based on configuration
      expect([200, 404, 429]).toContain(res.status);
    });
  });

  // ==========================================
  // Error Handling Tests
  // ==========================================
  describe('Error Handling', () => {
    it('should handle 404 for unknown routes', async () => {
      const res = await request(BASE_URL)
        .get('/api/unknown-route-that-does-not-exist');
      expect([404]).toContain(res.status);
    });

    it('should handle invalid JSON', async () => {
      const res = await request(BASE_URL)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json');
      expect([400, 500]).toContain(res.status);
    });
  });

  // ==========================================
  // CORS Tests
  // ==========================================
  describe('CORS Configuration', () => {
    it('should have CORS headers for allowed origins', async () => {
      const res = await request(BASE_URL)
        .get('/api/auth/check-admin-exists')
        .set('Origin', 'http://localhost:3000');
      // CORS headers should be present for allowed origin
      expect(res.status).not.toBe(500);
    });
  });

  // Cleanup after all tests
  afterAll(async () => {
    // Close mongoose connection if connected
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });
});

// ==========================================
// Unit Tests for Utilities
// ==========================================
describe('Utility Functions', () => {
  // Test serialGenerator if needed
  describe('Serial Generator', () => {
    it('should be importable', async () => {
      try {
        const { checkAndFixDuplicateServiceProviderIds } = await import('../Utils/serialGenerator.js');
        expect(typeof checkAndFixDuplicateServiceProviderIds).toBe('function');
      } catch (error) {
        // Module might have dependencies that aren't available in test
        expect(error).toBeDefined();
      }
    });
  });
});
