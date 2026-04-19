-- ==========================================
-- Partner Portal v6.0 - Supabase Schema
-- ==========================================

-- 1. App Settings (for Business Config)
CREATE TABLE IF NOT EXISTS app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 2. Ledger Groups
CREATE TABLE IF NOT EXISTS ledger_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    nature TEXT NOT NULL, -- Asset, Liability, Income, Expense, Capital
    is_internal BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Ledgers
CREATE TABLE IF NOT EXISTS ledgers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    group_id UUID REFERENCES ledger_groups(id) ON DELETE CASCADE,
    opening_balance DECIMAL(18,2) DEFAULT 0,
    opening_balance_type TEXT DEFAULT 'Dr', -- Dr or Cr
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Money Accounts (Actual Cash/Bank)
CREATE TABLE IF NOT EXISTS money_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    accountType TEXT NOT NULL, -- UPI, Bank, Cash
    ownerType TEXT NOT NULL, -- Business, Partner1, Partner2
    opening_balance DECIMAL(18,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Transactions (Sales, Purchases, Expenses)
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- sale, purchase, expense
    date DATE NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    ledger_id UUID REFERENCES ledgers(id),
    account_id UUID REFERENCES money_accounts(id), -- For sales/purchases
    notes TEXT,
    created_by TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 6. Partner Transactions (Investments, Withdrawals, Settlements)
CREATE TABLE IF NOT EXISTS partner_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL, -- investment, withdrawal, settlement
    date DATE NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    partner_id TEXT, -- partner1, partner2
    money_account_id UUID REFERENCES money_accounts(id),
    from_partner_id TEXT, -- for settlement
    to_partner_id TEXT, -- for settlement
    from_account_id UUID REFERENCES money_accounts(id), -- for settlement
    to_account_id UUID REFERENCES money_accounts(id), -- for settlement
    notes TEXT,
    created_by TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Default Data: App Config
INSERT INTO app_settings (key, value) VALUES ('business_config', '{
    "p1Name": "Partner 1",
    "p2Name": "Partner 2",
    "profitSharing": 50,
    "currency": "₹",
    "businessName": "Triven Partner Portal",
    "precision": 2
}') ON CONFLICT (key) DO NOTHING;

-- Default Data: Basic Ledger Groups
INSERT INTO ledger_groups (name, nature, is_internal) VALUES 
('Sales Accounts', 'Income', true),
('Purchase Accounts', 'Expense', true),
('Direct Expenses', 'Expense', true),
('Indirect Expenses', 'Expense', true),
('Sundry Debtors', 'Asset', true),
('Sundry Creditors', 'Liability', true),
('Capital Accounts', 'Capital', true),
('Current Assets', 'Asset', true)
ON CONFLICT DO NOTHING;
