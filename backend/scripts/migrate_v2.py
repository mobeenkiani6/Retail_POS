"""Add new columns to existing tables (safe migration for db.create_all limitations)."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.models import db

MIGRATIONS = [
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit NUMERIC(12,2) DEFAULT 0",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'each'",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock INTEGER",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_qty INTEGER DEFAULT 0",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12,2) DEFAULT 0",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
    "ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id)",
    "ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT",
]

if __name__ == '__main__':
    app = create_app()
    with app.app_context():
        for sql in MIGRATIONS:
            try:
                db.session.execute(db.text(sql))
                db.session.commit()
                print(f'OK: {sql[:60]}...')
            except Exception as e:
                db.session.rollback()
                print(f'SKIP: {sql[:40]}... ({e})')
        print('Migration complete.')
