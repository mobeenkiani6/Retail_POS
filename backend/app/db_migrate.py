"""Safe additive DB migrations — run on app startup."""
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError


MIGRATIONS = [
    "ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS store_credit NUMERIC(12,2) DEFAULT 0",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE customers ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(120)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50) DEFAULT 'each'",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_id INTEGER",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock INTEGER DEFAULT 0",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS max_stock INTEGER",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_qty INTEGER DEFAULT 0",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS shelf_location VARCHAR(100)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS sku VARCHAR(100)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id INTEGER",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id INTEGER",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS wholesale_price NUMERIC(12,2)",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS variants JSONB DEFAULT '[]'",
    "ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS variant VARCHAR(100)",
    "ALTER TABLE products ALTER COLUMN requires_expiry SET DEFAULT FALSE",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(12,2) DEFAULT 0",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0",
    "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS outstanding_balance NUMERIC(12,2) DEFAULT 0",
    "ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ",
    "ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER",
    "ALTER TABLE sales ADD COLUMN IF NOT EXISTS notes TEXT",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id INTEGER",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon VARCHAR(50)",
    "ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT",
    """CREATE TABLE IF NOT EXISTS units (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        abbreviation VARCHAR(20) NOT NULL,
        is_default BOOLEAN DEFAULT FALSE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        archived_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER REFERENCES branches(id),
        title VARCHAR(255) NOT NULL,
        message TEXT,
        severity VARCHAR(20) DEFAULT 'info',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    """CREATE TABLE IF NOT EXISTS variant_options (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        sort_order INTEGER DEFAULT 0,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        archived_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS brands (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        description TEXT,
        logo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        archived_at TIMESTAMPTZ
    )""",
    """CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        stock_level INTEGER NOT NULL DEFAULT 0 CHECK (stock_level >= 0),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(branch_id, product_id)
    )""",
    """CREATE TABLE IF NOT EXISTS inventory_transactions (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        delta INTEGER NOT NULL,
        reason VARCHAR(50) NOT NULL,
        reference_type VARCHAR(50),
        reference_id INTEGER,
        notes TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
    )""",
    "ALTER TABLE inventory ADD COLUMN IF NOT EXISTS variant VARCHAR(100) NOT NULL DEFAULT ''",
    "ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS variant VARCHAR(100) NOT NULL DEFAULT ''",
    "ALTER TABLE inventory DROP CONSTRAINT IF EXISTS _branch_product_inventory_uc",
    "ALTER TABLE inventory DROP CONSTRAINT IF EXISTS inventory_branch_id_product_id_key",
    "ALTER TABLE inventory ADD CONSTRAINT _branch_product_variant_uc UNIQUE (branch_id, product_id, variant)",
    "ALTER TABLE products ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'",
    "ALTER TABLE products ALTER COLUMN barcode DROP NOT NULL",
    """CREATE TABLE IF NOT EXISTS product_skus (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        sku_code VARCHAR(100) NOT NULL,
        barcode VARCHAR(100) NOT NULL UNIQUE,
        variant_name VARCHAR(100) NOT NULL DEFAULT 'Standard',
        quantity_value NUMERIC(12,3) NOT NULL DEFAULT 1,
        unit_id INTEGER REFERENCES units(id),
        unit_abbr VARCHAR(20),
        cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        wholesale_price NUMERIC(12,2),
        tax_rate NUMERIC(5,2),
        min_stock INTEGER DEFAULT 0,
        max_stock INTEGER,
        reorder_level INTEGER DEFAULT 0,
        shelf_location VARCHAR(100),
        image_url TEXT,
        notes TEXT,
        status VARCHAR(20) DEFAULT 'active',
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        archived_at TIMESTAMPTZ
    )""",
    "ALTER TABLE inventory ADD COLUMN IF NOT EXISTS sku_id INTEGER REFERENCES product_skus(id)",
    "ALTER TABLE inventory_transactions ADD COLUMN IF NOT EXISTS sku_id INTEGER REFERENCES product_skus(id)",
    "ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS sku_id INTEGER REFERENCES product_skus(id)",
    "ALTER TABLE grn_items ADD COLUMN IF NOT EXISTS sku_id INTEGER REFERENCES product_skus(id)",
    "ALTER TABLE inventory DROP CONSTRAINT IF EXISTS _branch_sku_uc",
    "ALTER TABLE inventory ADD CONSTRAINT _branch_sku_uc UNIQUE (branch_id, sku_id)",
]


def run_migrations(db):
    """Apply additive migrations; ignore already-applied changes."""
    for sql in MIGRATIONS:
        try:
            db.session.execute(text(sql))
            db.session.commit()
        except (OperationalError, ProgrammingError) as e:
            db.session.rollback()
            err = str(e).lower()
            if 'already exists' not in err and 'duplicate' not in err:
                print(f'Migration note: {sql[:50]}... ({e})')

    # Seed default units if none exist
    try:
        from app.models import Unit
        if Unit.query.count() == 0:
            defaults = [
                ('Piece', 'pc', True),
                ('Each', 'ea', False),
                ('Gram', 'g', False),
                ('Kilogram', 'kg', False),
                ('Milliliter', 'ml', False),
                ('Liter', 'L', False),
                ('Bottle', 'btl', False),
                ('Can', 'can', False),
                ('Packet', 'pkt', False),
                ('Pack', 'pk', False),
                ('Jar', 'jar', False),
                ('Roll', 'roll', False),
                ('Dozen', 'dz', False),
                ('Box', 'bx', False),
                ('Crate', 'crt', False),
                ('Bundle', 'bdl', False),
            ]
            for name, abbr, is_default in defaults:
                db.session.add(Unit(name=name, abbreviation=abbr, is_default=is_default, active=True))
            db.session.commit()
            print('Seeded default units.')
    except Exception as e:
        db.session.rollback()
        print(f'Unit seed note: {e}')

    try:
        from app.models import VariantOption
        if VariantOption.query.count() == 0:
            defaults = ['Small', 'Medium', 'Large', 'XL', 'XXL', 'Standard']
            for i, name in enumerate(defaults):
                db.session.add(VariantOption(name=name, sort_order=i, active=True))
            db.session.commit()
            print('Seeded default variant options.')
    except Exception as e:
        db.session.rollback()
        print(f'Variant option seed note: {e}')

    try:
        from app.services.stock_service import migrate_batches_to_inventory
        migrate_batches_to_inventory(db.session)
    except Exception as e:
        db.session.rollback()
        print(f'Inventory migration note: {e}')

    try:
        from app.services.sku_migration import migrate_products_to_skus
        migrate_products_to_skus()
    except Exception as e:
        db.session.rollback()
        print(f'SKU migration note: {e}')

    try:
        from app.services.stock_service import fix_sku_inventory_variants
        fix_sku_inventory_variants(db.session)
    except Exception as e:
        db.session.rollback()
        print(f'SKU inventory variant fix note: {e}')
