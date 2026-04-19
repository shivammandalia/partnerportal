/**
 * Partner Portal — Application Logic v7.0
 * Deep Restore: Sales, Partners, & Reports
 */

var db = window.db;

window.auth = {
    handleLogin(e) { if(e) e.preventDefault(); this.success('Administrator'); },
    success(user) {
        localStorage.setItem('auth_session', JSON.stringify({ user, ts: Date.now() }));
        document.getElementById('login-overlay').classList.add('hidden');
        document.getElementById('main-content').classList.remove('hidden');
        ui.init();
    },
    checkSession() {
        const s = JSON.parse(localStorage.getItem('auth_session'));
        if (s?.user) {
            document.getElementById('login-overlay').classList.add('hidden');
            document.getElementById('main-content').classList.remove('hidden');
            document.getElementById('current-user-tag').textContent = s.user;
            return true;
        }
        return false;
    },
    logout() { localStorage.removeItem('auth_session'); window.location.reload(); }
};

window.ui = {
    page: 'dashboard',
    filter: {},
    isLoaded: false,

    async init() {
        if (this.isLoaded) return;
        const r = window.db.getDatePreset('this_month');
        this.filter = { from: r.from, to: r.to, preset: 'this_month' };

        window.addEventListener('hashchange', () => this.nav(window.location.hash.slice(1) || 'dashboard'));
        
        let retry = 0;
        while (!window.db.state.isLoaded && retry < 10) { await new Promise(r => setTimeout(r, 500)); retry++; }

        await this.nav(window.location.hash.slice(1) || 'dashboard');
        this.renderFilterBar();
        this.isLoaded = true;
    },

    async nav(pageId) {
        if (!localStorage.getItem('auth_session')) return;
        this.page = pageId;
        window.location.hash = pageId;
        
        document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === pageId));
        const c = document.getElementById('page-container');
        c.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Syncing Cloud Data...</p></div>`;

        try {
            switch (pageId) {
                case 'dashboard': await this.renderDashboard(c); break;
                case 'sales':     await this.renderTxs(c, 'sale'); break;
                case 'purchases': await this.renderTxs(c, 'purchase'); break;
                case 'expenses':  await this.renderTxs(c, 'expense'); break;
                case 'accounts':  await this.renderAccounts(c); break;
                case 'partners':  await this.renderPartners(c); break;
                case 'ledgers':   await this.renderLedgers(c); break;
                case 'reports':   await this.renderReports(c); break;
                case 'settings':  this.renderSettings(c); break;
            }
        } catch (e) { console.error(e); }
        lucide.createIcons();
    },

    fmt(n) { return (window.db.settings?.currency || '₹') + (parseFloat(n)||0).toLocaleString('en-IN',{minimumFractionDigits:2}); },
    fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—'; },

    renderFilterBar() {
        const root = document.getElementById('filter-bar-root');
        if (!root) return;
        const presets = ['today', 'yesterday', 'this_month', 'all'];
        root.innerHTML = `<div class="filter-bar">
            <div class="fb-presets">${presets.map(p => `<button class="fb-btn ${this.filter.preset===p?'active':''}" onclick="ui.setFilterPreset('${p}')">${p.replace('_',' ')}</button>`).join('')}</div>
        </div>`;
    },

    setFilterPreset(p) { const r = window.db.getDatePreset(p); this.filter = { from: r.from, to: r.to, preset: p }; this.renderFilterBar(); this.nav(this.page); },

    // ── DASHBOARD ────────────────────────────────────────────────────────────
    async renderDashboard(c) {
        const s = await window.db.getSummary(this.filter);
        const accs = await window.db.getAccounts();
        const txs = await window.db.getAllTransactions(this.filter);
        
        if (txs.length === 0 && accs.length === 0) {
            c.innerHTML = `<div class="welcome-banner"><h2>Quick Setup</h2><p>Add your first account to begin.</p><button onclick="ui.openModal('account-add')" class="btn-primary">+ Add Account</button></div>`;
            return;
        }

        let totalCash = 0;
        for(const a of accs) { const st = await window.db.getAccountStats(a.id, this.filter); totalCash += st.balance; }

        c.innerHTML = `
            <div class="kpi-grid">
                <div class="kpi-card" onclick="ui.nav('sales')"><h3>Sales</h3><div class="v-green">${this.fmt(s.sales)}</div></div>
                <div class="kpi-card" onclick="ui.nav('accounts')"><h3>Liquid Cash</h3><div class="v-teal">${this.fmt(totalCash)}</div></div>
                <div class="kpi-card" onclick="ui.nav('reports')"><h3>Profit</h3><div class="v-amber">${this.fmt(s.netProfit)}</div></div>
            </div>
            <div class="dist-grid" style="margin-top:2rem">
                <div class="chart-card"><h3>Recent Activity</h3>
                    ${txs.slice(0,5).map(t => `<div class="act-item"><span>${t.type}</span><strong>${this.fmt(t.amount)}</strong></div>`).join('')}
                </div>
            </div>`;
    },

    // ── PARTNERS ─────────────────────────────────────────────────────────────
    async renderPartners(c) {
        const p1 = await window.db.getPartnerStats(1, this.filter);
        const p2 = await window.db.getPartnerStats(2, this.filter);

        let summaryText = "Settlement is balanced.";
        if (Math.abs(p1.position) > 1) {
            const payer = p1.position > 0 ? p1.name : p2.name;
            const receiver = p1.position > 0 ? p2.name : p1.name;
            summaryText = `<span class="pay-alert">${payer} should pay ${receiver} ${this.fmt(Math.abs(p1.position))}</span>`;
        }

        c.innerHTML = `
            <div class="settlement-summary">${summaryText} <button class="btn-primary" onclick="ui.openModal('settlement-add')">Settle Now</button></div>
            <div class="partners-grid">
                ${[p1, p2].map(p => `
                    <div class="partner-card">
                        <div class="p-header"><h3>${p.name}</h3><span>${p.sharePct}% Share</span></div>
                        <div class="p-body">
                            <div class="p-row"><span>Earned Share</span><strong>${this.fmt(p.earned)}</strong></div>
                            <div class="p-row"><span>Investment</span><strong>${this.fmt(p.invested)}</strong></div>
                            <div class="p-row"><span>Drawings</span><strong class="v-red">${this.fmt(p.drawings)}</strong></div>
                            <div class="p-row highlight"><span>Money Held</span><strong>${this.fmt(p.moneyHeld)}</strong></div>
                            <div class="p-divider"></div>
                            <div class="p-row"><span>Position</span><strong class="${p.position>0?'v-red':'v-green'}">${p.position > 0 ? 'Owes' : 'Receivable'} ${this.fmt(Math.abs(p.position))}</strong></div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    },

    // ── MODALS & FORMS ───────────────────────────────────────────────────────
    async openModal(type) {
        const o = document.getElementById('modal-overlay'), b = document.getElementById('modal-body'), t = document.getElementById('modal-title');
        o.classList.remove('hidden'); b.innerHTML = '<div class="spinner"></div>';
        
        const base = type.split('-')[0];
        const leds = await window.db.getCompatibleLedgers(base);
        const accs = await window.db.getAccounts();

        if (base === 'sale' || base === 'purchase' || base === 'expense') {
            t.textContent = 'Record ' + base.toUpperCase();
            b.innerHTML = `
                <div class="form-group"><label>Date</label><input type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Amount</label><input type="number" id="f-amt" step="0.01"></div>
                <div class="form-group"><label>Ledger</label><select id="f-led">${leds.map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Money Account</label><select id="f-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Notes</label><textarea id="f-notes"></textarea></div>
                <div class="modal-actions"><button onclick="ui.submitTx('${base}')" class="btn-primary">Submit Entry</button></div>`;
        } else if (base === 'settlement') {
            t.textContent = 'Partner Settlement';
            b.innerHTML = `
                <div class="form-group"><label>Amount</label><input type="number" id="f-amt"></div>
                <div class="form-group"><label>From Partner</label><select id="f-from-p"><option value="partner1">${window.db.settings.p1Name}</option><option value="partner2">${window.db.settings.p2Name}</option></select></div>
                <div class="form-group"><label>To Partner</label><select id="f-to-p"><option value="partner2">${window.db.settings.p2Name}</option><option value="partner1">${window.db.settings.p1Name}</option></select></div>
                <div class="form-group"><label>From Account</label><select id="f-from-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>To Account</label><select id="f-to-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="modal-actions"><button onclick="ui.submitSettlement()" class="btn-primary">Record Settlement</button></div>`;
        } else if (base === 'account') {
            t.textContent = 'Add Money Account';
            b.innerHTML = `<div class="form-group"><label>Name</label><input id="f-name"></div><div class="form-group"><label>Initial Balance</label><input type="number" id="f-bal" value="0"></div><div class="form-group"><label>Owner</label><select id="f-own"><option value="Business">Business</option><option value="Partner1">${window.db.settings.p1Name}</option><option value="Partner2">${window.db.settings.p2Name}</option></select></div><div class="modal-actions"><button onclick="ui.submitAccount()" class="btn-primary">Save</button></div>`;
        }
    },

    async submitTx(type) {
        const d = { 
            date: document.getElementById('f-date').value, 
            amount: document.getElementById('f-amt').value, 
            ledger_id: document.getElementById('f-led').value, 
            account_id: document.getElementById('f-acc').value,
            notes: document.getElementById('f-notes').value
        };
        await window.db.addTx(type, d);
        document.getElementById('modal-overlay').classList.add('hidden');
        this.nav(this.page);
    },

    async submitSettlement() {
        const d = {
            amount: document.getElementById('f-amt').value,
            from_partner_id: document.getElementById('f-from-p').value,
            to_partner_id: document.getElementById('f-to-p').value,
            from_account_id: document.getElementById('f-from-acc').value,
            to_account_id: document.getElementById('f-to-acc').value,
            date: new Date().toISOString().split('T')[0]
        };
        await window.db.addTx('settlement', d);
        document.getElementById('modal-overlay').classList.add('hidden');
        this.nav('partners');
    },

    async submitAccount() {
        await window.db.addAccount({ name: document.getElementById('f-name').value, opening_balance: document.getElementById('f-bal').value, owner_type: document.getElementById('f-own').value });
        document.getElementById('modal-overlay').classList.add('hidden');
        this.nav(this.page);
    },

    async renderTxs(c, type) {
        const txs = (await window.db.getAllTransactions(this.filter)).filter(t => t.type === type);
        c.innerHTML = `<div class="header-action-row"><button onclick="ui.openModal('${type}-add')" class="btn-primary">+ Record ${type.toUpperCase()}</button></div>
        <div class="table-container"><table><thead><tr><th>Date</th><th>Amount</th><th>Notes</th><th>Actions</th></tr></thead><tbody>
        ${txs.map(t=>`<tr><td>${this.fmtDate(t.date)}</td><td>${this.fmt(t.amount)}</td><td>${t.notes||''}</td><td><button onclick="ui.deleteTx('${t.id}')">Delete</button></td></tr>`).join('')}
        </tbody></table></div>`;
    },

    async renderReports(c) {
        const s = await window.db.getSummary(this.filter);
        c.innerHTML = `<div class="report-card"><h3>Profit & Loss Statement</h3>
            <div class="p-row"><span>Total Sales</span><strong class="v-green">${this.fmt(s.sales)}</strong></div>
            <div class="p-row"><span>Operating Expenses</span><strong class="v-red">${this.fmt(s.expenses + s.purchases)}</strong></div>
            <div class="p-divider"></div>
            <div class="p-row highlight"><span>Net Profit</span><strong class="v-amber">${this.fmt(s.netProfit)}</strong></div>
        </div>`;
    },

    async deleteTx(id) { await window.db.deleteTx(id); this.nav(this.page); },
    renderSettings(c) { c.innerHTML = `<button class="btn-primary" onclick="window.auth.logout()">Secure Logout</button>`; }
};

if (window.auth.checkSession()) ui.init();
