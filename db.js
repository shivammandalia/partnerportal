/**
 * Partner Portal — Cloud Database Engine v6.0
 * Powered by Supabase (PostgreSQL)
 */

window.db = {
    client: null,
    
    // Placeholder credentials — User will add real ones in Vercel
    config: {
        url: window.location.hostname === 'localhost' ? 'http://localhost:8000/placeholder' : (window.env?.SUPABASE_URL || 'https://qolakoauilsrgtqejpzr.supabase.co'),
        key: window.env?.SUPABASE_ANON_KEY || 'sb_publishable_VIgBodRJbqJQHIxKo12amg_Rc-jvJw9'
    },

    async init() {
        console.log('[DB] Connecting to Cloud Database...');
        
        // Defaults
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
            
            // Fetch initial settings
            const { data, error } = await this.client.from('app_settings').select('value').eq('key', 'business_config').maybeSingle();
            
            if (data && data.value) {
                this.settings = data.value;
                console.log('[DB] Settings synced successfully.');
            } else {
                console.warn('[DB] No business config found in cloud. Using defaults.');
            }
        } catch (e) {
            console.warn('[DB] Cloud Sync inhibited. Using defaults.', e);
        }
    },

    // ── MASTER ACCESS ────────────────────────────────────────────────────────
    async getGroups() {
        if (!this.client) return [];
        const { data } = await this.client.from('ledger_groups').select('*').order('name');
        return data || [];
    },

    async getLedgers() {
        if (!this.client) return [];
        const { data } = await this.client.from('ledgers').select('*').order('name');
        return data || [];
    },

    async getAccounts() {
        if (!this.client) return [];
        const { data } = await this.client.from('money_accounts').select('*').order('name');
        return data || [];
    },

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

    // ── TRANSACTION WRITING ──────────────────────────────────────────────────
    async addSale(d)    { return this._addTx('transactions', { ...d, type: 'sale' }); },
    async addPurchase(d){ return this._addTx('transactions', { ...d, type: 'purchase' }); },
    async addExpense(d) { return this._addTx('transactions', { ...d, type: 'expense' }); },
    async addPartnerTx(d){ return this._addTx('partner_transactions', d); },

    async _addTx(table, d) {
        const payload = {
            id: 'tx_' + Date.now() + Math.random().toString(36).substr(2, 5),
            created_by: 'admin',
            ...d
        };
        const { data, error } = await this.client.from(table).insert([payload]).select();
        if (error) throw error;
        return data[0];
    },

    async deleteTx(id) {
        await this.client.from('transactions').delete().eq('id', id);
        await this.client.from('partner_transactions').delete().eq('id', id);
    },

    async updateTx(id, d) {
        const { error: e1 } = await this.client.from('transactions').update(d).eq('id', id);
        const { error: e2 } = await this.client.from('partner_transactions').update(d).eq('id', id);
    },

    // ── MASTER MANAGEMENT ────────────────────────────────────────────────────
    async addGroup(d) {
        const id = 'grp_' + Date.now();
        await this.client.from('ledger_groups').insert([{ id, ...d, is_internal: false }]);
    },
    async deleteGroup(id) {
        const { error } = await this.client.from('ledger_groups').delete().eq('id', id);
        if (error) throw new Error('Cannot delete group. Ensure it has no ledgers.');
    },
    async addLedger(d) {
        const id = 'led_' + Date.now();
        await this.client.from('ledgers').insert([{ id, ...d }]);
    },
    async deleteLedger(id) {
        const { error } = await this.client.from('ledgers').delete().eq('id', id);
        if (error) throw new Error('Cannot delete ledger. Ensure it has no transactions.');
    },
    async addAccount(d) {
        const id = 'acc_' + Date.now();
        await this.client.from('money_accounts').insert([{ id, ...d }]);
    },
    async deleteAccount(id) {
        const { error } = await this.client.from('money_accounts').delete().eq('id', id);
        if (error) throw new Error('Cannot delete account. Ensure it has no transactions.');
    },

    // ── CALCULATION ENGINE ───────────────────────────────────────────────────
    async getAllTransactions(f = {}) {
        let q1 = this.client.from('transactions').select('*');
        let q2 = this.client.from('partner_transactions').select('*');

        if (f.from) { q1 = q1.gte('date', f.from); q2 = q2.gte('date', f.from); }
        if (f.to)   { q1 = q1.lte('date', f.to);   q2 = q2.lte('date', f.to); }

        const [{ data: d1 }, { data: d2 }] = await Promise.all([q1, q2]);
        return [...(d1||[]), ...(d2||[])];
    },

    async getAccountStats(accountId, f = {}) {
        const { data: acc } = await this.client.from('money_accounts').select('*').eq('id', accountId).single();
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
        const { data: led } = await this.client.from('ledgers').select('*, ledger_groups(nature)').eq('id', ledgerId).single();
        if (!led) return null;
        
        const nature = led.ledger_groups?.nature || 'Asset';
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

    async getPartnerStats(partnerName, f = {}) {
        const pKey = partnerName === this.settings.p1Name ? 'p1' : 'p2';
        const partnerId = pKey === 'p1' ? 'partner1' : 'partner2';
        const name = this.settings[pKey + 'Name'];
        const sharePct = pKey === 'p1' ? (this.settings.profitSharing || 50) : (100 - (this.settings.profitSharing || 50));
        
        const summary = await this.getSummary(f); 
        const earned = pKey === 'p1' ? summary.p1Share : summary.p2Share;

        const { data: allTxs } = await this.client.from('partner_transactions').select('*');
        const filteredTxs = (allTxs||[]).filter(t => t.partner_id === partnerId || t.from_partner_id === partnerId || t.to_partner_id === partnerId);
        
        const invested = filteredTxs.filter(t => t.type === 'investment').reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
        const drawings = filteredTxs.filter(t => t.type === 'withdrawal').reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
        const paid = filteredTxs.filter(t => t.type === 'settlement' && t.from_partner_id === partnerId).reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);
        const recv = filteredTxs.filter(t => t.type === 'settlement' && t.to_partner_id === partnerId).reduce((a, t) => a + (parseFloat(t.amount) || 0), 0);

        const { data: personalAccs } = await this.client.from('money_accounts').select('id').eq('owner_type', pKey==='p1'?'Partner1':'Partner2');
        let moneyHeld = 0;
        for (const acc of (personalAccs||[])) {
            const st = await this.getAccountStats(acc.id, {});
            moneyHeld += st.balance;
        }

        const capitalBalance = invested - drawings;
        const netEntitlement = earned + capitalBalance;
        const netPosition = moneyHeld - netEntitlement;

        return {
            name, partnerId, sharePct, earned, invested, drawings, paid, recv,
            moneyHeld, capitalBalance, netEntitlement, netPosition, 
            settlementPosition: netPosition, audit: summary 
        };
    },

    getDatePreset(preset) {
        const now = new Date();
        const fmt = d => d.toISOString().split('T')[0];
        const today = fmt(now);
        switch (preset) {
            case 'today':      return { from: today, to: today };
            case 'this_month': return { from: today.slice(0, 8) + '01', to: today };
            case 'all':        return { from: '', to: '' };
            default:           return { from: null, to: null };
        }
    }
};

window.db.init();
