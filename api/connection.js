import { DisconnectReason, fetchLatestBaileysVersion, makeWASocket, useMultiFileAuthState } from '@whiskeysockets/baileys';
import makeInMemoryStore from '@rodrigogs/baileys-store';
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

export const incrementStats = (sessionId, type) => {
    const session = sessions.get(sessionId);
    if (session && session.stats) {
        if (type === 'sent') session.stats.messagesSent++;
        if (type === 'received') session.stats.messagesReceived++;
    }
};

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

            // Inicializa o store usando @rodrigogs/baileys-store
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
                        browser: ["RC Omni SaaS", "Chrome", "1.0.0"], // Atualizado conforme recomendação
                        syncFullHistory: false, // Evita sobrecarga no primeiro login (v7)
                        markOnlineOnConnect: true, // Recomendado para v7
                        getMessage: async (key) => (store.loadMessage(key.remoteJid, key.id))?.message || undefined,
                    });

                    store.bind(sock.ev);
                    
                    const stats = {
                        startTime: Date.now(),
                        messagesSent: 0,
                        messagesReceived: 0,
                        contactsCount: 0,
                        blockedCount: 0
                    };

                    sessions.set(sessionId, { sock, store, qr: null, interval: storeInterval, token: sessionToken, stats });

                    sock.ev.on('creds.update', saveCreds);

                    // Tratamento de histórico para evitar flood (v7)
                    sock.ev.on('messaging-history.set', ({ chats, contacts, messages, isLatest }) => {
                        console.log(`Sessão ${sessionId}: Histórico recebido. Chats: ${chats.length}, Contatos: ${contacts.length}, Mensagens: ${messages.length}`);
                        // Não enviamos webhook aqui para evitar derrubar o backend
                    });

                    sock.ev.on('contacts.upsert', async () => {
                        const session = sessions.get(sessionId);
                        if (session && session.store && session.store.contacts) {
                            const contacts = Object.keys(session.store.contacts).length;
                            session.stats.contactsCount = contacts;
                        }
                    });

                    sock.ev.on('blocklist.update', async ({ blocklist }) => {
                         const session = sessions.get(sessionId);
                         if (session) {
                             session.stats.blockedCount = blocklist.length;
                         }
                    });

                    sock.ev.on('connection.update', async (update) => {
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
                                if (sessions.has(sessionId)) {
                                    startSession(sessionId);
                                }
                            } else {
                                deleteSession(sessionId);
                            }
                        } else if (connection === 'open') {
                            console.log(`Sessão ${sessionId} conectada!`);
                            if (sessionData) {
                                sessionData.qr = null;
                                sessionData.stats.startTime = Date.now();
                                try {
                                    const blocklist = await sock.fetchBlocklist();
                                    sessionData.stats.blockedCount = blocklist.length;
                                } catch (e) {}
                            }
                            
                            const userJid = sock.user?.id ? sock.user.id.split(':')[0] + '@s.whatsapp.net' : undefined;
                            const userName = sock.user?.name || sock.user?.notify || undefined;

                            const connectionData = { sessionId, sessionToken, user: { jid: userJid, name: userName } };
                            
                            sendWebhook('connection.open', connectionData);
                            emitEvent('status.update', { sessionId, status: 'open', user: connectionData.user });
                            resolve(sessions.get(sessionId));
                        }
                    });

                    sock.ev.on('messages.upsert', async m => {
                        // Filtra apenas mensagens novas (notify) para evitar processar histórico como novo
                        if (m.type === 'notify') {
                            for (const msg of m.messages) {
                                if (!msg.key.fromMe) {
                                    incrementStats(sessionId, 'received');
                                    const webhookPayload = { ...msg, sessionId, sessionToken };
                                    sendWebhook('message.received', webhookPayload);
                                } else {
                                    incrementStats(sessionId, 'sent');
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

export async function disconnectSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        session.sock.ev.removeAllListeners('connection.update');
        session.sock.end(undefined);
        if (session.interval) clearInterval(session.interval);
        sessions.delete(sessionId);
        console.log(`Sessão ${sessionId} desconectada (arquivos mantidos).`);
        emitEvent('status.update', { sessionId, status: 'disconnected' });
        return true;
    }
    return false;
}

export async function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    const sessionPath = path.join(SESSIONS_DIR, sessionId);

    if (session) {
        if (session.sock) {
            try { await session.sock.logout(); } catch (e) {}
            session.sock.end(undefined);
        }
        if (session.interval) clearInterval(session.interval);
        sessions.delete(sessionId);
    }

    if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    console.log(`Sessão ${sessionId} excluída.`);
    emitEvent('status.update', { sessionId, status: 'disconnected' });
    return true;
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
        const result = await disconnectSession(sessionId);
        if (result) res.json({ status: 'success', message: `Sessão ${sessionId} desconectada` });
        else res.status(404).json({ error: 'Sessão não encontrada ou já desconectada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: `Falha ao desconectar sessão: ${error.message}` });
    }
});

router.post('/sessions/delete', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId é obrigatório' });
    
    try {
        await deleteSession(sessionId);
        res.json({ status: 'success', message: `Sessão ${sessionId} excluída` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: `Falha ao excluir sessão: ${error.message}` });
    }
});

router.get('/sessions', (req, res) => {
    const activeSessions = listSessions();
    const savedSessions = fs.existsSync(SESSIONS_DIR) ? fs.readdirSync(SESSIONS_DIR) : [];
    const allSessions = [...new Set([...activeSessions, ...savedSessions])];
    res.json({ status: 'success', sessions: allSessions });
});

router.get('/sessions/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    const existsOnDisk = fs.existsSync(path.join(SESSIONS_DIR, sessionId));

    if (!session) {
        return res.json({ 
            status: existsOnDisk ? 'disconnected' : 'close',
            qr: null,
            user: null,
            stats: null
        });
    }
    
    const status = session.sock?.user ? 'open' : (session.qr ? 'qr_received' : 'connecting');
    
    const userData = session.sock?.user ? {
        jid: session.sock.user.id.split(':')[0] + '@s.whatsapp.net',
        name: session.sock.user.name || session.sock.user.notify
    } : null;

    if (session.store && session.store.contacts) {
        session.stats.contactsCount = Object.keys(session.store.contacts).length;
    }

    res.json({ 
        status, 
        qr: session.qr,
        sessionToken: session.token,
        user: userData,
        stats: session.stats
    });
});
