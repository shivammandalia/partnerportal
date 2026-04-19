/**
 * Partner Portal — Cloud Database Engine v6.1
 * Powered by Supabase (PostgreSQL)
 */

window.db = {
    client: null,
    
    // State cache to prevent UI hangs
    state: {
        accounts: [],
        ledgers: [],
        groups: [],
        transactions: [],
        currentUser: 'Administrator',
        isLoaded: false
    },

    // Placeholder credentials fallback
    config: {
        url: window.location.hostname === 'localhost' ? 'http://localhost:8000/placeholder' : (window.env?.SUPABASE_URL || 'https://qolakoauilsrgtqejpzr.supabase.co'),
        key: window.env?.SUPABASE_ANON_KEY || 'sb_publishable_VIgBodRJbqJQHIxKo12amg_Rc-jvJw9'
    },

    async init() {
        console.log('[DB] Connecting to Cloud Database...');
        
        // Default Settings
        this.settings = {
            p1Name: 'Partner 1', p2Name: 'Partner 2', profitSharing: 50,
            currency: '₹', businessName: 'Partner Portal', precision: 2
        };

        if (typeof supabase === 'undefined') {
            console.error('[DB] Supabase library NOT found. Check index.html CDN.');
            return;
        }

        try {
            const url = this.config.url;
            const key = this.config.key;

            if (url.includes('REPLACE') || url.includes('placeholder')) {
                console.warn('[DB] Using placeholder credentials. Cloud sync disabled.');
                return;
            }

            this.client = supabase.createClient(url, key);
            
            // Sync initial settings
            const { data: settingsData } = await this.client.from('app_settings').select('value').eq('key', 'business_config').maybeSingle();
            if (settingsData && settingsData.value) {
                this.settings = settingsData.value;
                console.log('[DB] Settings synced successfully.');
            }

            // Sync Master Data
            await this.syncMasterData();
            
        } catch (e) {
            console.warn('[DB] Connection Error. Using defaults/local cache.', e);
        } finally {
            this.state.isLoaded = true;
        }
    },

    async syncMasterData() {
        if (!this.client) return;
        try {
            console.log('[DB] Syncing Master Records...');
            const [{ data: accs }, { data: leds }, { data: grps }] = await Promise.all([
                this.client.from('money_accounts').select('*').order('name'),
                this.client.from('ledgers').select('*').order('name'),
                this.client.from('ledger_groups').select('*').order('name')
            ]);

            this.state.accounts = accs || [];
            this.state.ledgers = leds || [];
            this.state.groups = grps || [];
            console.log(`[DB] Sync Complete: ${this.state.accounts.length} Accounts, ${this.state.ledgers.length} Ledgers.`);
        } catch (err) {
            console.error('[DB] Master Sync Failed:', err);
        }
    },

    // ── MASTER ACCESS (Safe wrappers) ────────────────────────────────────────
    async getGroups() { return this.state.groups.length ? this.state.groups : (await this.syncMasterData(), this.state.groups); },
    async getLedgers() { return this.state.ledgers.length ? this.state.ledgers : (await this.syncMasterData(), this.state.ledgers); },
    async getAccounts() { return this.state.accounts.length ? this.state.accounts : (await this.syncMasterData(), this.state.accounts); },

    async getCompatibleLedgers(txType) {
        const rules = {
            sale: ['Income', 'Asset'], purchase: ['Expense', 'Liability'],
            expense: ['Expense'], investment: ['Capital'],
            withdrawal: ['Capital'], settlement: ['Capital', 'Liability']
        };
        const allowedNatures = rules[txType] || [];
        const groups = await this.getGroups();
        const ledgers = await this.getLedgers();
        
        return ledgers.filter(l => {
            const grp = groups.find(g => g.id === l.group_id);
            return allowedNatures.includes(grp?.nature);
        });
    },

    // ── TRANSACTION LOGIC ────────────────────────────────────────────────────
    async getAllTransactions(f = {}) {
        if (!this.client) return [];
        try {
            let q1 = this.client.from('transactions').select('*');
            let q2 = this.client.from('partner_transactions').select('*');

            if (f.from) { q1 = q1.gte('date', f.from); q2 = q2.gte('date', f.from); }
            if (f.to)   { q1 = q1.lte('date', f.to); q2 = q2.lte('date', f.to); }

            const [{ data: d1 }, { data: d2 }] = await Promise.all([q1, q2]);
            return [...(d1||[]), ...(d2||[])];
        } catch (e) {
            console.error('[DB] Fetch Transactions Failed:', e);
            return [];
        }
    },

    async getSummary(f = {}) {
        const txs = await this.getAllTransactions(f);
        const s = txs.reduce((a, e) => {
            const amt = parseFloat(e.amount) || 0;
            if (e.type === 'sale') a.sales += amt;
            else if (e.type === 'purchase') a.purchases += amt;
            else if (e.type === 'expense') a.expenses += amt;
            return a;
        }, { sales: 0, purchases: 0, expenses: 0 });

        const net = s.sales - s.purchases - s.expenses;
        const share = this.settings.profitSharing || 50;
        return { ...s, netProfit: net, p1Share: net * share / 100, p2Share: net * (100 - share) / 100 };
    },

    async getAccountStats(accountId, f = {}) {
        const acc = this.state.accounts.find(a => a.id === accountId);
        const opening = parseFloat(acc?.opening_balance) || 0;
        
        const txs = await this.getAllTransactions(f);
        const filtered = txs.filter(t => 
            t.account_id === accountId || t.from_account_id === accountId || t.to_account_id === accountId
        );

        let balance = opening;
        let inflow = 0, outflow = 0;

        filtered.forEach(e => {
            const a = parseFloat(e.amount) || 0;
            const isSettlementIn = e.type === 'settlement' && e.to_account_id === accountId;
            const isSettlementOut = e.type === 'settlement' && (e.from_account_id === accountId || e.account_id === accountId);
            
            if (e.type === 'sale' || e.type === 'investment' || isSettlementIn) {
                inflow += a; balance += a;
            } else if (e.type === 'purchase' || e.type === 'expense' || e.type === 'withdrawal' || isSettlementOut) {
                outflow += a; balance -= a;
            }
        });

        return { inflow, outflow, balance };
    },

    async getLedgerStats(ledgerId, f = {}) {
        const led = this.state.ledgers.find(l => l.id === ledgerId);
        if (!led) return { dr: 0, cr: 0, balance: 0, opening: 0, opType: 'Dr', entries: [] };
        
        const g = this.state.groups.find(gr => gr.id === led.group_id);
        const nature = g?.nature || 'Asset';
        const txs = await this.getAllTransactions(f);
        const filtered = txs.filter(t => t.ledger_id === ledgerId);

        let dr = 0, cr = 0;
        filtered.forEach(e => {
            const a = parseFloat(e.amount) || 0;
            if (['sale','investment'].includes(e.type)) cr += a; else dr += a;
        });

        const opening = parseFloat(led.opening_balance) || 0;
        const opType = led.opening_balance_type || 'Dr';

        let closing = 0;
        if (['Asset', 'Expense'].includes(nature)) {
            const base = (opType === 'Dr') ? opening : -opening;
            closing = base + dr - cr;
        } else {
            const base = (opType === 'Cr') ? opening : -opening;
            closing = base + cr - dr;
        }

        return { dr, cr, opening, opType, balance: closing, entries: filtered, nature };
    },

    async getPartnerStats(partnerName, f = {}) {
        const pKey = partnerName === this.settings.p1Name ? 'p1' : 'p2';
        const partnerId = pKey === 'p1' ? 'partner1' : 'partner2';
        const name = this.settings[pKey + 'Name'];
        
        const summary = await this.getSummary(f); 
        const earned = pKey === 'p1' ? summary.p1Share : summary.p2Share;

        const { data: allTxs } = await this.client.from('partner_transactions').select('*');
        const filteredTxs = (allTxs||[]).filter(t => t.partner_id === partnerId || t.from_partner_id === partnerId || t.to_partner_id === partnerId);
        
        const invested = filteredTxs.filter(t => t.type === 'investment').reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
        const drawings = filteredTxs.filter(t => t.type === 'withdrawal').reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
        const paid = filteredTxs.filter(t => t.type === 'settlement' && t.from_partner_id === partnerId).reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
        const recv = filteredTxs.filter(t => t.type === 'settlement' && t.to_partner_id === partnerId).reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);

        const personalAccs = this.state.accounts.filter(a => a.owner_type === (pKey==='p1'?'Partner1':'Partner2'));
        let moneyHeld = 0;
        for (const acc of personalAccs) {
            const st = await this.getAccountStats(acc.id, {});
            moneyHeld += st.balance;
        }

        const capitalBalance = invested - drawings;
        const netPosition = (earned + capitalBalance) - moneyHeld;

        return { name, partnerId, earned, invested, drawings, paid, recv, moneyHeld, netPosition, sharePct: (pKey==='p1'?this.settings.profitSharing:100-this.settings.profitSharing) };
    },

    // ── DATA WRITING (Safe) ──────────────────────────────────────────────────
    async _addTx(table, d) {
        if (!this.client) return;
        const payload = { id: 'tx_' + Date.now(), created_by: this.state.currentUser, ...d };
        await this.client.from(table).insert([payload]);
        await this.syncMasterData(); // Refresh local cache
    },

    async addSale(d)    { await this._addTx('transactions', { ...d, type: 'sale' }); },
    async addPurchase(d){ await this._addTx('transactions', { ...d, type: 'purchase' }); },
    async addExpense(d) { await this._addTx('transactions', { ...d, type: 'expense' }); },
    async addPartnerTx(d){ await this._addTx('partner_transactions', d); },
    async addLedger(d)  { await this.client.from('ledgers').insert([{ id:'led_'+Date.now(), ...d }]); await this.syncMasterData(); },
    async addAccount(d) { await this.client.from('money_accounts').insert([{ id:'acc_'+Date.now(), ...d }]); await this.syncMasterData(); },
    
    async deleteTx(id)      { await this.client.from('transactions').delete().eq('id', id); await this.client.from('partner_transactions').delete().eq('id', id); },
    async deleteLedger(id)  { await this.client.from('ledgers').delete().eq('id', id); await this.syncMasterData(); },
    async deleteAccount(id) { await this.client.from('money_accounts').delete().eq('id', id); await this.syncMasterData(); },

    async saveSettings(s) { 
        this.settings = s; 
        await this.client.from('app_settings').upsert({ key: 'business_config', value: s }); 
    },

    getDatePreset(p) {
        const d = new Date(), now = d.toISOString().split('T')[0];
        if (p === 'today') return { from: now, to: now };
        if (p === 'yesterday') { d.setDate(d.getDate()-1); const y = d.toISOString().split('T')[0]; return { from: y, to: y }; }
        if (p === 'this_month') { const f = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; return { from: f, to: now }; }
        return { from: '', to: '' };
    }
};

window.db.init();
