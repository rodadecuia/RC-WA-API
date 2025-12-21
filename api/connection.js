const { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState, makeInMemoryStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { sendWebhook } = require('./webhook');
const { emitEvent } = require('./socket');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Mapa para armazenar todas as sessões ativas
const sessions = new Map();

const SESSIONS_DIR = './sessions_data';

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR);
}

const getSession = (sessionId) => {
    return sessions.get(sessionId);
};

const listSessions = () => {
    return Array.from(sessions.keys());
};

async function startSession(sessionId) {
    if (sessions.has(sessionId) && sessions.get(sessionId).sock?.user) {
        console.log(`Sessão ${sessionId} já está ativa.`);
        return sessions.get(sessionId);
    }

    // Gera um token único para esta instância da sessão
    const sessionToken = uuidv4();

    const sessionPath = path.join(SESSIONS_DIR, sessionId);
    const authPath = path.join(sessionPath, 'auth');
    const storePath = path.join(sessionPath, 'store.json');

    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });

    const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });
    
    try {
        if (fs.existsSync(storePath)) store.readFromFile(storePath);
    } catch (err) {
        console.log(`Erro ao ler store da sessão ${sessionId}:`, err.message);
    }

    const storeInterval = setInterval(() => {
        store.writeToFile(storePath);
    }, 10_000);

    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`Iniciando sessão: ${sessionId} (Token: ${sessionToken})`);

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ["RC WA API", "Chrome", "1.0.0"],
        getMessage: async (key) => {
            if (store) {
                const msg = await store.loadMessage(key.remoteJid, key.id);
                return msg?.message || undefined;
            }
            return { conversation: 'hello' };
        }
    });

    store.bind(sock.ev);

    // Armazena a sessão com o token
    sessions.set(sessionId, { sock, store, qr: null, interval: storeInterval, token: sessionToken });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        const sessionData = sessions.get(sessionId);

        if (qr) {
            if (sessionData) sessionData.qr = qr;
            console.log(`QR Code recebido para sessão: ${sessionId}`);
            
            const eventData = { sessionId, qr, sessionToken };
            sendWebhook('connection.qr', eventData);
            emitEvent('connection.qr', eventData);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`Sessão ${sessionId} fechada. Reconectar: ${shouldReconnect}`);
            
            const eventData = { sessionId, reason: lastDisconnect.error?.message, shouldReconnect, sessionToken };
            sendWebhook('connection.close', eventData);
            emitEvent('status.update', { sessionId, status: 'disconnected' });

            if (shouldReconnect) {
                startSession(sessionId);
            } else {
                deleteSession(sessionId);
            }
        } else if (connection === 'open') {
            console.log(`Sessão ${sessionId} conectada!`);
            if (sessionData) sessionData.qr = null;
            
            // Coleta dados do usuário conectado
            const userJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : undefined;
            const userName = sock.user?.name || sock.user?.notify || undefined;

            const connectionData = {
                sessionId,
                sessionToken,
                user: {
                    jid: userJid,
                    name: userName
                }
            };
            
            sendWebhook('connection.open', connectionData);
            emitEvent('status.update', { sessionId, status: 'open', user: connectionData.user });
        }
    });

    sock.ev.on('messages.upsert', async m => {
        if (m.type === 'notify') {
            for (const msg of m.messages) {
                if (!msg.key.fromMe) {
                    const webhookPayload = { ...msg, sessionId, sessionToken };
                    sendWebhook('message.received', webhookPayload);
                }
            }
        }
    });

    return { sock, store };
}

async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        if (session.sock) {
            try { await session.sock.logout(); } catch (e) {}
            session.sock.end(undefined);
        }
        if (session.interval) clearInterval(session.interval);
        sessions.delete(sessionId);
        console.log(`Sessão ${sessionId} removida.`);
        return true;
    }
    return false;
}

const initSavedSessions = async () => {
    if (fs.existsSync(SESSIONS_DIR)) {
        const files = fs.readdirSync(SESSIONS_DIR);
        for (const file of files) {
            if (fs.existsSync(path.join(SESSIONS_DIR, file, 'auth'))) {
                startSession(file);
            }
        }
    }
};

const router = require('express').Router();

router.post('/sessions/start', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });
    
    await startSession(sessionId);
    // Retorna o token gerado na resposta inicial também (embora a conexão ainda esteja pendente)
    const session = sessions.get(sessionId);
    res.json({ 
        status: 'success', 
        message: `Sessão ${sessionId} iniciada`,
        sessionToken: session?.token
    });
});

router.post('/sessions/stop', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });
    
    const result = await deleteSession(sessionId);
    if (result) res.json({ status: 'success', message: `Sessão ${sessionId} parada` });
    else res.status(404).json({ error: 'Sessão não encontrada' });
});

router.get('/sessions', (req, res) => {
    res.json({ status: 'success', sessions: listSessions() });
});

router.get('/sessions/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    
    const status = session.sock?.user ? 'open' : (session.qr ? 'qr_received' : 'connecting');
    
    // Inclui dados do usuário se conectado
    const userData = session.sock?.user ? {
        jid: session.sock.user.id.split(':')[0] + '@s.whatsapp.net',
        name: session.sock.user.name || session.sock.user.notify
    } : null;

    res.json({ 
        status, 
        qr: session.qr,
        sessionToken: session.token,
        user: userData
    });
});

module.exports = { 
    router, 
    startSession, 
    getSession, 
    deleteSession,
    initSavedSessions,
    listSessions // Exportando listSessions
};
