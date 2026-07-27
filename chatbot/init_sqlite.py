"""Initialize the local SQLite database without requiring SQLAlchemy."""

import sqlite3
from pathlib import Path

database_path = Path(__file__).with_name("data") / "asr_customers.db"
database_path.parent.mkdir(parents=True, exist_ok=True)

schema = """
CREATE TABLE IF NOT EXISTS customer_leads (
    customer_id VARCHAR(32) PRIMARY KEY,
    created_at DATETIME NOT NULL,
    name VARCHAR(100) NOT NULL,
    company VARCHAR(150) NOT NULL DEFAULT '',
    email VARCHAR(254) NOT NULL,
    phone VARCHAR(30) NOT NULL DEFAULT '',
    requirement TEXT NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'Website',
    status VARCHAR(30) NOT NULL DEFAULT 'New'
);
CREATE INDEX IF NOT EXISTS ix_customer_leads_created_at ON customer_leads(created_at);
CREATE INDEX IF NOT EXISTS ix_customer_leads_email ON customer_leads(email);
CREATE INDEX IF NOT EXISTS ix_customer_leads_status ON customer_leads(status);
"""

with sqlite3.connect(database_path) as connection:
    connection.executescript(schema)
    objects = connection.execute(
        "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') ORDER BY name"
    ).fetchall()

print(f"SQLite ready: {database_path}")
print("Objects:", ", ".join(name for (name,) in objects))
