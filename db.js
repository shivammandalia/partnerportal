/**
 * Partner Portal — Cloud Database Engine v11.5 (FINAL STABLE RELEASE)
 * Professional Accounting Core: RESTORED snake_case for Database Schema
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
        url: window.env?.SUPABASE_URL || 'https://qolakoauilsrgtqejpzr.supabase.co',
        key: window.env?.SUPABASE_ANON_KEY || 'sb_publishable_VIgBodRJbqJQHIxKo12amg_Rc-jvJw9'
    },

    async init() {
        console.log('[DB] v11.5: Omni-Compatible Schema Strategy (Auto-Healing)');
        this.settings = {
            p1Name: 'Partner 1', p2Name: 'Partner 2', profitSharing: 50,
            currency: '₹', businessName: 'Partner Portal', precision: 2,
            gsWebhookUrl: 'https://script.google.com/macros/s/AKfycbzBo87jtgTJySnH6Nb6xSgGSywmxwkhbLaF2B7GjW9SFvBByOZfu5qof-LJwuNB3Q/exec', 
            gsBackupEnabled: true
        };

        if (typeof supabase === 'undefined') return console.error('[DB] SDK Missing');

        try {
            this.client = supabase.createClient(this.config.url, this.config.key);
            
            const { data: s, error: sErr } = await this.client.from('app_settings').select('value').eq('key', 'business_config').maybeSingle();
            if (sErr) throw sErr;
            if (s?.value) this.settings = s.value;

            await this.syncMasterData();
            await this.healAccountingMasters();
            await this.syncMasterData();
            
            console.log('[DB] Foundation Finalized. Master Data Status: Healthy');
        } catch (e) {
            console.error('[DB] Init Error:', e);
            alert('Database Connection Failed: ' + (e.message || 'Unknown Error'));
        } finally {
            this.state.isLoaded = true;
        }
    },

    async healAccountingMasters() {
        if (!this.client) return;
        
        // 1. Required Groups
        const requiredGroups = [
            { name: 'Sales Accounts', nature: 'Income' },
            { name: 'Purchase Accounts', nature: 'Expense' },
            { name: 'Direct Expenses', nature: 'Expense' },
            { name: 'Indirect Expenses', nature: 'Expense' },
            { name: 'Capital Accounts', nature: 'Capital' },
            { name: 'Drawings', nature: 'Capital' },
            { name: 'Bank Accounts', nature: 'Asset' },
            { name: 'Cash-in-Hand', nature: 'Asset' },
            { name: 'Sundry Debtors', nature: 'Asset' },
            { name: 'Sundry Creditors', nature: 'Liability' }
        ];

        for (const g of requiredGroups) {
            if (!this.state.groups.find(eg => eg.name === g.name)) {
                await this.client.from('ledger_groups').insert([{ id: crypto.randomUUID(), ...g }]);
            }
        }
        await this.syncMasterData();

        // 2. Required Ledgers (using camelCase for group_id if needed, but SQL schema says group_id)
        const requiredLedgers = [
            { name: 'Sales Account', group: 'Sales Accounts' },
            { name: 'Purchase Account', group: 'Purchase Accounts' },
            { name: 'Meta Ads', group: 'Indirect Expenses' },
            { name: 'Misc Expense', group: 'Indirect Expenses' },
            { name: 'Cash Ledger', group: 'Cash-in-Hand' },
            { name: 'Partner 1 Capital', group: 'Capital Accounts' },
            { name: 'Partner 2 Capital', group: 'Capital Accounts' },
            { name: 'Partner 1 Drawings', group: 'Drawings' },
            { name: 'Partner 2 Drawings', group: 'Drawings' }
        ];

        for (const l of requiredLedgers) {
            if (!this.state.ledgers.find(el => el.name === l.name)) {
                const group = this.state.groups.find(g => g.name === l.group);
                if (group) {
                    await this.safeInsertLedger({ name: l.name, group_id: group.id });
                }
            }
        }

        // 3. Required Money Accounts (Omni-Compatible Mapping)
        const requiredAccs = [
            { name: 'Cash', account_type: 'Cash', owner_type: 'Business' },
            { name: 'Partner 1 UPI', account_type: 'UPI', owner_type: 'Partner1' },
            { name: 'Partner 2 UPI', account_type: 'UPI', owner_type: 'Partner2' }
        ];

        for (const a of requiredAccs) {
            if (!this.state.accounts.find(ea => ea.name === a.name)) {
                await this.safeInsertAccount({ 
                    name: a.name, 
                    account_type: a.account_type, 
                    owner_type: a.owner_type, 
                    opening_balance: 0 
                });
            }
        }
    },

    async syncMasterData() {
        if (!this.client) return;
        try {
            const [grpRes, ledRes, accRes] = await Promise.all([
                this.client.from('ledger_groups').select('*').order('name'),
                this.client.from('ledgers').select('*').order('name'),
                this.client.from('money_accounts').select('*').order('name')
            ]);
            
            if (grpRes.error) throw grpRes.error;
            if (ledRes.error) throw ledRes.error;
            if (accRes.error) throw accRes.error;

            this.state.groups = grpRes.data || [];
            this.state.ledgers = (ledRes.data || []).map(l => ({
                id: l.id,
                name: l.name,
                group_id: l.group_id || l.groupId || l.groupid,
                opening_balance: l.opening_balance || 0
            }));
            this.state.accounts = (accRes.data || []).map(a => ({
                id: a.id,
                name: a.name,
                account_type: a.account_type || a.accountType || a.accounttype,
                owner_type: a.owner_type || a.ownerType || a.ownertype,
                opening_balance: a.opening_balance || a.openingBalance || 0
            }));
        } catch (e) {
            console.error('[DB] Sync Fail:', e);
            throw e;
        }
    },

    async getAccounts(includeArchived = false) { return includeArchived ? this.state.accounts : this.state.accounts.filter(a => !String(a.name).startsWith('[ARCHIVED]')); },
    async getLedgers(includeArchived = false) { return includeArchived ? this.state.ledgers : this.state.ledgers.filter(a => !String(a.name).startsWith('[ARCHIVED]')); },
    async getGroups(includeArchived = false) { return includeArchived ? this.state.groups : this.state.groups.filter(a => !String(a.name).startsWith('[ARCHIVED]')); },

    async getCompatibleLedgers(txType) {
        const rules = {
            sale: ['Sales Accounts', 'Indirect Income', 'Sundry Debtors'],
            purchase: ['Purchase Accounts', 'Direct Expenses', 'Sundry Creditors'],
            expense: ['Direct Expenses', 'Indirect Expenses'],
            investment: ['Capital Accounts'],
            withdrawal: ['Drawings'],
            settlement: ['Capital Accounts']
        };
        const allowed = rules[txType] || [];
        return this.state.ledgers.filter(l => {
            if (String(l.name).startsWith('[ARCHIVED]')) return false;
            const g = this.state.groups.find(gr => gr.id === l.group_id);
            return allowed.includes(g?.name);
        });
    },

    async getAllTransactions(f = {}) {
        if (!this.client) return [];
        try {
            let q1 = this.client.from('transactions').select('*');
            let q2 = this.client.from('partner_transactions').select('*');
            if (f.from) { q1 = q1.gte('date', f.from); q2 = q2.gte('date', f.from); }
            if (f.to)   { q1 = q1.lte('date', f.to); q2 = q2.lte('date', f.to); }
            const [r1, r2] = await Promise.all([q1, q2]);
            return [...(r1.data||[]), ...(r2.data||[])].sort((a,b) => new Date(b.date) - new Date(a.date));
        } catch (e) { return []; }
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
        const share = parseFloat(this.settings.profitSharing) || 50;
        return { ...s, netProfit: net, p1Share: net * share / 100, p2Share: net * (100 - share) / 100 };
    },

    async getAccountStats(accountId, f = {}) {
        const acc = this.state.accounts.find(a => a.id === accountId);
        const opening = parseFloat(acc?.opening_balance) || 0;
        const txs = await this.getAllTransactions(f);
        let inflow = 0, outflow = 0;
        txs.forEach(e => {
            const a = parseFloat(e.amount) || 0;
            if (e.account_id === accountId) {
                if (e.type === 'sale') inflow += a;
                else if (['purchase', 'expense'].includes(e.type)) outflow += a;
            }
            if (e.money_account_id === accountId) {
                if (e.type === 'investment') inflow += a;
                else if (e.type === 'withdrawal') outflow += a;
            }
            if (e.type === 'settlement') {
                if (e.to_account_id === accountId) inflow += a;
                if (e.from_account_id === accountId) outflow += a;
            }
        });
        return { balance: opening + inflow - outflow };
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
        const pAccounts = this.state.accounts.filter(a => a.owner_type === 'Partner' + pNum);
        let moneyHeld = 0;
        for(const acc of pAccounts) {
            const st = await this.getAccountStats(acc.id, f);
            moneyHeld += st.balance;
        }
        const position = (moneyHeld - (invested - drawings)) - earned;
        return { name, partnerId, earned, invested, drawings, moneyHeld, position, sharePct };
    },

    async addTx(type, d) {
        if (!this.client) return;
        const table = ['investment', 'withdrawal', 'settlement'].includes(type) ? 'partner_transactions' : 'transactions';
        const id = crypto.randomUUID();
        const payload = { id, ...d, type, created_by: this.state.currentUser };
        const { error } = await this.client.from(table).insert([payload]);
        if (error) throw error;
        this.postToGoogleSheets(type, 'CREATE', payload);
        await this.syncMasterData();
    },

    async updateTx(id, type, d) {
        console.log(`[DB UPDATE] id: ${id}, type: ${type}`, d);
        if (!this.client) return;
        const table = ['investment', 'withdrawal', 'settlement'].includes(type) ? 'partner_transactions' : 'transactions';
        const { error } = await this.client.from(table).update(d).eq('id', id);
        if (error) throw error;
        this.postToGoogleSheets(type, 'EDIT', { id, ...d });
        await this.syncMasterData();
    },

    async deleteTx(id, type) {
        console.log(`[DB DELETE] id: ${id}, type: ${type}`);
        if (!this.client) return;
        const table = ['investment', 'withdrawal', 'settlement'].includes(type) ? 'partner_transactions' : 'transactions';
        const { error } = await this.client.from(table).delete().eq('id', id);
        if (error) throw error;
        this.postToGoogleSheets(type, 'DELETE', { id });
        await this.syncMasterData();
    },

    async safeInsertAccount(a) {
        let errs = [];
        const id = crypto.randomUUID();
        let { error: e1 } = await this.client.from('money_accounts').insert([{ id, name: a.name, account_type: a.account_type, owner_type: a.owner_type, opening_balance: a.opening_balance || 0 }]);
        if (!e1) return; errs.push(e1.message);
        
        let { error: e2 } = await this.client.from('money_accounts').insert([{ id, name: a.name, accountType: a.account_type, ownerType: a.owner_type, opening_balance: a.opening_balance || 0 }]);
        if (!e2) return; errs.push(e2.message);
        
        let { error: e3 } = await this.client.from('money_accounts').insert([{ id, name: a.name, accounttype: a.account_type, ownertype: a.owner_type, opening_balance: a.opening_balance || 0 }]);
        if (e3) { errs.push(e3.message); throw new Error("Auto-Heal Insert Failed: " + errs.join(" | ")); }
        return id;
    },

    async safeInsertLedger(l) {
        let errs = [];
        const id = crypto.randomUUID();
        let { error: e1 } = await this.client.from('ledgers').insert([{ id, name: l.name, group_id: l.group_id }]);
        if (!e1) return; errs.push(e1.message);

        let { error: e2 } = await this.client.from('ledgers').insert([{ id, name: l.name, groupId: l.group_id }]);
        if (!e2) return; errs.push(e2.message);

        let { error: e3 } = await this.client.from('ledgers').insert([{ id, name: l.name, groupid: l.group_id }]);
        if (e3) { errs.push(e3.message); throw new Error("Auto-Heal Insert Failed: " + errs.join(" | ")); }
        return id;
    },

    async addAccount(d) { 
        if (!this.client) return;
        const id = await this.safeInsertAccount({
            name: d.name,
            account_type: d.account_type,
            owner_type: d.owner_type,
            opening_balance: parseFloat(d.opening_balance) || 0
        });
        if (id) this.postToGoogleSheets('account', 'CREATE', { id, ...d });
        await this.syncMasterData(); 
    },

    async addLedger(d)  { 
        const id = await this.safeInsertLedger(d);
        if (id) this.postToGoogleSheets('ledger', 'CREATE', { id, ...d });
        await this.syncMasterData(); 
    },
    async updateAccount(id, payload) {
        if (!this.client) return;
        const { error } = await this.client.from('money_accounts').update(payload).eq('id', id);
        if (error) throw error;
        this.postToGoogleSheets('account', String(payload.name).startsWith('[ARCHIVED]') ? 'ARCHIVE' : 'EDIT', { id, ...payload });
        await this.syncMasterData();
    },
    async deleteAccount(id) {
        if (!this.client) return;
        const { error } = await this.client.from('money_accounts').delete().eq('id', id);
        if (error) throw error;
        this.postToGoogleSheets('account', 'DELETE', { id });
        await this.syncMasterData();
    },
    async updateLedger(id, payload) {
        if (!this.client) return;
        const { error } = await this.client.from('ledgers').update(payload).eq('id', id);
        if (error) throw error;
        this.postToGoogleSheets('ledger', String(payload.name).startsWith('[ARCHIVED]') ? 'ARCHIVE' : 'EDIT', { id, ...payload });
        await this.syncMasterData();
    },
    async deleteLedger(id) {
        if (!this.client) return;
        const { error } = await this.client.from('ledgers').delete().eq('id', id);
        if (error) throw error;
        this.postToGoogleSheets('ledger', 'DELETE', { id });
        await this.syncMasterData();
    },
    async updateGroup(id, payload) {
        if (!this.client) return;
        const { error } = await this.client.from('ledger_groups').update(payload).eq('id', id);
        if (error) throw error;
        await this.syncMasterData();
    },
    async deleteGroup(id) {
        if (!this.client) return;
        const { error } = await this.client.from('ledger_groups').delete().eq('id', id);
        if (error) throw error;
        await this.syncMasterData();
    },
    async isRecordUsed(type, id) {
        const txs = await this.getAllTransactions({ preset: 'all' }); 
        if (type === 'account') {
            return txs.some(t => t.account_id === id || t.money_account_id === id || t.from_account_id === id || t.to_account_id === id);
        }
        if (type === 'ledger') {
            return txs.some(t => t.ledger_id === id);
        }
        if (type === 'group') {
            return this.state.ledgers.some(l => l.group_id === id);
        }
        return false;
    },
    async saveSettings(s) { 
        this.settings = s; 
        const { error } = await this.client.from('app_settings').upsert({ key: 'business_config', value: s }); 
        if (error) throw error;
    },

    async postToGoogleSheets(recordType, actionType, payload) {
        if (!this.settings?.gsBackupEnabled || !this.settings?.gsWebhookUrl) return;
        try {
            const data = {
                app_record_id: payload.id || crypto.randomUUID(),
                action_type: actionType,
                timestamp: new Date().toISOString(),
                record_type: recordType,
                user: this.state.currentUser,
                ...payload
            };
            fetch(this.settings.gsWebhookUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(data)
            }).catch(e => console.warn('[GS Backup Network Error]', e));
        } catch (e) {
            console.warn('[GS Backup Error]', e);
        }
    },

    getDatePreset(p) {
        const d = new Date(), now = d.toISOString().split('T')[0];
        if (p === 'today') return { from: now, to: now };
        if (p === 'this_week') { 
            const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1); 
            const fw = new Date(d.setDate(diff)).toISOString().split('T')[0]; 
            return { from: fw, to: now };
        }
        if (p === 'this_month') { 
            const f = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]; 
            return { from: f, to: now }; 
        }
        if (p === 'last_month') { 
            const f = new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString().split('T')[0];
            const t = new Date(d.getFullYear(), d.getMonth(), 0).toISOString().split('T')[0];
            return { from: f, to: t }; 
        }
        if (p === 'this_year') { 
            const f = new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0]; 
            return { from: f, to: now }; 
        }
        if (p === 'custom') return null;
        return { from: '', to: '' };
    }
};

window.db.init();
