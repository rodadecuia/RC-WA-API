let io;

const initSocket = (server) => {
    const { Server } = require("socket.io");
    io = new Server(server);

    io.on('connection', (socket) => {
        console.log('Novo cliente conectado ao Dashboard (Socket.io)');
        
        // Opcional: Autenticação via handshake auth se quiser proteger o socket
        // const token = socket.handshake.auth.token;
    });
};

const getIO = () => {
    if (!io) {
        throw new Error("Socket.io não inicializado!");
    }
    return io;
};

const emitEvent = (event, data) => {
    if (io) {
        io.emit(event, data);
    }
};

module.exports = { initSocket, getIO, emitEvent };
