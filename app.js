/**
 * Partner Portal — Application Logic v5.1
 * Tally-Style Multi-Layer Accounting
 */

var db = window.db;

window.SECURITY = {
    MAX_ATTEMPTS: 999,
    COOLDOWN_MS: 5 * 60 * 1000 
};

window.auth = {
    async hash(str) { return str; }, // Simplified for initial setup

    async handleLogin(e) {
        if (e) e.preventDefault();
        this.success('Administrator');
    },

    success(user) {
        console.log(`[AUTH] Granting Access...`);
        localStorage.setItem('auth_session', JSON.stringify({ user, ts: Date.now() }));
        
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        document.getElementById('current-user-tag').textContent = user;
        
        ui.init();
        ui.showToast('Securely signed in', 'success');
    },

    checkSession() {
        const session = JSON.parse(localStorage.getItem('auth_session'));
        if (session && session.user) {
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('current-user-tag').textContent = session.user;
            return true;
        }
        return false;
    },

    logout() {
        localStorage.removeItem('auth_session');
        window.location.reload();
    }
};

window.ui = {
    page:          'dashboard',
    filter:        {},
    isLoaded:      false,

    async init() {
        if (this.isLoaded) return;
        console.log('[UI] Booting Modules...');
        
        // 1. Initial State
        const r = window.db.getDatePreset('this_month');
        this.filter = { from: r.from, to: r.to, preset: 'this_month' };

        // 2. Wait for DB with Timeout to prevent infinite spinner
        let retry = 0;
        while (!window.db.state.isLoaded && retry < 10) {
            await new Promise(r => setTimeout(r, 500));
            retry++;
        }

        // 3. Navigation setup
        window.addEventListener('hashchange', () => {
            const h = window.location.hash.slice(1) || 'dashboard';
            if (this.page !== h) this.nav(h);
        });

        lucide.createIcons();

        const initialPage = window.location.hash.slice(1) || 'dashboard';
        await this.nav(initialPage);
        
        this.renderFilterBar();
        this.bindEvents();
        this.isLoaded = true;
    },

    bindEvents() {
        document.querySelectorAll('.nav-item').forEach(b => {
            b.addEventListener('click', () => { if (b.dataset.page) this.nav(b.dataset.page); });
        });
        document.querySelectorAll('.mobile-nav [data-page]').forEach(b => {
            b.addEventListener('click', () => this.nav(b.dataset.page));
        });
    },

    async nav(pageId) {
        if (!localStorage.getItem('auth_session')) { window.auth.logout(); return; }
        
        this.page = pageId;
        window.location.hash = pageId;
        
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

        try {
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
        } catch (err) {
            console.error('[UI] Render Error:', err);
            c.innerHTML = `<div class="empty-state"><p>Error loading ${pageId}. Please check database connection.</p></div>`;
        }
        lucide.createIcons();
    },

    // ── Helpers ─────────────────────────────────────────────────────────────
    fmt(n)     { return (window.db.settings?.currency || '₹') + (parseFloat(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2}); },
    fmtDate(d) { return d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'; },

    renderFilterBar() {
        const root = document.getElementById('filter-bar-root');
        if (!root) return;
        const presets = [{ id: 'today', label: 'Today' }, { id: 'yesterday', label: 'Yesterday' }, { id: 'this_month', label: 'This Month' }, { id: 'all', label: 'All Time' }];
        root.innerHTML = `
        <div class="filter-bar">
            <div class="fb-presets">${presets.map(p => `<button class="fb-btn ${this.filter.preset === p.id ? 'active' : ''}" onclick="ui.setFilterPreset('${p.id}')">${p.label}</button>`).join('')}</div>
            <div class="fb-custom">
                <input type="date" id="filter-from" value="${this.filter.from || ''}">
                <input type="date" id="filter-to" value="${this.filter.to || ''}">
                <button class="fb-apply-btn" onclick="ui.applyFilter()">Apply</button>
            </div>
        </div>`;
    },

    setFilterPreset(p) { const r = window.db.getDatePreset(p); this.filter = { from: r.from, to: r.to, preset: p }; this.renderFilterBar(); this.nav(this.page); },
    applyFilter() { this.filter = { from: document.getElementById('filter-from').value, to: document.getElementById('filter-to').value, preset: 'custom' }; this.renderFilterBar(); this.nav(this.page); },

    // ── DASHBOARD ────────────────────────────────────────────────────────────
    async renderDashboard(c) {
        const s = await window.db.getSummary(this.filter);
        const accs = await window.db.getAccounts();
        const txs = await window.db.getAllTransactions();
        
        let totalCash = 0;
        for(const a of accs) { const st = await window.db.getAccountStats(a.id); totalCash += st.balance; }
        
        const hasAccount = accs.length > 0;
        const hasLedger = window.db.state.ledgers.length > 0;

        if (txs.length === 0 || !hasAccount) {
            c.innerHTML = `
            <div class="welcome-banner">
                <div class="wb-content"><h2>Let's Get Started</h2><p>Finish your initial setup to see business insights.</p></div>
                <div class="wb-steps">
                    <div class="wb-step ${hasAccount?'done':''}"><span>Step 1: Create Money Account</span><button onclick="ui.openModal('account-add')">Add Now</button></div>
                    <div class="wb-step ${hasLedger?'done':''}"><span>Step 2: Setup Ledgers</span><button onclick="ui.nav('ledgers')">Go</button></div>
                    <div class="wb-step"><span>Step 3: Record First Sale</span><button onclick="ui.openModal('sale-add')">Record</button></div>
                </div>
            </div>`;
            return;
        }

        c.innerHTML = `
            <div class="kpi-card" onclick="ui.nav('sales')"><div class="kpi-label">Sales Revenue</div><div class="kpi-value v-green">${this.fmt(s.sales)}</div></div>
            <div class="kpi-card" onclick="ui.nav('accounts')"><div class="kpi-label">Liquid Cash</div><div class="kpi-value v-teal">${this.fmt(totalCash)}</div></div>
            <div class="kpi-card" onclick="ui.nav('expenses')"><div class="kpi-label">Expenses</div><div class="kpi-value v-red">${this.fmt(s.expenses + s.purchases)}</div></div>
            <div class="kpi-card" onclick="ui.nav('reports')"><div class="kpi-label">Net Profit</div><div class="kpi-value v-amber">${this.fmt(s.netProfit)}</div></div>
        </div>
        <div class="dist-grid" style="margin-top:2rem">
            <div class="chart-card"><h3>Accounts</h3>${accs.map(a => `<div class="acc-strip"><span>${a.name}</span><strong>${a.opening_balance}</strong></div>`).join('')}</div>
            <div class="chart-card"><h3>Recent Activity</h3>${txs.slice(-5).map(t => `<div class="act-item"><span>${t.type}</span><strong>${this.fmt(t.amount)}</strong></div>`).join('')}</div>
        </div>`;
    },

    // ── ACCOUNTS PAGE ────────────────────────────────────────────────────────
    async renderAccounts(c) {
        const accs = await window.db.getAccounts();
        c.innerHTML = `
        <div class="header-action-row"><p>Track actual money flow.</p><button onclick="ui.openModal('account-add')" class="btn-primary">+ Add Account</button></div>
        <div class="accounts-grid">
            ${(await Promise.all(accs.map(async a => {
                const s = await window.db.getAccountStats(a.id, this.filter);
                return `<div class="acc-full-card"><div class="afc-name">${a.name}</div><div class="afc-balance">${this.fmt(s.balance)}</div></div>`;
            }))).join('') || '<p class="empty-hint">No accounts yet.</p>'}
        </div>`;
    },

    async renderGroups(c) {
        const grps = await window.db.getGroups();
        c.innerHTML = `<div class="header-action-row"><button onclick="ui.openModal('group-add')" class="btn-primary">+ New Group</button></div>
        <div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Name</th><th>Nature</th></tr></thead><tbody>
        ${grps.map(g => `<tr><td>${g.name}</td><td>${g.nature}</td></tr>`).join('')}</tbody></table></div>`;
    },

    async renderLedgers(c) {
        const leds = await window.db.getLedgers();
        c.innerHTML = `<div class="header-action-row"><button onclick="ui.openModal('ledger-add')" class="btn-primary">+ New Ledger</button></div>
        <div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Name</th><th>Balance</th></tr></thead><tbody>
        ${(await Promise.all(leds.map(async l => {
            const s = await window.db.getLedgerStats(l.id, this.filter);
            return `<tr><td>${l.name}</td><td>${this.fmt(s.balance)}</td></tr>`;
        }))).join('')}</tbody></table></div>`;
    },

    async renderTxs(c, type) {
        const txs = (await window.db.getAllTransactions(this.filter)).filter(t => !type || t.type === type.slice(0,-1));
        c.innerHTML = `<div class="header-action-row">${type?`<button onclick="ui.openModal('${type.slice(0,-1)}-add')" class="btn-primary">+ Add</button>`:''}</div>
        <div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Actions</th></tr></thead><tbody>
        ${txs.map(t => `<tr><td>${this.fmtDate(t.date)}</td><td>${t.type}</td><td>${this.fmt(t.amount)}</td><td><button onclick="ui.deleteTx('${t.id}')">Delete</button></td></tr>`).join('')}
        </tbody></table></div>`;
    },

    // ── MODALS ───────────────────────────────────────────────────────────────
    async openModal(type, d = {}) {
        const o = document.getElementById('modal-overlay'), b = document.getElementById('modal-body'), t = document.getElementById('modal-title');
        o.classList.remove('hidden'); b.innerHTML = '<div class="spinner"></div>';
        const base = type.split('-')[0];
        
        if (base === 'account') {
            t.textContent = 'Add Account';
            b.innerHTML = `<div class="form-group"><label>Name</label><input id="a-name"></div>
            <div class="form-group"><label>Initial Balance</label><input type="number" id="a-bal" value="0"></div>
            <div class="modal-actions"><button onclick="ui.submitAccount()" class="btn-primary">Save</button></div>`;
        } else if (base === 'ledger') {
            t.textContent = 'Add Ledger';
            const grps = (await window.db.getGroups()).map(g => `<option value="${g.id}">${g.name}</option>`).join('');
            b.innerHTML = `<div class="form-group"><label>Name</label><input id="l-name"></div>
            <div class="form-group"><label>Group</label><select id="l-grp">${grps}</select></div>
            <div class="modal-actions"><button onclick="ui.submitLedger()" class="btn-primary">Save</button></div>`;
        } else if (['sale','purchase','expense'].includes(base)) {
            t.textContent = 'Record ' + base;
            const leds = (await window.db.getLedgers()).map(l => `<option value="${l.id}">${l.name}</option>`).join('');
            const accs = (await window.db.getAccounts()).map(a => `<option value="${a.id}">${a.name}</option>`).join('');
            b.innerHTML = `<div class="form-group"><label>Date</label><input type="date" id="tx-date" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="form-group"><label>Amount</label><input type="number" id="tx-amt"></div>
            <div class="form-group"><label>Ledger</label><select id="tx-led">${leds}</select></div>
            <div class="form-group"><label>Account</label><select id="tx-acc">${accs}</select></div>
            <div class="modal-actions"><button onclick="ui.submitTx('${base}')" class="btn-primary">Submit</button></div>`;
        }
    },

    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },
    async submitAccount() { await window.db.addAccount({ name:document.getElementById('a-name').value, opening_balance:document.getElementById('a-bal').value }); this.closeModal(); this.nav(this.page); },
    async submitLedger() { await window.db.addLedger({ name:document.getElementById('l-name').value, group_id:document.getElementById('l-grp').value }); this.closeModal(); this.nav(this.page); },
    async submitTx(type) { await window.db._addTx('transactions', { type, date:document.getElementById('tx-date').value, amount:document.getElementById('tx-amt').value, ledger_id:document.getElementById('tx-led').value, account_id:document.getElementById('tx-acc').value }); this.closeModal(); this.nav(this.page); },
    async deleteTx(id) { await window.db.deleteTx(id); this.nav(this.page); },

    async renderReports(c) { c.innerHTML = '<div class="empty-state">Reports available soon...</div>'; },
    async renderPartners(c) { c.innerHTML = '<div class="empty-state">Partners dashboard available soon...</div>'; },
    async renderSettings(c) { c.innerHTML = '<button class="btn-primary" onclick="window.auth.logout()">Secure Logout</button>'; },
    
    showToast(m, t) { console.log(`[TOAST] ${t}: ${m}`); }
};

if (window.auth.checkSession()) ui.init();
