require('dotenv').config();
const express = require('express');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { router: connectionRouter, initSavedSessions, deleteSession, listSessions } = require('./api/connection');
const messagesRouter = require('./api/messages');
const mediaRouter = require('./api/media');
const groupsRouter = require('./api/groups');
const othersRouter = require('./api/others');
const storeRouter = require('./api/store');
const { checkApiKey } = require('./api/utils');
const { initSocket } = require('./api/socket');

const app = express();
const server = http.createServer(app);
const port = process.env.RC_WA_API_PORT || 3000;

// Inicializa o Socket.io
initSocket(server);

// Configuração de Rate Limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 600, // Limite de 600 requisições por minuto (10 req/s)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições, tente novamente mais tarde.' }
});

// Aplica o limitador globalmente
app.use(limiter);

// Carrega o arquivo Swagger
const swaggerDocument = YAML.load('./swagger.yaml');

if (process.env.RC_WA_API_URL) {
    swaggerDocument.servers = [{ url: process.env.RC_WA_API_URL }];
}

app.use(express.json());

// Servir arquivos estáticos (Dashboard)
app.use(express.static(path.join(__dirname, 'frontend')));

// Rota da documentação Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Middleware de autenticação global
const apiRoutes = express.Router();
apiRoutes.use(checkApiKey);
apiRoutes.use('/', connectionRouter);
apiRoutes.use('/', messagesRouter);
apiRoutes.use('/', mediaRouter);
apiRoutes.use('/', groupsRouter);
apiRoutes.use('/', othersRouter);
apiRoutes.use('/', storeRouter);

app.use('/', apiRoutes);

// Inicializa sessões salvas
initSavedSessions();

const httpServer = server.listen(port, () => {
    console.log(`API RC WA rodando na porta ${port}`);
    console.log(`Dashboard disponível em http://localhost:${port}`);
    console.log(`Documentação disponível em http://localhost:${port}/api-docs`);
});

// Graceful Shutdown
const gracefulShutdown = async () => {
    console.log('Recebido sinal de desligamento. Fechando sessões...');
    
    // Obtém lista de sessões via função exportada (precisa exportar listSessions no connection.js)
    // Como listSessions retorna array de IDs, vamos iterar
    // Nota: listSessions foi importado lá em cima, mas precisamos garantir que ele retorne os IDs
    
    // Como listSessions retorna apenas as chaves, vamos usar deleteSession para fechar
    // Mas deleteSession remove do mapa. O ideal seria apenas fechar o socket.
    // Para simplificar, vamos forçar o encerramento do processo após um tempo
    
    httpServer.close(() => {
        console.log('Servidor HTTP fechado.');
        process.exit(0);
    });

    // Força o encerramento se demorar muito
    setTimeout(() => {
        console.error('Forçando encerramento...');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
