-- ASR Global Solutions customer-lead schema (PostgreSQL)
-- SQLAlchemy creates this table automatically; this file is provided for DBAs.

CREATE TABLE IF NOT EXISTS customer_leads (
    -- Business-friendly reference returned to the customer after submission.
    customer_id VARCHAR(32) PRIMARY KEY,
    -- TIMESTAMPTZ preserves an unambiguous UTC-aware creation time.
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name VARCHAR(100) NOT NULL,
    company VARCHAR(150) NOT NULL DEFAULT '',
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(30) NOT NULL DEFAULT '',
    requirement TEXT NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'Website',
    status VARCHAR(30) NOT NULL DEFAULT 'New',
    -- Restrict workflow status to values recognized by the sales process.
    CONSTRAINT customer_leads_status_check
        CHECK (status IN ('New', 'Contacted', 'Qualified', 'Quoted', 'Won', 'Lost', 'Closed'))
);

-- Index the fields most likely to be searched in a future sales dashboard.
CREATE INDEX IF NOT EXISTS ix_customer_leads_created_at ON customer_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS ix_customer_leads_email ON customer_leads (email);
CREATE INDEX IF NOT EXISTS ix_customer_leads_status ON customer_leads (status);
