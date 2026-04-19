/**
 * Partner Portal — Application Logic v7.5
 * TOTAL RESTORATION: Defensive Rendering & Router Hardening
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

        // 2. Navigation Binding (Delegated & Global)
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

        // 3. Wait for DB with Safety + Failsafe
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
        
        console.log(`[UI] Navigating to: ${pageId}`);
        this.page = pageId;
        window.location.hash = pageId;
        
        // Update Sidebars (All)
        document.querySelectorAll('[data-page]').forEach(el => el.classList.toggle('active', el.dataset.page === pageId));
        
        const c = document.getElementById('page-container');
        if (!c) return;
        
        // Start Loading State
        c.innerHTML = `<div class="loading-state" id="global-spinner"><div class="spinner"></div><p>Syncing Cloud Data...</p></div>`;

        const titles = { 
            dashboard: 'Business Insights', sales: 'Sales Book', purchases: 'Purchase Book',
            expenses: 'Expense Book', ledger: 'General Ledger', accounts: 'Money Accounts',
            groups: 'Ledger Groups', ledgers: 'Accounting Ledgers', reports: 'Financial Reports',
            partners: 'Partner Settlement', settings: 'Settings'
        };
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = titles[pageId] || pageId;

        // Failsafe Spinner Cleanup
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
                case 'accounts':  await this.renderAccounts(c); break;
                case 'partners':  await this.renderPartners(c); break;
                case 'groups':    await this.renderGroups(c); break;
                case 'ledgers':   await this.renderLedgers(c); break;
                case 'reports':   await this.renderReports(c); break;
                case 'settings':  this.renderSettings(c); break;
                default: c.innerHTML = `<div class="empty-state"><h3>Wait a moment...</h3><p>Page "${pageId}" is loading.</p></div>`;
            }
        } catch (e) { 
            console.error('[UI] Nav Crash:', e);
            c.innerHTML = `<div class="empty-state"><h3>Navigation Failure</h3><p>${e.message}</p></div>`;
        } finally {
            clearTimeout(spinnerTimeout);
        }
        
        try { lucide.createIcons(); } catch(e) {}
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
                c.innerHTML = `<div class="welcome-banner"><h2>Welcome to Partner Portal</h2><p>Start by adding your first money account.</p><button onclick="ui.openModal('account-add')" class="btn-primary">+ Add Account</button></div>`;
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
                    <div class="kpi-card" data-page="reports"><h3>Net Profit</h3><div class="v-amber">${this.fmt(s.netProfit)}</div></div>
                </div>
                <div class="dist-grid" style="margin-top:2rem">
                    <div class="chart-card"><h3>Recent Transactions</h3>
                        <div class="activity-list">
                            ${txs.slice(0,8).map(t => `<div class="act-item"><span>${t.type}</span><strong>${this.fmt(t.amount)}</strong><em style="font-size:0.7rem;color:var(--t3)">${this.fmtDate(t.date)}</em></div>`).join('')}
                            ${txs.length===0?'<p class="empty-hint">No recent activity.</p>':''}
                        </div>
                    </div>
                </div>`;
        } catch(e) { c.innerHTML = `<div class="empty-state">Dashboard failed: ${e.message}</div>`; }
    },

    // ── PARTNERS ─────────────────────────────────────────────────────────────
    async renderPartners(c) {
        try {
            const p1 = await window.db.getPartnerStats(1, this.filter) || { name: 'Partner 1', sharePct: 50, position: 0 };
            const p2 = await window.db.getPartnerStats(2, this.filter) || { name: 'Partner 2', sharePct: 50, position: 0 };

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
                            <div class="p-header"><h3>${p.name || 'Partner'}</h3><span>${p.sharePct || 50}% Share</span></div>
                            <div class="p-body">
                                <div class="p-row"><span>Earned</span><strong>${this.fmt(p.earned)}</strong></div>
                                <div class="p-row"><span>Investments</span><strong>${this.fmt(p.invested)}</strong></div>
                                <div class="p-row"><span>Drawings</span><strong class="v-red">${this.fmt(p.drawings)}</strong></div>
                                <div class="p-row highlight"><span>Money Held</span><strong>${this.fmt(p.moneyHeld)}</strong></div>
                                <div class="p-divider"></div>
                                <div class="p-row"><span>Final Position</span><strong class="${p.position>0?'v-red':'v-green'}">${p.position > 0 ? 'Owes' : 'Receivable'} ${this.fmt(Math.abs(p.position))}</strong></div>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
        } catch(e) { c.innerHTML = `<div class="empty-state">Partner logic failure: ${e.message}</div>`; }
    },

    // ── MASTERS ──────────────────────────────────────────────────────────────
    async renderAccounts(c) {
        try {
            const accs = await window.db.getAccounts() || [];
            c.innerHTML = `
            <div class="header-action-row"><p>Physical Money Accounts (UPI, Bank, Cash)</p><button onclick="ui.openModal('account-add')" class="btn-primary" style="width:auto">+ Add Account</button></div>
            <div class="accounts-grid">
                ${(await Promise.all(accs.map(async a => {
                    const s = await window.db.getAccountStats(a.id, this.filter);
                    return `<div class="acc-full-card"><div class="afc-name">${a.name}</div><div class="afc-balance">${this.fmt(s?.balance || 0)}</div><div class="afc-tag">${a.owner_type}</div></div>`;
                }))).join('') || '<div class="empty-state">No money accounts configured.</div>'}
            </div>`;
        } catch(e) { c.innerHTML = `Error loading accounts: ${e.message}`; }
    },

    async renderLedgers(c) {
        try {
            const leds = await window.db.getLedgers() || [];
            const grps = await window.db.getGroups() || [];
            c.innerHTML = `<div class="header-action-row"><p>Accounting Heads</p><button onclick="ui.openModal('ledger-add')" class="btn-primary" style="width:auto">+ New Ledger</button></div>
            <div class="ledger-table-container"><table><thead><tr><th>Name head</th><th>Group</th><th>Nature</th></tr></thead><tbody>
            ${leds.map(l => {
                const g = grps.find(gr => gr.id === l.group_id);
                return `<tr><td>${l.name}</td><td>${g?.name || '—'}</td><td>${g?.nature || '—'}</td></tr>`;
            }).join('')}
            ${leds.length===0?'<tr><td colspan="3" class="empty-hint">No accounting ledgers found.</td></tr>':''}
            </tbody></table></div>`;
        } catch(e) { c.innerHTML = `Error loading ledgers: ${e.message}`; }
    },

    async renderGroups(c) {
        const grps = await window.db.getGroups() || [];
        c.innerHTML = `<div class="ledger-table-container"><table><thead><tr><th>Group Name</th><th>Nature</th></tr></thead><tbody>
        ${grps.map(g => `<tr><td>${g.name}</td><td>${g.nature}</td></tr>`).join('')}
        </tbody></table></div>`;
    },

    // ── TRANSACTIONS ─────────────────────────────────────────────────────────
    async renderTxs(c, type) {
        try {
            const txsAll = await window.db.getAllTransactions(this.filter) || [];
            const txs = txsAll.filter(t => t.type === type);
            c.innerHTML = `<div class="header-action-row"><button onclick="ui.openModal('${type}-add')" class="btn-primary" style="width:auto">+ Record ${type.toUpperCase()}</button></div>
            <div class="ledger-table-container"><table><thead><tr><th>Date</th><th>Amount</th><th>Category</th><th>Notes</th><th style="text-align:right">Action</th></tr></thead><tbody>
            ${txs.map(t=>`<tr><td>${this.fmtDate(t.date)}</td><td>${this.fmt(t.amount)}</td><td>${t.ledger_id||'—'}</td><td>${t.notes||''}</td><td style="text-align:right"><button class="btn-icon" style="color:var(--rd)" onclick="ui.deleteTx('${t.id}')">✕</button></td></tr>`).join('')}
            ${txs.length===0?'<tr><td colspan="5" class="empty-hint">No transactions for this period.</td></tr>':''}
            </tbody></table></div>`;
        } catch(e) { c.innerHTML = `Error rendering transactions: ${e.message}`; }
    },

    // ── MODALS ───────────────────────────────────────────────────────────────
    async openModal(type) {
        const o = document.getElementById('modal-overlay'), b = document.getElementById('modal-body'), t = document.getElementById('modal-title');
        if (!o || !b || !t) return;
        
        o.classList.remove('hidden'); b.innerHTML = '<div class="spinner"></div>';
        
        const base = type.split('-')[0];
        const leds = await window.db.getCompatibleLedgers(base) || [];
        const accs = await window.db.getAccounts() || [];

        if (['sale', 'purchase', 'expense'].includes(base)) {
            t.textContent = 'Record New ' + base.toUpperCase();
            b.innerHTML = `
                <div class="form-group"><label>Transaction Date</label><input type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Total Amount</label><input type="number" id="f-amt" step="0.01"></div>
                <div class="form-group"><label>Select Category (Ledger)</label><select id="f-led">${leds.map(l=>`<option value="${l.id}">${l.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Money Source / Target</label><select id="f-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Reference / Notes</label><textarea id="f-notes" placeholder="Enter transaction details..."></textarea></div>
                <div class="modal-actions"><button onclick="ui.submitTx('${base}')" class="btn-primary">Confirm Entry</button><button onclick="ui.closeModal()" class="btn-cancel">Dismiss</button></div>`;
        } else if (base === 'settlement') {
            t.textContent = 'Partner Transfer';
            b.innerHTML = `
                <div class="form-group"><label>Amount</label><input type="number" id="f-amt"></div>
                <div class="form-group"><label>From</label><select id="f-from-p"><option value="partner1">${window.db.settings?.p1Name||'P1'}</option><option value="partner2">${window.db.settings?.p2Name||'P2'}</option></select></div>
                <div class="form-group"><label>To</label><select id="f-to-p"><option value="partner2">${window.db.settings?.p2Name||'P2'}</option><option value="partner1">${window.db.settings?.p1Name||'P1'}</option></select></div>
                <div class="form-group"><label>From Account</label><select id="f-from-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>To Account</label><select id="f-to-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="modal-actions"><button onclick="ui.submitSettlement()" class="btn-primary">Confirm</button><button onclick="ui.closeModal()" class="btn-cancel">Cancel</button></div>`;
        } else if (base === 'account') {
            t.textContent = 'Setup Money Account';
            b.innerHTML = `
                <div class="form-group"><label>Account Name</label><input id="f-name"></div>
                <div class="form-group"><label>Opening Balance</label><input type="number" id="f-bal" value="0"></div>
                <div class="form-group"><label>Account Type</label><select id="f-own"><option value="Business">Business</option><option value="Partner1">${window.db.settings?.p1Name||'P1'}</option><option value="Partner2">${window.db.settings?.p2Name||'P2'}</option></select></div>
                <div class="modal-actions"><button onclick="ui.submitAccount()" class="btn-primary">Add Account</button></div>`;
        } else if (base === 'ledger') {
            t.textContent = 'Create Master Ledger';
            const categories = await window.db.getGroups() || [];
            b.innerHTML = `<div class="form-group"><label>Ledger Name</label><input id="f-name"></div>
                <div class="form-group"><label>Accounting Group</label><select id="f-grp">${categories.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select></div>
                <div class="modal-actions"><button onclick="ui.submitLedger()" class="btn-primary">Save Ledger</button></div>`;
        }
    },

    async submitTx(type) {
        await window.db.addTx(type, { 
            date: document.getElementById('f-date').value, amount: document.getElementById('f-amt').value, 
            ledger_id: document.getElementById('f-led').value, account_id: document.getElementById('f-acc').value,
            notes: document.getElementById('f-notes').value
        });
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

    async submitAccount() {
        await window.db.addAccount({ name: document.getElementById('f-name').value, opening_balance: document.getElementById('f-bal').value, owner_type: document.getElementById('f-own').value });
        this.closeModal(); this.nav(this.page);
    },

    async submitLedger() {
        await window.db.addLedger({ name: document.getElementById('f-name').value, group_id: document.getElementById('f-grp').value });
        this.closeModal(); this.nav(this.page);
    },

    async renderReports(c) {
        const s = await window.db.getSummary(this.filter);
        c.innerHTML = `<div class="report-card"><h3>Profit & Loss Statement</h3>
            <div class="p-row"><span>Total Sales</span><strong class="v-green">${this.fmt(s.sales)}</strong></div>
            <div class="p-row"><span>Total Costs</span><strong class="v-red">${this.fmt(s.expenses + s.purchases)}</strong></div>
            <div class="p-divider"></div>
            <div class="p-row highlight" style="font-size:1.2rem"><span>Net Business Profit</span><strong class="v-amber">${this.fmt(s.netProfit)}</strong></div>
        </div>`;
    },

    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); },
    async deleteTx(id) { if(confirm('Delete permanently?')) { await window.db.deleteTx(id); this.nav(this.page); } },
    renderSettings(c) { c.innerHTML = `<div class="header-action-row"><h3>Settings</h3></div><button class="btn-primary" style="background:var(--rd);width:auto;margin-top:1rem" onclick="window.auth.logout()">Secure Logout</button>`; }
};

if (window.auth.checkSession()) ui.init();
