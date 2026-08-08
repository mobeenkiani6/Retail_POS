from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import CheckConstraint
from datetime import datetime
import uuid

db = SQLAlchemy()


class Branch(db.Model):
    __tablename__ = 'branches'
    # Hex string (32 chars) — shared with the admin panel for this POS instance
    id = db.Column(db.String(36), primary_key=True, default=lambda: uuid.uuid4().hex)
    name = db.Column(db.String(255), nullable=False)
    address = db.Column(db.Text)
    phone = db.Column(db.String(50))
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    users = db.relationship('User', backref='branch', lazy=True)
    sales = db.relationship('Sale', backref='branch', lazy=True)
    settings = db.relationship('Setting', backref='branch', uselist=False)
    batches = db.relationship('ProductBatch', backref='branch', lazy=True)
    grns = db.relationship('GoodsReceivedNote', backref='branch', lazy=True)


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    pin_hash = db.Column(db.String(255))
    role = db.Column(db.String(50), default='cashier')  # owner, manager, cashier, inventory_manager
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)
    last_login_at = db.Column(db.DateTime(timezone=True), nullable=True)

    sales = db.relationship('Sale', backref='user', lazy=True)
    shifts = db.relationship('Shift', backref='user', lazy=True)


class Setting(db.Model):
    __tablename__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), unique=True, nullable=True)
    config = db.Column(db.JSON, nullable=False, default={})


class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.Text)
    parent_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    sort_order = db.Column(db.Integer, default=0)
    icon = db.Column(db.String(50), nullable=True)
    image_url = db.Column(db.Text, nullable=True)
    # Days before expiry to warn (e.g. 2 for fresh produce, 14 for grocery). Null = use product/default.
    expiry_warning_days = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    products = db.relationship('Product', backref='category', lazy=True)
    children = db.relationship('Category', backref=db.backref('parent', remote_side=[id]), lazy=True)


class VariantOption(db.Model):
    __tablename__ = 'variant_options'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    sort_order = db.Column(db.Integer, default=0)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)


class Unit(db.Model):
    __tablename__ = 'units'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    abbreviation = db.Column(db.String(20), nullable=False)
    is_default = db.Column(db.Boolean, default=False)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    products = db.relationship('Product', backref='unit_ref', lazy=True, foreign_keys='Product.unit_id')


class Brand(db.Model):
    __tablename__ = 'brands'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    logo_url = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    products = db.relationship('Product', backref='brand_ref', lazy=True, foreign_keys='Product.brand_id')


class Supplier(db.Model):
    __tablename__ = 'suppliers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    supplier_code = db.Column(db.String(80), unique=True, nullable=True)
    contact_name = db.Column(db.String(255))
    email = db.Column(db.String(255))
    phone = db.Column(db.String(50))
    whatsapp = db.Column(db.String(50), nullable=True)
    address = db.Column(db.Text)
    city = db.Column(db.String(100), nullable=True)
    state = db.Column(db.String(100), nullable=True)
    country = db.Column(db.String(100), nullable=True)
    postal_code = db.Column(db.String(30), nullable=True)
    ntn = db.Column(db.String(50), nullable=True)
    strn = db.Column(db.String(50), nullable=True)
    payment_terms = db.Column(db.String(120), nullable=True)
    credit_limit = db.Column(db.Numeric(12, 2), nullable=True, default=0)
    opening_balance = db.Column(db.Numeric(12, 2), nullable=True, default=0)
    outstanding_balance = db.Column(db.Numeric(12, 2), default=0)  # current balance / due
    bank_name = db.Column(db.String(120), nullable=True)
    bank_account = db.Column(db.String(80), nullable=True)
    iban = db.Column(db.String(80), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='active')  # active | inactive
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    grns = db.relationship('GoodsReceivedNote', backref='supplier', lazy=True)
    ledger_entries = db.relationship('SupplierLedgerEntry', backref='supplier', lazy=True)


class SupplierLedgerEntry(db.Model):
    """Purchase / payment / return ledger lines for a supplier."""
    __tablename__ = 'supplier_ledger_entries'
    id = db.Column(db.Integer, primary_key=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=False, index=True)
    entry_type = db.Column(db.String(30), nullable=False)  # purchase | payment | return | adjustment
    amount = db.Column(db.Numeric(12, 2), nullable=False)  # +increases due, -decreases due
    balance_after = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    reference_type = db.Column(db.String(50), nullable=True)  # grn | payment | manual
    reference_id = db.Column(db.Integer, nullable=True)
    reference_number = db.Column(db.String(80), nullable=True)
    payment_method = db.Column(db.String(50), nullable=True)  # cash | bank_transfer | cheque | online
    notes = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, index=True)


class Product(db.Model):
    """Parent product — catalog identity only. Pricing and stock live on ProductSku."""
    __table_args__ = (CheckConstraint('base_price >= 0', name='ck_product_base_price_non_neg'),)
    __tablename__ = 'products'
    id = db.Column(db.Integer, primary_key=True)
    sku = db.Column(db.String(100), nullable=True)
    barcode = db.Column(db.String(100), unique=True, nullable=True)
    name = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'), nullable=True)
    brand_id = db.Column(db.Integer, db.ForeignKey('brands.id'), nullable=True)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    base_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    wholesale_price = db.Column(db.Numeric(12, 2), nullable=True)
    cost_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    tax_rate = db.Column(db.Numeric(5, 2), default=0)
    requires_expiry = db.Column(db.Boolean, default=False)
    shelf_life_days = db.Column(db.Integer, nullable=True)  # optional: auto-suggest expiry on receive
    expiry_warning_days = db.Column(db.Integer, nullable=True)  # override category/default warning window
    image_url = db.Column(db.Text, nullable=True, default='')
    brand = db.Column(db.String(120), nullable=True)
    unit = db.Column(db.String(50), nullable=True, default='each')
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True)
    # Packaging: how much product content is in 1 carton / 1 packet (qty + unit of measure)
    carton_qty = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    carton_unit = db.Column(db.String(20), nullable=True)
    packet_qty = db.Column(db.Numeric(12, 3), nullable=False, default=0)
    packet_unit = db.Column(db.String(20), nullable=True)
    min_stock = db.Column(db.Integer, default=0)
    max_stock = db.Column(db.Integer, nullable=True)
    reorder_qty = db.Column(db.Integer, default=0)
    shelf_location = db.Column(db.String(100), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    variants = db.Column(db.JSON, nullable=False, default=list)
    status = db.Column(db.String(20), default='active')
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    batches = db.relationship('ProductBatch', backref='product', lazy=True)
    sale_items = db.relationship('SaleItem', backref='product', lazy=True)
    inventory_rows = db.relationship('Inventory', backref='product', lazy=True)
    supplier = db.relationship('Supplier', backref='products', lazy=True)
    skus = db.relationship('ProductSku', backref='product', lazy=True, cascade='all, delete-orphan',
                           order_by='ProductSku.sort_order')


class ProductSku(db.Model):
    """Sellable SKU — each pack size is a distinct item with its own barcode, price, and stock."""
    __tablename__ = 'product_skus'
    __table_args__ = (
        CheckConstraint('selling_price >= 0', name='ck_sku_selling_price_non_neg'),
        CheckConstraint('cost_price >= 0', name='ck_sku_cost_price_non_neg'),
        CheckConstraint('quantity_value > 0', name='ck_sku_qty_positive'),
    )
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id', ondelete='CASCADE'), nullable=False)
    sku_code = db.Column(db.String(100), nullable=False, unique=True)
    barcode = db.Column(db.String(100), unique=True, nullable=True)  # nullable for unpackaged goods
    variant_name = db.Column(db.String(100), nullable=False, default='Standard')
    quantity_value = db.Column(db.Numeric(12, 3), nullable=False, default=1)
    unit_id = db.Column(db.Integer, db.ForeignKey('units.id'), nullable=True)
    unit_abbr = db.Column(db.String(20), nullable=True)
    cost_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    selling_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    wholesale_price = db.Column(db.Numeric(12, 2), nullable=True)
    tax_rate = db.Column(db.Numeric(5, 2), nullable=True)
    min_stock = db.Column(db.Integer, default=0)
    max_stock = db.Column(db.Integer, nullable=True)
    reorder_level = db.Column(db.Integer, default=0)
    shelf_location = db.Column(db.String(100), nullable=True)
    image_url = db.Column(db.Text, nullable=True)
    notes = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(20), default='active')
    sort_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    unit_ref = db.relationship('Unit', foreign_keys=[unit_id])
    inventory_rows = db.relationship('Inventory', backref='sku', lazy=True)
    sale_items = db.relationship('SaleItem', backref='sku', lazy=True)


class Inventory(db.Model):
    __tablename__ = 'inventory'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    variant = db.Column(db.String(100), nullable=False, default='')
    stock_level = db.Column(db.Integer, default=0, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('branch_id', 'product_id', 'variant', name='_branch_product_variant_uc'),
        db.UniqueConstraint('branch_id', 'sku_id', name='_branch_sku_uc'),
        CheckConstraint('stock_level >= 0', name='ck_inventory_stock_non_neg'),
    )


class InventoryTransaction(db.Model):
    __tablename__ = 'inventory_transactions'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    variant = db.Column(db.String(100), nullable=False, default='')
    delta = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.String(50), nullable=False)
    reference_type = db.Column(db.String(50))
    reference_id = db.Column(db.Integer)
    notes = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    product = db.relationship('Product', backref='inventory_transactions', lazy=True)


class ProductBatch(db.Model):
    __tablename__ = 'product_batches'
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    batch_number = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, default=0)
    cost_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    sell_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    expiry_date = db.Column(db.Date, nullable=True)
    received_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    markdown_percent = db.Column(db.Numeric(5, 2), default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    movements = db.relationship('BatchMovement', backref='batch', lazy=True)
    sale_items = db.relationship('SaleItem', backref='batch', lazy=True)
    sku = db.relationship('ProductSku', backref='batches', lazy=True)

    __table_args__ = (
        db.UniqueConstraint('branch_id', 'product_id', 'batch_number', name='_branch_product_batch_uc'),
        CheckConstraint('quantity >= 0', name='ck_batch_qty_non_neg'),
        CheckConstraint('cost_price >= 0', name='ck_batch_cost_non_neg'),
        CheckConstraint('sell_price >= 0', name='ck_batch_sell_non_neg'),
    )


class BatchMovement(db.Model):
    __tablename__ = 'batch_movements'
    id = db.Column(db.Integer, primary_key=True)
    batch_id = db.Column(db.Integer, db.ForeignKey('product_batches.id'), nullable=False)
    movement_type = db.Column(db.String(50), nullable=False)  # grn_in, sale_out, adjustment, transfer, expiry_writeoff
    quantity_delta = db.Column(db.Integer, nullable=False)
    reference_type = db.Column(db.String(50))
    reference_id = db.Column(db.Integer)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class GoodsReceivedNote(db.Model):
    __tablename__ = 'goods_received_notes'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    supplier_id = db.Column(db.Integer, db.ForeignKey('suppliers.id'), nullable=True)
    grn_number = db.Column(db.String(50), unique=True, nullable=False)
    # draft (=active), partial, received (=completed), cancelled, deleted
    status = db.Column(db.String(30), default='draft')
    received_at = db.Column(db.DateTime(timezone=True), nullable=True)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    items = db.relationship('GRNItem', backref='grn', lazy=True, cascade='all, delete-orphan')


class GRNItem(db.Model):
    __tablename__ = 'grn_items'
    __table_args__ = (CheckConstraint('quantity > 0', name='ck_grn_item_qty_positive'),)
    id = db.Column(db.Integer, primary_key=True)
    grn_id = db.Column(db.Integer, db.ForeignKey('goods_received_notes.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    batch_number = db.Column(db.String(100), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)  # ordered qty (in receive_unit)
    received_quantity = db.Column(db.Integer, nullable=False, default=0)  # cumulative received
    # unit | carton | packet — quantity is counted in this packaging unit
    receive_unit = db.Column(db.String(20), nullable=False, default='unit')
    cost_price = db.Column(db.Numeric(12, 2), nullable=False)
    sell_price = db.Column(db.Numeric(12, 2), nullable=False)
    expiry_date = db.Column(db.Date, nullable=True)

    product = db.relationship('Product', backref='grn_items', lazy=True)


class Sale(db.Model):
    __tablename__ = 'sales'
    __table_args__ = (
        CheckConstraint('total_amount >= 0', name='ck_sale_total_non_neg'),
        CheckConstraint('tax_amount >= 0', name='ck_sale_tax_non_neg'),
        CheckConstraint(
            "status IN ('completed', 'refunded', 'held', 'partially_returned')",
            name='ck_sale_status_valid',
        ),
    )
    id = db.Column(db.Integer, primary_key=True)
    invoice_uuid = db.Column(db.String(36), unique=True, nullable=False, default=lambda: str(uuid.uuid4()))
    invoice_number = db.Column(db.String(40), unique=True, nullable=True, index=True)
    receipt_number = db.Column(db.String(40), unique=True, nullable=True, index=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    terminal_id = db.Column(db.String(64), nullable=True)
    subtotal_amount = db.Column(db.Numeric(12, 2), nullable=True, default=0)
    total_amount = db.Column(db.Numeric(12, 2), nullable=False)
    tax_amount = db.Column(db.Numeric(12, 2), nullable=False)
    cogs_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    payment_method = db.Column(db.String(50))
    cash_received = db.Column(db.Numeric(12, 2), nullable=True)
    receipt_snapshot = db.Column(db.JSON, nullable=True)  # exact print payload — never recalculate on reprint
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    synced_at = db.Column(db.DateTime(timezone=True), nullable=True)
    status = db.Column(db.String(20), default='completed')
    discount_amount = db.Column(db.Numeric(12, 2), nullable=True, default=0)
    discount_id = db.Column(db.String(64), nullable=True)
    discount_snapshot = db.Column(db.JSON, nullable=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=True)
    notes = db.Column(db.Text, nullable=True)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    items = db.relationship('SaleItem', backref='sale', lazy=True, cascade='all, delete-orphan')
    returns = db.relationship('SaleReturn', backref='sale', lazy=True, cascade='all, delete-orphan')


class SaleItem(db.Model):
    __tablename__ = 'sale_items'
    __table_args__ = (
        CheckConstraint('quantity > 0', name='ck_sale_item_quantity_positive'),
        CheckConstraint('unit_price >= 0', name='ck_sale_item_unit_price_non_neg'),
        CheckConstraint('subtotal >= 0', name='ck_sale_item_subtotal_non_neg'),
        CheckConstraint('cost_price >= 0', name='ck_sale_item_cost_non_neg'),
    )
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=True)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    batch_id = db.Column(db.Integer, db.ForeignKey('product_batches.id'), nullable=True)
    quantity = db.Column(db.Integer, nullable=False)
    quantity_returned = db.Column(db.Integer, nullable=False, default=0)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    cost_price = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    subtotal = db.Column(db.Numeric(12, 2), nullable=False)
    variant = db.Column(db.String(100), nullable=True)


class SaleReturn(db.Model):
    __tablename__ = 'sale_returns'
    id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id', ondelete='CASCADE'), nullable=False, index=True)
    return_number = db.Column(db.String(40), unique=True, nullable=False)
    refund_amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    refund_method = db.Column(db.String(50), nullable=True)
    reason = db.Column(db.Text, nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)

    items = db.relationship('SaleReturnItem', backref='sale_return', lazy=True, cascade='all, delete-orphan')


class SaleReturnItem(db.Model):
    __tablename__ = 'sale_return_items'
    id = db.Column(db.Integer, primary_key=True)
    return_id = db.Column(db.Integer, db.ForeignKey('sale_returns.id', ondelete='CASCADE'), nullable=False)
    sale_item_id = db.Column(db.Integer, db.ForeignKey('sale_items.id'), nullable=False)
    quantity = db.Column(db.Integer, nullable=False)
    unit_price = db.Column(db.Numeric(12, 2), nullable=False)
    subtotal = db.Column(db.Numeric(12, 2), nullable=False)


class SyncOutbox(db.Model):
    __tablename__ = 'sync_outbox'
    id = db.Column(db.Integer, primary_key=True)
    event_type = db.Column(db.String(50), nullable=False)
    payload = db.Column(db.JSON, nullable=False)
    invoice_uuid = db.Column(db.String(36), nullable=True, index=True)
    status = db.Column(db.String(20), default='pending')  # pending, synced, failed
    attempts = db.Column(db.Integer, default=0)
    last_error = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    synced_at = db.Column(db.DateTime(timezone=True), nullable=True)


class Customer(db.Model):
    __tablename__ = 'customers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    email = db.Column(db.String(255))
    phone = db.Column(db.String(50))
    loyalty_points = db.Column(db.Integer, default=0)
    store_credit = db.Column(db.Numeric(12, 2), default=0)
    birthday = db.Column(db.Date, nullable=True)
    notes = db.Column(db.Text)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)


class Coupon(db.Model):
    __tablename__ = 'coupons'
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)
    name = db.Column(db.String(255))
    discount_type = db.Column(db.String(20), default='percent')  # percent, fixed
    discount_value = db.Column(db.Numeric(12, 2), nullable=False)
    active = db.Column(db.Boolean, default=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)


class GiftCard(db.Model):
    __tablename__ = 'gift_cards'
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(50), unique=True, nullable=False)
    balance = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class Promotion(db.Model):
    __tablename__ = 'promotions'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    promo_type = db.Column(db.String(50))
    config = db.Column(db.JSON, default={})
    active = db.Column(db.Boolean, default=True)
    starts_at = db.Column(db.DateTime(timezone=True))
    ends_at = db.Column(db.DateTime(timezone=True))


class Shift(db.Model):
    __tablename__ = 'shifts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    opened_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    closed_at = db.Column(db.DateTime(timezone=True), nullable=True)
    opening_cash = db.Column(db.Numeric(12, 2), default=0)
    closing_cash = db.Column(db.Numeric(12, 2), nullable=True)


class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    action = db.Column(db.String(100), nullable=False)
    entity_type = db.Column(db.String(50))
    entity_id = db.Column(db.Integer)
    details = db.Column(db.JSON)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class Notification(db.Model):
    __tablename__ = 'notifications'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    message = db.Column(db.Text)
    severity = db.Column(db.String(20), default='info')
    read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


# ── Admin / HQ extensions ─────────────────────────────────────────────────────


class ExpenseCategory(db.Model):
    __tablename__ = 'expense_categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False, unique=True)
    description = db.Column(db.Text)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class Expense(db.Model):
    __tablename__ = 'expenses'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=True, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey('expense_categories.id'), nullable=True)
    title = db.Column(db.String(255), nullable=False)
    amount = db.Column(db.Numeric(12, 2), nullable=False, default=0)
    payment_method = db.Column(db.String(50), nullable=True)
    expense_date = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, index=True)
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    archived_at = db.Column(db.DateTime(timezone=True), nullable=True)

    category = db.relationship('ExpenseCategory', backref='expenses', lazy=True)


class LoyaltyTransaction(db.Model):
    __tablename__ = 'loyalty_transactions'
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False, index=True)
    sale_id = db.Column(db.Integer, db.ForeignKey('sales.id'), nullable=True)
    points_delta = db.Column(db.Integer, nullable=False, default=0)
    balance_after = db.Column(db.Integer, nullable=False, default=0)
    reason = db.Column(db.String(100), nullable=True)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class CustomerNote(db.Model):
    __tablename__ = 'customer_notes'
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False, index=True)
    body = db.Column(db.Text, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class CustomerAddress(db.Model):
    __tablename__ = 'customer_addresses'
    id = db.Column(db.Integer, primary_key=True)
    customer_id = db.Column(db.Integer, db.ForeignKey('customers.id'), nullable=False, index=True)
    label = db.Column(db.String(50), default='home')
    line1 = db.Column(db.String(255), nullable=False)
    line2 = db.Column(db.String(255))
    city = db.Column(db.String(100))
    state = db.Column(db.String(100))
    postal_code = db.Column(db.String(30))
    country = db.Column(db.String(100))
    is_default = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class LoginHistory(db.Model):
    __tablename__ = 'login_history'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    success = db.Column(db.Boolean, default=True)
    ip_address = db.Column(db.String(64))
    user_agent = db.Column(db.String(512))
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, index=True)


class UserSession(db.Model):
    __tablename__ = 'user_sessions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    token_jti = db.Column(db.String(64), unique=True, nullable=False, index=True)
    ip_address = db.Column(db.String(64))
    user_agent = db.Column(db.String(512))
    revoked_at = db.Column(db.DateTime(timezone=True), nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class PermissionOverride(db.Model):
    __tablename__ = 'permission_overrides'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    permission_key = db.Column(db.String(100), nullable=False)
    allowed = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)


class StockTransfer(db.Model):
    __tablename__ = 'stock_transfers'
    id = db.Column(db.Integer, primary_key=True)
    transfer_number = db.Column(db.String(40), unique=True, nullable=False)
    from_branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    to_branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False)
    status = db.Column(db.String(20), default='draft')  # draft | in_transit | received | cancelled
    notes = db.Column(db.Text)
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    received_at = db.Column(db.DateTime(timezone=True), nullable=True)

    items = db.relationship('StockTransferItem', backref='transfer', lazy=True, cascade='all, delete-orphan')


class StockTransferItem(db.Model):
    __tablename__ = 'stock_transfer_items'
    id = db.Column(db.Integer, primary_key=True)
    transfer_id = db.Column(db.Integer, db.ForeignKey('stock_transfers.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    quantity = db.Column(db.Integer, nullable=False, default=0)


class CycleCount(db.Model):
    __tablename__ = 'cycle_counts'
    id = db.Column(db.Integer, primary_key=True)
    branch_id = db.Column(db.String(36), db.ForeignKey('branches.id'), nullable=False, index=True)
    name = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='open')  # open | completed | cancelled
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
    completed_at = db.Column(db.DateTime(timezone=True), nullable=True)

    items = db.relationship('CycleCountItem', backref='cycle_count', lazy=True, cascade='all, delete-orphan')


class CycleCountItem(db.Model):
    __tablename__ = 'cycle_count_items'
    id = db.Column(db.Integer, primary_key=True)
    cycle_count_id = db.Column(db.Integer, db.ForeignKey('cycle_counts.id', ondelete='CASCADE'), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('products.id'), nullable=False)
    sku_id = db.Column(db.Integer, db.ForeignKey('product_skus.id'), nullable=True)
    expected_qty = db.Column(db.Integer, default=0)
    counted_qty = db.Column(db.Integer, nullable=True)
    variance = db.Column(db.Integer, nullable=True)


class IntegrationSetting(db.Model):
    __tablename__ = 'integration_settings'
    id = db.Column(db.Integer, primary_key=True)
    provider = db.Column(db.String(50), nullable=False, unique=True)  # email | sms | whatsapp | custom
    config = db.Column(db.JSON, default=dict)
    enabled = db.Column(db.Boolean, default=False)
    updated_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    created_at = db.Column(db.DateTime(timezone=True), default=datetime.utcnow)
