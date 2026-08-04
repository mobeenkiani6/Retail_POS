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
        branch_id VARCHAR(36) REFERENCES branches(id),
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
        branch_id VARCHAR(36) NOT NULL REFERENCES branches(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        stock_level INTEGER NOT NULL DEFAULT 0 CHECK (stock_level >= 0),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(branch_id, product_id)
    )""",
    """CREATE TABLE IF NOT EXISTS inventory_transactions (
        id SERIAL PRIMARY KEY,
        branch_id VARCHAR(36) NOT NULL REFERENCES branches(id),
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


def _migrate_branch_ids_to_uuid(db):
    """Convert legacy integer branch PKs/FKs to UUID strings (PostgreSQL only)."""
    bind = db.session.get_bind()
    if bind.dialect.name != 'postgresql':
        return

    try:
        row = db.session.execute(text(
            "SELECT data_type FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'id'"
        )).fetchone()
    except Exception:
        db.session.rollback()
        return

    if not row or row[0] in ('character varying', 'uuid', 'text'):
        return

    print('Migrating branch IDs from integer to UUID…')
    try:
        db.session.execute(text('CREATE EXTENSION IF NOT EXISTS pgcrypto'))
        db.session.commit()
    except Exception:
        db.session.rollback()

    fk_tables = [
        ('users', 'branch_id'),
        ('settings', 'branch_id'),
        ('inventory', 'branch_id'),
        ('inventory_transactions', 'branch_id'),
        ('product_batches', 'branch_id'),
        ('goods_received_notes', 'branch_id'),
        ('sales', 'branch_id'),
        ('shifts', 'branch_id'),
        ('notifications', 'branch_id'),
    ]

    try:
        # Drop FKs that reference branches(id)
        fks = db.session.execute(text(
            "SELECT tc.table_name, tc.constraint_name "
            "FROM information_schema.table_constraints tc "
            "JOIN information_schema.constraint_column_usage ccu "
            "  ON tc.constraint_name = ccu.constraint_name "
            "WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'branches'"
        )).fetchall()
        for table_name, constraint_name in fks:
            db.session.execute(text(
                f'ALTER TABLE "{table_name}" DROP CONSTRAINT IF EXISTS "{constraint_name}"'
            ))

        db.session.execute(text(
            "ALTER TABLE branches ADD COLUMN IF NOT EXISTS id_uuid VARCHAR(36)"
        ))
        db.session.execute(text(
            "UPDATE branches SET id_uuid = gen_random_uuid()::text WHERE id_uuid IS NULL"
        ))

        for table_name, col in fk_tables:
            exists = db.session.execute(text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ), {'t': table_name}).fetchone()
            if not exists:
                continue
            db.session.execute(text(
                f'ALTER TABLE "{table_name}" ADD COLUMN IF NOT EXISTS {col}_uuid VARCHAR(36)'
            ))
            db.session.execute(text(
                f'UPDATE "{table_name}" t SET {col}_uuid = b.id_uuid '
                f'FROM branches b WHERE t.{col} = b.id AND t.{col} IS NOT NULL'
            ))

        for table_name, col in fk_tables:
            exists = db.session.execute(text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ), {'t': table_name}).fetchone()
            if not exists:
                continue
            db.session.execute(text(f'ALTER TABLE "{table_name}" DROP COLUMN IF EXISTS {col}'))
            db.session.execute(text(
                f'ALTER TABLE "{table_name}" RENAME COLUMN {col}_uuid TO {col}'
            ))

        db.session.execute(text('ALTER TABLE branches DROP CONSTRAINT IF EXISTS branches_pkey'))
        db.session.execute(text('ALTER TABLE branches DROP COLUMN IF EXISTS id'))
        db.session.execute(text('ALTER TABLE branches RENAME COLUMN id_uuid TO id'))
        db.session.execute(text('ALTER TABLE branches ADD PRIMARY KEY (id)'))

        for table_name, col in fk_tables:
            exists = db.session.execute(text(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema = 'public' AND table_name = :t"
            ), {'t': table_name}).fetchone()
            if not exists:
                continue
            db.session.execute(text(
                f'ALTER TABLE "{table_name}" '
                f'ADD CONSTRAINT "{table_name}_{col}_fkey" '
                f'FOREIGN KEY ({col}) REFERENCES branches(id)'
            ))

        db.session.commit()
        print('Branch ID UUID migration complete.')
    except Exception as e:
        db.session.rollback()
        print(f'Branch UUID migration failed (reset DB or migrate manually): {e}')


def _migrate_branch_ids_to_hex(db):
    """Convert dashed UUID branch ids to 32-char hex (strip hyphens)."""
    try:
        rows = db.session.execute(text("SELECT id FROM branches WHERE id LIKE '%-%'")).fetchall()
    except Exception:
        db.session.rollback()
        return

    if not rows:
        return

    print('Migrating dashed branch UUIDs to hex…')
    bind = db.session.get_bind()
    inspector = None
    try:
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(bind)
        existing_tables = set(inspector.get_table_names())
    except Exception:
        existing_tables = {
            'users', 'settings', 'inventory', 'inventory_transactions',
            'product_batches', 'goods_received_notes', 'sales', 'shifts', 'notifications',
        }

    fk_tables = [
        t for t in (
            'users', 'settings', 'inventory', 'inventory_transactions',
            'product_batches', 'goods_received_notes', 'sales', 'shifts', 'notifications',
        ) if t in existing_tables
    ]

    try:
        for (old_id,) in rows:
            new_id = str(old_id).replace('-', '').lower()
            if str(old_id) == new_id:
                continue

            exists = db.session.execute(
                text('SELECT 1 FROM branches WHERE id = :new'), {'new': new_id}
            ).fetchone()
            if not exists:
                db.session.execute(text(
                    'INSERT INTO branches (id, name, address, phone, created_at, archived_at) '
                    'SELECT :new, name, address, phone, created_at, archived_at '
                    'FROM branches WHERE id = :old'
                ), {'new': new_id, 'old': old_id})

            for table in fk_tables:
                db.session.execute(text(
                    f'UPDATE {table} SET branch_id = :new WHERE branch_id = :old'
                ), {'new': new_id, 'old': old_id})

            db.session.execute(text('DELETE FROM branches WHERE id = :old'), {'old': old_id})

        db.session.commit()
        print('Branch ID hex migration complete.')
    except Exception as e:
        db.session.rollback()
        print(f'Branch hex migration failed: {e}')


def run_migrations(db):
    """Apply additive migrations; ignore already-applied changes."""
    _migrate_branch_ids_to_uuid(db)
    _migrate_branch_ids_to_hex(db)

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
