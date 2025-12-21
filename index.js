require('dotenv').config();
const express = require('express');
const http = require('http');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { router: connectionRouter, initSavedSessions } = require('./api/connection');
const messagesRouter = require('./api/messages');
const mediaRouter = require('./api/media');
const groupsRouter = require('./api/groups');
const othersRouter = require('./api/others');
const storeRouter = require('./api/store');
const { checkApiKey } = require('./api/utils');
const { initSocket } = require('./api/socket');

// Garante que a pasta de sessões existe
const SESSIONS_DIR = './sessions_data';
if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

const apiKey = process.env.RC_WA_API_KEY;
if (!apiKey || apiKey.length < 20) {
    console.error('❌ ERRO FATAL: A variável de ambiente RC_WA_API_KEY não está definida ou é muito curta (mínimo 20 caracteres).');
    process.exit(1);
}

const app = express();
const server = http.createServer(app);
const port = process.env.RC_WA_API_PORT || 3000;

app.set('trust proxy', 1);
initSocket(server);

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Muitas requisições, tente novamente mais tarde.' }
});

app.use(limiter);

const swaggerDocument = YAML.load('./swagger.yaml');
const servers = [];
if (process.env.RC_WA_API_URL) servers.push({ url: process.env.RC_WA_API_URL, description: 'Servidor Externo (Público)' });
if (process.env.RC_WA_API_INTERNAL_URL) servers.push({ url: process.env.RC_WA_API_INTERNAL_URL, description: 'Servidor Interno (Docker/Local)' });
if (servers.length > 0) swaggerDocument.servers = servers;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.get('/api/docs', (req, res) => res.redirect('/api-docs'));

const apiRoutes = express.Router();
apiRoutes.use(checkApiKey);
apiRoutes.use('/', connectionRouter);
apiRoutes.use('/', messagesRouter);
apiRoutes.use('/', mediaRouter);
apiRoutes.use('/', groupsRouter);
apiRoutes.use('/', othersRouter);
apiRoutes.use('/', storeRouter);
app.use('/', apiRoutes);

async function startServer() {
    console.log('🔄 Carregando sessões salvas...');
    await initSavedSessions();
    console.log('✅ Sessões carregadas.');

    const httpServer = server.listen(port, () => {
        const externalUrl = process.env.RC_WA_API_URL || `http://localhost:${port}`;
        const internalUrl = process.env.RC_WA_API_INTERNAL_URL;

        console.log(`✅ API RC WA rodando na porta ${port}`);
        console.log(`📊 Dashboard disponível em ${externalUrl}`);
        console.log(`📚 Documentação disponível em ${externalUrl}/api-docs`);
        if (internalUrl) console.log(`🔒 URL Interna (API): ${internalUrl}`);
    });

    const gracefulShutdown = async () => {
        console.log('Recebido sinal de desligamento. Fechando sessões...');
        httpServer.close(() => {
            console.log('Servidor HTTP fechado.');
            process.exit(0);
        });
        setTimeout(() => {
            console.error('Forçando encerramento...');
            process.exit(1);
        }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
}

startServer();
