# RC WA API

API para integração com WhatsApp utilizando a biblioteca Baileys.

## Instalação e Execução

### Docker

```bash
docker build -t rc-wa-api .
docker run -p 3000:3000 rc-wa-api
```

### Manual

```bash
npm install
npm start
```

## Autenticação

Ao iniciar a aplicação, um QR Code será exibido no terminal. Escaneie-o com o WhatsApp para conectar.
Você também pode obter o QR Code via API através da rota `/qr`.

## Endpoints da API

A API roda por padrão na porta `3000`.

### Conexão

*   **GET /status**
    *   Retorna o status da conexão (`open`, `connecting`, `disconnected`, `qr_received`).
*   **GET /qr**
    *   Retorna o QR Code em formato base64 (se disponível e não conectado).
*   **POST /logout**
    *   Desconecta a sessão atual.

### Mensagens

*   **POST /send-text**
    *   Body: `{ "number": "5511999999999", "message": "Olá!" }`
*   **POST /send-location**
    *   Body: `{ "number": "5511999999999", "lat": -23.5505, "long": -46.6333, "address": "São Paulo, SP" }`
*   **POST /send-contact**
    *   Body: `{ "number": "5511999999999", "contactName": "Fulano", "contactNumber": "5511888888888" }`

### Mídia

*   **POST /send-image**
    *   Body: `{ "number": "5511999999999", "url": "https://exemplo.com/imagem.jpg", "caption": "Legenda" }`
*   **POST /send-video**
    *   Body: `{ "number": "5511999999999", "url": "https://exemplo.com/video.mp4", "caption": "Legenda", "gifPlayback": false }`
*   **POST /send-audio**
    *   Body: `{ "number": "5511999999999", "url": "https://exemplo.com/audio.mp3", "ptt": true }` (ptt=true envia como nota de voz)
*   **POST /send-document**
    *   Body: `{ "number": "5511999999999", "url": "https://exemplo.com/doc.pdf", "fileName": "arquivo.pdf", "mimetype": "application/pdf", "caption": "Legenda" }`

### Grupos

*   **POST /group-create**
    *   Body: `{ "subject": "Nome do Grupo", "participants": ["5511999999999", "5511888888888"] }`
*   **POST /group-update-participants**
    *   Body: `{ "groupId": "123456789@g.us", "action": "add", "participants": ["5511777777777"] }`
    *   Actions: `add`, `remove`, `promote`, `demote`
*   **GET /group-metadata/:groupId**
    *   Retorna informações do grupo (participantes, admins, etc).

### Outros

*   **GET /profile-pic/:number**
    *   Retorna a URL da foto de perfil do usuário.
*   **POST /block-user**
    *   Body: `{ "number": "5511999999999", "block": true }`

## Observações

*   O parâmetro `number` pode ser apenas o número (ex: `5511999999999`) ou o JID completo (ex: `5511999999999@s.whatsapp.net`). A API formata automaticamente.
