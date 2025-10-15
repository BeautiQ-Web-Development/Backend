// controllers/chatController.js
import Chat from '../models/Chat.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import { getIo } from '../server.js';

// Get all chat accounts/contacts for the logged-in user
export const getChatAccounts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    let availableContacts = [];

    // Based on role, determine who they can chat with
    if (userRole === 'customer') {
      // Customers can see all approved service providers
      availableContacts = await User.find({
        role: 'serviceProvider',
        approvalStatus: 'approved',
        isActive: true
      }).select('fullName serviceProviderId profilePhoto isOnline lastSeen role');

    } else if (userRole === 'serviceProvider') {
      // Service providers can see customers and admin
      const customers = await User.find({
        role: 'customer',
        isActive: true
      }).select('fullName customerId profilePhoto isOnline lastSeen role');

      const admin = await User.find({
        role: 'admin',
        isActive: true
      }).select('fullName profilePhoto isOnline lastSeen role');

      availableContacts = [...customers, ...admin];

    } else if (userRole === 'admin') {
      // Admin can see all service providers
      availableContacts = await User.find({
        role: 'serviceProvider',
        approvalStatus: 'approved',
        isActive: true
      }).select('fullName serviceProviderId profilePhoto isOnline lastSeen role');
    }

    // Get chat contacts with last message info
    const chatContacts = await Chat.getChatContacts(userId);

    // Merge available contacts with chat history
    const contactsWithChat = availableContacts.map(contact => {
      const chatInfo = chatContacts.find(
        chat => chat._id.toString() === contact._id.toString()
      );

      return {
        _id: contact._id,
        fullName: contact.fullName,
        role: contact.role,
        customerId: contact.customerId,
        serviceProviderId: contact.serviceProviderId,
        profilePhoto: contact.profilePhoto,
        isOnline: contact.isOnline,
        lastSeen: contact.lastSeen,
        lastMessage: chatInfo?.lastMessage || null,
        lastMessageTime: chatInfo?.lastMessageTime || null,
        unreadCount: chatInfo?.unreadCount || 0
      };
    });

    // Sort by last message time, then by name
    contactsWithChat.sort((a, b) => {
      if (a.lastMessageTime && b.lastMessageTime) {
        return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
      }
      if (a.lastMessageTime) return -1;
      if (b.lastMessageTime) return 1;
      return a.fullName.localeCompare(b.fullName);
    });

    res.json({
      success: true,
      contacts: contactsWithChat
    });

  } catch (error) {
    console.error('Error fetching chat accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat accounts',
      error: error.message
    });
  }
};

// Get chat history between two users
export const getChatHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { contactId } = req.params;
    const { limit = 100, skip = 0 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    // Verify the contact exists
    const contact = await User.findById(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    // Get chat history
    const messages = await Chat.getChatHistory(
      userId,
      contactId,
      parseInt(limit),
      parseInt(skip)
    );

    // Mark messages as read
    await Chat.markAllAsRead(contactId, userId);

    res.json({
      success: true,
      messages,
      contact: {
        _id: contact._id,
        fullName: contact.fullName,
        role: contact.role,
        customerId: contact.customerId,
        serviceProviderId: contact.serviceProviderId,
        profilePhoto: contact.profilePhoto,
        isOnline: contact.isOnline,
        lastSeen: contact.lastSeen
      }
    });

  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch chat history',
      error: error.message
    });
  }
};

// Send a chat message (via HTTP, socket will also be used)
export const sendMessage = async (req, res) => {
  try {
    const senderId = req.user.userId;
    const { receiverId, message } = req.body;

    if (!receiverId || !message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Receiver ID and message are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid receiver ID'
      });
    }

    // Verify receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: 'Receiver not found'
      });
    }

    // Get sender info
    const sender = await User.findById(senderId);
    if (!sender) {
      return res.status(404).json({
        success: false,
        message: 'Sender not found'
      });
    }

    // Create chat message
    const chatMessage = new Chat({
      senderId,
      receiverId,
      senderRole: sender.role,
      receiverRole: receiver.role,
      message: message.trim()
    });

    await chatMessage.save();

    // Populate sender and receiver info
    await chatMessage.populate('senderId', 'fullName role customerId serviceProviderId profilePhoto');
    await chatMessage.populate('receiverId', 'fullName role customerId serviceProviderId profilePhoto');

    // Emit to receiver via socket
    const io = getIo();
    if (io) {
      io.emitToUser(receiverId, 'newMessage', {
        message: chatMessage
      });
    }

    res.status(201).json({
      success: true,
      message: chatMessage
    });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

// Mark messages as read
export const markMessagesAsRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { senderId } = req.body;

    if (!senderId) {
      return res.status(400).json({
        success: false,
        message: 'Sender ID is required'
      });
    }

    const result = await Chat.markAllAsRead(senderId, userId);

    res.json({
      success: true,
      markedCount: result.modifiedCount
    });

  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark messages as read',
      error: error.message
    });
  }
};

// Get unread message count
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const count = await Chat.getUnreadCount(userId);

    res.json({
      success: true,
      unreadCount: count
    });

  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message
    });
  }
};

// Delete chat account from user's list (soft delete - just hide from their view)
// Note: Messages are not actually deleted, just the contact is removed from the user's visible list
export const deleteContactFromList = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { contactId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    // This is a soft delete - we're not actually deleting messages
    // Just acknowledging the user wants to hide this contact
    // The messages will still be in the database
    
    // You could implement a separate collection to track hidden contacts
    // For now, we'll just return success as the frontend will handle UI removal
    
    res.json({
      success: true,
      message: 'Contact removed from your list'
    });

  } catch (error) {
    console.error('Error deleting contact:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete contact',
      error: error.message
    });
  }
};

// Search for users to chat with
export const searchUsers = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { query } = req.query;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }

    let searchFilter = {
      _id: { $ne: userId },
      isActive: true,
      $or: [
        { fullName: { $regex: query, $options: 'i' } },
        { businessName: { $regex: query, $options: 'i' } }
      ]
    };

    // Apply role-based filtering
    if (userRole === 'customer') {
      searchFilter.role = 'serviceProvider';
      searchFilter.approvalStatus = 'approved';
    } else if (userRole === 'serviceProvider') {
      searchFilter.role = { $in: ['customer', 'admin'] };
    } else if (userRole === 'admin') {
      searchFilter.role = 'serviceProvider';
      searchFilter.approvalStatus = 'approved';
    }

    const users = await User.find(searchFilter)
      .select('fullName role customerId serviceProviderId profilePhoto isOnline lastSeen')
      .limit(20);

    res.json({
      success: true,
      users
    });

  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users',
      error: error.message
    });
  }
};
