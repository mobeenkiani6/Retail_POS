"""Goods Received Notes (GRN) — purchase receiving without batch tracking."""
from datetime import datetime
from decimal import Decimal
from app.models import db, GoodsReceivedNote, GRNItem, Product, ProductSku
from app.services.stock_service import restock, restock_sku
from app.services.packaging_service import receive_quantity_to_stock, cost_per_sku_unit
from app.services.notification_service import notify_sale_below_cost


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
            receive_unit=_normalize_receive_unit(item.get('receive_unit')),
            cost_price=cost,
            sell_price=sell,
            expiry_date=item.get('expiry_date'),
        )
        db.session.add(grn_item)

    db.session.commit()
    return grn


def receive_grn(grn_id, user_id):
    grn = GoodsReceivedNote.query.get(grn_id)
    if not grn:
        raise ValueError('GRN not found')
    if grn.status == 'received':
        raise ValueError('GRN already received')
    if grn.status == 'cancelled':
        raise ValueError('GRN is cancelled')

    price_warnings = []

    for item in grn.items:
        receive_unit = _normalize_receive_unit(getattr(item, 'receive_unit', None) or 'unit')
        if item.sku_id:
            sku = ProductSku.query.get(item.sku_id)
            product = Product.query.get(item.product_id)
            if not sku or not product:
                raise ValueError('GRN item SKU/product missing')
            stock_qty = receive_quantity_to_stock(product, sku, item.quantity, receive_unit)
            restock_sku(
                grn.branch_id,
                item.sku_id,
                stock_qty,
                reason='purchase_receive',
                reference_type='grn',
                reference_id=grn.id,
                user_id=user_id,
                notes=f'GRN {grn.grn_number} ({item.quantity} {receive_unit})',
            )
            if item.cost_price is not None:
                # cost_price on the line is per receive unit (per carton/packet/pack)
                per_pack = cost_per_sku_unit(item.cost_price, item.quantity, stock_qty)
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
                item.quantity,
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

    grn.status = 'received'
    grn.received_at = datetime.utcnow()

    # Post purchase to supplier ledger (increases outstanding balance)
    if grn.supplier_id:
        try:
            from app.services.supplier_ledger_service import post_purchase
            purchase_total = sum(
                float(item.cost_price or 0) * int(item.quantity or 0)
                for item in grn.items
            )
            if purchase_total > 0:
                post_purchase(
                    grn.supplier_id, purchase_total,
                    grn_id=grn.id, grn_number=grn.grn_number,
                    user_id=user_id, notes=f'GRN {grn.grn_number}',
                )
        except Exception as e:
            print(f'Warning: supplier ledger post failed for GRN {grn.id}: {e}')

    db.session.commit()
    grn._price_warnings = price_warnings  # attached for API response
    return grn


def cancel_grn(grn_id):
    grn = GoodsReceivedNote.query.get(grn_id)
    if not grn:
        raise ValueError('GRN not found')
    if grn.status == 'received':
        raise ValueError('Cannot cancel received GRN')
    grn.status = 'cancelled'
    db.session.commit()
    return grn


def grn_to_dict(grn):
    data = {
        'id': grn.id,
        'grn_number': grn.grn_number,
        'branch_id': grn.branch_id,
        'supplier_id': grn.supplier_id,
        'supplier_name': grn.supplier.name if grn.supplier else None,
        'status': grn.status,
        'notes': grn.notes,
        'received_at': grn.received_at.isoformat() if grn.received_at else None,
        'created_at': grn.created_at.isoformat() if grn.created_at else None,
        'items': [
            {
                'id': i.id,
                'product_id': i.product_id,
                'sku_id': i.sku_id,
                'product_name': i.product.name if hasattr(i, 'product') and i.product else None,
                'sku_label': _sku_label(i),
                'quantity': i.quantity,
                'receive_unit': getattr(i, 'receive_unit', None) or 'unit',
                'cost_price': float(i.cost_price),
                'sell_price': float(i.sell_price),
            }
            for i in grn.items
        ],
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
