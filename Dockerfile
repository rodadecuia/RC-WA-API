FROM node:24-alpine

# Cria o diretório de trabalho
WORKDIR /usr/src/app

# Instala git e dependências de build (python3, make, g++) necessárias para algumas libs
RUN apk add --no-cache git python3 make g++

# Copia os arquivos de dependências
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o restante dos arquivos do projeto
COPY . .

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD [ "npm", "start" ]