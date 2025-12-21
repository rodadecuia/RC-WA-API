import { Server } from 'socket.io';

let io;

export const initSocket = (server) => {
    io = new Server(server);

    io.on('connection', (socket) => {
        console.log('Novo cliente conectado ao Dashboard (Socket.io)');
    });
};

export const getIO = () => {
    if (!io) {
        throw new Error("Socket.io não inicializado!");
    }
    return io;
};

export const emitEvent = (event, data) => {
    if (io) {
        io.emit(event, data);
    }
};
