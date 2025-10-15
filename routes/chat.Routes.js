// routes/chat.Routes.js
import express from 'express';
import {
  getChatAccounts,
  getChatHistory,
  sendMessage,
  markMessagesAsRead,
  getUnreadCount,
  deleteContactFromList,
  searchUsers
} from '../controllers/chatController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Get all chat accounts/contacts for the logged-in user
router.get('/accounts', getChatAccounts);

// Get chat history with a specific contact
router.get('/history/:contactId', getChatHistory);

// Send a message
router.post('/send', sendMessage);

// Mark messages as read
router.put('/mark-read', markMessagesAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Delete/hide a contact from user's chat list
router.delete('/contact/:contactId', deleteContactFromList);

// Search for users to chat with
router.get('/search', searchUsers);

export default router;
