import fs from 'fs';
import pino from 'pino';

export function makeInMemoryStore({ logger }) {
    const chats = new Map();
    const messages = new Map();
    const contacts = {};
    let writeInterval;

    const loadMessage = async (jid, id) => {
        if (messages.has(jid)) {
            const msgs = messages.get(jid);
            return msgs.get(id);
        }
        return undefined;
    };

    const bind = (ev) => {
        ev.on('connection.update', (update) => {
            Object.assign(contacts, update.contacts);
        });

        ev.on('messaging-history.set', ({ chats: newChats, contacts: newContacts, messages: newMessages }) => {
            if (newContacts) {
                newContacts.forEach(c => contacts[c.id] = Object.assign(contacts[c.id] || {}, c));
            }
            if (newMessages) {
                newMessages.forEach(msg => {
                    const jid = msg.key.remoteJid;
                    if (!messages.has(jid)) messages.set(jid, new Map());
                    messages.get(jid).set(msg.key.id, msg);
                });
            }
        });

        ev.on('contacts.upsert', (newContacts) => {
            newContacts.forEach(c => contacts[c.id] = Object.assign(contacts[c.id] || {}, c));
        });

        ev.on('messages.upsert', ({ messages: newMessages, type }) => {
            if (type === 'notify' || type === 'append') {
                newMessages.forEach(msg => {
                    const jid = msg.key.remoteJid;
                    if (!messages.has(jid)) messages.set(jid, new Map());
                    messages.get(jid).set(msg.key.id, msg);
                });
            }
        });
    };

    const writeToFile = (path) => {
        try {
            const json = JSON.stringify({
                chats: Object.fromEntries(chats),
                contacts,
                messages: Object.fromEntries(
                    Array.from(messages.entries()).map(([jid, msgs]) => [jid, Object.fromEntries(msgs)])
                )
            });
            fs.writeFileSync(path, json);
        } catch (error) {
            logger.error({ error }, 'failed to write store');
        }
    };

    const readFromFile = (path) => {
        if (fs.existsSync(path)) {
            try {
                const json = JSON.parse(fs.readFileSync(path, { encoding: 'utf-8' }));
                if (json.contacts) Object.assign(contacts, json.contacts);
                if (json.messages) {
                    Object.entries(json.messages).forEach(([jid, msgs]) => {
                        messages.set(jid, new Map(Object.entries(msgs)));
                    });
                }
            } catch (error) {
                logger.error({ error }, 'failed to read store');
            }
        }
    };

    return {
        chats,
        contacts,
        messages,
        loadMessage,
        bind,
        writeToFile,
        readFromFile
    };
}
