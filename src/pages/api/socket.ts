// src/pages/api/socket.ts - Enhanced with debugging
import { Server as NetServer } from 'http';
import { NextApiRequest, NextApiResponse } from 'next';
import { Server as ServerIO } from 'socket.io';

interface ServerType extends NetServer {
  io?: ServerIO;
}

import { Socket } from 'net';

interface SocketResponse extends NextApiResponse {
  socket: Socket & {
    server: ServerType;
  };
}

export const config = {
  api: {
    bodyParser: false,
  },
};

const SocketHandler = (req: NextApiRequest, res: SocketResponse) => {
  console.log('🚀 Socket handler called');

  if (res.socket.server.io) {
    console.log('✅ Socket server already running');
    res.end();
    return;
  }

  console.log('🔧 Setting up new socket server...');

  const httpServer: ServerType = res.socket.server;
  const io = new ServerIO(httpServer, {
    path: '/api/socket',
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
  });

  res.socket.server.io = io;

  // Track connected users
  const connectedUsers = new Map();

  io.on('connection', (socket) => {
    console.log(`👤 User Connected: ${socket.id}`);

    // Store user info
    connectedUsers.set(socket.id, {
      id: socket.id,
      connectedAt: new Date().toISOString()
    });

    // Notify others about new user
    socket.broadcast.emit('user-connected', socket.id);

    // Send current user count
    io.emit('user-count', connectedUsers.size);

    // Handle test messages
    socket.on('test-message', (data) => {
      console.log('📨 Test message received:', data);
      socket.emit('test-response', { message: 'Server received your test!' });
    });

    // Handle drawing data
    socket.on('draw-line', (data) => {
      console.log(`🎨 Draw data from ${socket.id}:`, {
        currentPoint: data.currentPoint,
        hasPrivious: !!data.previousPoint
      });

      // Broadcast to all other clients (not the sender)
      socket.broadcast.emit('draw-line', {
        id: socket.id,
        ...data,
      });

      console.log(`📡 Broadcasted draw data to ${connectedUsers.size - 1} other users`);
    });

    // Handle canvas clear
    socket.on('clear-canvas', () => {
      console.log(`🧹 Canvas clear request from ${socket.id}`);
      socket.broadcast.emit('clear-canvas');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      console.log(`👋 User Disconnected: ${socket.id}, Reason: ${reason}`);

      // Remove from connected users
      connectedUsers.delete(socket.id);

      // Notify others
      socket.broadcast.emit('user-disconnected', socket.id);
      io.emit('user-count', connectedUsers.size);

      console.log(`👥 Remaining users: ${connectedUsers.size}`);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`❌ Socket error for ${socket.id}:`, error);
    });

    // Send welcome message
    socket.emit('welcome', {
      message: 'Welcome to SketchWeave!',
      userCount: connectedUsers.size,
      yourId: socket.id
    });
  });

  // Server-level error handling
  io.engine.on('connection_error', (err) => {
    console.error('🚫 Connection error:', err.req, err.code, err.message, err.context);
  });

  console.log('🎉 Socket server started successfully');
  console.log('📊 Server configuration:', {
    path: '/api/socket',
    transports: ['websocket', 'polling'],
    cors: { origin: "*", methods: ["GET", "POST"] }
  });

  res.end();
};

export default SocketHandler;