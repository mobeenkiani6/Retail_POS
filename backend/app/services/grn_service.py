"""Goods Received Notes (GRN) — purchase receiving without batch tracking."""
from datetime import datetime
from decimal import Decimal
from app.models import db, GoodsReceivedNote, GRNItem, Product, ProductSku
from app.services.stock_service import restock, restock_sku
from app.services.packaging_service import receive_quantity_to_stock, cost_per_sku_unit
from app.services.notification_service import notify_sale_below_cost

# UI categories ↔ DB statuses
# active → draft | completed → received | partial → partial | deleted → deleted|cancelled
CATEGORY_STATUSES = {
    'active': ('draft',),
    'completed': ('received',),
    'partial': ('partial',),
    'deleted': ('deleted', 'cancelled'),
}

RECEIVABLE_STATUSES = ('draft', 'partial')


def generate_grn_number():
    count = GoodsReceivedNote.query.count() + 1
    return f'GRN-{datetime.utcnow().strftime("%Y%m%d")}-{count:04d}'


def _normalize_receive_unit(value):
    ru = (value or 'unit').strip().lower()
    if ru in ('carton', 'cartons', 'box', 'boxes'):
        return 'carton'
    if ru in ('packet', 'packets', 'pack', 'packs', 'pkt'):
        return 'packet'
    return 'unit'


def _item_received_qty(item):
    return int(getattr(item, 'received_quantity', None) or 0)


def _item_remaining(item):
    return max(0, int(item.quantity or 0) - _item_received_qty(item))


def create_grn(branch_id, supplier_id, items, user_id, notes=None):
    if not items:
        raise ValueError('GRN must have at least one item')

    grn = GoodsReceivedNote(
        branch_id=branch_id,
        supplier_id=supplier_id,
        grn_number=generate_grn_number(),
        status='draft',
        notes=notes,
        created_by=user_id,
    )
    db.session.add(grn)
    db.session.flush()

    for item in items:
        sku_id = item.get('sku_id')
        product_id = item.get('product_id')
        sku = None
        if sku_id:
            sku = ProductSku.query.get(int(sku_id))
            if not sku:
                raise ValueError(f"SKU {sku_id} not found")
            product_id = sku.product_id
        product = Product.query.get(product_id)
        if not product:
            raise ValueError(f"Product {product_id} not found")
        cost = item.get('cost_price', sku.cost_price if sku else product.cost_price or 0)
        sell = item.get('sell_price', sku.selling_price if sku else product.base_price)
        grn_item = GRNItem(
            grn_id=grn.id,
            product_id=product_id,
            sku_id=sku.id if sku else None,
            batch_number=item.get('batch_number') or 'N/A',
            quantity=int(item['quantity']),
            received_quantity=0,
            receive_unit=_normalize_receive_unit(item.get('receive_unit')),
            cost_price=cost,
            sell_price=sell,
            expiry_date=item.get('expiry_date'),
        )
        db.session.add(grn_item)

    db.session.commit()
    return grn


def _restock_line(grn, item, qty_this_receive, user_id, price_warnings):
    """Restock inventory for qty_this_receive (in receive_unit) and update costs."""
    if qty_this_receive <= 0:
        return 0.0

    receive_unit = _normalize_receive_unit(getattr(item, 'receive_unit', None) or 'unit')
    line_cost = float(item.cost_price or 0) * qty_this_receive

    if item.sku_id:
        sku = ProductSku.query.get(item.sku_id)
        product = Product.query.get(item.product_id)
        if not sku or not product:
            raise ValueError('GRN item SKU/product missing')
        stock_qty = receive_quantity_to_stock(product, sku, qty_this_receive, receive_unit)
        restock_sku(
            grn.branch_id,
            item.sku_id,
            stock_qty,
            reason='purchase_receive',
            reference_type='grn',
            reference_id=grn.id,
            user_id=user_id,
            notes=f'GRN {grn.grn_number} ({qty_this_receive} {receive_unit})',
        )
        if item.cost_price is not None:
            per_pack = cost_per_sku_unit(item.cost_price, qty_this_receive, stock_qty)
            sku.cost_price = per_pack
        if item.sell_price is not None and Decimal(str(item.sell_price or 0)) > 0:
            sku.selling_price = item.sell_price

        cost = Decimal(str(sku.cost_price or 0))
        sell = Decimal(str(sku.selling_price or 0))
        if sell > 0 and cost > sell:
            notify_sale_below_cost(
                grn.branch_id, product.name, sku.variant_name, cost, sell,
            )
            price_warnings.append({
                'product_id': product.id,
                'sku_id': sku.id,
                'name': product.name,
                'variant': sku.variant_name,
                'cost_price': float(cost),
                'sell_price': float(sell),
            })
    else:
        restock(
            grn.branch_id,
            item.product_id,
            qty_this_receive,
            reason='purchase_receive',
            reference_type='grn',
            reference_id=grn.id,
            user_id=user_id,
            notes=f'GRN {grn.grn_number}',
        )
        product = Product.query.get(item.product_id)
        if product and item.cost_price:
            product.cost_price = item.cost_price
            sell = Decimal(str(product.base_price or 0))
            cost = Decimal(str(product.cost_price or 0))
            if sell > 0 and cost > sell:
                notify_sale_below_cost(
                    grn.branch_id, product.name, '', cost, sell,
                )
                price_warnings.append({
                    'product_id': product.id,
                    'sku_id': None,
                    'name': product.name,
                    'variant': '',
                    'cost_price': float(cost),
                    'sell_price': float(sell),
                })

    return line_cost


def receive_grn(grn_id, user_id, items=None, mode='complete'):
    """
    Receive stock against a PO/GRN.

    mode='complete' — receive all remaining quantities (items ignored).
    mode='partial'  — receive only quantities in items: [{id, quantity}].
    """
    grn = GoodsReceivedNote.query.get(grn_id)
    if not grn:
        raise ValueError('GRN not found')
    if grn.status == 'received':
        raise ValueError('Purchase order already completed')
    if grn.status in ('cancelled', 'deleted'):
        raise ValueError('Purchase order is deleted')
    if grn.status not in RECEIVABLE_STATUSES:
        raise ValueError(f'Cannot receive purchase order in status "{grn.status}"')

    mode = (mode or 'complete').strip().lower()
    if mode not in ('complete', 'partial'):
        raise ValueError('mode must be "complete" or "partial"')

    # Build qty-to-receive map for this call
    receive_map = {}  # item.id -> qty this time
    if mode == 'complete' or not items:
        for item in grn.items:
            rem = _item_remaining(item)
            if rem > 0:
                receive_map[item.id] = rem
    else:
        by_id = {i.id: i for i in grn.items}
        for entry in items:
            if not isinstance(entry, dict):
                continue
            item_id = entry.get('id')
            if item_id is None:
                continue
            item = by_id.get(int(item_id))
            if not item:
                raise ValueError(f'Line {item_id} not found on this purchase order')
            try:
                qty = int(entry.get('quantity', 0) or 0)
            except (TypeError, ValueError):
                raise ValueError(f'Invalid quantity for line {item_id}')
            if qty < 0:
                raise ValueError(f'Quantity cannot be negative for line {item_id}')
            if qty == 0:
                continue
            rem = _item_remaining(item)
            if qty > rem:
                raise ValueError(
                    f'Cannot receive {qty} for line {item_id} — only {rem} remaining'
                )
            receive_map[item.id] = qty

    if not receive_map:
        raise ValueError('Nothing to receive — enter quantities or use complete receive')

    price_warnings = []
    purchase_delta = 0.0

    for item in grn.items:
        qty_this = receive_map.get(item.id, 0)
        if qty_this <= 0:
            continue
        purchase_delta += _restock_line(grn, item, qty_this, user_id, price_warnings)
        item.received_quantity = _item_received_qty(item) + qty_this

    # Update status based on remaining
    all_done = all(_item_remaining(i) == 0 for i in grn.items)
    any_received = any(_item_received_qty(i) > 0 for i in grn.items)
    if all_done:
        grn.status = 'received'
        grn.received_at = datetime.utcnow()
    elif any_received:
        grn.status = 'partial'
        if not grn.received_at:
            grn.received_at = datetime.utcnow()

    # Post only this receive's cost to supplier ledger
    if grn.supplier_id and purchase_delta > 0:
        try:
            from app.services.supplier_ledger_service import post_purchase
            post_purchase(
                grn.supplier_id, purchase_delta,
                grn_id=grn.id, grn_number=grn.grn_number,
                user_id=user_id, notes=f'GRN {grn.grn_number} ({mode})',
            )
        except Exception as e:
            print(f'Warning: supplier ledger post failed for GRN {grn.id}: {e}')

    db.session.commit()
    grn._price_warnings = price_warnings
    return grn


def cancel_grn(grn_id):
    grn = GoodsReceivedNote.query.get(grn_id)
    if not grn:
        raise ValueError('GRN not found')
    if grn.status in ('deleted', 'cancelled'):
        raise ValueError('Purchase order already deleted')
    # Soft-delete — already received stock remains in inventory
    grn.status = 'deleted'
    db.session.commit()
    return grn


def soft_delete_grn(grn_id):
    """Mark PO as deleted without reversing inventory."""
    return cancel_grn(grn_id)


def grn_to_dict(grn):
    items_out = []
    ordered_total = 0
    received_total = 0
    for i in grn.items:
        ordered = int(i.quantity or 0)
        received = _item_received_qty(i)
        remaining = max(0, ordered - received)
        ordered_total += ordered
        received_total += received
        items_out.append({
            'id': i.id,
            'product_id': i.product_id,
            'sku_id': i.sku_id,
            'product_name': i.product.name if hasattr(i, 'product') and i.product else None,
            'sku_label': _sku_label(i),
            'quantity': ordered,
            'ordered_quantity': ordered,
            'received_quantity': received,
            'remaining_quantity': remaining,
            'receive_unit': getattr(i, 'receive_unit', None) or 'unit',
            'cost_price': float(i.cost_price),
            'sell_price': float(i.sell_price),
        })

    # UI category for filtering
    status = grn.status or 'draft'
    if status == 'draft':
        category = 'active'
    elif status == 'received':
        category = 'completed'
    elif status == 'partial':
        category = 'partial'
    elif status in ('deleted', 'cancelled'):
        category = 'deleted'
    else:
        category = status

    data = {
        'id': grn.id,
        'grn_number': grn.grn_number,
        'branch_id': grn.branch_id,
        'supplier_id': grn.supplier_id,
        'supplier_name': grn.supplier.name if grn.supplier else None,
        'status': status,
        'category': category,
        'notes': grn.notes,
        'received_at': grn.received_at.isoformat() if grn.received_at else None,
        'created_at': grn.created_at.isoformat() if grn.created_at else None,
        'ordered_quantity': ordered_total,
        'received_quantity': received_total,
        'remaining_quantity': max(0, ordered_total - received_total),
        'items': items_out,
    }
    warnings = getattr(grn, '_price_warnings', None)
    if warnings:
        data['price_warnings'] = warnings
    return data


def _sku_label(item):
    if item.sku_id:
        from app.models import ProductSku
        from app.services.sku_service import format_sku_display
        sku = ProductSku.query.get(item.sku_id)
        if sku:
            return format_sku_display(sku)
    return None
