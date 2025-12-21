import express from 'express';
import { formatJid, checkSession } from './utils.js';
import { sendWebhook } from './webhook.js';

const router = express.Router();

router.get('/profile-pic/:number', checkSession, async (req, res) => {
    const { number } = req.params;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    try {
        const url = await sock.profilePictureUrl(jid, 'image');
        res.json({ status: 'success', url });
    } catch (error) {
        res.status(404).json({ error: 'Foto de perfil não encontrada ou inacessível' });
    }
});

router.post('/check-number', checkSession, async (req, res) => {
    const { number } = req.body;
    const sock = req.sessionData.sock;

    if (!number) return res.status(400).json({ error: 'Número é obrigatório' });

    try {
        const jid = formatJid(number);
        const [result] = await sock.onWhatsApp(jid);
        
        if (result && result.exists) {
            res.json({ status: 'success', exists: true, jid: result.jid });
        } else {
            res.json({ status: 'success', exists: false });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao verificar número' });
    }
});

router.post('/block-user', checkSession, async (req, res) => {
    const { number, block } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    try {
        await sock.updateBlockStatus(jid, block ? 'block' : 'unblock');
        res.json({ status: 'success', action: block ? 'blocked' : 'unblocked' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar status de bloqueio' });
    }
});

router.post('/update-profile-status', checkSession, async (req, res) => {
    const { status } = req.body;
    const sock = req.sessionData.sock;

    if (!status) return res.status(400).json({ error: 'Novo status é obrigatório' });

    try {
        await sock.updateProfileStatus(status);
        res.json({ status: 'success', message: 'Status do perfil atualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar status do perfil' });
    }
});

router.post('/update-profile-name', checkSession, async (req, res) => {
    const { name } = req.body;
    const sock = req.sessionData.sock;

    if (!name) return res.status(400).json({ error: 'Novo nome é obrigatório' });

    try {
        await sock.updateProfileName(name);
        res.json({ status: 'success', message: 'Nome de exibição atualizado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar nome de exibição' });
    }
});

router.post('/webhook-test', async (req, res) => {
    const webhookUrl = process.env.RC_WA_WEBHOOK_URL;
    if (!webhookUrl) {
        return res.status(400).json({ error: 'Webhook URL não configurada no .env' });
    }

    try {
        await sendWebhook('test.event', { message: 'Teste de Webhook realizado com sucesso!' });
        res.json({ message: `Webhook de teste enviado para ${webhookUrl}` });
    } catch (error) {
        res.status(500).json({ error: 'Falha ao enviar webhook de teste' });
    }
});

export default router;
