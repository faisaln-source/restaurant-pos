import { Server } from 'socket.io';

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Join rooms based on role or name
    socket.on('join:kds', () => {
      socket.join('kds');
      console.log(`[Socket] ${socket.id} joined KDS room`);
    });

    socket.on('join:pos', () => {
      socket.join('pos');
      console.log(`[Socket] ${socket.id} joined POS room`);
    });

    socket.on('join', (room: string) => {
      if (room) {
        socket.join(room);
        console.log(`[Socket] ${socket.id} joined ${room} room`);
      }
    });

    // Also auto-join both pos and kds by default for unified app experience
    socket.join('kds');
    socket.join('pos');

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });
}
