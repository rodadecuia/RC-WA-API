const app = {
    config: {
        apiKey: null,
        currentSessionId: null,
        socket: null,
        templates: {}
    },
    ui: {
        modals: {},
        async init() {
            app.ui.modals.apiKey = new bootstrap.Modal('#apiKeyModal');
            app.ui.modals.newSession = new bootstrap.Modal('#newSessionModal');
            
            const storedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-bs-theme', storedTheme);
            document.getElementById('theme-light-btn').addEventListener('click', () => app.ui.setTheme('light'));
            document.getElementById('theme-dark-btn').addEventListener('click', () => app.ui.setTheme('dark'));

            document.querySelectorAll('.sidebar .nav-link').forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    app.router.navigate(link.dataset.page);
                });
            });
            
            document.getElementById('sidebar-toggle-btn').addEventListener('click', () => {
                document.querySelector('.sidebar').classList.toggle('show');
            });
        },
        setTheme(theme) {
            document.documentElement.setAttribute('data-bs-theme', theme);
            localStorage.setItem('theme', theme);
        },
        async loadTemplate(name) {
            if (app.config.templates[name]) return app.config.templates[name];
            const res = await fetch(`/partials/${name}.html`);
            const html = await res.text();
            app.config.templates[name] = html;
            return html;
        },
        async showPage(pageId) {
            const main = document.getElementById('main-container');
            main.innerHTML = await app.ui.loadTemplate(pageId);
            
            document.querySelectorAll('.sidebar .nav-link').forEach(link => {
                link.classList.toggle('active', link.dataset.page === pageId);
            });
            document.querySelector('.sidebar').classList.remove('show');
        },
        formatStatus(status) {
            const labels = {
                'open': 'Conectado',
                'connecting': 'Conectando...',
                'disconnected': 'Desconectado',
                'qr_received': 'Aguardando Leitura',
                'close': 'Não Iniciada'
            };
            return labels[status] || status;
        },
        formatDuration(startTime) {
            if (!startTime) return '-';
            const diff = Date.now() - startTime;
            const seconds = Math.floor((diff / 1000) % 60);
            const minutes = Math.floor((diff / (1000 * 60)) % 60);
            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            let str = '';
            if (days > 0) str += `${days}d `;
            if (hours > 0) str += `${hours}h `;
            str += `${minutes}m`;
            return str;
        },
        renderDashboard(sessions) {
            const connected = sessions.filter(s => s.status === 'open').length;
            const disconnected = sessions.length - connected;

            document.getElementById('total-sessions').innerText = sessions.length;
            document.getElementById('connected-sessions').innerText = connected;
            document.getElementById('disconnected-sessions').innerText = disconnected;
            
            const list = document.getElementById('sessionsList');
            list.innerHTML = '';

            if (sessions.length === 0) {
                list.innerHTML = '<div class="list-group-item text-center text-muted">Nenhuma sessão encontrada.</div>';
                return;
            }

            sessions.forEach(({ sessionId, status }) => {
                const item = document.createElement('a');
                item.href = `#session/${sessionId}`;
                item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
                item.innerHTML = `
                    <span><span class="status-indicator status-${status} me-2"></span>${sessionId}</span>
                    <span class="badge bg-secondary rounded-pill">${app.ui.formatStatus(status)}</span>
                `;
                item.onclick = (e) => {
                    e.preventDefault();
                    app.router.navigate('session-details', { sessionId });
                };
                list.appendChild(item);
            });
        },
        renderSessionDetails(sessionId, status, qr, user, stats) {
            app.config.currentSessionId = sessionId;
            
            document.getElementById('session-title').innerText = `Sessão: ${sessionId}`;
            
            if (user) {
                document.getElementById('session-user').style.display = 'block';
                document.getElementById('session-user-name').innerText = user.name || 'Usuário';
                document.getElementById('session-user-jid').innerText = user.jid;
            }

            document.getElementById('statusText').innerText = app.ui.formatStatus(status);
            document.getElementById('statusIndicator').className = `status-indicator status-${status}`;

            if (stats) {
                document.getElementById('stats-container').style.display = 'flex';
                document.getElementById('stat-contacts').innerText = stats.contactsCount || 0;
                document.getElementById('stat-uptime').innerText = status === 'open' ? app.ui.formatDuration(stats.startTime) : '-';
                document.getElementById('stat-sent').innerText = stats.messagesSent || 0;
                document.getElementById('stat-received').innerText = stats.messagesReceived || 0;
                document.getElementById('stat-blocked').innerText = stats.blockedCount || 0;
            }

            app.ui.updateStatus(status, qr);
        },
        renderSettings() {
            document.getElementById('apiKeyDisplay').value = app.config.apiKey;
            document.getElementById('toggleApiKeyVisibility').addEventListener('click', (e) => {
                const input = document.getElementById('apiKeyDisplay');
                const icon = e.currentTarget.querySelector('i');
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.replace('bi-eye', 'bi-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.replace('bi-eye-slash', 'bi-eye');
                }
            });
        },
        updateStatus(status, qr) {
            const statusText = document.getElementById('statusText');
            if (statusText) {
                statusText.innerText = app.ui.formatStatus(status);
                const indicator = document.getElementById('statusIndicator');
                indicator.className = `status-indicator status-${status}`;
            }
            
            const container = document.getElementById('qrCodeContainer');
            if (container) {
                if (qr) {
                    app.ui.renderQr(qr);
                } else if (status === 'open') {
                    container.innerHTML = '<div class="text-center text-success"><i class="bi bi-check-circle-fill display-1"></i><p class="fw-bold mt-2">Conectado!</p></div>';
                } else if (status === 'disconnected') {
                    container.innerHTML = `
                        <div class="text-center">
                            <i class="bi bi-plug-fill display-4 text-danger"></i>
                            <p class="mt-2">Sessão Desconectada</p>
                            <button class="btn btn-primary btn-sm" onclick="app.sessions.create()">Reconectar</button>
                        </div>`;
                } else {
                    container.innerHTML = '<div class="text-center text-muted"><i class="bi bi-hourglass-split display-4"></i><p>Aguardando...</p></div>';
                }
            }
        },
        renderQr(qrCode) {
            const container = document.getElementById('qrCodeContainer');
            if (!container) return;
            container.innerHTML = '';
            new QRCode(container, { text: qrCode, width: 220, height: 220 });
        }
    },
    router: {
        async navigate(page, params = {}) {
            await app.ui.showPage(page);
            switch (page) {
                case 'dashboard':
                    app.sessions.loadAll();
                    break;
                case 'session-details':
                    app.sessions.select(params.sessionId);
                    break;
                case 'settings':
                    app.ui.renderSettings();
                    break;
            }
        }
    },
    auth: {
        init() {
            app.config.apiKey = localStorage.getItem('rc_wa_api_key');
            if (!app.config.apiKey) {
                app.ui.modals.apiKey.show();
            } else {
                app.initSocket();
                app.router.navigate('dashboard');
            }
        },
        saveApiKey() {
            const input = document.getElementById('apiKeyInput').value;
            if (input) {
                app.config.apiKey = input;
                localStorage.setItem('rc_wa_api_key', app.config.apiKey);
                app.ui.modals.apiKey.hide();
                app.auth.init();
            }
        },
        logout() {
            if (confirm('Tem certeza que deseja sair? Sua chave de API será removida.')) {
                localStorage.removeItem('rc_wa_api_key');
                location.reload();
            }
        }
    },
    sessions: {
        async loadAll() {
            try {
                const res = await fetch('/sessions', { headers: { 'x-api-key': app.config.apiKey } });
                if (res.status === 401) return app.auth.logout();
                const data = await res.json();
                
                const sessionDetails = await Promise.all(data.sessions.map(async (sessionId) => {
                    const statusRes = await fetch(`/sessions/${sessionId}/status`, { headers: { 'x-api-key': app.config.apiKey } });
                    const statusData = await statusRes.json();
                    return { sessionId, status: statusData.status };
                }));

                app.ui.renderDashboard(sessionDetails);
            } catch (e) {
                console.error('Erro ao carregar sessões', e);
            }
        },
        async create() {
            let sessionId = app.config.currentSessionId;
            if (!sessionId || document.getElementById('newSessionId').value) {
                sessionId = document.getElementById('newSessionId').value;
            }
            
            if (!sessionId) return;
            
            try {
                await fetch('/sessions/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': app.config.apiKey },
                    body: JSON.stringify({ sessionId })
                });
                app.ui.modals.newSession.hide();
                document.getElementById('newSessionId').value = '';
                app.router.navigate('session-details', { sessionId });
            } catch (e) {
                alert('Erro ao criar/iniciar sessão');
            }
        },
        async select(sessionId) {
            try {
                const res = await fetch(`/sessions/${sessionId}/status`, { headers: { 'x-api-key': app.config.apiKey } });
                const data = await res.json();
                app.ui.renderSessionDetails(sessionId, data.status, data.qr, data.user, data.stats);
            } catch (e) {
                console.error(e);
            }
        },
        async stop() {
            if (!confirm(`Deseja desconectar a sessão ${app.config.currentSessionId}? (Os dados serão mantidos)`)) return;
            try {
                await fetch('/sessions/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': app.config.apiKey },
                    body: JSON.stringify({ sessionId: app.config.currentSessionId })
                });
                app.sessions.select(app.config.currentSessionId);
            } catch (e) {
                alert('Erro ao desconectar sessão');
            }
        },
        async delete() {
            if (!confirm(`ATENÇÃO: Deseja EXCLUIR a sessão ${app.config.currentSessionId}? Isso fará logout e apagará todos os dados.`)) return;
            try {
                await fetch('/sessions/delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': app.config.apiKey },
                    body: JSON.stringify({ sessionId: app.config.currentSessionId })
                });
                app.config.currentSessionId = null;
                app.router.navigate('dashboard');
            } catch (e) {
                alert('Erro ao excluir sessão');
            }
        },
        async sendMessage() {
            const number = document.getElementById('testNumber').value;
            const message = document.getElementById('testMessage').value;
            if (!number || !message) return alert('Preencha número e mensagem');
            try {
                const res = await fetch('/send-text', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': app.config.apiKey },
                    body: JSON.stringify({ sessionId: app.config.currentSessionId, number, message })
                });
                const data = await res.json();
                alert(data.status === 'success' ? 'Enviado!' : `Erro: ${data.error}`);
            } catch (e) {
                alert('Erro ao enviar');
            }
        }
    },
    initSocket() {
        app.config.socket = io();
        
        // CORREÇÃO: Adicionado listener para o evento 'connection.qr'
        app.config.socket.on('connection.qr', (data) => {
            if (data.sessionId === app.config.currentSessionId) {
                app.ui.renderQr(data.qr);
                app.ui.updateStatus('qr_received');
            }
        });

        app.config.socket.on('status.update', (data) => {
            if (document.getElementById('total-sessions')) {
                const badge = document.querySelector(`#sessionsList a[href="#session/${data.sessionId}"] .badge`);
                if (badge) badge.textContent = app.ui.formatStatus(data.status);
                const indicator = document.querySelector(`#sessionsList a[href="#session/${data.sessionId}"] .status-indicator`);
                if(indicator) indicator.className = `status-indicator status-${data.status} me-2`;
            }
            if (data.sessionId === app.config.currentSessionId) {
                app.ui.updateStatus(data.status);
                if (data.status === 'open') {
                    app.sessions.select(data.sessionId);
                }
            }
        });
    },
    init() {
        app.ui.init();
        app.auth.init();
    }
};

document.addEventListener('DOMContentLoaded', app.init);
