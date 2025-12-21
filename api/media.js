import express from 'express';
import { formatJid, checkSession } from './utils.js';

const router = express.Router();

router.post('/send-image', checkSession, async (req, res) => {
    const { number, url, caption } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !url) return res.status(400).json({ error: 'Número e URL da imagem são obrigatórios' });

    try {
        const result = await sock.sendMessage(jid, { 
            image: { url: url }, 
            caption: caption 
        });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar imagem' });
    }
});

router.post('/send-video', checkSession, async (req, res) => {
    const { number, url, caption, gifPlayback } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !url) return res.status(400).json({ error: 'Número e URL do vídeo são obrigatórios' });

    try {
        const result = await sock.sendMessage(jid, { 
            video: { url: url }, 
            caption: caption,
            gifPlayback: !!gifPlayback
        });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar vídeo' });
    }
});

router.post('/send-audio', checkSession, async (req, res) => {
    const { number, url, ptt } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !url) return res.status(400).json({ error: 'Número e URL do áudio são obrigatórios' });

    try {
        const result = await sock.sendMessage(jid, { 
            audio: { url: url }, 
            mimetype: 'audio/mp4',
            ptt: !!ptt 
        });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar áudio' });
    }
});

router.post('/send-document', checkSession, async (req, res) => {
    const { number, url, fileName, mimetype, caption } = req.body;
    const jid = formatJid(number);
    const sock = req.sessionData.sock;

    if (!jid || !url) return res.status(400).json({ error: 'Número e URL do documento são obrigatórios' });

    try {
        const result = await sock.sendMessage(jid, { 
            document: { url: url }, 
            mimetype: mimetype || 'application/octet-stream',
            fileName: fileName || 'document',
            caption: caption
        });
        res.json({ status: 'success', result });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao enviar documento' });
    }
});

export default router;
