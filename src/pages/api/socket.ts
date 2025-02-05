// src/pages/api/socket.ts
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
  if (res.socket.server.io) {
    console.log('Socket server already running');
    res.end();
    return;
  }

  const httpServer: ServerType = res.socket.server;
  const io = new ServerIO(httpServer, {
    path: '/api/socket',
  });

  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

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