/**
 * Partner Portal — Application Logic v8.0
 * PROFESSIONAL ACCOUNTING OVERHAUL: Strict Logic & Smart Forms
 */

var db = window.db;

window.auth = {
    handleLogin(e) { if(e) e.preventDefault(); this.success('Administrator'); },
    success(user) {
        localStorage.setItem('auth_session', JSON.stringify({ user, ts: Date.now() }));
        const overlay = document.getElementById('login-overlay');
        const main = document.getElementById('main-content');
        if (overlay) overlay.classList.add('hidden');
        if (main) main.classList.remove('hidden');
        ui.init();
    },
    checkSession() {
        const s = JSON.parse(localStorage.getItem('auth_session'));
        if (s?.user) {
            const overlay = document.getElementById('login-overlay');
            const main = document.getElementById('main-content');
            if (overlay) overlay.classList.add('hidden');
            if (main) main.classList.remove('hidden');
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
        
        // 1. Initial State
        const r = window.db.getDatePreset('this_month');
        this.filter = { from: r.from, to: r.to, preset: 'this_month' };

        // 2. Navigation Binding
        document.body.onclick = (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn) {
                e.preventDefault();
                e.stopPropagation();
                this.nav(btn.dataset.page);
            }
        };

        window.onhashchange = () => {
            const h = window.location.hash.slice(1) || 'dashboard';
            if (this.page !== h) this.nav(h);
        };

        // 3. Wait for DB
        let retry = 0;
        while (!window.db.state.isLoaded && retry < 15) { 
            await new Promise(r => setTimeout(r, 400)); 
            retry++; 
        }

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
        if (!c) return;
        
        c.innerHTML = `<div class="loading-state" id="global-spinner"><div class="spinner"></div><p>Syncing Cloud Data...</p></div>`;

        const titles = { 
            dashboard: 'Business Insights', sales: 'Sales Book', purchases: 'Purchase Book',
            expenses: 'Expense Book', ledger: 'General Ledger', accounts: 'Money Accounts',
            groups: 'Ledger Groups', ledgers: 'Accounting Ledgers', reports: 'Financial Reports',
            partners: 'Partner Settlement', settings: 'Settings'
        };
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = titles[pageId] || pageId;

        const spinnerTimeout = setTimeout(() => {
            const s = document.getElementById('global-spinner');
            if (s) s.innerHTML = '<p class="empty-hint">Sync timed out. Retrying rendered data...</p>';
        }, 5000);

        try {
            switch (pageId) {
                case 'dashboard': await this.renderDashboard(c); break;
                case 'sales':     await this.renderTxs(c, 'sale'); break;
                case 'purchases': await this.renderTxs(c, 'purchase'); break;
                case 'expenses':  await this.renderTxs(c, 'expense'); break;
                case 'ledger':    await this.renderAllTxs(c); break;
                case 'accounts':  await this.renderAccounts(c); break;
                case 'partners':  await this.renderPartners(c); break;
                case 'groups':    await this.renderGroups(c); break;
                case 'ledgers':   await this.renderLedgers(c); break;
                case 'reports':   await this.renderReports(c); break;
                case 'settings':  this.renderSettings(c); break;
                default: c.innerHTML = `<div class="empty-state"><h3>Wait a moment...</h3><p>Page "${pageId}" is loading.</p></div>`;
            }
        } catch (e) { 
            c.innerHTML = `<div class="empty-state"><h3>Navigation Failure</h3><p>${e.message}</p></div>`;
        } finally {
            clearTimeout(spinnerTimeout);
        }
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
        try {
            const s = await window.db.getSummary(this.filter);
            const accs = await window.db.getAccounts() || [];
            const txs = await window.db.getAllTransactions(this.filter) || [];
            
            if (txs.length === 0 && accs.length === 0) {
                c.innerHTML = `<div class="welcome-banner"><h2>Welcome to Partner Portal</h2><p>Default accounting ledgers have been created. Start by adding your first bank account.</p><button onclick="ui.openModal('account-add')" class="btn-primary">+ Add Account</button></div>`;
                return;
            }

            let totalCash = 0;
            for(const a of accs) { 
                const st = await window.db.getAccountStats(a.id, this.filter); 
                totalCash += (st?.balance || 0); 
            }

            c.innerHTML = `
                <div class="kpi-grid">
                    <div class="kpi-card" data-page="sales"><h3>Sales</h3><div class="v-green">${this.fmt(s.sales)}</div></div>
                    <div class="kpi-card" data-page="accounts"><h3>Liquid Cash</h3><div class="v-teal">${this.fmt(totalCash)}</div></div>
                    <div class="kpi-card" data-page="reports"><h3>Profit</h3><div class="v-amber">${this.fmt(s.netProfit)}</div></div>
                </div>
                <div class="dist-grid" style="margin-top:2rem">
                    <div class="chart-card"><h3>Transactions</h3>
                        <div class="activity-list">
                            ${txs.slice(0,8).map(t => `<div class="act-item"><span>${t.type}</span><strong>${this.fmt(t.amount)}</strong><em style="font-size:0.7rem;color:var(--t3)">${this.fmtDate(t.date)}</em></div>`).join('')}
                            ${txs.length===0?'<p class="empty-hint">No activity.</p>':''}
                        </div>
                    </div>
                </div>`;
        } catch(e) { c.innerHTML = `<div class="empty-state">Dashboard error: ${e.message}</div>`; }
    },

    // ── PARTNERS ─────────────────────────────────────────────────────────────
    async renderPartners(c) {
        try {
            const p1 = await window.db.getPartnerStats(1, this.filter);
            const p2 = await window.db.getPartnerStats(2, this.filter);
            let summaryText = "Settlement is balanced.";
            if (Math.abs(p1.position) > 1) {
                const payer = p1.position > 0 ? p1.name : p2.name;
                const receiver = p1.position > 0 ? p2.name : p1.name;
                summaryText = `<span class="pay-alert"><strong>${payer}</strong> should pay <strong>${receiver}</strong> ${this.fmt(Math.abs(p1.position))}</span>`;
            }
            c.innerHTML = `
                <div class="settlement-summary">${summaryText} <button class="btn-primary" style="width:auto;padding:0.5rem 1rem" onclick="ui.openModal('settlement-add')">Record Transfer</button></div>
                <div class="partners-grid">
                    ${[p1, p2].map(p => `
                        <div class="partner-card">
                            <div class="p-header"><h3>${p.name}</h3><span>${p.sharePct}% Share</span></div>
                            <div class="p-body">
                                <div class="p-row"><span>Earned</span><strong>${this.fmt(p.earned)}</strong></div>
                                <div class="p-row"><span>Investments</span><strong>${this.fmt(p.invested)}</strong></div>
                                <div class="p-row"><span>Drawings</span><strong class="v-red">${this.fmt(p.drawings)}</strong></div>
                                <div class="p-row highlight"><span>Money Held</span><strong>${this.fmt(p.moneyHeld)}</strong></div>
                                <div class="p-divider"></div>
                                <div class="p-row"><span>Position</span><strong class="${p.position>0?'v-red':'v-green'}">${p.position > 0 ? 'Owes' : 'Receivable'} ${this.fmt(Math.abs(p.position))}</strong></div>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
        } catch(e) { c.innerHTML = `<div class="empty-state">Partner error: ${e.message}</div>`; }
    },

    // ── MASTERS ──────────────────────────────────────────────────────────────
    async renderAccounts(c) {
        try {
            const accs = await window.db.getAccounts();
            c.innerHTML = `
            <div class="header-action-row"><p>Cash & Bank Accounts</p><button onclick="ui.openModal('account-add')" class="btn-primary" style="width:auto">+ Add Account</button></div>
            <div class="accounts-grid">
                ${(await Promise.all(accs.map(async a => {
                    const s = await window.db.getAccountStats(a.id, this.filter);
                    return `<div class="acc-full-card"><div class="afc-name">${a.name}</div><div class="afc-balance">${this.fmt(s?.balance || 0)}</div><div class="afc-tag">${a.owner_type}</div></div>`;
                }))).join('') || '<div class="empty-state">No money accounts.</div>'}
            </div>`;
        } catch(e) { c.innerHTML = `Error: ${e.message}`; }
    },

    async renderLedgers(c) {
        const leds = await window.db.getLedgers();
        const grps = await window.db.getGroups();
        c.innerHTML = `<div class="header-action-row"><p>Accounting Heads</p><button onclick="ui.openModal('ledger-add')" class="btn-primary" style="width:auto">+ New Ledger</button></div>
        <div class="ledger-table-container"><table><thead><tr><th>Ledger Name</th><th>Group</th></tr></thead><tbody>
        ${leds.map(l => {
            const g = grps.find(gr => gr.id === l.group_id);
            return `<tr><td>${l.name}</td><td>${g?.name || '—'}</td></tr>`;
        }).join('')}
        </tbody></table></div>`;
    },

    async renderGroups(c) {
        const grps = await window.db.getGroups();
        c.innerHTML = `<div class="ledger-table-container"><table><thead><tr><th>Group Name</th><th>Nature</th></tr></thead><tbody>
        ${grps.map(g => `<tr><td>${g.name}</td><td>${g.nature}</td></tr>`).join('')}
        </tbody></table></div>`;
    },

    // ── TRANSACTIONS ─────────────────────────────────────────────────────────
    async renderTxs(c, type) {
        const txsAll = await window.db.getAllTransactions(this.filter);
        const leds = await window.db.getLedgers();
        const txs = txsAll.filter(t => t.type === type);
        c.innerHTML = `<div class="header-action-row"><button onclick="ui.openModal('${type}-add')" class="btn-primary" style="width:auto">+ Record ${type.toUpperCase()}</button></div>
        <div class="ledger-table-container"><table><thead><tr><th>Date</th><th>Amount</th><th>Ledger</th><th>Notes</th><th style="text-align:right">Action</th></tr></thead><tbody>
        ${txs.map(t=>{
            const l = leds.find(led => led.id == t.ledger_id);
            return `<tr><td>${this.fmtDate(t.date)}</td><td>${this.fmt(t.amount)}</td><td>${l?.name||'—'}</td><td>${t.notes||''}</td><td style="text-align:right"><button class="btn-icon" style="color:var(--rd)" onclick="ui.deleteTx('${t.id}')">✕</button></td></tr>`;
        }).join('')}
        ${txs.length===0?'<tr><td colspan="5" class="empty-hint">No transactions.</td></tr>':''}
        </tbody></table></div>`;
    },

    async renderAllTxs(c) {
        const txs = await window.db.getAllTransactions(this.filter);
        const leds = await window.db.getLedgers();
        c.innerHTML = `<div class="ledger-table-container"><table><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Ledger</th></tr></thead><tbody>
        ${txs.map(t=>{
            const l = leds.find(led => led.id == t.ledger_id);
            return `<tr><td>${this.fmtDate(t.date)}</td><td style="text-transform:capitalize">${t.type}</td><td>${this.fmt(t.amount)}</td><td>${l?.name||'—'}</td></tr>`;
        }).join('')}
        </tbody></table></div>`;
    },

    // ── MODALS ───────────────────────────────────────────────────────────────
    async openModal(type) {
        const o = document.getElementById('modal-overlay'), b = document.getElementById('modal-body'), t = document.getElementById('modal-title');
        if (!o || !b || !t) return;
        o.classList.remove('hidden'); b.innerHTML = '<div class="spinner"></div>';
        
        const base = type.split('-')[0];
        const leds = await window.db.getCompatibleLedgers(base);
        const accs = await window.db.getAccounts();

        if (['sale', 'purchase', 'expense'].includes(base)) {
            const defaultMap = { sale: 'Sales Account', purchase: 'Purchase Account', expense: 'Meta Ads' };
            const defLed = leds.find(l => l.name === defaultMap[base]) || leds[0];
            
            t.textContent = 'New ' + base.toUpperCase();
            b.innerHTML = `
                <div class="form-group"><label>Date</label><input type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Amount</label><input type="number" id="f-amt" step="0.01"></div>
                <div class="form-group"><label>Money Account</label><select id="f-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Ledger (Category)</label><select id="f-led">${leds.map(l=>`<option value="${l.id}" ${l.id===defLed?.id?'selected':''}>${l.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Notes</label><textarea id="f-notes"></textarea></div>
                <div class="modal-actions"><button onclick="ui.submitTx('${base}')" class="btn-primary">Save Entry</button></div>`;
        } else if (base === 'account') {
            t.textContent = 'Add Account';
            b.innerHTML = `<div class="form-group"><label>Name</label><input id="f-name"></div>
                <div class="form-group"><label>Opening Balance</label><input type="number" id="f-bal" value="0"></div>
                <div class="form-group"><label>Owner</label><select id="f-own"><option value="Business">Business</option><option value="Partner1">${window.db.settings.p1Name}</option><option value="Partner2">${window.db.settings.p2Name}</option></select></div>
                <div class="modal-actions"><button onclick="ui.submitAccount()" class="btn-primary">Create</button></div>`;
        } else if (base === 'ledger') {
            t.textContent = 'Add Ledger';
            const grps = await window.db.getGroups();
            b.innerHTML = `<div class="form-group"><label>Ledger Name</label><input id="f-name"></div>
                <div class="form-group"><label>Group</label><select id="f-grp">${grps.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select></div>
                <div class="modal-actions"><button onclick="ui.submitLedger()" class="btn-primary">Create</button></div>`;
        } else if (base === 'settlement') {
            t.textContent = 'Partner Settlement';
            b.innerHTML = `<div class="form-group"><label>Amount</label><input type="number" id="f-amt"></div>
                <div class="form-group"><label>From Partner</label><select id="f-from-p"><option value="partner1">${window.db.settings.p1Name}</option><option value="partner2">${window.db.settings.p2Name}</option></select></div>
                <div class="form-group"><label>To Partner</label><select id="f-to-p"><option value="partner2">${window.db.settings.p2Name}</option><option value="partner1">${window.db.settings.p1Name}</option></select></div>
                <div class="form-group"><label>From Account</label><select id="f-from-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>To Account</label><select id="f-to-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="modal-actions"><button onclick="ui.submitSettlement()" class="btn-primary">Record Settlement</button></div>`;
        }
    },

    async submitTx(type) {
        const amt = document.getElementById('f-amt').value;
        const led = document.getElementById('f-led').value;
        const acc = document.getElementById('f-acc').value;
        if (!amt || !led || !acc) return alert('Please fill all required fields.');
        await window.db.addTx(type, { 
            date: document.getElementById('f-date').value, amount: amt, 
            ledger_id: led, account_id: acc, notes: document.getElementById('f-notes').value
        });
        this.closeModal(); this.nav(this.page);
    },

    async submitAccount() {
        await window.db.addAccount({ name: document.getElementById('f-name').value, opening_balance: document.getElementById('f-bal').value, owner_type: document.getElementById('f-own').value });
        this.closeModal(); this.nav(this.page);
    },

    async submitLedger() {
        await window.db.addLedger({ name: document.getElementById('f-name').value, group_id: document.getElementById('f-grp').value });
        this.closeModal(); this.nav(this.page);
    },

    async submitSettlement() {
        await window.db.addTx('settlement', {
            amount: document.getElementById('f-amt').value, from_partner_id: document.getElementById('f-from-p').value,
            to_partner_id: document.getElementById('f-to-p').value, from_account_id: document.getElementById('f-from-acc').value,
            to_account_id: document.getElementById('f-to-acc').value, date: new Date().toISOString().split('T')[0]
        });
        this.closeModal(); this.nav('partners');
    },

    renderReports(c) {
        window.db.getSummary(this.filter).then(s => {
            c.innerHTML = `<div class="report-card"><h3>Profit & Loss</h3>
                <div class="p-row"><span>Sales</span><strong class="v-green">${this.fmt(s.sales)}</strong></div>
                <div class="p-row"><span>Direct Costs</span><strong class="v-red">${this.fmt(s.purchases)}</strong></div>
                <div class="p-row"><span>Operating Expenses</span><strong class="v-red">${this.fmt(s.expenses)}</strong></div>
                <div class="p-divider"></div>
                <div class="p-row highlight"><span>Net Profit</span><strong class="v-amber">${this.fmt(s.netProfit)}</strong></div>
            </div>`;
        });
    },

    renderSettings(c) {
        const s = window.db.settings;
        c.innerHTML = `<div class="settings-container"><div class="report-card"><h3>Config</h3>
            <div class="form-group"><label>Biz Name</label><input id="s-biz" value="${s.businessName}"></div>
            <div class="form-group"><label>P1 Name</label><input id="s-p1" value="${s.p1Name}"></div>
            <div class="form-group"><label>P2 Name</label><input id="s-p2" value="${s.p2Name}"></div>
            <div class="form-group"><label>P1 Share %</label><input type="number" id="s-pct" value="${s.profitSharing}"></div>
            <button onclick="ui.updateConfig()" class="btn-primary">Save</button>
        </div><button class="btn-cancel" style="margin-top:2rem" onclick="window.auth.logout()">Logout</button></div>`;
    },

    async updateConfig() {
        const s = { businessName: document.getElementById('s-biz').value, p1Name: document.getElementById('s-p1').value, p2Name: document.getElementById('s-p2').value, profitSharing: parseFloat(document.getElementById('s-pct').value), currency: '₹' };
        await window.db.saveSettings(s);
        location.reload();
    },

    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },
    async deleteTx(id) { if(confirm('Delete?')) { await window.db.deleteTx(id); this.nav(this.page); } }
};

if (window.auth.checkSession()) ui.init();
