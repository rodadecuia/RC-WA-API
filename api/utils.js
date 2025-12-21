import { getSession } from './connection.js';

// Função auxiliar para formatar números
export const formatJid = (number) => {
    if (!number) return null;
    if (number.includes('@')) return number;
    return `${number}@s.whatsapp.net`;
};

// Middleware para verificar autenticação via API Key
export const checkApiKey = (req, res, next) => {
    const apiKey = process.env.RC_WA_API_KEY;
    const requestKey = req.headers['x-api-key'] || req.query.apiKey;

    if (!requestKey || requestKey !== apiKey) {
        return res.status(401).json({ error: 'Acesso não autorizado. API Key inválida ou ausente.' });
    }

    next();
};

// Middleware para verificar sessão e conexão
export const checkSession = (req, res, next) => {
    const sessionId = req.body.sessionId || req.query.sessionId || req.params.sessionId;

    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    const session = getSession(sessionId);

    if (!session) {
        return res.status(404).json({ error: 'Sessão não encontrada ou não iniciada' });
    }

    if (!session.sock) {
        return res.status(503).json({ error: 'Sessão não está pronta' });
    }

    // Injeta a sessão no request para uso posterior
    req.sessionData = session;
    next();
};
