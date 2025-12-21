const router = require('express').Router();
const { formatJid, checkSession } = require('./utils');

// Cria um novo grupo
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

// Atualiza participantes (Adicionar, Remover, Promover, Rebaixar)
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

// Lista TODOS os grupos que a sessão participa
router.get('/groups', checkSession, async (req, res) => {
    const sock = req.sessionData.sock;

    try {
        // groupFetchAllParticipating busca os metadados de TODOS os grupos
        const groups = await sock.groupFetchAllParticipating();
        // O retorno é um objeto { "id": data }, transformamos em array
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

// Obtém dados completos de um grupo específico (incluindo foto)
router.get('/group-info/:groupId', checkSession, async (req, res) => {
    const { groupId } = req.params;
    const sock = req.sessionData.sock;

    try {
        // Busca metadados
        const metadata = await sock.groupMetadata(groupId);
        
        // Tenta buscar a foto (pode falhar se não tiver)
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

// Obtém link de convite
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

// Atualiza configurações do grupo (Nome, Descrição, Restrições)
router.post('/group-settings', checkSession, async (req, res) => {
    const { groupId, action, value } = req.body;
    const sock = req.sessionData.sock;
    
    // actions: 'subject' (nome), 'description', 'announcement' (fechar grupo), 'locked' (apenas admin edita dados)
    
    try {
        if (action === 'subject') {
            await sock.groupUpdateSubject(groupId, value);
        } else if (action === 'description') {
            await sock.groupUpdateDescription(groupId, value);
        } else if (action === 'announcement') {
            // value: true (fechado), false (aberto)
            await sock.groupSettingUpdate(groupId, 'announcement', value ? 'announcement' : 'not_announcement');
        } else if (action === 'locked') {
            // value: true (restrito), false (livre)
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

module.exports = router;
