/**
 * Partner Portal — Application Logic v5.0
 * Tally-Style Multi-Layer Accounting
 */

var db = window.db;

window.SECURITY = {
    SALT: 'triven_premium_salt_2024',
    USER_HASH: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', // admin
    PASS_HASH: 'd60c6a2a2cb24065b031c844ef6a4692628c45a4e869dbec2b86ec617eb6d2eb', // 12345 + salt
    MAX_ATTEMPTS: 5,
    COOLDOWN_MS: 5 * 60 * 1000 // 5 Minutes
};

window.auth = {
    async hash(str) {
        const msgBuffer = new TextEncoder().encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    async handleLogin(e) {
        if (e) e.preventDefault();
        console.log('[AUTH] Shared Login process started...');

        const idInput = document.getElementById('login-id');
        const passInput = document.getElementById('login-pass');
        const btn = document.getElementById('login-submit-btn');
        const btnSpan = btn.querySelector('span');

        this.hideError();

        const id = idInput.value.trim();
        const pass = passInput.value;

        if (!id || !pass) {
            this.showError('Please enter both username and password');
            return;
        }

        btn.disabled = true;
        const originalBtnText = btnSpan.textContent;
        btnSpan.textContent = 'Verifying...';

        try {
            const passH = await this.hash(pass + SECURITY.SALT);
            
            if (id === 'admin' && passH === SECURITY.PASS_HASH) {
                console.log('[AUTH] Shared credentials matched. Success!');
                this.success('Administrator');
            } else {
                throw new Error('Invalid username or password');
            }
        } catch (error) {
            console.error('[AUTH] Login failure:', error.message);
            this.showError(error.message);
            this.fail();
        } finally {
            btn.disabled = false;
            btnSpan.textContent = originalBtnText;
        }
    },

    success(user) {
        console.log(`[AUTH] Creating session for ${user}...`);
        window.db.state.currentUser = user;
        localStorage.setItem('auth_session', JSON.stringify({ user, ts: Date.now() }));
        localStorage.removeItem('auth_attempts');
        
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('current-user-tag').textContent = user;
        
        // Reset form
        document.getElementById('login-id').value = '';
        document.getElementById('login-pass').value = '';
        this.hideError();

        console.log('[AUTH] Redirecting to Dashboard.');
        ui.nav('dashboard');
        ui.showToast('Securely signed in', 'success');
    },

    fail() {
        let attempts = parseInt(localStorage.getItem('auth_attempts') || 0) + 1;
        localStorage.setItem('auth_attempts', attempts);

        if (attempts >= window.SECURITY.MAX_ATTEMPTS) {
            localStorage.setItem('auth_cooldown', Date.now() + window.SECURITY.COOLDOWN_MS);
            this.showError('Security Lockout: 5 failed attempts. Wait 5 mins.');
        } else {
            this.showError(`Invalid username or password. ${window.SECURITY.MAX_ATTEMPTS - attempts} attempts remaining.`);
        }
    },

    showError(msg) {
        const errEl = document.getElementById('login-error');
        const txtEl = document.getElementById('error-text');
        if (errEl && txtEl) {
            txtEl.textContent = msg;
            errEl.style.display = 'flex';
        }
    },

    hideError() {
        const errEl = document.getElementById('login-error');
        if (errEl) errEl.style.display = 'none';
    },

    togglePass() {
        const p = document.getElementById('login-pass');
        const i = document.getElementById('pass-icon');
        if (!p || !i) return;
        const isPass = p.getAttribute('type') === 'password';
        p.setAttribute('type', isPass ? 'text' : 'password');
        i.setAttribute('data-lucide', isPass ? 'eye-off' : 'eye');
        lucide.createIcons();
    },

    checkSession() {
        const session = JSON.parse(localStorage.getItem('auth_session'));
        if (session && session.user) {
            console.log('[AUTH] Local session restored:', session.user);
            window.db.currentUser = session.user;
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('current-user-tag').textContent = session.user;
            return true;
        }
        this.logout();
        return false;
    },

    async logout() {
        if (window.db) window.db.currentUser = null;
        localStorage.removeItem('auth_session');
        document.getElementById('login-overlay').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        if (ui.showToast) ui.showToast('Signed out successfully', 'success');
    }
};

window.ui = {
    page:          'dashboard',
    subId:         null, 
    filter:        {},
    charts:        {},
    isVerified:    true,

    async init() {
        console.log('[UI] Initializing Portal...');
        
        // 1. Bind Login Form IMMEDIATELY (So user can type while DB syncs)
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            console.log('[UI] Binding login form...');
            loginForm.addEventListener('submit', (e) => auth.handleLogin(e));
        }

        // 2. Check for existing session
        if (!auth.checkSession()) {
            console.warn('[UI] No valid session. Authentication required.');
            // We still start db.init in background even if not logged in
            window.db.init();
            return;
        }

        // 3. Start Cloud Sync in background
        window.db.init(); 

        const r = window.db.getDatePreset('this_month');
        this.filter = { from: r.from, to: r.to, preset: 'this_month' };
        
        window.addEventListener('hashchange', () => {
            const h = window.location.hash.slice(1) || 'dashboard';
            if (this.page !== h) this.nav(h);
        });

        lucide.createIcons();
        
        const loggedIn = auth.checkSession();
        
        if (!loggedIn) {
            console.warn('[UI] No valid session. Waiting for login.');
            return;
        }

        const initialPage = window.location.hash.slice(1) || 'dashboard';
        await this.nav(initialPage);
        
        this.renderFilterBar();

        document.querySelectorAll('.nav-item').forEach(b => {
            b.addEventListener('click', () => { if (b.dataset.page) this.nav(b.dataset.page); });
        });
        document.querySelectorAll('.mobile-nav [data-page]').forEach(b => {
            b.addEventListener('click', () => this.nav(b.dataset.page));
        });
    },

    // ── Navigation ──────────────────────────────────────────────────────────
    async nav(pageId) {
        if (!localStorage.getItem('auth_session')) {
            console.error('[UI] Unauthorized access attempt. Redirecting to login.');
            await window.auth.logout();
            return;
        }

        // Update Hash for SPA routing
        if (window.location.hash !== '#' + pageId) {
            window.location.hash = pageId;
        }

        if (pageId !== 'ledgers' && pageId !== 'groups') this.subId = null;
        this.page = pageId;
        
        const titles = { 
            dashboard: 'Business Insights', sales: 'Sales Book', purchases: 'Purchase Book',
            expenses: 'Expense Book', ledger: 'General Ledger', accounts: 'Money Accounts',
            groups: 'Ledger Groups', ledgers: 'Accounting Ledgers', reports: 'Financial Reports',
            settings: 'Settings'
        };
        document.getElementById('page-title').textContent = titles[pageId] || pageId;
        document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === pageId));

        const c = document.getElementById('page-container');
        c.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Syncing Live Data...</p></div>`;

        switch (pageId) {
            case 'dashboard': await this.renderDashboard(c); break;
            case 'sales':     await this.renderTxs(c, 'sales'); break;
            case 'purchases': await this.renderTxs(c, 'purchases'); break;
            case 'expenses':  await this.renderTxs(c, 'expenses'); break;
            case 'ledger':    await this.renderTxs(c, null); break;
            case 'accounts':  await this.renderAccounts(c); break;
            case 'groups':    await this.renderGroups(c); break;
            case 'ledgers':   await this.renderLedgers(c); break;
            case 'reports':   await this.renderReports(c); break;
            case 'partners':  await this.renderPartners(c); break;
            case 'settings':  await this.renderSettings(c); break;
        }
        lucide.createIcons();
    },

    // ── Helpers ─────────────────────────────────────────────────────────────
    fmt(n)     { return (window.db.settings?.currency || '₹') + (parseFloat(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); },
    fmtDate(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'; },

    // ── GLOBAL FILTER ────────────────────────────────────────────────────────
    renderFilterBar() {
        const root = document.getElementById('filter-bar-root');
        if (!root) return;

        const presets = [
            { id: 'today',      label: 'Today' },
            { id: 'yesterday',  label: 'Yesterday' },
            { id: 'this_month', label: 'This Month' },
            { id: 'all',        label: 'All Time' }
        ];

        root.innerHTML = `
        <div class="filter-bar">
            <div class="fb-presets">
                ${presets.map(p => `
                    <button class="fb-btn ${this.filter.preset === p.id ? 'active' : ''}" 
                            onclick="ui.setFilterPreset('${p.id}')">${p.label}</button>
                `).join('')}
            </div>
            <div class="fb-custom">
                <div class="fb-input-group">
                    <label>From</label>
                    <input type="date" id="filter-from" value="${this.filter.from || ''}">
                </div>
                <div class="fb-input-group">
                    <label>To</label>
                    <input type="date" id="filter-to" value="${this.filter.to || ''}">
                </div>
                <button class="fb-apply-btn" onclick="ui.applyFilter()">Apply Filter</button>
            </div>
        </div>`;
    },

    setFilterPreset(p) {
        const r = window.db.getDatePreset(p);
        this.filter = { from: r.from, to: r.to, preset: p };
        this.renderFilterBar();
        this.nav(this.page);
        this.showToast(`Showing results for ${p.replace('_',' ')}`);
    },

    applyFilter() {
        const from = document.getElementById('filter-from').value;
        const to = document.getElementById('filter-to').value;
        this.filter = { from, to, preset: 'custom' };
        this.renderFilterBar();
        this.nav(this.page);
        this.showToast('Custom filter applied');
    },

    // ── DASHBOARD ────────────────────────────────────────────────────────────
    async renderDashboard(c) {
        const s = await window.db.getSummary(this.filter);
        const accs = await db.getAccounts();
        let totalCash = 0;
        for(const a of accs) {
            const st = await db.getAccountStats(a.id, this.filter);
            totalCash += st.balance;
        }
        
        const txs = await db.getAllTransactions();
        const txCount = txs.length;
        const hasAccount = accs.length > 0;
        const hasLedger = window.db.state.ledgers.length > 8; // Default v6 has 8 ledgers

        let html = '';
        if (txCount === 0 || !hasAccount) {
            html += `
            <div class="welcome-banner">
                <div class="wb-content">
                    <h2>Welcome to Portal V5</h2>
                    <p>Let's get your business accounting set up correctly.</p>
                </div>
                <div class="wb-steps">
                    <div class="wb-step ${hasAccount?'done':''}">
                        <i data-lucide="${hasAccount?'check-circle-2':'circle'}"></i>
                        <span>Create Payment Account</span>
                        ${!hasAccount ? `<button onclick="ui.openModal('account-add')">Add Now</button>` : ''}
                    </div>
                    <div class="wb-step ${hasLedger?'done':''}">
                        <i data-lucide="${hasLedger?'check-circle-2':'circle'}"></i>
                        <span>Setup Accounting Ledgers</span>
                        ${!hasLedger ? `<button onclick="ui.nav('ledgers')">Set Ledgers</button>` : ''}
                    </div>
                    <div class="wb-step ${txCount>0?'done':''}">
                        <i data-lucide="${txCount>0?'check-circle-2':'circle'}"></i>
                        <span>Add First Transaction</span>
                        ${txCount===0 ? `<button onclick="ui.openModal('sale-add')">Add Sale</button>` : ''}
                    </div>
                </div>
            </div>`;
        }

        html += `
            <div class="kpi-card" style="--kpi-clr:var(--gr);--kpi-dim:var(--gr-dim)" onclick="ui.nav('sales')">
                <div class="kpi-top">
                    <div><div class="kpi-label">Sales Revenue</div><div class="kpi-value v-green">${this.fmt(s.sales)}</div></div>
                    <div class="kpi-icon"><i data-lucide="trending-up"></i></div>
                </div>
            </div>
            <div class="kpi-card" style="--kpi-clr:var(--cy);--kpi-dim:var(--cy-dim)" onclick="ui.nav('accounts')">
                <div class="kpi-top">
                    <div><div class="kpi-label">Liquid Cash</div><div class="kpi-value v-teal">${this.fmt(totalCash)}</div></div>
                    <div class="kpi-icon"><i data-lucide="wallet"></i></div>
                </div>
            </div>
            <div class="kpi-card" style="--kpi-clr:var(--rd);--kpi-dim:var(--rd-dim)" onclick="ui.nav('expenses')">
                <div class="kpi-top">
                    <div><div class="kpi-label">Total Expenses</div><div class="kpi-value v-red">${this.fmt(s.expenses + s.purchases)}</div></div>
                    <div class="kpi-icon"><i data-lucide="receipt"></i></div>
                </div>
            </div>
            <div class="kpi-card" style="--kpi-clr:var(--am);--kpi-dim:var(--am-dim)" onclick="ui.nav('reports')">
                <div class="kpi-top">
                    <div><div class="kpi-label">Net Profit</div><div class="kpi-value v-amber">${this.fmt(s.netProfit)}</div></div>
                    <div class="kpi-icon"><i data-lucide="pie-chart"></i></div>
                </div>
            </div>
        </div>

        <div class="dist-grid" style="margin-top:2rem">
            <div class="chart-card">
                <h3>Money Accounts</h3>
                <div class="account-strips">
                    ${(await Promise.all(accs.map(async a => {
                        const st = await window.db.getAccountStats(a.id);
                        return `
                        <div class="acc-strip">
                            <i data-lucide="${a.accountType==='Cash'?'banknote':'smartphone'}"></i>
                            <div class="acc-strip-info">
                                <small>${a.name}</small>
                                <span class="${st.balance>=0?'v-green':'v-red'}">${this.fmt(st.balance)}</span>
                            </div>
                        </div>`;
                    }))).join('')}
                    <button class="add-inline" onclick="ui.openModal('account-add')">+ Add Account</button>
                </div>
            </div>
            <div class="chart-card">
                <h3>Recent Activity</h3>
                <div class="activity-list">
                    ${(await Promise.all(txs.slice(-5).reverse().map(async t => {
                        const leds = await db.getLedgers();
                        const led = leds.find(l => l.id === t.ledger_id);
                        return `
                        <div class="act-item" onclick="ui.nav('${t.type}')">
                            <span class="act-type ${t.type}">${t.type[0].toUpperCase()}</span>
                            <div class="act-desc">
                                <strong>${led?.name || 'Unknown'}</strong>
                                <small>${this.fmtDate(t.date || t.timestamp.slice(0,10))}</small>
                            </div>
                            <span class="act-amt">${this.fmt(t.amount)}</span>
                        </div>`;
                    }))).join('') || '<p class="empty-hint">No transactions yet</p>'}
                </div>
            </div>
        </div>
        `;
        c.innerHTML = html;
    },

    // ── ACCOUNTS PAGE ────────────────────────────────────────────────────────
    async renderAccounts(c) {
        const accs = await window.db.getAccounts();
        c.innerHTML = `
        <div class="header-action-row">
            <p>Payment accounts (UPI/Bank/Cash) tracking actual money movement.</p>
            <button onclick="ui.openModal('account-add')" class="btn-primary">+ Add Account</button>
        </div>
        <div class="accounts-grid">
            ${(await Promise.all(accs.map(async a => {
                const s = await window.db.getAccountStats(a.id, this.filter);
                return `
                <div class="acc-full-card">
                    <div class="afc-header">
                        <div><div class="afc-name">${a.name}</div><div class="afc-type">${a.accountType} · ${a.ownerType}</div></div>
                        <div class="acc-actions">
                            <button class="icon-btn" onclick="ui.openModal('account-edit', { id: '${a.id}' })"><i data-lucide="edit-3"></i></button>
                            <button class="icon-btn v-red" onclick="ui.deleteAccount('${a.id}')"><i data-lucide="trash-2"></i></button>
                        </div>
                    </div>
                    <div class="afc-main">
                        <div class="afc-balance">${this.fmt(s.balance)}</div>
                        <div class="afc-meta">Available Cashflow</div>
                    </div>
                    <div class="afc-in-out">
                        <div class="io-item"><small>Inflow (Sales/Inv)</small><span class="v-green">+${this.fmt(s.inflow)}</span></div>
                        <div class="io-item"><small>Outflow (Purch/Exp)</small><span class="v-red">-${this.fmt(s.outflow)}</span></div>
                    </div>
                </div>`;
            }))).join('')}
        </div>`;
    },

    // ── GROUP MASTERS ────────────────────────────────────────────────────────
    async renderGroups(c) {
        const groups = await window.db.getGroups();
        c.innerHTML = `
        <div class="header-action-row">
            <p>Standard accounting groups used to categorise ledgers.</p>
            <button onclick="ui.openModal('group-add')" class="btn-primary">+ New Group</button>
        </div>
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Group Name</th><th>Nature</th><th>Internal</th><th>Notes</th><th style="width:100px">Actions</th></tr></thead>
                <tbody>
                    ${groups.map(g => `
                        <tr>
                            <td><strong>${g.name}</strong></td>
                            <td><span class="group-badge">${g.nature}</span></td>
                            <td>${g.is_internal ? 'System' : 'Custom'}</td>
                            <td class="t-dim">${g.notes || '-'}</td>
                            <td>
                                <div class="tx-actions">
                                    <button class="icon-btn" onclick="ui.openModal('group-edit', { id: '${g.id}' })"><i data-lucide="edit-3"></i></button>
                                    ${!g.is_internal ? `<button class="icon-btn v-red" onclick="ui.deleteGroup('${g.id}')"><i data-lucide="trash-2"></i></button>` : ''}
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
        lucide.createIcons();
    },

    // ── LEDGER MASTERS ───────────────────────────────────────────────────────
    async renderLedgers(c) {
        if (this.subId) { await this.renderLedgerDetail(c, this.subId); return; }
        const ledgers = await window.db.getLedgers();
        const groups = await window.db.getGroups();
        c.innerHTML = `
        <div class="header-action-row">
            <p>Accounting heads for parties, suppliers, ads, and income/expense flows.</p>
            <button onclick="ui.openModal('ledger-add')" class="btn-primary">+ Create Ledger</button>
        </div>
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Ledger Name</th><th>Group</th><th>Running Balance</th><th>Actions</th></tr></thead>
                <tbody>
                    ${(await Promise.all(ledgers.map(async l => {
                        const s = await window.db.getLedgerStats(l.id, this.filter);
                        const g = groups.find(gr => gr.id === l.group_id);
                        return `
                        <tr onclick="ui.subId='${l.id}';ui.nav('ledgers')" style="cursor:pointer">
                            <td><strong>${l.name}</strong></td>
                            <td>${g?.name || 'Unassigned'}</td>
                            <td class="${s.balance>=0?'v-green':'v-red'}">${this.fmt(s.balance)}</td>
                            <td>
                                <div class="acc-actions">
                                    <button class="icon-btn" onclick="event.stopPropagation();ui.openModal('ledger-edit', { id: '${l.id}' })">
                                        <i data-lucide="edit-3"></i>
                                    </button>
                                    <button class="icon-btn v-red" onclick="event.stopPropagation();ui.deleteLedger('${l.id}')">
                                        <i data-lucide="trash-2"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>`;
                    }))).join('')}
                </tbody>
            </table>
        </div>`;
    },

    async renderLedgerDetail(c, id) {
        const leds = await window.db.getLedgers();
        const l = leds.find(x => x.id === id);
        const s = await window.db.getLedgerStats(id, this.filter);
        const groups = await window.db.getGroups();
        const accs = await window.db.getAccounts();

        c.innerHTML = `
        <div class="back-bar"><button onclick="ui.subId=null;ui.nav('ledgers')">← Back to Ledgers</button></div>
        <div class="ledger-profile-header">
            <div class="lph-info">
                <h2>${l.name}</h2>
                <span class="group-badge">${groups.find(g=>g.id===l.group_id)?.name}</span>
            </div>
            <div class="lph-stats">
                <div class="lph-stat-card"><small>Opening</small><div>${this.fmt(s.opening)} ${s.opType}</div></div>
                <div class="lph-stat-card"><small>Debit Total</small><div class="v-red">${this.fmt(s.dr)}</div></div>
                <div class="lph-stat-card"><small>Credit Total</small><div class="v-green">${this.fmt(s.cr)}</div></div>
                <div class="lph-stat-card balance"><small>Current Balance</small><div>${this.fmt(s.balance)}</div></div>
            </div>
        </div>
        <div class="ledger-table-container">
            <h3>Transaction History</h3>
            <table class="ledger-table">
                <thead><tr><th>Date</th><th>Type</th><th>Account</th><th>Debit (Dr)</th><th>Credit (Cr)</th></tr></thead>
                <tbody>
                    ${s.entries.map(e => `
                        <tr>
                            <td>${this.fmtDate(e.date)}</td>
                            <td><span class="badge ${e.type}">${e.type}</span></td>
                            <td>${accs.find(a=>a.id===e.accountId || a.id === e.money_account_id)?.name || '-'}</td>
                            <td class="v-red">${e.type!=='sale' ? this.fmt(e.amount) : '-'}</td>
                            <td class="v-green">${e.type==='sale' ? this.fmt(e.amount) : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
    },

    // ── TRANSACTIONS ─────────────────────────────────────────────────────────
    async renderTxs(c, type) {
        const txs = (await window.db.getAllTransactions(this.filter)).filter(t => !type || t.type === type.slice(0,-1)).reverse();
        const leds = await window.db.getLedgers();
        const accs = await window.db.getAccounts();
        const label = type ? type.charAt(0).toUpperCase() + type.slice(1, -1) + 's' : 'All Transactions';
        c.innerHTML = `
        <div class="header-action-row">
            <p>Recording ${label} across all business ledgers.</p>
            ${type ? `<button onclick="ui.openModal('${type.slice(0,-1)}-add')" class="btn-action ${type.slice(0,-1)}">+ Add ${type.slice(0,-1)}</button>` : ''}
        </div>
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Date</th><th>Ledger / Party</th><th>Account</th><th>Amount</th><th>By</th><th></th></tr></thead>
                <tbody>
                    ${txs.map(t => {
                        const led = leds.find(l=>l.id===t.ledger_id);
                        const acc = accs.find(a=>a.id===t.account_id || a.id === t.money_account_id);
                        return `
                        <tr>
                            <td>${this.fmtDate(t.date || t.timestamp.slice(0,10))}</td>
                            <td><strong>${led?.name || 'Unknown'}</strong></td>
                             <td class="t-dim">${acc?.name || '-'}</td>
                            <td class="${t.type==='sale'?'v-green':t.type==='purchase'?'v-amber':'v-red'}" style="font-weight:700">
                                ${t.type==='sale'?'+':'−'}${this.fmt(t.amount)}
                            </td>
                            <td class="t-dim">${t.created_by || 'System'}</td>
                            <td>
                                <div class="tx-actions">
                                    <button class="icon-btn" onclick="ui.openModal('${t.type}-edit', { id: '${t.id}', date: '${t.date}', amount: ${t.amount}, ledger_id: '${t.ledger_id}', account_id: '${t.account_id || t.money_account_id}', notes: '${t.notes || ''}' })"><i data-lucide="edit-3"></i></button>
                                    <button class="icon-btn v-red" onclick="ui.deleteTx('${t.id}')"><i data-lucide="trash-2"></i></button>
                                </div>
                            </td>
                        </tr>`;
                    }).join('') || '<tr><td colspan="6" class="empty-hint">No transactions recorded.</td></tr>'}
                </tbody>
            </table>
        </div>`;
        lucide.createIcons();
    },

    deleteTx(id) { 
        this.openModal('delete-tx', { id });
    },

    // ── MODALS & SUBMITS ─────────────────────────────────────────────────────
    async openModal(type, d = {}) {
        const o = document.getElementById('modal-overlay'), b = document.getElementById('modal-body'), t = document.getElementById('modal-title');
        o.classList.remove('hidden'); b.innerHTML = '';
        const isAdd = type.endsWith('-add'), isEdit = type.endsWith('-edit'), base = type.split('-')[0];
        const today = new Date().toISOString().split('T')[0];

        if (['sale','purchase','expense'].includes(base)) {
            t.textContent = (isEdit?'Edit ':'New ') + base.charAt(0).toUpperCase() + base.slice(1);
            const leds = (await window.db.getLedgers()).map(l => `<option value="${l.id}" ${d.ledger_id===l.id?'selected':''}>${l.name}</option>`).join('');
            const accs = (await window.db.getAccounts()).map(a => `<option value="${a.id}" ${d.account_id===a.id?'selected':''}>${a.name}</option>`).join('');
            
            b.innerHTML = `
                <div class="form-group"><label>Date *</label><input type="date" id="tx-date" value="${d.date||today}"></div>
                <div class="form-group"><label>Amount *</label><input type="number" id="tx-amt" value="${d.amount||0}"></div>
                <div class="form-group"><label>Ledger / Party *</label><select id="tx-led">${leds}</select></div>
                <div class="form-group"><label>Payment Account *</label><select id="tx-acc">${accs}</select></div>
                <div class="form-group"><label>Notes</label><textarea id="tx-notes" placeholder="Optional notes...">${d.notes||''}</textarea></div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="ui.closeModal()">Cancel</button>
                    <button class="btn-primary ${base}" onclick="ui.submitTx('${base}', '${d.id||''}')">✓ Confirm ${base}</button>
                </div>`;
        } else if (base === 'ledger') {
            t.textContent = isEdit?'Edit Ledger':'Create Ledger';
            const ledsList = await window.db.getLedgers();
            const data = isEdit ? ledsList.find(l => l.id === d.id) : d;
            const groups = await window.db.getGroups();
            const grps = groups.map(g => `<option value="${g.id}" ${data.group_id===g.id?'selected':''}>${g.name} (${g.nature})</option>`).join('');
            b.innerHTML = `
                <div class="form-group"><label>Ledger Name *</label><input id="l-name" value="${data.name||''}"></div>
                <div class="form-group"><label>Ledger Group *</label><select id="l-grp">${grps}</select></div>
                <div class="form-row">
                    <div class="form-group"><label>Opening Balance</label><input type="number" id="l-open" value="${data.opening_balance||0}"></div>
                    <div class="form-group"><label>Type</label><select id="l-type"><option value="Dr" ${data.opening_balance_type==='Dr'?'selected':''}>Dr (Debit)</option><option value="Cr" ${data.opening_balance_type==='Cr'?'selected':''}>Cr (Credit)</option></select></div>
                </div>
                <div class="modal-actions"><button class="btn-cancel" onclick="ui.closeModal()">Cancel</button><button class="btn-primary" onclick="ui.submitLedger('${data.id||''}')">Save Ledger</button></div>`;
        } else if (base === 'account') {
            t.textContent = isEdit?'Edit Account':'New Account';
            const accsList = await window.db.getAccounts();
            const data = isEdit ? accsList.find(a => a.id === d.id) : d;
            b.innerHTML = `
                <div class="form-group"><label>Account Name</label><input id="a-name" value="${data.name||''}"></div>
                <div class="form-row">
                    <div class="form-group"><label>Account Type</label><select id="a-type"><option value="UPI" ${data.accountType==='UPI'?'selected':''}>UPI / Digital</option><option value="Bank" ${data.accountType==='Bank'?'selected':''}>Bank AC</option><option value="Cash" ${data.accountType==='Cash'?'selected':''}>Cash-in-hand</option></select></div>
                    <div class="form-group"><label>Owner</label><select id="a-owner"><option value="Business" ${data.ownerType==='Business'?'selected':''}>Business</option><option value="Partner1" ${data.ownerType==='Partner1'?'selected':''}>Partner 1</option><option value="Partner2" ${data.ownerType==='Partner2'?'selected':''}>Partner 2</option></select></div>
                </div>
                <div class="form-group"><label>Opening Bal</label><input type="number" id="a-bal" value="${data.opening_balance||0}"></div>
                <div class="modal-actions"><button class="btn-cancel" onclick="ui.closeModal()">Cancel</button><button class="btn-primary" onclick="ui.submitAccount('${data.id||''}')">Save Account</button></div>`;
        } else if (base === 'partner') {
             // Settlement Logic
             t.textContent = 'Partner Settlement';
             const p1Stats = await window.db.getPartnerStats(window.db.settings.p1Name, this.filter);
             const p2Stats = await window.db.getPartnerStats(window.db.settings.p2Name, this.filter);
             const pending = Math.abs(p1Stats.netPosition);
             const fromP = p1Stats.netPosition > 0 ? p1Stats.name : p2Stats.name;
             const toP = p1Stats.netPosition > 0 ? p2Stats.name : p1Stats.name;
             const fromId = p1Stats.netPosition > 0 ? 'partner1' : 'partner2';
             const toId = p1Stats.netPosition > 0 ? 'partner2' : 'partner1';

             const accs = await window.db.getAccounts();
             const accsHtml = accs.map(a => `<option value="${a.id}">${a.name} (${a.ownerType})</option>`).join('');
             
             b.innerHTML = `
                <div class="form-row">
                    <div class="form-group"><label>From Partner</label><input value="${fromP}" disabled></div>
                    <div class="form-group"><label>To Partner</label><input value="${toP}" disabled></div>
                </div>
                <div class="form-group"><label>Amount to Settle</label><input type="number" id="s-amt" value="${pending.toFixed(2)}"></div>
                <div class="form-row">
                    <div class="form-group"><label>From Account</label><select id="s-from-acc">${accsHtml}</select></div>
                    <div class="form-group"><label>To Account</label><select id="s-to-acc">${accsHtml}</select></div>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="ui.closeModal()">Cancel</button>
                    <button class="btn-primary" onclick="ui.submitSettlement('${fromId}', '${toId}')">Settle Now</button>
                </div>`;
        } else if (base === 'delete') {
            t.textContent = 'Confirm Deletion';
            const isMaster = d.type === 'ledger' || d.type === 'account';
            b.innerHTML = `
                <div class="empty-state">
                    <i data-lucide="alert-triangle" style="color:var(--rd)"></i>
                    <p>${isMaster ? `Are you sure you want to delete this ${d.type}? This will permanently remove the master record.` : 'Are you sure you want to delete this transaction? This action cannot be undone and financial balances will be updated.'}</p>
                </div>
                <div class="modal-actions">
                    <button class="btn-cancel" onclick="ui.closeModal()">Cancel</button>
                    <button class="btn-primary" style="background:var(--rd)" onclick="${isMaster ? `ui.confirmDeleteMaster('${d.type}', '${d.id}')` : `ui.confirmDelete('${d.id}')`}">Delete Permanently</button>
                </div>`;
            lucide.createIcons();
        }
    },

    confirmDelete(id) {
        window.db.deleteTx(id);
        this.closeModal();
        this.nav(this.page);
        ui.showToast('Transaction deleted successfully');
    },

    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },

    async submitTx(base, id) {
        const d = {
            date: document.getElementById('tx-date').value,
            amount: parseFloat(document.getElementById('tx-amt').value) || 0,
            ledger_id: document.getElementById('tx-led').value,
            account_id: document.getElementById('tx-acc').value,
            notes: document.getElementById('tx-notes').value
        };
        if (!d.amount) { this.showToast('Please enter amount', 'error'); return; }

        if (id) await window.db.updateTx(id, d);
        else {
            if (base === 'sale') await window.db.addSale(d);
            else if (base === 'purchase') await window.db.addPurchase(d);
            else await window.db.addExpense(d);
        }
        this.closeModal(); await this.nav(this.page); this.showToast('Transaction saved');
    },

    async submitLedger(id) {
        const d = {
            name: document.getElementById('l-name').value,
            group_id: document.getElementById('l-grp').value,
            opening_balance: parseFloat(document.getElementById('l-open').value) || 0,
            opening_balance_type: document.getElementById('l-type').value
        };
        await window.db.addLedger(d);
        this.closeModal(); await this.nav(this.page);
    },

    async submitAccount(id) {
        const d = {
            name: document.getElementById('a-name').value,
            accountType: document.getElementById('a-type').value,
            ownerType: document.getElementById('a-owner').value,
            opening_balance: parseFloat(document.getElementById('a-bal').value) || 0
        };
        await window.db.addAccount(d);
        this.closeModal(); await this.nav(this.page);
    },

    async confirmDeleteMaster(type, id) {
        if (type === 'ledger') await window.db.deleteLedger(id);
        else if (type === 'account') await window.db.deleteAccount(id);
        this.closeModal(); await this.nav(this.page);
        this.showToast('Record deleted');
    },

    async submitSettlement(fromId, toId) {
        const d = {
            type: 'settlement', from_partner_id: fromId, to_partner_id: toId,
            date: new Date().toISOString().split('T')[0],
            amount: parseFloat(document.getElementById('s-amt').value),
            from_account_id: document.getElementById('s-from-acc').value,
            to_account_id: document.getElementById('s-to-acc').value,
            notes: 'Cloud Settlement'
        };
        await window.db.addPartnerTx(d);
        this.closeModal(); await this.nav(this.page);
        this.showToast('Settled Successfully');
    },

    showToast(m, t='success') {
        const s = document.getElementById('toast-stack'); if(!s) return;
        const p = document.createElement('div'); p.className='toast-pill';
        p.style.cssText = `--toast-clr:${t==='error'?'var(--rd)':'var(--gr)'}`;
        p.textContent = m; s.appendChild(p);
        setTimeout(() => { p.style.opacity='0'; p.style.transform='translateX(15px)'; setTimeout(()=>p.remove(),350); }, 3000);
    },

    // ═════════════════════════════════════════════════════════════════════════
    // NEW MODULES: REPORTS, PARTNERS, SETTINGS
    // ═════════════════════════════════════════════════════════════════════════

    renderTabs(tabs, current, onSwitch) {
        return `
        <div class="tab-bar">
            ${tabs.map(t => `<button class="tab-item ${current===t.id?'active':''}" onclick="${onSwitch}('${t.id}')">${t.label}</button>`).join('')}
        </div>`;
    },

    // ── REPORTS ──────────────────────────────────────────────────────────────
    reportTab: 'profit',
    async renderReports(c) {
        const tabs = [
            { id: 'profit',    label: 'Profit Report' },
            { id: 'sales',     label: 'Sales' },
            { id: 'purchase',  label: 'Purchases' },
            { id: 'expense',   label: 'Expenses' },
            { id: 'partner',   label: 'Partner Share' },
            { id: 'account',   label: 'Account Balances' },
            { id: 'ledger',    label: 'Ledger Summary' }
        ];

        let html = `
        <div class="header-action-row">
            <p>Financial analytics and business performance reports.</p>
            <div class="action-stack">
                <button class="btn-secondary" onclick="exportData.excel()"><i data-lucide="file-spreadsheet"></i>Excel</button>
                <button class="btn-secondary" onclick="exportData.pdf()"><i data-lucide="file-text"></i>PDF</button>
            </div>
        </div>
        ${this.renderTabs(tabs, this.reportTab, 'ui.switchReport')}
        <div id="report-view"></div>`;
        
        c.innerHTML = html;
        await this.switchReport(this.reportTab);
    },

    async switchReport(tabId) {
        this.reportTab = tabId;
        const v = document.getElementById('report-view');
        if (!v) return;
        
        v.innerHTML = `<div class="spinner"></div>`;
        
        switch (tabId) {
            case 'profit':    await this.renderProfitReport(v); break;
            case 'sales':     await this.renderTransactionReport(v, 'sale'); break;
            case 'purchase':  await this.renderTransactionReport(v, 'purchase'); break;
            case 'expense':   await this.renderTransactionReport(v, 'expense'); break;
            case 'partner':   await this.renderPartnerReport(v); break;
            case 'account':   await this.renderAccountReport(v); break;
            case 'ledger':    await this.renderLedgerReport(v); break;
            default:          v.innerHTML = `<div class="empty-state">Report for ${tabId} coming soon...</div>`;
        }
        lucide.createIcons();
    },

    async renderTransactionReport(v, type) {
        const txs = (await window.db.getAllTransactions(this.filter)).filter(t => t.type === type);
        const leds = await window.db.getLedgers();
        const accs = await window.db.getAccounts();
        const total = txs.reduce((a, t) => a + t.amount, 0);
        
        let extra = '';
        if (type === 'expense') {
            const ads = txs.filter(t => (t.notes||'').toLowerCase().includes('meta') || (t.notes||'').toLowerCase().includes('ads')).reduce((a,t)=>a+t.amount,0);
            extra = `<div class="report-card" style="border-left:4px solid var(--am)"><h4>Meta Ads Spend</h4><div class="val v-amber">${this.fmt(ads)}</div></div>`;
        }

        v.innerHTML = `
        <div class="report-grid" style="margin-bottom:1.5rem">
            <div class="report-card"><h4>Total ${type.charAt(0).toUpperCase()+type.slice(1)}s</h4><div class="val">${this.fmt(total)}</div></div>
            ${extra}
        </div>
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Date</th><th>Ledger</th><th>Account</th><th>Amount</th></tr></thead>
                <tbody>
                    ${txs.map(t => {
                        const led = leds.find(l=>l.id===t.ledger_id);
                        const acc = accs.find(a=>a.id===t.account_id || a.id === t.money_account_id);
                        return `<tr><td>${this.fmtDate(t.date || t.timestamp.slice(0,10))}</td><td>${led?.name || '-'}</td><td>${acc?.name || '-'}</td><td>${this.fmt(t.amount)}</td></tr>`;
                    }).join('') || '<tr><td colspan="4" class="empty-hint">No entries found</td></tr>'}
                </tbody>
            </table>
        </div>`;
    },

    async renderAccountReport(v) {
        const accs = await window.db.getAccounts();
        v.innerHTML = `
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Account Name</th><th>Opening</th><th>Inflow</th><th>Outflow</th><th>Closing</th></tr></thead>
                <tbody>
                    ${(await Promise.all(accs.map(async a => {
                        const st = await window.db.getAccountStats(a.id, this.filter);
                        return `<tr><td><strong>${a.name}</strong></td><td>${this.fmt(a.opening_balance)}</td><td class="v-green">+${this.fmt(st.inflow)}</td><td class="v-red">-${this.fmt(st.outflow)}</td><td class="v-teal">${this.fmt(st.balance)}</td></tr>`;
                    }))).join('')}
                </tbody>
            </table>
        </div>`;
    },

    async renderLedgerReport(v) {
        const leds = await window.db.getLedgers();
        const groups = await window.db.getGroups();
        v.innerHTML = `
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Ledger Name</th><th>Group</th><th>Debit</th><th>Credit</th><th>Closing</th></tr></thead>
                <tbody>
                    ${(await Promise.all(leds.map(async l => {
                        const st = await window.db.getLedgerStats(l.id, this.filter);
                        const g = groups.find(gr => gr.id === l.group_id);
                        return `<tr><td><strong>${l.name}</strong></td><td>${g?.name || '-'}</td><td>${this.fmt(st.dr)}</td><td>${this.fmt(st.cr)}</td><td class="${st.balance>=0?'v-green':'v-red'}">${this.fmt(st.balance)}</td></tr>`;
                    }))).join('')}
                </tbody>
            </table>
        </div>`;
    },

    async renderProfitReport(v) {
        const s = await window.db.getSummary(this.filter); 
        v.innerHTML = `
        <div class="report-grid">
            <div class="report-card"><h4>Total Sales</h4><div class="val v-green">${this.fmt(s.sales)}</div></div>
            <div class="report-card"><h4>Purchases</h4><div class="val v-amber">${this.fmt(s.purchases)}</div></div>
            <div class="report-card"><h4>Expenses</h4><div class="val v-red">${this.fmt(s.expenses)}</div></div>
            <div class="report-card" style="border-left:4px solid var(--v-teal)"><h4>Net Business Profit</h4><div class="val v-teal">${this.fmt(s.netProfit)}</div></div>
        </div>`;
    },

    async renderPartnerReport(v) {
        const p1 = await window.db.getPartnerStats(window.db.settings.p1Name, this.filter);
        const p2 = await window.db.getPartnerStats(window.db.settings.p2Name, this.filter);
        v.innerHTML = `
        <div class="report-grid">
            <div class="report-card"><h4>${p1.name} Share</h4><div class="val">${this.fmt(p1.earned)}</div></div>
            <div class="report-card"><h4>${p2.name} Share</h4><div class="val">${this.fmt(p2.earned)}</div></div>
        </div>`;
    },

    async renderPartners(c) {
        const p1 = await window.db.getPartnerStats(window.db.settings.p1Name, this.filter);
        const p2 = await window.db.getPartnerStats(window.db.settings.p2Name, this.filter);
        
        let summaryText = "All partner balances are settled.";
        let summaryClass = "settled";
        let showSettleBtn = false;
        let pFrom = '', pTo = '', amt = 0;

        const net = p1.netPosition;
        if (net > 1) { 
            summaryText = `${p1.name} should pay ${this.fmt(net)} to ${p2.name}`;
            summaryClass = "warning";
            showSettleBtn = true;
            pFrom = 'partner1'; pTo = 'partner2'; amt = net;
        } else if (net < -1) {
            summaryText = `${p2.name} should pay ${this.fmt(Math.abs(net))} to ${p1.name}`;
            summaryClass = "warning";
            showSettleBtn = true;
            pFrom = 'partner2'; pTo = 'partner1'; amt = Math.abs(net);
        }

        const audit = await window.db.getSummary(this.filter);

        c.innerHTML = `
        <div class="header-action-row">
            <p>Manage partner capital, profit sharing, and business cashflow settlements.</p>
            <div class="action-stack">
                <button class="btn-primary" onclick="ui.openModal('investment-add')">+ Investment</button>
                <button class="btn-primary" onclick="ui.openModal('withdrawal-add')">+ Withdrawal</button>
            </div>
        </div>

        <div class="financial-audit-header" style="background:var(--bg-card); border:1px solid var(--br); border-radius:12px; padding:1.25rem; margin-bottom:1.5rem; display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:1rem; box-shadow:0 4px 20px rgba(0,0,0,0.05)">
            <div class="audit-item">
                <small class="t-dim" style="text-transform:uppercase; font-size:0.65rem; font-weight:700">Total Sales (+)</small>
                <div style="font-size:1.1rem; font-weight:600; color:var(--gr)">+ ${this.fmt(audit.sales)}</div>
            </div>
            <div class="audit-item">
                <small class="t-dim" style="text-transform:uppercase; font-size:0.65rem; font-weight:700">Total Purchases (-)</small>
                <div style="font-size:1.1rem; font-weight:600; color:var(--amber)">- ${this.fmt(audit.purchases)}</div>
            </div>
             <div class="audit-item">
                <small class="t-dim" style="text-transform:uppercase; font-size:0.65rem; font-weight:700">Total Expenses (-)</small>
                <div style="font-size:1.1rem; font-weight:600; color:var(--rd)">- ${this.fmt(audit.expenses)}</div>
            </div>
            <div class="audit-item" style="border-left:1px solid var(--br); padding-left:1rem">
                <small class="t-dim" style="text-transform:uppercase; font-size:0.65rem; font-weight:700">Net Business Profit</small>
                <div style="font-size:1.1rem; font-weight:700; color:var(--v-teal)">${this.fmt(audit.netProfit)}</div>
            </div>
        </div>

        <div class="settlement-summary-card ${summaryClass}" style="border: 2px solid ${summaryClass==='settled'?'var(--gr)':'var(--rd)'}; background: ${summaryClass==='settled'?'rgba(0,184,148,0.1)':'rgba(255,118,117,0.1)'}">
            <div class="ssc-icon"><i data-lucide="${summaryClass==='settled'?'check-circle':'alert-circle'}"></i></div>
            <div class="ssc-text">
                <h4 style="text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.75rem;">Partner Settlement Status</h4>
                <p style="font-size: 1.1rem; font-weight: 600;">${summaryText}</p>
            </div>
            ${showSettleBtn ? `
                <button class="btn-primary" style="width:auto; padding-inline:1.5rem; box-shadow: 0 4px 15px rgba(0,0,0,0.1)" 
                    onclick="ui.openModal('partner-settlement', { fromPartnerId:'${pFrom}', toPartnerId:'${pTo}', amount:${amt} })">
                    Settle Partner
                </button>
            ` : ''}
        </div>

        <div class="partner-grid">
            ${[p1, p2].map(p => {
                const sp = p.netPosition;
                const statusClass = sp > 1 ? 'v-red' : (sp < -1 ? 'v-green' : 'v-teal');
                
                return `
                <div class="partner-card">
                    <div class="pc-header">
                        <div style="display:flex; flex-direction:column">
                            <h2>${p.name}</h2>
                            <small class="t-dim">ID: ${p.partnerId}</small>
                        </div>
                        <span class="status-pill ${statusClass}">${sp > 1 ? `Pay ${this.fmt(sp)}` : (sp < -1 ? `Receive ${this.fmt(Math.abs(sp))}` : 'Settled')}</span>
                    </div>
                    <div class="partner-stat-row"><label>Profit Ratio</label><span>${p.sharePct}%</span></div>
                    <div class="partner-stat-row"><label>Profit Share (for selected period)</label><span>${this.fmt(p.earned)}</span></div>
                    <div class="partner-stat-row"><label>Current Cash Held</label><span>${this.fmt(p.moneyHeld)}</span></div>
                    <div class="partner-stat-row"><label>Lifetime Capital Invested</label><span>${this.fmt(p.invested)}</span></div>
                    <div class="partner-stat-row"><label>Lifetime Drawings</label><span>${this.fmt(p.drawings)}</span></div>
                    <div class="partner-stat-row"><label>Lifetime Settlements (Net)</label><span>${this.fmt(p.recv - p.paid)}</span></div>
                    
                    <div class="partner-stat-row settlement-pos" style="margin-top:1rem; padding-top:1rem; border-top:1px dashed var(--br)">
                        <label>Final Net Position</label>
                        <strong class="${statusClass}">${sp > 1 ? 'Payable' : (sp < -1 ? 'Receivable' : 'Settled')}</strong>
                    </div>
                </div>`;
            }).join('')}
        </div>

        <div class="report-section" style="margin-top:3rem">
            <h3 style="margin-bottom:1rem">Settlement History</h3>
            ${await this.renderSettlementHistory()}
        </div>`;
        lucide.createIcons();
    },

    async renderSettlementHistory() {
        const sets = (await window.db.getPartnerTransactions()).filter(t => t.type === 'settlement').reverse();
        const accs = await window.db.getAccounts();
        if (sets.length === 0) return `<p class="empty-hint">No settlements recorded yet.</p>`;

        return `
        <div class="ledger-table-container">
            <table class="ledger-table">
                <thead><tr><th>Date</th><th>From (Payer)</th><th>To (Receiver)</th><th>Amount</th><th>Through Account</th><th>Notes</th><th>By</th></tr></thead>
                <tbody>
                    ${sets.map(t => {
                        const fromP = t.from_partner_id === 'partner1' ? window.db.settings.p1Name : window.db.settings.p2Name;
                        const toP = t.to_partner_id === 'partner1' ? window.db.settings.p1Name : window.db.settings.p2Name;
                        const acc = accs.find(a => a.id === t.from_account_id || a.id === t.account_id);
                        return `
                        <tr>
                            <td>${this.fmtDate(t.date)}</td>
                            <td><strong>${fromP}</strong></td>
                            <td><strong>${toP}</strong></td>
                            <td>${this.fmt(t.amount)}</td>
                            <td class="t-dim">${acc?.name || '-'}</td>
                            <td class="t-dim">${t.notes || '-'}</td>
                            <td class="t-dim" style="font-size:0.75rem">${t.created_by || 'System'}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>`;
    },

    // ── SETTINGS ─────────────────────────────────────────────────────────────
    settingsTab: 'business',
    async renderSettings(c) {
        const tabs = [
            { id: 'business', label: 'Business' },
            { id: 'partner',  label: 'Partners' },
            { id: 'theme',    label: 'Theme' },
            { id: 'backup',   label: 'Security' }
        ];
        
        c.innerHTML = `
        <div class="header-action-row"><p>Configure portal behavior, branding, and data security.</p></div>
        ${this.renderTabs(tabs, this.settingsTab, 'ui.switchSettings')}
        <div id="settings-view"></div>`;
        
        await this.switchSettings(this.settingsTab);
    },

    async switchSettings(tabId) {
        this.settingsTab = tabId;
        const v = document.getElementById('settings-view');
        if (!v) return;

        const s = window.db.settings;
        switch (tabId) {
            case 'business':
                v.innerHTML = `
                <div class="settings-section">
                    <h3>General Branding</h3>
                    <div class="form-group"><label>Currency Symbol</label><input value="${s.currency}" id="s-curr"></div>
                    <div class="form-group"><label>Business Name</label><input value="${s.businessName}" id="s-bname"></div>
                    <button class="btn-primary" onclick="ui.saveSettings()">Save Changes</button>
                </div>`;
                break;
            case 'partner':
                v.innerHTML = `
                <div class="settings-section">
                    <h3>Partner Setup</h3>
                    <div class="form-row">
                        <div class="form-group"><label>Partner 1 Name</label><input value="${s.p1Name}" id="s-p1n"></div>
                        <div class="form-group"><label>Partner 2 Name</label><input value="${s.p2Name}" id="s-p2n"></div>
                    </div>
                    <div class="form-group"><label>Profit Sharing % (Partner 1 / Partner 2)</label>
                        <div style="display:flex; align-items:center; gap:1rem">
                            <input type="number" value="${s.profitSharing}" id="s-p1s" style="width:100px">
                            <span>/</span>
                            <div class="val" id="s-p2s-display">${100-s.profitSharing}%</div>
                        </div>
                    </div>
                    <button class="btn-primary" onclick="ui.saveSettings()">Save Partners</button>
                </div>`;
                break;
            case 'backup':
                v.innerHTML = `
                <div class="settings-section">
                    <h3>Cloud Protection</h3>
                    <p class="t-dim" style="margin-bottom:1.5rem">Your data is secured by Supabase Row-Level Security. Only authenticated partners can access or modify records.</p>
                    <div class="modal-actions" style="justify-content:flex-start">
                        <button class="btn-primary" onclick="auth.logout()">Secure Logout</button>
                    </div>
                </div>`;
                break;
            default:
                v.innerHTML = `<div class="empty-state">Coming soon...</div>`;
        }
        lucide.createIcons();
    },

    async saveSettings() {
        const d = {
            currency: document.getElementById('s-curr')?.value || window.db.settings.currency,
            p1Name: document.getElementById('s-p1n')?.value || window.db.settings.p1Name,
            p2Name: document.getElementById('s-p2n')?.value || window.db.settings.p2Name,
            businessName: document.getElementById('s-bname')?.value || window.db.settings.businessName,
            profitSharing: parseInt(document.getElementById('s-p1s')?.value) || 50
        };
        await window.db.saveSettings(d);
        ui.showToast('Settings saved successfully');
        await ui.nav('settings');
    }
};

// ─── EXPORT LOGIC ────────────────────────────────────────────────────────────
const exportData = {
    async excel() {
        const txs = await window.db.getAllTransactions();
        const ws = XLSX.utils.json_to_sheet(txs);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, `Portal_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
        ui.showToast('Excel Exported');
    },
    pdf() {
        window.print();
        ui.showToast('Use Print to Save as PDF');
    }
};

window.ui.init();
console.log('Portal V5 Architecture Ready.');
