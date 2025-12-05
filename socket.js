import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

// Keep track of connected users: userId -> Set of socket IDs
const connectedUsers = {};
let ioInstance;

export const initializeSocket = (server) => {
  console.log('🔌 Initializing Socket.IO server...');
  
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000
  });

  // Optional: JWT authentication middleware for sockets
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;
      if (!token) {
        // Allow connection without auth for public features
        console.log('⚠️ Socket connected without authentication');
        return next();
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      console.log(`🔑 Socket authenticated for user: ${socket.userId}, role: ${socket.userRole}`);
      next();
    } catch (error) {
      console.error('❌ Socket authentication error:', error.message);
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`🟢 New socket connected: ${socket.id}`);
    
    // Register user connection with explicit user ID from client
    socket.on('register', (userId) => {
      if (!userId) {
        console.log('⚠️ Register event received without userId');
        return;
      }
      
      // Store socket ID mapped to user ID
      if (!connectedUsers[userId]) {
        connectedUsers[userId] = new Set();
      }
      connectedUsers[userId].add(socket.id);
      
      // Add socket to a room named after the user ID for easier targeting
      socket.join(userId);
      
      console.log(`👤 User ${userId} registered with socket ${socket.id}`);
      console.log(`📊 Total connected users: ${Object.keys(connectedUsers).length}`);
      
      // Broadcast user online status to others
      socket.broadcast.emit('userOnline', { userId });
    });

    // Chat: Send a message
    socket.on('sendMessage', async (data) => {
      const { receiverId, message, senderId, senderName } = data;
      
      console.log(`💬 Message from ${senderId} to ${receiverId}`);
      
      // Emit to receiver
      io.to(receiverId).emit('receiveMessage', {
        senderId,
        senderName,
        message,
        timestamp: new Date()
      });
    });

    // Chat: Typing indicator
    socket.on('typing', (data) => {
      const { receiverId, senderId, senderName, isTyping } = data;
      
      io.to(receiverId).emit('userTyping', {
        senderId,
        senderName,
        isTyping
      });
    });

    // Chat: Mark messages as read
    socket.on('messagesRead', (data) => {
      const { senderId, receiverId } = data;
      
      io.to(senderId).emit('messagesReadConfirmation', {
        readBy: receiverId
      });
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
      console.log(`🔴 Socket disconnected: ${socket.id}`);
      
      let disconnectedUserId = null;
      
      // Remove socket from user connections
      for (const [userId, sockets] of Object.entries(connectedUsers)) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          console.log(`🔌 Removed socket ${socket.id} from user ${userId}`);
          
          // Clean up empty user entries
          if (sockets.size === 0) {
            delete connectedUsers[userId];
            disconnectedUserId = userId;
            console.log(`🧹 Removed empty user entry for ${userId}`);
          }
          break;
        }
      }
      
      // Broadcast user offline status
      if (disconnectedUserId) {
        socket.broadcast.emit('userOffline', { userId: disconnectedUserId });
      }
      
      console.log(`📊 Remaining connected users: ${Object.keys(connectedUsers).length}`);
    });
  });

  // Add custom methods to the io instance for easier access
  io.emitToUser = (userId, event, data) => {
    if (!userId) {
      console.error('❌ Cannot emit to null/undefined userId');
      return false;
    }
    
    const userIdStr = userId.toString();
    
    if (connectedUsers[userIdStr] && connectedUsers[userIdStr].size > 0) {
      io.to(userIdStr).emit(event, data);
      console.log(`📨 Emitted ${event} to user ${userIdStr}`);
      
      // Enhanced logging for service unavailability notifications
      if (event === 'newNotification') {
        console.log(`🔔 Real-time notification sent to user ${userIdStr}:`, {
          message: data.message,
          type: data.type,
          dataFields: Object.keys(data.data || {})
        });
      }
      return true;
    } else {
      console.log(`⚠️ User ${userIdStr} not connected, notification queued for later delivery`);
      
      // Enhanced logging for service unavailability notifications
      if (event === 'newNotification' && 
         (data.type === 'serviceUnavailable' || data.type === 'providerUnavailable')) {
        console.log(`📌 Queued ${data.type} notification for offline user ${userIdStr}:`, {
          message: data.message,
          type: data.type
        });
      }
      
      return false;
    }
  };

  io.emitToRole = (role, event, data) => {
    let delivered = false;
    Object.entries(connectedUsers).forEach(([userId, sockets]) => {
      // This is simplified - in production you'd have a more sophisticated way to check roles
      const socket = io.sockets.sockets.get(Array.from(sockets)[0]);
      if (socket && socket.userRole === role) {
        io.to(userId).emit(event, data);
        delivered = true;
      }
    });
    return delivered;
  };

  console.log('✅ Socket.IO server initialized successfully');
  ioInstance = io;
  return io;
};

export const getIo = () => ioInstance;

export const getConnectedUsers = () => {
  return Object.keys(connectedUsers).map(userId => ({
    userId,
    connections: connectedUsers[userId].size
  }));
};

// Expose the connectedUsers for debugging
export const getConnectedUserMap = () => connectedUsers;
