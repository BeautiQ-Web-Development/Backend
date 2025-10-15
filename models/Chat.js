// models/Chat.js - Chat message model
import mongoose from 'mongoose';

const { Schema } = mongoose;

const chatSchema = new Schema({
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  receiverId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  senderRole: {
    type: String,
    enum: ['customer', 'serviceProvider', 'admin'],
    required: true
  },
  receiverRole: {
    type: String,
    enum: ['customer', 'serviceProvider', 'admin'],
    required: true
  },
  message: {
    type: String,
    required: true,
    trim: true,
    maxlength: 5000 // Limit message length
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Compound index for efficient chat queries
chatSchema.index({ senderId: 1, receiverId: 1, createdAt: -1 });
chatSchema.index({ receiverId: 1, senderId: 1, createdAt: -1 });

// Index for unread messages
chatSchema.index({ receiverId: 1, isRead: 1 });

// Method to mark message as read
chatSchema.methods.markAsRead = function() {
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }
  return this.save();
};

// Static method to get chat history between two users
chatSchema.statics.getChatHistory = function(userId1, userId2, limit = 100, skip = 0) {
  return this.find({
    $or: [
      { senderId: userId1, receiverId: userId2 },
      { senderId: userId2, receiverId: userId1 }
    ]
  })
  .sort({ createdAt: 1 })
  .skip(skip)
  .limit(limit)
  .populate('senderId', 'fullName role customerId serviceProviderId profilePhoto')
  .populate('receiverId', 'fullName role customerId serviceProviderId profilePhoto');
};

// Static method to get unread message count
chatSchema.statics.getUnreadCount = function(userId) {
  return this.countDocuments({
    receiverId: userId,
    isRead: false
  });
};

// Static method to mark all messages as read between two users
chatSchema.statics.markAllAsRead = async function(senderId, receiverId) {
  const result = await this.updateMany(
    {
      senderId: senderId,
      receiverId: receiverId,
      isRead: false
    },
    {
      $set: {
        isRead: true,
        readAt: new Date()
      }
    }
  );
  return result;
};

// Static method to get all chat contacts for a user
chatSchema.statics.getChatContacts = async function(userId) {
  const messages = await this.aggregate([
    {
      $match: {
        $or: [
          { senderId: new mongoose.Types.ObjectId(userId) },
          { receiverId: new mongoose.Types.ObjectId(userId) }
        ]
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $group: {
        _id: {
          $cond: [
            { $eq: ['$senderId', new mongoose.Types.ObjectId(userId)] },
            '$receiverId',
            '$senderId'
          ]
        },
        lastMessage: { $first: '$message' },
        lastMessageTime: { $first: '$createdAt' },
        unreadCount: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$receiverId', new mongoose.Types.ObjectId(userId)] },
                  { $eq: ['$isRead', false] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'contactInfo'
      }
    },
    {
      $unwind: '$contactInfo'
    },
    {
      $project: {
        _id: 1,
        lastMessage: 1,
        lastMessageTime: 1,
        unreadCount: 1,
        fullName: '$contactInfo.fullName',
        role: '$contactInfo.role',
        customerId: '$contactInfo.customerId',
        serviceProviderId: '$contactInfo.serviceProviderId',
        profilePhoto: '$contactInfo.profilePhoto',
        isOnline: '$contactInfo.isOnline',
        lastSeen: '$contactInfo.lastSeen'
      }
    },
    {
      $sort: { lastMessageTime: -1 }
    }
  ]);

  return messages;
};

export default mongoose.model('Chat', chatSchema);
