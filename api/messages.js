import express from 'express';
import { formatJid, checkSession } from './utils.js';

const router = express.Router();

router.post('/send-text', checkSession, async (req, res) => {
    const { number, message } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !message) return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });

    try {
        const result = await sock.sendMessage(jid, { text: message });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar mensagem' });
    }
});

router.post('/send-location', checkSession, async (req, res) => {
    const { number, lat, long, address } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !lat || !long) return res.status(400).json({ error: 'Número, latitude e longitude são obrigatórios' });

    try {
        const result = await sock.sendMessage(jid, { 
            location: { degreesLatitude: lat, degreesLongitude: long, address: address }
        });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar localização' });
    }
});

router.post('/send-contact', checkSession, async (req, res) => {
    const { number, contactName, contactNumber } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !contactName || !contactNumber) return res.status(400).json({ error: 'Número de destino, nome do contato e número do contato são obrigatórios' });

    const vcard = 'BEGIN:VCARD\n' 
        + 'VERSION:3.0\n' 
        + `FN:${contactName}\n` 
        + `TEL;type=CELL;type=VOICE;waid=${contactNumber}:${contactNumber}\n` 
        + 'END:VCARD';

    try {
        const result = await sock.sendMessage(jid, { 
            contacts: { 
                displayName: contactName, 
                contacts: [{ vcard }] 
            }
        });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar contato' });
    }
});

router.post('/send-reaction', checkSession, async (req, res) => {
    const { number, text, keyId } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !text || !keyId) return res.status(400).json({ error: 'Número, emoji (text) e ID da mensagem (keyId) são obrigatórios' });

    try {
        const reactionMessage = {
            react: {
                text: text,
                key: { remoteJid: jid, fromMe: false, id: keyId }
            }
        };
        const result = await sock.sendMessage(jid, reactionMessage);
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar reação' });
    }
});

router.post('/send-presence', checkSession, async (req, res) => {
    const { number, state } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !state) return res.status(400).json({ error: 'Número e estado (composing, recording, paused) são obrigatórios' });

    try {
        await sock.sendPresenceUpdate(state, jid);
        res.json({ status: 'success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar presença' });
    }
});

router.post('/mark-read', checkSession, async (req, res) => {
    const { number, messageIds } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !messageIds || !Array.isArray(messageIds)) return res.status(400).json({ error: 'Número e lista de IDs de mensagem são obrigatórios' });

    try {
        const keys = messageIds.map(id => ({ remoteJid: jid, id: id, fromMe: false }));
        await sock.readMessages(keys);
        res.json({ status: 'success' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao marcar como lido' });
    }
});

export default router;
