import express from 'express';
import { formatJid, checkSession } from './utils.js';

const router = express.Router();

router.post('/group-create', checkSession, async (req, res) => {
    const { subject, participants } = req.body;
    const sock = req.sessionData.sock;

    if (!subject || !participants || !Array.isArray(participants)) {
        return res.status(400).json({ error: 'Assunto e lista de participantes (array) são obrigatórios' });
    }

    try {
        const pJids = participants.map(p => formatJid(p));
        const group = await sock.groupCreate(subject, pJids);
        res.json({ status: 'success', group });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao criar grupo' });
    }
});

router.post('/group-update-participants', checkSession, async (req, res) => {
    const { groupId, action, participants } = req.body;
    const sock = req.sessionData.sock;

    if (!groupId || !action || !participants) {
        return res.status(400).json({ error: 'ID do grupo, ação e participantes são obrigatórios' });
    }

    try {
        const pJids = participants.map(p => formatJid(p));
        const response = await sock.groupParticipantsUpdate(groupId, pJids, action);
        res.json({ status: 'success', response });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar participantes do grupo' });
    }
});

router.get('/groups', checkSession, async (req, res) => {
    const sock = req.sessionData.sock;

    try {
        const groups = await sock.groupFetchAllParticipating();
        const groupsList = Object.values(groups);
        
        res.json({ 
            status: 'success', 
            count: groupsList.length, 
            data: groupsList 
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao listar grupos' });
    }
});

router.get('/group-info/:groupId', checkSession, async (req, res) => {
    const { groupId } = req.params;
    const sock = req.sessionData.sock;

    try {
        const metadata = await sock.groupMetadata(groupId);
        
        let ppUrl = null;
        try {
            ppUrl = await sock.profilePictureUrl(groupId, 'image');
        } catch (e) {
            ppUrl = null;
        }

        res.json({ 
            status: 'success', 
            metadata: {
                ...metadata,
                profilePictureUrl: ppUrl
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao obter informações do grupo' });
    }
});

router.get('/group-invite-code/:groupId', checkSession, async (req, res) => {
    const { groupId } = req.params;
    const sock = req.sessionData.sock;

    try {
        const code = await sock.groupInviteCode(groupId);
        res.json({ status: 'success', code: code, url: `https://chat.whatsapp.com/${code}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao obter código de convite (você precisa ser admin)' });
    }
});

router.post('/group-settings', checkSession, async (req, res) => {
    const { groupId, action, value } = req.body;
    const sock = req.sessionData.sock;
    
    try {
        if (action === 'subject') {
            await sock.groupUpdateSubject(groupId, value);
        } else if (action === 'description') {
            await sock.groupUpdateDescription(groupId, value);
        } else if (action === 'announcement') {
            await sock.groupSettingUpdate(groupId, 'announcement', value ? 'announcement' : 'not_announcement');
        } else if (action === 'locked') {
            await sock.groupSettingUpdate(groupId, 'locked', value ? 'locked' : 'unlocked');
        } else {
            return res.status(400).json({ error: 'Ação inválida' });
        }
        
        res.json({ status: 'success', message: 'Configuração atualizada' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Falha ao atualizar configurações do grupo' });
    }
});

export default router;
