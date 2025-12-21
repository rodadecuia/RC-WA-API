# RC WA API

API Multi-Sessão para integração com WhatsApp utilizando a biblioteca Baileys.

## Instalação e Execução

### 1. Configuração

Primeiro, copie o arquivo `.env.example` para `.env` e preencha as variáveis, especialmente a `RC_WA_API_KEY`.

```bash
cp .env.example .env
```

### 2. Usando Docker (Recomendado)

#### Produção

Para rodar a versão estável (imagem do GHCR):

```bash
docker-compose -f docker-compose.prod.yml up -d
```

#### Desenvolvimento

Para rodar em modo de desenvolvimento (com build local e hot-reload):

```bash
docker-compose -f docker-compose.dev.yml up --build
```

### 3. Manual (Sem Docker)

```bash
npm install
npm start
```

## Documentação da API

Após iniciar a aplicação, a documentação completa estará disponível em:

*   **Dashboard:** `http://localhost:3000`
*   **Swagger UI:** `http://localhost:3000/api-docs`

## Estrutura

*   **`api/`**: Contém toda a lógica de backend (rotas, conexão, etc).
*   **`frontend/`**: Contém o painel de gerenciamento (Dashboard).
*   **`sessions_data/`**: Armazena os dados de autenticação e store de cada sessão.
*   **`docker-compose.prod.yml`**: Arquivo para rodar em produção.
*   **`docker-compose.dev.yml`**: Arquivo para desenvolvimento local.
