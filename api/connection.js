import Baileys, { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState, makeInMemoryStore } from '@whiskeysockets/baileys';
import pino from 'pino';
import { sendWebhook } from './webhook.js';
import { emitEvent } from './socket.js';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import express from 'express';

const sessions = new Map();
const SESSIONS_DIR = './sessions_data';

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR);
}

export const getSession = (sessionId) => sessions.get(sessionId);
export const listSessions = () => Array.from(sessions.keys());

export async function startSession(sessionId) {
    return new Promise((resolve, reject) => {
        try {
            if (sessions.has(sessionId) && sessions.get(sessionId).sock?.user) {
                console.log(`Sessão ${sessionId} já está ativa.`);
                return resolve(sessions.get(sessionId));
            }

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

            useMultiFileAuthState(authPath).then(({ state, saveCreds }) => {
                fetchLatestBaileysVersion().then(({ version }) => {
                    console.log(`Iniciando sessão: ${sessionId} (v${version.join('.')})`);

                    const sock = makeWASocket({
                        version,
                        auth: state,
                        printQRInTerminal: false,
                        logger: pino({ level: 'silent' }),
                        browser: ["RC WA API", "Chrome", "1.0.0"],
                        getMessage: async (key) => (store.loadMessage(key.remoteJid, key.id))?.message || undefined,
                    });

                    store.bind(sock.ev);
                    sessions.set(sessionId, { sock, store, qr: null, interval: storeInterval, token: sessionToken });

                    sock.ev.on('creds.update', saveCreds);

                    sock.ev.on('connection.update', (update) => {
                        const { connection, lastDisconnect, qr } = update;
                        const sessionData = sessions.get(sessionId);

                        if (qr) {
                            if (sessionData) sessionData.qr = qr;
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
                            
                            const userJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : undefined;
                            const userName = sock.user?.name || sock.user?.notify || undefined;

                            const connectionData = { sessionId, sessionToken, user: { jid: userJid, name: userName } };
                            
                            sendWebhook('connection.open', connectionData);
                            emitEvent('status.update', { sessionId, status: 'open', user: connectionData.user });
                            resolve(sessions.get(sessionId));
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
                }).catch(reject);
            }).catch(reject);
        } catch (error) {
            console.error(`Erro fatal ao iniciar sessão ${sessionId}:`, error);
            reject(error);
        }
    });
}

export async function deleteSession(sessionId) {
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

export const initSavedSessions = async () => {
    if (fs.existsSync(SESSIONS_DIR)) {
        const files = fs.readdirSync(SESSIONS_DIR);
        const promises = files.map(file => {
            if (fs.existsSync(path.join(SESSIONS_DIR, file, 'auth'))) {
                return startSession(file).catch(err => console.error(`Falha ao restaurar sessão ${file}:`, err));
            }
        }).filter(p => p);
        await Promise.all(promises);
    }
};

export const router = express.Router();

router.post('/sessions/start', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });
    
    try {
        await startSession(sessionId);
        const session = sessions.get(sessionId);
        res.json({ 
            status: 'success', 
            message: `Sessão ${sessionId} iniciada`,
            sessionToken: session?.token
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: `Falha ao iniciar sessão: ${error.message}` });
    }
});

router.post('/sessions/stop', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });
    
    try {
        const result = await deleteSession(sessionId);
        if (result) res.json({ status: 'success', message: `Sessão ${sessionId} parada` });
        else res.status(404).json({ error: 'Sessão não encontrada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: `Falha ao parar sessão: ${error.message}` });
    }
});

router.get('/sessions', (req, res) => {
    res.json({ status: 'success', sessions: listSessions() });
});

router.get('/sessions/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    
    if (!session) return res.status(404).json({ error: 'Sessão não encontrada' });
    
    const status = session.sock?.user ? 'open' : (session.qr ? 'qr_received' : 'connecting');
    
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
