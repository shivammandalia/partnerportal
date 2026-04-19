/**
 * Partner Portal — Cloud Database Engine v7.5
 * Professional Accounting Core: Advanced Auto-Seeding & Hardened Sync
 */

window.db = {
    client: null,
    state: {
        accounts: [],
        ledgers: [],
        groups: [],
        isLoaded: false,
        currentUser: 'Administrator'
    },

    config: {
        url: window.location.hostname === 'localhost' ? 'http://localhost:8000/placeholder' : (window.env?.SUPABASE_URL || 'https://qolakoauilsrgtqejpzr.supabase.co'),
        key: window.env?.SUPABASE_ANON_KEY || 'sb_publishable_VIgBodRJbqJQHIxKo12amg_Rc-jvJw9'
    },

    async init() {
        console.log('[DB] Initializing Professional Core...');
        this.settings = {
            p1Name: 'Partner 1', p2Name: 'Partner 2', profitSharing: 50,
            currency: '₹', businessName: 'Partner Portal', precision: 2
        };

        if (typeof supabase === 'undefined') {
            console.error('[DB] Supabase SDK missing!');
            return;
        }

        try {
            this.client = supabase.createClient(this.config.url, this.config.key);
            
            // 1. Sync settings
            const { data: s } = await this.client.from('app_settings').select('value').eq('key', 'business_config').maybeSingle();
            if (s?.value) this.settings = s.value;

            // 2. Sync Master Data
            await this.syncMasterData();

            // 3. Self-Healing / Auto-Seed Pass
            await this.healAccountingMasters();
        } catch (e) {
            console.error('[DB] Init Error:', e);
        } finally {
            this.state.isLoaded = true;
        }
    },

    async healAccountingMasters() {
        if (!this.client) return;
        
        // Step A: Groups
        const requiredGroups = [
            { name: 'Sales Accounts', nature: 'Income' },
            { name: 'Purchase Accounts', nature: 'Expense' },
            { name: 'Direct Expenses', nature: 'Expense' },
            { name: 'Indirect Expenses', nature: 'Expense' },
            { name: 'Capital Accounts', nature: 'Capital' },
            { name: 'Current Assets', nature: 'Asset' },
            { name: 'Current Liabilities', nature: 'Liability' },
            { name: 'Sundry Creditors', nature: 'Liability' },
            { name: 'Sundry Debtors', nature: 'Asset' },
            { name: 'Drawings', nature: 'Capital' },
            { name: 'Bank Accounts', nature: 'Asset' },
            { name: 'Cash-in-Hand', nature: 'Asset' }
        ];

        let grpsChanged = false;
        for (const g of requiredGroups) {
            if (!this.state.groups.find(eg => eg.name === g.name)) {
                await this.client.from('ledger_groups').insert([g]);
                grpsChanged = true;
            }
        }
        if (grpsChanged) await this.syncMasterData();

        // Step B: Ledgers
        const requiredLedgers = [
            { name: 'Sales Account', group: 'Sales Accounts' },
            { name: 'Purchase Account', group: 'Purchase Accounts' },
            { name: 'Meta Ads', group: 'Indirect Expenses' },
            { name: 'Misc Expense', group: 'Indirect Expenses' },
            { name: 'Salary Expense', group: 'Indirect Expenses' },
            { name: 'Internet Expense', group: 'Indirect Expenses' },
            { name: 'Refund Expense', group: 'Indirect Expenses' },
            { name: 'Cash Adjustment', group: 'Current Assets' },
            { name: 'General Supplier', group: 'Sundry Creditors' },
            { name: 'General Customer', group: 'Sundry Debtors' },
            { name: 'Partner 1 Capital', group: 'Capital Accounts' },
            { name: 'Partner 2 Capital', group: 'Capital Accounts' },
            { name: 'Partner 1 Drawings', group: 'Drawings' },
            { name: 'Partner 2 Drawings', group: 'Drawings' }
        ];

        let ledsChanged = false;
        for (const l of requiredLedgers) {
            if (!this.state.ledgers.find(el => el.name === l.name)) {
                const group = this.state.groups.find(g => g.name === l.group);
                if (group) {
                    await this.client.from('ledgers').insert([{ name: l.name, group_id: group.id }]);
                    ledsChanged = true;
                }
            }
        }
        if (ledsChanged) await this.syncMasterData();
    },

    async syncMasterData() {
        if (!this.client) return;
        try {
            const [{ data: accs }, { data: leds }, { data: grps }] = await Promise.all([
                this.client.from('money_accounts').select('*').order('name'),
                this.client.from('ledgers').select('*').order('name'),
                this.client.from('ledger_groups').select('*').order('name')
            ]);
            this.state.accounts = accs || [];
            this.state.ledgers = leds || [];
            this.state.groups = grps || [];
            console.log(`[DB] Sync. Accs: ${this.state.accounts.length}, Leds: ${this.state.ledgers.length}, Grps: ${this.state.groups.length}`);
        } catch (err) {
            console.warn('[DB] Sync Fail:', err);
        }
    },

    // ── DATA ACCESS ──────────────────────────────────────────────────────────
    async getAccounts() { return this.state.accounts; },
    async getLedgers() { return this.state.ledgers; },
    async getGroups() { return this.state.groups; },

    async getCompatibleLedgers(txType) {
        const rules = {
            sale: ['Sales Accounts', 'Direct Income', 'Indirect Income', 'Sundry Debtors'],
            purchase: ['Purchase Accounts', 'Direct Expenses', 'Indirect Expenses', 'Sundry Creditors'],
            expense: ['Direct Expenses', 'Indirect Expenses'],
            investment: ['Capital Accounts'],
            withdrawal: ['Drawings'],
            settlement: ['Capital Accounts']
        };
        const allowedGroupNames = rules[txType] || [];
        const leds = await this.getLedgers();
        const grps = await this.getGroups();
        
        return leds.filter(l => {
            const g = grps.find(gr => gr.id === l.group_id);
            return allowedGroupNames.includes(g?.name);
        });
    },

    async getAllTransactions(f = {}) {
        if (!this.client) return [];
        try {
            let q1 = this.client.from('transactions').select('*');
            let q2 = this.client.from('partner_transactions').select('*');
            if (f.from) { q1 = q1.gte('date', f.from); q2 = q2.gte('date', f.from); }
            if (f.to)   { q1 = q1.lte('date', f.to); q2 = q2.lte('date', f.to); }
            const [{ data: d1 }, { data: d2 }] = await Promise.all([q1, q2]);
            return [...(d1||[]), ...(d2||[])].sort((a,b) => new Date(b.date) - new Date(a.date));
        } catch (e) { return []; }
    },

    // ── CALCULATION ENGINE ──────────────────────────────────────────────────
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
        const share = parseFloat(this.settings.profitSharing) || 50;
        return { ...s, netProfit: net, p1Share: net * share / 100, p2Share: net * (100 - share) / 100 };
    },

    async getAccountStats(accountId, f = {}) {
        const acc = this.state.accounts.find(a => a.id === accountId);
        const opening = parseFloat(acc?.opening_balance) || 0;
        const txs = await this.getAllTransactions(f);
        let inflow = 0, outflow = 0;
        txs.filter(t => t.account_id === accountId || t.from_account_id === accountId || t.to_account_id === accountId).forEach(e => {
            const a = parseFloat(e.amount) || 0;
            const isTo = e.to_account_id === accountId;
            const isFrom = e.from_account_id === accountId || e.account_id === accountId;
            if (['sale', 'investment'].includes(e.type) || isTo) { inflow += a; } 
            else if (['purchase', 'expense', 'withdrawal'].includes(e.type) || isFrom) { outflow += a; }
        });
        return { inflow, outflow, balance: opening + inflow - outflow };
    },

    async getPartnerStats(pNum, f = {}) {
        const pKey = 'p' + pNum;
        const name = this.settings[pKey + 'Name'];
        const partnerId = 'partner' + pNum;
        const sharePct = pNum === 1 ? this.settings.profitSharing : (100 - this.settings.profitSharing);
        const summary = await this.getSummary(f);
        const earned = (summary.netProfit * sharePct) / 100;
        const txs = await this.getAllTransactions(f);
        const pTxs = txs.filter(t => t.partner_id === partnerId || t.from_partner_id === partnerId || t.to_partner_id === partnerId);
        const invested = pTxs.filter(t => t.type === 'investment').reduce((a, t) => a + (parseFloat(t.amount)||0), 0);
        const drawings = pTxs.filter(t => t.type === 'withdrawal').reduce((a, t) => a + (parseFloat(t.amount)||0), 0);
        const settledOut = pTxs.filter(t => t.type === 'settlement' && t.from_partner_id === partnerId).reduce((a, t) => a + (parseFloat(t.amount)||0), 0);
        const settledIn = pTxs.filter(t => t.type === 'settlement' && t.to_partner_id === partnerId).reduce((a, t) => a + (parseFloat(t.amount)||0), 0);
        const pAccounts = this.state.accounts.filter(a => a.owner_type === 'Partner' + pNum);
        let moneyHeld = 0;
        for(const acc of pAccounts) {
            const st = await this.getAccountStats(acc.id, f);
            moneyHeld += st.balance;
        }
        const netInvestment = invested - drawings;
        const position = (moneyHeld - netInvestment) - earned;
        return { name, partnerId, earned, invested, drawings, moneyHeld, settledIn, settledOut, position, sharePct };
    },

    // ── WRITING DATA ────────────────────────────────────────────────────────
    async addTx(type, d) {
        if (!this.client) return;
        const table = ['investment', 'withdrawal', 'settlement'].includes(type) ? 'partner_transactions' : 'transactions';
        const payload = {
            id: 'tx_' + Date.now(),
            type,
            created_at: new Date().toISOString(),
            created_by: this.state.currentUser,
            ...d
        };
        await this.client.from(table).insert([payload]);
        await this.syncMasterData();
    },

    async addAccount(d) { 
        if (!this.client) return;
        const payload = { id: 'acc_' + Date.now(), status: 'Active', ...d };
        const { data, error } = await this.client.from('money_accounts').insert([payload]).select();
        if (error) throw error;
        await this.syncMasterData(); 
        return data?.[0];
    },

    async addLedger(d)  { await this.client.from('ledgers').insert([{ id:'led_'+Date.now(), ...d }]); await this.syncMasterData(); },
    async deleteTx(id)   { await this.client.from('transactions').delete().eq('id', id); await this.client.from('partner_transactions').delete().eq('id', id); },
    
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
