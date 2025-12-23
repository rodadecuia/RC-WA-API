import fs from 'fs';

// Implementação simplificada e funcional do makeInMemoryStore
export function makeInMemoryStore({ logger }) {
    const chats = new Map();
    const messages = new Map();
    const contacts = {};

    const loadMessage = async (jid, id) => {
        if (messages.has(jid)) {
            return messages.get(jid).get(id);
        }
        return undefined;
    };

    const bind = (ev) => {
        ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages }) => {
            if (newContacts) {
                for (const contact of newContacts) {
                    contacts[contact.id] = contact;
                }
            }
            if (newMessages) {
                for (const msg of newMessages) {
                    const jid = msg.key.remoteJid;
                    if (!messages.has(jid)) {
                        messages.set(jid, new Map());
                    }
                    messages.get(jid).set(msg.key.id, msg);
                }
            }
        });

        ev.on('contacts.upsert', (newContacts) => {
            for (const contact of newContacts) {
                contacts[contact.id] = Object.assign(contacts[contact.id] || {}, contact);
            }
        });

        ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            if (type === 'notify' || type === 'append') {
                for (const msg of newMessages) {
                    const jid = msg.key.remoteJid;
                    if (!messages.has(jid)) {
                        messages.set(jid, new Map());
                    }
                    messages.get(jid).set(msg.key.id, msg);
                }
            }
        });
    };

    const toJSON = () => ({
        chats: Object.fromEntries(chats),
        contacts,
        messages: Object.fromEntries(
            Array.from(messages.entries()).map(([jid, msgs]) => [jid, Object.fromEntries(msgs)])
        )
    });

    const fromJSON = (json) => {
        if (json.contacts) Object.assign(contacts, json.contacts);
        if (json.messages) {
            for (const jid in json.messages) {
                messages.set(jid, new Map(Object.entries(json.messages[jid])));
            }
        }
    };

    return {
        chats,
        contacts,
        messages,
        loadMessage,
        bind,
        writeToFile: (path) => {
            try {
                fs.writeFileSync(path, JSON.stringify(toJSON()));
            } catch (e) {
                logger?.error({ e }, 'Falha ao escrever no store');
            }
        },
        readFromFile: (path) => {
            if (fs.existsSync(path)) {
                try {
                    const json = JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
                    fromJSON(json);
                } catch (e) {
                    logger?.error({ e }, 'Falha ao ler do store');
                }
            }
        },
    };
}
