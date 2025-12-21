const axios = require('axios');

// Função de espera (sleep)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const sendWebhook = async (event, data, attempt = 1) => {
    const webhookUrl = process.env.RC_WA_WEBHOOK_URL;
    const MAX_RETRIES = 5;
    const BASE_DELAY = 2000; // 2 segundos

    if (!webhookUrl) return;

    const payload = {
        event: event,
        data: data,
        timestamp: new Date().toISOString(),
        attempt: attempt // Envia o número da tentativa atual
    };

    try {
        await axios.post(webhookUrl, payload, { timeout: 5000 }); // Timeout de 5s por requisição
        // console.log(`Webhook enviado com sucesso: ${event}`);
    } catch (error) {
        const errorMessage = error.response ? `Status ${error.response.status}` : error.message;
        
        if (attempt <= MAX_RETRIES) {
            // Backoff: 2s, 4s, 6s, 8s, 10s...
            const delay = BASE_DELAY * attempt; 
            
            console.warn(`[Webhook] Falha ao enviar '${event}' (${errorMessage}). Tentativa ${attempt}/${MAX_RETRIES}. Retentando em ${delay/1000}s...`);
            
            await sleep(delay);
            return sendWebhook(event, data, attempt + 1);
        } else {
            console.error(`[Webhook] Erro fatal. Desistindo de enviar '${event}' após ${MAX_RETRIES} tentativas. Erro: ${errorMessage}`);
        }
    }
};

module.exports = { sendWebhook };
