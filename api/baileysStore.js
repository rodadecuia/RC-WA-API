const fs = require('fs');

function makeInMemoryStore({ logger }) {
    const chats = new Map();
    const messages = new Map(); // jid -> Map<id, msg>
    const contacts = {};

    const loadMessage = async (jid, id) => {
        if (messages.has(jid)) {
            return messages.get(jid).get(id);
        }
        return undefined;
    }

    const loadMessages = async (jid, count) => {
        if (!messages.has(jid)) return [];
        const msgs = Array.from(messages.get(jid).values());
        // Ordena por timestamp se possível, mas aqui assume ordem de chegada
        return msgs.slice(-count); 
    }

    const bind = (ev) => {
        ev.on('chats.upsert', (newChats) => {
            for (const chat of newChats) {
                chats.set(chat.id, Object.assign(chats.get(chat.id) || {}, chat));
            }
        });

        ev.on('contacts.upsert', (newContacts) => {
             for (const contact of newContacts) {
                 contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
             }
        });

        ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            if (type === 'append' || type === 'notify') {
                for (const msg of newMessages) {
                    const jid = msg.key.remoteJid;
                    if (!messages.has(jid)) messages.set(jid, new Map());
                    messages.get(jid).set(msg.key.id, msg);
                    
                    // Limita histórico em memória (opcional, para não estourar RAM)
                    const chatMsgs = messages.get(jid);
                    if (chatMsgs.size > 50) {
                        const firstKey = chatMsgs.keys().next().value;
                        chatMsgs.delete(firstKey);
                    }
                }
            }
        });
    }

    const writeToFile = (path) => {
        // Salva apenas chats e contatos para persistência leve
        const data = {
            chats: Object.fromEntries(chats),
            contacts: contacts
        };
        fs.writeFileSync(path, JSON.stringify(data));
    }

    const readFromFile = (path) => {
        if (fs.existsSync(path)) {
            const data = JSON.parse(fs.readFileSync(path));
            if (data.chats) {
                for (const [id, chat] of Object.entries(data.chats)) chats.set(id, chat);
            }
            if (data.contacts) {
                Object.assign(contacts, data.contacts);
            }
        }
    }

    return { 
        bind, 
        loadMessage, 
        loadMessages, 
        writeToFile, 
        readFromFile, 
        chats: { all: () => Array.from(chats.values()) }, 
        contacts 
    };
}

module.exports = { makeInMemoryStore };
