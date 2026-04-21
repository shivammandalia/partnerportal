/**
 * Partner Portal — Application Logic v11.2
 * MASTER REBUILD: Atomic Initialization & Snake_Case Alignment
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
            const userTag = document.getElementById('current-user-tag');
            if (userTag) userTag.textContent = s.user;
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
        document.body.onclick = (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn) { e.preventDefault(); e.stopPropagation(); this.nav(btn.dataset.page); }
        };
        window.onhashchange = () => {
            const h = window.location.hash.slice(1) || 'dashboard';
            if (this.page !== h) this.nav(h);
        };
        let retry = 0;
        while (!window.db.state.isLoaded && retry < 25) { await new Promise(r => setTimeout(r, 400)); retry++; }
        if (!window.db.state.isLoaded) return;
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
        c.innerHTML = `<div class="loading-state" id="global-spinner"><div class="spinner"></div><p>Syncing Enterprise Data...</p></div>`;
        const titles = { 
            dashboard: 'Business Insights', sales: 'Sales Book', purchases: 'Purchase Book',
            expenses: 'Expense Book', ledger: 'General Ledger', accounts: 'Money Accounts',
            groups: 'Ledger Groups', ledgers: 'Accounting Ledgers', reports: 'Financial Reports',
            partners: 'Partner Settlement', settings: 'Settings'
        };
        const titleEl = document.getElementById('page-title');
        if (titleEl) titleEl.textContent = titles[pageId] || pageId;
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
            if (window.lucide) { setTimeout(() => window.lucide.createIcons(), 10); }
        } catch (e) { c.innerHTML = `<div class="empty-state"><h3>Navigation Failure</h3><p>${e.message}</p></div>`; }
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

    async renderDashboard(c) {
        try {
            const s = await window.db.getSummary(this.filter);
            const accs = await window.db.getAccounts() || [];
            const txs = await window.db.getAllTransactions(this.filter) || [];
            let totalCash = 0;
            for(const a of accs) { const st = await window.db.getAccountStats(a.id, this.filter); totalCash += (st?.balance || 0); }
            c.innerHTML = `
                <div class="kpi-grid stats-grid">
                    <div class="kpi-card" data-page="sales" style="--kpi-clr:var(--gr); --kpi-dim:var(--gr-dim)">
                        <div class="kpi-top">
                            <div class="kpi-icon"><i data-lucide="trending-up"></i></div>
                            <div class="kpi-action" style="font-size:0.7rem; color:var(--t3); cursor:pointer;">View Book →</div>
                        </div>
                        <div class="kpi-label">Total Sales</div>
                        <div class="kpi-value v-green">${this.fmt(s.sales)}</div>
                    </div>
                    <div class="kpi-card" data-page="accounts" style="--kpi-clr:var(--cy); --kpi-dim:var(--cy-dim)">
                        <div class="kpi-top">
                            <div class="kpi-icon"><i data-lucide="wallet"></i></div>
                            <div class="kpi-action" style="font-size:0.7rem; color:var(--t3); cursor:pointer;">Accounts →</div>
                        </div>
                        <div class="kpi-label">Liquid Balance</div>
                        <div class="kpi-value v-teal">${this.fmt(totalCash)}</div>
                    </div>
                    <div class="kpi-card" data-page="reports" style="--kpi-clr:var(--am); --kpi-dim:var(--am-dim)">
                        <div class="kpi-top">
                            <div class="kpi-icon"><i data-lucide="line-chart"></i></div>
                            <div class="kpi-action" style="font-size:0.7rem; color:var(--t3); cursor:pointer;">Reports →</div>
                        </div>
                        <div class="kpi-label">Net Profit</div>
                        <div class="kpi-value v-amber">${this.fmt(s.netProfit)}</div>
                    </div>
                </div>
                <div class="dist-grid" style="margin-top:2rem">
                    <div class="chart-card"><h3>Recent Activity</h3>
                        <div class="activity-list">
                            ${txs.slice(0,8).map(t => `<div class="act-item"><span>${t.type}</span><strong>${this.fmt(t.amount)}</strong><em style="font-size:0.75rem;color:var(--t3)">${this.fmtDate(t.date)}</em></div>`).join('')}
                            ${txs.length===0?'<p class="empty-hint">No transactions recorded yet.</p>':''}
                        </div>
                    </div>
                </div>`;
        } catch(e) { c.innerHTML = `<div class="empty-state">Dashboard error: ${e.message}</div>`; }
    },

    async renderPartners(c) {
        try {
            const p1 = await window.db.getPartnerStats(1, this.filter);
            const p2 = await window.db.getPartnerStats(2, this.filter);
            const sum = await window.db.getSummary(this.filter);
            const activeTab = this.partnerTab || 'summary';
            
            let summaryText = "No settlement pending.";
            let bannerClass = "balanced";
            if (Math.abs(p1.position) > 0.01) {
                const payer = p1.position > 0 ? p1.name : p2.name;
                const receiver = p1.position > 0 ? p2.name : p1.name;
                bannerClass = p1.position > 0 ? "pay-alert" : "receive-alert";
                summaryText = `<div class="settlement-alert"><span class="${bannerClass}"><strong>${payer}</strong> should pay <strong>${receiver}</strong> <strong>${this.fmt(Math.abs(p1.position))}</strong></span></div>`;
            } else {
                summaryText = `<div class="settlement-alert"><span style="color:var(--t2)">No settlement pending</span></div>`;
            }

            const tabs = [
                { id: 'summary', name: 'Summary' },
                { id: 'settlements', name: 'Settlement History' },
                { id: 'capital', name: 'Capital History' },
                { id: 'drawings', name: 'Drawings' },
                { id: 'ledger', name: 'Profit Ledger' }
            ];

            const navHTML = `<div class="partner-section-header">
                <div class="settlement-banner">
                    ${summaryText}
                    <div style="display:flex; gap:0.5rem">
                        <button class="btn-primary" onclick="ui.openModal('settlement-add')">Record Settlement</button>
                        <button class="btn-primary" style="background:var(--surf2);color:var(--t);border:1px solid var(--br)" onclick="ui.exportPartnerCSV(ui.partnerTab)">Export CSV</button>
                    </div>
                </div>
                <div class="pt-tabs">
                    ${tabs.map(t => `<button class="pt-tab ${activeTab === t.id ? 'active' : ''}" onclick="ui.partnerTab='${t.id}'; ui.nav('partners')">${t.name}</button>`).join('')}
                </div>
            </div>`;

            let contentHTML = '';

            if (activeTab === 'summary') {
                contentHTML = `<div class="partners-premium-grid">
                    ${[p1, p2].map((p) => `
                        <div class="partner-finance-card">
                            <div class="pfc-header"><h3>${p.name}</h3><span class="share-badge">${p.sharePct}% Profit Ratio</span></div>
                            <div class="pfc-body">
                                <div class="pfc-row"><span>Profit Earned</span><strong>${this.fmt(p.earned)}</strong></div>
                                <div class="pfc-row"><span>Capital Added</span><strong>${this.fmt(p.invested)}</strong></div>
                                <div class="pfc-row"><span>Drawings Taken</span><strong class="v-red">${this.fmt(p.drawings)}</strong></div>
                                <div class="pfc-row" style="color:#fff"><span>Cash Held</span><strong>${this.fmt(p.moneyHeld)}</strong></div>
                                <div class="pfc-divider"></div>
                                <div class="pfc-position"><span style="color:${p.position>0?'var(--rd)':'var(--gr)'}">${p.position > 0 ? 'Payable' : 'Receivable'}</span><strong style="color:${p.position>0?'var(--rd)':'var(--gr)'}">${this.fmt(Math.abs(p.position))}</strong></div>
                            </div>
                            <div class="pfc-actions">
                                <button class="btn-primary" style="background:var(--surf2);color:var(--t)" onclick="ui.openModal('investment-add')">Add Capital</button>
                                <button class="btn-primary" style="background:var(--surf2);color:var(--t)" onclick="ui.openModal('withdrawal-add')">Add Drawing</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="calc-breakdown">
                    <div class="calc-header" onclick="this.nextElementSibling.classList.toggle('open')"><span>How this is calculated</span><i data-lucide="chevron-down"></i></div>
                    <div class="calc-body">
                        <div class="cb-section">
                            <div class="cb-title">1. Business Profit</div>
                            <div class="cb-line"><span>Total Sales</span><strong>${this.fmt(sum.sales)}</strong></div>
                            <div class="cb-line"><span>Total Purchases</span><strong class="v-red">${this.fmt(sum.purchases)}</strong></div>
                            <div class="cb-line"><span>Total Expenses</span><strong class="v-red">${this.fmt(sum.expenses)}</strong></div>
                            <div class="cb-total"><span>Net Profit</span><strong>${this.fmt(sum.netProfit)}</strong></div>
                        </div>
                        <div class="cb-section">
                            <div class="cb-title">2. Partner Value Generation</div>
                            <div class="cb-line"><span>${p1.name} Share (${p1.sharePct}%)</span><strong>${this.fmt(p1.earned)}</strong></div>
                            <div class="cb-line"><span>${p2.name} Share (${p2.sharePct}%)</span><strong>${this.fmt(p2.earned)}</strong></div>
                        </div>
                        <div class="cb-section">
                            <div class="cb-title">3. Pending Settlement Formula</div>
                            <div class="cb-line"><span>Formula</span><strong>Cash Held - Capital + Drawings - Profit Share = Payable</strong></div>
                        </div>
                    </div>
                </div>`;
            } else {
                const txs = await window.db.getAllTransactions(this.filter);
                const pTxs = txs.filter(t => t.type === (activeTab === 'settlements' ? 'settlement' : (activeTab === 'capital' ? 'investment' : 'withdrawal')));
                
                if (activeTab === 'ledger') {
                    contentHTML = `<div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Date Range</th><th style="text-align:right">Total Profit</th><th style="text-align:right">${p1.name} Share</th><th style="text-align:right">${p2.name} Share</th></tr></thead><tbody>
                        <tr><td><span style="color:var(--t2)">Current Filter</span></td><td style="text-align:right; font-weight:600; color:#fff">${this.fmt(sum.netProfit)}</td><td style="text-align:right; color:var(--gr)">${this.fmt(p1.earned)}</td><td style="text-align:right; color:var(--gr)">${this.fmt(p2.earned)}</td></tr>
                    </tbody></table></div>`;
                } else {
                    const accs = await window.db.getAccounts() || [];
                    contentHTML = `<div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Date</th><th>Relation</th><th style="text-align:right">Amount</th><th>Notes</th><th style="text-align:right">Action</th></tr></thead><tbody>
                    ${pTxs.length === 0 ? `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--t3)">No records found.</td></tr>` : ''}
                    ${pTxs.map(t=>{
                        let relName = '—';
                        if (t.type === 'settlement') {
                            const pFrom = t.from_partner_id==='partner1'?p1.name:(t.from_partner_id==='partner2'?p2.name:'Business');
                            const pTo = t.to_partner_id==='partner1'?p1.name:(t.to_partner_id==='partner2'?p2.name:'Business');
                            relName = pFrom + ' → ' + pTo;
                        } else {
                            relName = t.partner_id==='partner1'?p1.name:p2.name;
                        }
                        return `<tr><td><span style="color:var(--t2)">${this.fmtDate(t.date)}</span></td><td style="font-weight:600">${relName}</td><td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; color:#fff">${this.fmt(t.amount)}</td><td style="color:var(--t2); font-size:0.8rem">${t.notes || '—'}</td><td style="text-align:right"><button class="row-icon-btn" onclick="ui.deleteTx('${t.id}')" title="Delete record"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button></td></tr>`;
                    }).join('')}
                    </tbody></table></div>`;
                }
            }

            c.innerHTML = navHTML + contentHTML;
            if (window.lucide) window.lucide.createIcons();
        } catch(e) { c.innerHTML = `<div class="empty-state">Partner error: ${e.message}</div>`; }
    },

    async renderAccounts(c) {
        try {
            const accs = await window.db.getAccounts() || [];
            c.innerHTML = `
            <div class="header-action-row"><p>Cash & Bank Accounts</p><button onclick="ui.openModal('account-add')" class="btn-primary" style="width:auto">+ Add Wallet</button></div>
            <div class="accounts-grid">
                ${(await Promise.all(accs.map(async a => {
                    const s = await window.db.getAccountStats(a.id, this.filter);
                    return `<div class="acc-full-card"><div class="afc-name">${a.name}</div><div class="afc-balance">${this.fmt(s?.balance || 0)}</div><div class="afc-tag">${a.owner_type} · ${a.account_type}</div></div>`;
                }))).join('') || '<div class="empty-state">No money accounts. Repairing foundation...</div>'}
            </div>`;
        } catch(e) { c.innerHTML = `Error: ${e.message}`; }
    },

    async renderLedgers(c) {
        const leds = await window.db.getLedgers();
        const grps = await window.db.getGroups();
        c.innerHTML = `<div class="header-action-row"><p>Accounting Heads</p><button onclick="ui.openModal('ledger-add')" class="btn-primary" style="width:auto">+ New Ledger</button></div>
        <div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Ledger Name</th><th>Group / Class</th></tr></thead><tbody>
        ${leds.map(l => {
            const g = grps.find(gr => gr.id === l.group_id);
            return `<tr><td style="font-weight:500;">${l.name}</td><td><span class="group-badge">${g?.name || '—'}</span></td></tr>`;
        }).join('')}
        </tbody></table></div>`;
    },

    async renderGroups(c) {
        const grps = await window.db.getGroups();
        c.innerHTML = `<div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Classification</th><th>Nature</th></tr></thead><tbody>
        ${grps.map(g => `<tr><td style="font-weight:500;">${g.name}</td><td><span class="badge ${g.nature.toLowerCase()==='asset'?'sales':g.nature.toLowerCase()==='liability'?'expense':'other'}">${g.nature}</span></td></tr>`).join('')}
        </tbody></table></div>`;
    },

    async renderTxs(c, type) {
        const txsAll = await window.db.getAllTransactions(this.filter);
        const leds = await window.db.getLedgers();
        const txs = txsAll.filter(t => t.type === type);
        c.innerHTML = `<div class="header-action-row"><p style="color:var(--t2); font-size:0.85rem">${txs.length} entries on record.</p><button onclick="ui.openModal('${type}-add')" class="btn-primary" style="width:auto">+ Record ${type.toUpperCase()}</button></div>
        <div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Date</th><th style="text-align:right">Amount</th><th>Category</th><th>Notes</th><th style="text-align:right">Action</th></tr></thead><tbody>
        ${txs.length === 0 ? `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--t3)">No ${type} transactions recorded in this period.</td></tr>` : ''}
        ${txs.map(t=>{
            const l = leds.find(led => led.id == t.ledger_id);
            return `<tr><td><span style="color:var(--t2)">${this.fmtDate(t.date)}</span></td><td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; color:#fff">${this.fmt(t.amount)}</td><td><span class="group-badge">${l?.name||'—'}</span></td><td style="color:var(--t2); font-size:0.8rem; max-width:200px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${t.notes || '—'}</td><td style="text-align:right"><button class="row-icon-btn" onclick="ui.editTx('${t.id}')" title="Edit record" style="color:var(--a)"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg></button><button class="row-icon-btn" onclick="ui.deleteTx('${t.id}')" title="Delete record"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg></button></td></tr>`;
        }).join('')}
        </tbody></table></div>`;
    },

    async renderAllTxs(c) {
        const txs = await window.db.getAllTransactions(this.filter);
        const leds = await window.db.getLedgers();
        c.innerHTML = `<div class="ledger-table-container"><table class="ledger-table"><thead><tr><th>Date</th><th>Type</th><th style="text-align:right">Amount</th><th>Ledger</th></tr></thead><tbody>
        ${txs.length === 0 ? `<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--t3)">No activity recorded.</td></tr>` : ''}
        ${txs.map(t=>{
            const l = leds.find(led => led.id == t.ledger_id);
            const tColor = t.type === 'sale' ? 'var(--gr)' : (t.type === 'purchase' ? 'var(--am)' : (t.type === 'expense' ? 'var(--rd)' : 'var(--t)'));
            return `<tr><td><span style="color:var(--t2)">${this.fmtDate(t.date)}</span></td><td style="text-transform:capitalize; color:${tColor}; font-weight:600">${t.type}</td><td style="text-align:right; font-family:'JetBrains Mono',monospace; font-weight:600; color:#fff">${this.fmt(t.amount)}</td><td><span class="group-badge">${l?.name||'—'}</span></td></tr>`;
        }).join('')}
        </tbody></table></div>`;
    },

    async openModal(type) {
        const o = document.getElementById('modal-overlay'), b = document.getElementById('modal-body'), t = document.getElementById('modal-title');
        if (!o || !b || !t) return;
        o.classList.remove('hidden'); b.innerHTML = '<div class="spinner"></div>';
        const base = type.split('-')[0];
        const leds = await window.db.getCompatibleLedgers(base);
        const accs = await window.db.getAccounts() || [];

        if (['sale', 'purchase', 'expense'].includes(base)) {
            const defaultMap = { sale: 'Sales Account', purchase: 'Purchase Account', expense: 'Meta Ads' };
            const defLed = leds.find(l => l.name === defaultMap[base]) || leds[0];
            if (accs.length === 0) {
                b.innerHTML = `<div class="empty-state"><p>No money accounts. Repairing foundation...</p><button onclick="ui.repairFoundation()" class="btn-primary">Repair Now</button></div>`;
                return;
            }
            t.textContent = 'New ' + base.toUpperCase();
            b.innerHTML = `
                <div class="form-group"><label>Date</label><input type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Amount</label><input type="number" id="f-amt"></div>
                <div class="form-group"><label>Account</label><select id="f-acc">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Ledger</label><select id="f-led">${leds.map(l=>`<option value="${l.id}" ${l.id===defLed?.id?'selected':''}>${l.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Notes</label><textarea id="f-notes"></textarea></div>
                <div class="modal-actions"><button id="btn-sub" onclick="ui.submitTx('${base}')" class="btn-primary">Save Entry</button><button onclick="ui.closeModal()" class="btn-cancel">Cancel</button></div>`;
        } else if (base === 'account') {
            t.textContent = 'Add Money Wallet';
            b.innerHTML = `<div class="form-group"><label>Name</label><input id="f-name"></div>
                <div class="form-group"><label>Balance</label><input type="number" id="f-bal" value="0"></div>
                <div class="form-group"><label>Owner</label><select id="f-own"><option value="Business">Business</option><option value="Partner1">${window.db.settings.p1Name}</option><option value="Partner2">${window.db.settings.p2Name}</option></select></div>
                <div class="form-group"><label>Type</label><select id="f-type"><option value="Bank">Bank</option><option value="UPI">UPI</option><option value="Cash">Cash</option></select></div>
                <div class="modal-actions"><button onclick="ui.submitAccount()" class="btn-primary">Create Wallet</button></div>`;
        } else if (base === 'ledger') {
            t.textContent = 'New Ledger';
            const grps = await window.db.getGroups();
            b.innerHTML = `<div class="form-group"><label>Name</label><input id="f-name"></div>
                <div class="form-group"><label>Group</label><select id="f-grp">${grps.map(g=>`<option value="${g.id}">${g.name}</option>`).join('')}</select></div>
                <div class="modal-actions"><button onclick="ui.submitLedger()" class="btn-primary">Save</button></div>`;
        } else if (['investment', 'withdrawal', 'settlement'].includes(base)) {
            t.textContent = base === 'settlement' ? 'Record Settlement' : (base === 'investment' ? 'Add Capital' : 'Record Drawing');
            const partners = [{id: 'partner1', name: window.db.settings.p1Name}, {id: 'partner2', name: window.db.settings.p2Name}];
            
            let extraHTML = '';
            if (base === 'settlement') {
                extraHTML = `
                <div class="form-group"><label>Paid By</label><select id="f-from-p"><option value="partner1">${partners[0].name}</option><option value="partner2">${partners[1].name}</option><option value="business">Business</option></select></div>
                <div class="form-group"><label>Received By</label><select id="f-to-p"><option value="partner2">${partners[1].name}</option><option value="partner1">${partners[0].name}</option><option value="business">Business</option></select></div>
                <div class="form-group"><label>Paid From Wallet</label><select id="f-from-a">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Received In Wallet</label><select id="f-to-a">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>`;
            } else {
                extraHTML = `
                <div class="form-group"><label>Partner</label><select id="f-from-p">${partners.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select></div>
                <div class="form-group"><label>Wallet</label><select id="f-from-a">${accs.map(a=>`<option value="${a.id}">${a.name}</option>`).join('')}</select></div>`;
            }

            b.innerHTML = `
                <div class="form-group"><label>Date</label><input type="date" id="f-date" value="${new Date().toISOString().split('T')[0]}"></div>
                <div class="form-group"><label>Amount</label><input type="number" id="f-amt"></div>
                ${extraHTML}
                <div class="form-group"><label>Notes</label><textarea id="f-notes"></textarea></div>
                <div class="modal-actions"><button id="btn-sub" onclick="ui.submitPartnerTx('${base}')" class="btn-primary">Confirm</button><button onclick="ui.closeModal()" class="btn-cancel">Cancel</button></div>`;
        }
    },

    async repairFoundation() {
        const b = document.getElementById('modal-body');
        b.innerHTML = '<div class="spinner"></div><p>Rebuilding defaults...</p>';
        await window.db.healAccountingMasters();
        await window.db.syncMasterData();
        this.closeModal();
        this.nav(this.page);
    },

    async submitPartnerTx(type) {
        const btn = document.getElementById('btn-sub');
        if(btn) btn.textContent = 'Saving...';
        try {
            const amt = document.getElementById('f-amt').value;
            const dt = document.getElementById('f-date').value;
            const nts = document.getElementById('f-notes').value;
            if (!amt) { alert('Amount is required for this action.'); if(btn) btn.textContent = 'Confirm'; return; }
            
            const payload = { amount: amt, date: dt, notes: nts };
            if (type === 'settlement') {
                payload.from_partner_id = document.getElementById('f-from-p').value;
                payload.to_partner_id = document.getElementById('f-to-p').value;
                payload.from_account_id = document.getElementById('f-from-a').value;
                payload.to_account_id = document.getElementById('f-to-a').value;
            } else {
                payload.partner_id = document.getElementById('f-from-p').value;
                payload.account_id = document.getElementById('f-from-a').value;
            }
            
            await window.db.addTx(type, payload);
            alert('Transfer recorded successfully!');
            this.closeModal();
            this.nav(this.page);
        } catch(e) {
            console.error('[PARTNER_TX_ERROR]', e);
            alert('Failed: ' + e.message);
            if(btn) btn.textContent = 'Confirm';
        }
    },

    async submitTx(type) {
        console.log(`[SAVE START] type: ${type}`);
        const btn = document.getElementById('btn-sub');
        if (btn) btn.textContent = 'Saving...';
        try {
            const amt = document.getElementById('f-amt').value;
            const led = document.getElementById('f-led').value;
            const acc = document.getElementById('f-acc').value;
            const dt = document.getElementById('f-date').value;
            const nts = document.getElementById('f-notes').value;

            console.log(`[PAYLOAD] Amount: ${amt}, Ledger: ${led}, Account: ${acc}, Date: ${dt}`);

            if (!amt || !led || !acc) {
                alert('Validation Failed: Amount, Account, and Ledger are required.');
                if (btn) btn.textContent = 'Save Entry';
                return;
            }

            const payload = { date: dt, amount: amt, ledger_id: led, account_id: acc, notes: nts };
            console.log(`[DB INSERT INIT] Table Target: `, ['investment', 'withdrawal', 'settlement'].includes(type) ? 'partner_transactions' : 'transactions');
            console.log(`[DB PAYLOAD]`, payload);

            await window.db.addTx(type, payload);
            
            console.log(`[SAVE SUCCESS] Row inserted successfully.`);
            alert('Entry saved successfully!');
            this.closeModal(); 
            this.nav(this.page);
        } catch (e) {
            console.error(`[SAVE ERROR]`, e);
            alert(`Database Insert Failed: ${e.message}`);
            if (btn) btn.textContent = 'Save Entry';
        }
    },

    async deleteTx(id) {
        console.log(`[UI DELETE] Clicked for id: ${id}`);
        if (!confirm('Are you sure you want to delete this transaction?')) {
            console.log(`[UI DELETE] Cancelled by user.`);
            return;
        }
        try {
            const txs = await window.db.getAllTransactions();
            const tx = txs.find(t => t.id == id);
            console.log(`[UI DELETE] Found TX: `, tx);
            if (!tx) {
                alert(`Delete failed: Could not find transaction with ID ${id}`);
                console.error(`[UI DELETE] TX not found for id: ${id}. Available IDs:`, txs.map(t=>t.id));
                return;
            }
            console.log(`[UI DELETE] Target Table Type: ${tx.type}`);
            await window.db.deleteTx(id, tx.type);
            console.log(`[UI DELETE] Success. Row count before: ${txs.length}, after: ${txs.length - 1}`);
            alert('Entry deleted successfully');
            this.nav(this.page);
        } catch(e) { 
            console.error(`[UI DELETE ERROR]`, e);
            alert('Delete failed: ' + e.message); 
        }
    },

    async editTx(id) {
        console.log(`[UI EDIT] Clicked for id: ${id}`);
        const txs = await window.db.getAllTransactions();
        const tx = txs.find(t => t.id == id);
        if (!tx) {
            console.error(`[UI EDIT] TX not found for id: ${id}.`);
            return;
        }
        
        console.log(`[UI EDIT] Found TX matching type ${tx.type}`);
        await this.openModal(tx.type + '-add');
        
        setTimeout(() => {
            const dateInput = document.getElementById('f-date');
            if(dateInput) dateInput.value = tx.date;
            
            const amtInput = document.getElementById('f-amt');
            if(amtInput) amtInput.value = tx.amount;
            
            const notesInput = document.getElementById('f-notes');
            if(notesInput) notesInput.value = tx.notes || '';
            
            const ledInput = document.getElementById('f-led');
            if(ledInput && tx.ledger_id) ledInput.value = tx.ledger_id;
            
            const accInput = document.getElementById('f-acc');
            if(accInput && tx.account_id) accInput.value = tx.account_id;
            
            const btn = document.getElementById('btn-sub');
            if(btn) {
                btn.textContent = 'Save Changes';
                btn.onclick = () => this.updateTx(id, tx.type);
            }
        }, 50);
    },

    async updateTx(id, type) {
        const btn = document.getElementById('btn-sub');
        if (btn) btn.textContent = 'Updating...';
        try {
            const amt = document.getElementById('f-amt').value;
            const led = document.getElementById('f-led').value;
            const acc = document.getElementById('f-acc').value;
            const dt = document.getElementById('f-date').value;
            const nts = document.getElementById('f-notes').value;

            if (!amt || !led || !acc) { alert('Amount, Account, and Ledger are required.'); if (btn) btn.textContent = 'Save Changes'; return; }

            const payload = { date: dt, amount: amt, ledger_id: led, account_id: acc, notes: nts };
            await window.db.updateTx(id, type, payload);
            alert('Entry updated successfully!');
            this.closeModal(); 
            this.nav(this.page);
        } catch (e) {
            console.error(`[UPDATE ERROR]`, e);
            alert(`Update Failed: ${e.message}`);
            if (btn) btn.textContent = 'Save Changes';
        }
    },

    async submitAccount() {
        const name = document.getElementById('f-name').value, bal = document.getElementById('f-bal').value, own = document.getElementById('f-own').value, typ = document.getElementById('f-type').value;
        if (!name) return alert('Name required');
        await window.db.addAccount({ name, opening_balance: bal, owner_type: own, account_type: typ });
        this.closeModal();
        await window.db.syncMasterData();
        await this.nav(this.page);
    },

    async submitLedger() {
        await window.db.addLedger({ name: document.getElementById('f-name').value, group_id: document.getElementById('f-grp').value });
        this.closeModal(); await window.db.syncMasterData(); await this.nav(this.page);
    },

    async renderReports(c) {
        const s = await window.db.getSummary(this.filter);
        c.innerHTML = `<div class="report-card"><h3>Profit & Loss</h3>
            <div class="p-row"><span>Sales</span><strong class="v-green">${this.fmt(s.sales)}</strong></div>
            <div class="p-row"><span>Costs</span><strong class="v-red">${this.fmt(s.purchases + s.expenses)}</strong></div>
            <div class="p-divider"></div>
            <div class="p-row highlight"><span>Net Profit</span><strong class="v-amber">${this.fmt(s.netProfit)}</strong></div>
        </div>`;
    },

    renderSettings(c) {
        const s = window.db.settings;
        c.innerHTML = `<div class="settings-container"><div class="report-card"><h3>Config</h3>
            <div class="form-group"><label>Brand</label><input id="s-biz" value="${s.businessName}"></div>
            <div class="form-group"><label>P1 Name</label><input id="s-p1" value="${s.p1Name}"></div>
            <div class="form-group"><label>P2 Name</label><input id="s-p2" value="${s.p2Name}"></div>
            <div class="form-group"><label>P1 %</label><input type="number" id="s-pct" value="${s.profitSharing}"></div>
            <button onclick="ui.updateConfig()" class="btn-primary">Apply</button>
        </div><button class="btn-cancel" style="margin-top:2rem;background:var(--rd);color:white" onclick="window.auth.logout()">Logout</button></div>`;
    },

    async updateConfig() {
        const s = { businessName: document.getElementById('s-biz').value, p1Name: document.getElementById('s-p1').value, p2Name: document.getElementById('s-p2').value, profitSharing: parseFloat(document.getElementById('s-pct').value), currency: '₹' };
        await window.db.saveSettings(s);
        location.reload();
    },

    async exportPartnerCSV(tab) {
        if (!tab) tab = 'summary';
        const txs = await window.db.getAllTransactions(this.filter);
        let data = [];
        let filename = 'export.csv';
        const p1 = window.db.settings.p1Name || 'Partner 1';
        const p2 = window.db.settings.p2Name || 'Partner 2';
        
        if (tab === 'settlements') {
            filename = 'Settlement_History.csv';
            data.push(['Date', 'From', 'To', 'Amount', 'Notes']);
            txs.filter(t => t.type === 'settlement').forEach(t => {
                const fromP = t.from_partner_id === 'partner1' ? p1 : (t.from_partner_id === 'partner2' ? p2 : 'Business');
                const toP = t.to_partner_id === 'partner1' ? p1 : (t.to_partner_id === 'partner2' ? p2 : 'Business');
                data.push([t.date, fromP, toP, t.amount, `"${(t.notes || '').replace(/"/g, '""')}"`]);
            });
        }
        else if (tab === 'capital') {
            filename = 'Capital_History.csv';
            data.push(['Date', 'Partner', 'Amount', 'Notes']);
            txs.filter(t => t.type === 'investment').forEach(t => {
                data.push([t.date, t.partner_id === 'partner1' ? p1 : p2, t.amount, `"${(t.notes || '').replace(/"/g, '""')}"`]);
            });
        }
        else if (tab === 'drawings') {
            filename = 'Drawings_History.csv';
            data.push(['Date', 'Partner', 'Amount', 'Notes']);
            txs.filter(t => t.type === 'withdrawal').forEach(t => {
                data.push([t.date, t.partner_id === 'partner1' ? p1 : p2, t.amount, `"${(t.notes || '').replace(/"/g, '""')}"`]);
            });
        }
        else if (tab === 'ledger' || tab === 'summary') {
            filename = 'Profit_Ledger.csv';
            const s = await window.db.getSummary(this.filter);
            const share = window.db.settings.profitSharing;
            data.push(['Period', 'Total Sales', 'Total Purchases', 'Total Expenses', 'Net Profit', `${p1} Share (${share}%)`, `${p2} Share (${100-share}%)`]);
            data.push([this.filter.from ? `${this.filter.from} to ${this.filter.to || 'now'}` : 'All Time', s.sales, s.purchases, s.expenses, s.netProfit, (s.netProfit * share / 100).toFixed(2), (s.netProfit * (100-share) / 100).toFixed(2)]);
        }
        
        const csv = data.map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
    },

    closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }
};

if (window.auth.checkSession()) ui.init();
