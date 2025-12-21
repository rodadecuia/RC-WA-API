const router = require('express').Router();
const { checkSession } = require('./utils');

router.get('/chats', checkSession, (req, res) => {
    try {
        const store = req.sessionData.store;
        if (!store) return res.status(503).json({ error: 'Store não disponível para esta sessão' });

        const chats = store.chats.all();
        res.json({ status: 'success', count: chats.length, data: chats });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao obter chats' });
    }
});

router.get('/contacts', checkSession, (req, res) => {
    try {
        const store = req.sessionData.store;
        if (!store) return res.status(503).json({ error: 'Store não disponível para esta sessão' });

        const contacts = store.contacts;
        const contactsList = Object.values(contacts);
        res.json({ status: 'success', count: contactsList.length, data: contactsList });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao obter contatos' });
    }
});

router.get('/messages/:jid', checkSession, async (req, res) => {
    const { jid } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const store = req.sessionData.store;

    if (!store) return res.status(503).json({ error: 'Store não disponível para esta sessão' });

    try {
        const messages = await store.loadMessages(jid, limit);
        res.json({ status: 'success', count: messages.length, data: messages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao obter mensagens' });
    }
});

module.exports = router;
