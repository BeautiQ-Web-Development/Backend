// controllers/feedbackController.js

import { ObjectId } from 'mongodb';
import Feedback from '../models/Feedback.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Initialize the collection reference - DEPRECATED but kept for compatibility if needed
// We will use Mongoose model 'Feedback' instead
export const initializeFeedbackController = (collection) => {
  // feedbacksCollection = collection;
};

/**
 * @desc    Submit new feedback
 * @route   POST /api/feedback
 * @access  Protected (Customer)
 */
export const createFeedback = async (req, res) => {
  try {
    const { 
      bookingId, 
      serviceId, 
      providerId, 
      rating, 
      feedbackText,
      serviceName,
      providerName,
      customerName
    } = req.body;

    const customerId = req.user.userId;

    // Create feedback in MongoDB
    const feedback = new Feedback({
      bookingId,
      customerId,
      providerId,
      serviceId,
      rating,
      feedbackText,
      serviceName,
      providerName,
      customerName: customerName || req.user.fullName || 'Anonymous',
      sentiment: 'NEUTRAL', // Default, can be updated by AI later
      processedAt: new Date()
    });

    await feedback.save();

    // Save to S3 for AI analysis
    const s3Key = `feedbacks/${feedback._id}.json`;
    const feedbackData = JSON.stringify(feedback.toObject(), null, 2);

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: s3Key,
      Body: feedbackData,
      ContentType: 'application/json'
    }));

    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully',
      data: feedback
    });
  } catch (error) {
    console.error('❌ Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit feedback',
      error: error.message
    });
  }
};

/**
 * @desc    Get all feedbacks with filters and pagination
 * @route   GET /api/feedback
 * @access  Public/Protected (depending on your needs)
 */
export const getAllFeedbacks = async (req, res) => {
  try {
    const { 
      sentiment, 
      rating, 
      startDate, 
      endDate, 
      limit = 50, 
      page = 1,
      sortBy = 'processedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query object
    const query = {};

    // Filter by sentiment
    if (sentiment) {
      query.sentiment = sentiment.toUpperCase();
    }

    // Filter by rating
    if (rating) {
      const ratingNum = parseInt(rating);
      if (ratingNum >= 1 && ratingNum <= 5) {
        query.rating = ratingNum;
      }
    }

    // Filter by date range
    if (startDate || endDate) {
      query.processedAt = {};
      if (startDate) {
        query.processedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.processedAt.$lte = new Date(endDate);
      }
    }

    // Pagination
    const limitNum = Math.min(parseInt(limit), 100); // Max 100 items per page
    const pageNum = Math.max(parseInt(page), 1);
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Get total count for pagination
    const total = await Feedback.countDocuments(query);

    // Fetch feedbacks
    const feedbacks = await Feedback
      .find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limitNum);

    res.status(200).json({
      success: true,
      data: feedbacks,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum),
        hasNextPage: pageNum < Math.ceil(total / limitNum),
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching feedbacks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedbacks',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get feedback statistics
 * @route   GET /api/feedback/stats
 * @access  Public/Protected
 */
export const getFeedbackStats = async (req, res) => {
  try {
    // Run aggregations in parallel for better performance
    const [
      avgRatingResult,
      sentimentDist,
      keyPhrasesResult,
      totalFeedback,
      ratingDistribution,
    ] = await Promise.all([
      // Average rating
      Feedback.aggregate([
        { $group: { _id: null, avgRating: { $avg: '$rating' } } },
      ]),

      // Sentiment distribution
      Feedback.aggregate([
        { $group: { _id: '$sentiment', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Top key phrases (placeholder if not implemented in schema yet)
      // Assuming keyPhrases might be added later or we skip it for now
      Promise.resolve([]),

      // Total feedback count
      Feedback.countDocuments(),

      // Rating distribution
      Feedback.aggregate([
        { $group: { _id: '$rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const avgRating = avgRatingResult[0]?.avgRating || 0;

    res.status(200).json({
      success: true,
      data: {
        totalFeedback,
        avgRating: parseFloat(avgRating.toFixed(2)),
        sentimentDistribution: sentimentDist,
        ratingDistribution,
        topKeyPhrases: keyPhrasesResult,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching feedback stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get single feedback by ID
 * @route   GET /api/feedback/:id
 * @access  Public/Protected
 */
export const getFeedbackById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feedback ID format',
      });
    }

    const feedback = await Feedback.findById(id);

    if (!feedback) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found',
      });
    }

    res.status(200).json({
      success: true,
      data: feedback,
    });
  } catch (error) {
    console.error('❌ Error fetching feedback by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get feedbacks by booking ID
 * @route   GET /api/feedback/booking/:bookingId
 * @access  Protected (Customer/Admin)
 */
export const getFeedbacksByBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;

    const feedbacks = await Feedback
      .find({ bookingId })
      .sort({ processedAt: -1 });

    res.status(200).json({
      success: true,
      count: feedbacks.length,
      data: feedbacks,
    });
  } catch (error) {
    console.error('❌ Error fetching booking feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch booking feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get feedbacks by customer ID
 * @route   GET /api/feedback/customer/:customerId
 * @access  Protected (Customer/Admin)
 */
export const getFeedbacksByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;

    const feedbacks = await Feedback
      .find({ customerId })
      .sort({ processedAt: -1 });

    // Calculate customer-specific stats
    const stats = {
      totalFeedbacks: feedbacks.length,
      avgRating: feedbacks.length > 0
        ? feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / feedbacks.length
        : 0,
    };

    res.status(200).json({
      success: true,
      data: {
        feedbacks,
        stats: {
          ...stats,
          avgRating: parseFloat(stats.avgRating.toFixed(2)),
        },
      },
    });
  } catch (error) {
    console.error('❌ Error fetching customer feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get feedbacks by provider ID with statistics
 * @route   GET /api/feedback/provider/:providerId
 * @access  Protected (Provider/Admin)
 */
export const getFeedbacksByProvider = async (req, res) => {
  try {
    const { providerId } = req.params;

    // Find feedbacks by provider ID
    const feedbacks = await Feedback
      .find({ providerId })
      .sort({ processedAt: -1 });

    // Calculate provider-specific stats
    const totalFeedbacks = feedbacks.length;
    const avgRating = totalFeedbacks > 0
      ? feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / totalFeedbacks
      : 0;

    const sentimentCounts = feedbacks.reduce((acc, fb) => {
      acc[fb.sentiment] = (acc[fb.sentiment] || 0) + 1;
      return acc;
    }, {});

    const ratingCounts = feedbacks.reduce((acc, fb) => {
      acc[fb.rating] = (acc[fb.rating] || 0) + 1;
      return acc;
    }, {});

    // Get recent feedbacks (last 5)
    const recentFeedbacks = feedbacks.slice(0, 5);

    res.status(200).json({
      success: true,
      data: {
        feedbacks,
        stats: {
          totalFeedbacks,
          avgRating: parseFloat(avgRating.toFixed(2)),
          sentimentCounts,
          ratingCounts,
        },
        recentFeedbacks,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching provider feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch provider feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get feedbacks by service
 * @route   GET /api/feedback/service/:serviceName
 * @access  Public/Protected
 */
export const getFeedbacksByService = async (req, res) => {
  try {
    const { serviceName } = req.params;

    const feedbacks = await Feedback
      .find({ serviceName: { $regex: new RegExp(serviceName, 'i') } })
      .sort({ processedAt: -1 });

    // Calculate service-specific stats
    const totalFeedbacks = feedbacks.length;
    const avgRating = totalFeedbacks > 0
      ? feedbacks.reduce((sum, fb) => sum + fb.rating, 0) / totalFeedbacks
      : 0;

    res.status(200).json({
      success: true,
      data: {
        serviceName,
        feedbacks,
        stats: {
          totalFeedbacks,
          avgRating: parseFloat(avgRating.toFixed(2)),
        },
      },
    });
  } catch (error) {
    console.error('❌ Error fetching service feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch service feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Delete feedback by ID (Admin only)
 * @route   DELETE /api/feedback/:id
 * @access  Protected (Admin)
 */
export const deleteFeedback = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid feedback ID format',
      });
    }

    const result = await Feedback.findByIdAndDelete(id);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Feedback not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Feedback deleted successfully',
    });
  } catch (error) {
    console.error('❌ Error deleting feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get feedback trends over time
 * @route   GET /api/feedback/trends
 * @access  Protected (Admin)
 */
export const getFeedbackTrends = async (req, res) => {
  try {
    const { period = 'week' } = req.query; // 'week', 'month', 'year'

    // Calculate date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case 'week':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'month':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
      case 'year':
        startDate = new Date(now.setFullYear(now.getFullYear() - 1));
        break;
      default:
        startDate = new Date(now.setDate(now.getDate() - 7));
    }

    const trends = await Feedback.aggregate([
      {
        $match: {
          processedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$processedAt',
            },
          },
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' },
          positiveSentiment: {
            $sum: { $cond: [{ $eq: ['$sentiment', 'POSITIVE'] }, 1, 0] },
          },
          negativeSentiment: {
            $sum: { $cond: [{ $eq: ['$sentiment', 'NEGATIVE'] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        trends,
      },
    });
  } catch (error) {
    console.error('❌ Error fetching feedback trends:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trends',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

/**
 * @desc    Get statistics for all providers
 * @route   GET /api/feedback/providers/stats
 * @access  Public
 */
export const getAllProviderStats = async (req, res) => {
  try {
    const stats = await Feedback.aggregate([
      {
        $group: {
          _id: '$providerId',
          avgRating: { $avg: '$rating' },
          totalFeedbacks: { $sum: 1 }
        }
      }
    ]);

    // Convert array to map for easier lookup
    const statsMap = {};
    stats.forEach(stat => {
      statsMap[stat._id] = {
        avgRating: parseFloat(stat.avgRating.toFixed(2)),
        totalFeedbacks: stat.totalFeedbacks
      };
    });

    res.status(200).json({
      success: true,
      data: statsMap
    });
  } catch (error) {
    console.error('❌ Error fetching all provider stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch provider stats',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
};

export default {
  initializeFeedbackController,
  getAllFeedbacks,
  getFeedbackStats,
  getFeedbackById,
  getFeedbacksByBooking,
  getFeedbacksByCustomer,
  getFeedbacksByProvider,
  getFeedbacksByService,
  deleteFeedback,
  getFeedbackTrends,
  getAllProviderStats,
};