const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const express = require('express');
const pino = require('pino');
const qrcode = require('qrcode-terminal');

const app = express();
const port = 3000;

app.use(express.json());

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_rc_wa_api');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('QR Code recebido. Escaneie para conectar.');
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Conexão fechada devido a ', lastDisconnect.error, ', reconectando ', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Conexão aberta com sucesso!');
        }
    });

    sock.ev.on('messages.upsert', async m => {
        console.log(JSON.stringify(m, undefined, 2));

        const msg = m.messages[0];
        if (!msg.key.fromMe && m.type === 'notify') {
            console.log('Mensagem recebida:', msg.message?.conversation || msg.message?.extendedTextMessage?.text);
        }
    });
    
    // Endpoint para enviar mensagem de texto
    app.post('/send-message', async (req, res) => {
        const { number, message } = req.body;

        if (!number || !message) {
            return res.status(400).json({ error: 'Número e mensagem são obrigatórios' });
        }

        try {
            const formattedNumber = number.includes('@s.whatsapp.net') ? number : `${number}@s.whatsapp.net`;
            await sock.sendMessage(formattedNumber, { text: message });
            res.json({ status: 'Mensagem enviada com sucesso' });
        } catch (error) {
            console.error('Erro ao enviar mensagem:', error);
            res.status(500).json({ error: 'Falha ao enviar mensagem' });
        }
    });
}

connectToWhatsApp();

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
});