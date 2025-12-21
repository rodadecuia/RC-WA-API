FROM node:24-alpine

# Cria o diretório de trabalho
WORKDIR /usr/src/app

# Instala git e dependências de build
RUN apk add --no-cache git python3 make g++

# Copia os arquivos de dependências
COPY package*.json ./

# Limpa o cache e instala as dependências
RUN npm cache clean --force && npm install

# Copia o restante dos arquivos do projeto
COPY . .

# Cria um usuário não-root e dá permissão
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /usr/src/app
USER appuser

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD [ "npm", "start" ]
