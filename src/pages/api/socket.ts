// src/pages/api/socket.ts
import { Server as NetServer } from 'http';
import { NextApiRequest } from 'next';
import { Server as ServerIO } from 'socket.io';
import { NextApiResponseServerIO } from '@/types/socket';

export const config = {
  api: {
    bodyParser: false,
  },
};

const SocketHandler = (req: NextApiRequest, res: NextApiResponseServerIO) => {
  if (res.socket.server.io) {
    console.log('Socket server already running');
    res.end();
    return;
  }

  const httpServer: NetServer = res.socket.server as any;
  const io = new ServerIO(httpServer, {
    path: '/api/socket',
  });

  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Broadcast the new cursor position to all other clients
    socket.on('cursor-move', (data) => {
      socket.broadcast.emit('cursor-move', {
        id: socket.id,
        ...data,
      });
    });

    // Broadcast new drawing data to all other clients
    socket.on('draw-line', (data) => {
      socket.broadcast.emit('draw-line', {
        id: socket.id,
        ...data,
      });
    });

    socket.on('disconnect', () => {
      console.log(`User Disconnected: ${socket.id}`);
      io.emit('user-disconnected', socket.id);
    });
  });

  console.log('Socket server started');
  res.end();
};

export default SocketHandler;