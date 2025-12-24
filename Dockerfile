FROM node:20-slim

# Cria o diretório de trabalho
WORKDIR /usr/src/app

# Instala dependências do sistema
# ffmpeg: necessário para manipulação de áudio/vídeo e stickers
# git, python3, make, g++: necessários para compilar dependências nativas (node-gyp)
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copia os arquivos de dependências
COPY package*.json ./

# Limpa o cache e instala as dependências
RUN npm cache clean --force && npm install

# Copia o restante dos arquivos do projeto
COPY . .

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD [ "npm", "start" ]
