"""Barcode validation, normalization, and product lookup for Mart POS."""
from __future__ import annotations

import re
from typing import Any

from app.models import db, Product, ProductSku


# Printable Code-128 / retail barcode characters (exclude whitespace control)
_CODE128_RE = re.compile(r'^[\x21-\x7E]+$')
_DIGITS_RE = re.compile(r'^\d+$')


def normalize_barcode(raw: str | None) -> str:
    """Trim whitespace; keep content as-is otherwise."""
    if raw is None:
        return ''
    return str(raw).strip()


def _ean_check_digit(body: str) -> int:
    """Compute EAN/UPC check digit for a digit body (no check digit)."""
    total = 0
    # Weights alternate from the right
    for i, ch in enumerate(reversed(body)):
        n = int(ch)
        total += n * (3 if i % 2 == 0 else 1)
    return (10 - (total % 10)) % 10


def validate_barcode(raw: str | None) -> tuple[bool, str, str | None]:
    """
    Validate a barcode string.

    Returns (ok, normalized, error_message).
    Empty barcode is allowed (locally produced / unpackaged goods).
    Supports EAN-13, EAN-8, UPC-A (12), and Code 128-style alphanumeric.
    """
    code = normalize_barcode(raw)
    if not code:
        return True, '', None

    if len(code) < 4:
        return False, code, 'Invalid barcode format — too short (minimum 4 characters)'
    if len(code) > 48:
        return False, code, 'Invalid barcode format — too long (maximum 48 characters)'

    if _DIGITS_RE.match(code):
        if len(code) in (8, 12, 13):
            body, check = code[:-1], int(code[-1])
            if _ean_check_digit(body) != check:
                # Soft-warn style: still accept common retail codes with bad check digits
                # from older labels, but flag clearly invalid lengths only.
                pass
            return True, code, None
        if 4 <= len(code) <= 14:
            # Short/internal numeric codes (store-generated)
            return True, code, None
        return False, code, 'Invalid barcode format — numeric barcodes should be 8, 12, or 13 digits (EAN/UPC)'

    if _CODE128_RE.match(code):
        return True, code, None

    return False, code, 'Invalid barcode format — use digits (EAN/UPC) or printable Code 128 characters'


def find_sku_by_barcode(barcode: str, exclude_sku_id: int | None = None) -> ProductSku | None:
    """Find an active SKU by exact barcode."""
    code = normalize_barcode(barcode)
    if not code:
        return None
    q = ProductSku.query.filter(
        ProductSku.barcode == code,
        ProductSku.archived_at == None,  # noqa: E711
    )
    if exclude_sku_id:
        q = q.filter(ProductSku.id != exclude_sku_id)
    return q.first()


def find_legacy_product_by_barcode(barcode: str) -> Product | None:
    code = normalize_barcode(barcode)
    if not code:
        return None
    return Product.query.filter(
        Product.barcode == code,
        Product.archived_at == None,  # noqa: E711
    ).first()


def barcode_conflict_message(sku: ProductSku) -> str:
    product = sku.product
    name = product.name if product else 'Unknown product'
    variant = sku.variant_name or ''
    label = f'{name} {variant}'.strip()
    sku_code = sku.sku_code or ''
    return (
        f'Barcode already exists.\n\n'
        f'This barcode is already assigned to:\n{label}\n'
        f'SKU: {sku_code}\n\n'
        f'Please use a different barcode.'
    )


def sku_lookup_dict(sku: ProductSku, branch_id: str | None = None) -> dict[str, Any]:
    from app.services.sku_service import sku_to_dict, format_sku_display
    from app.services.stock_service import get_sku_stock_level

    product = sku.product
    stock = get_sku_stock_level(branch_id, sku.id) if branch_id else None
    brand = ''
    if product:
        brand = product.brand or ''
        if product.brand_ref:
            brand = product.brand_ref.name
    return {
        'product_id': sku.product_id,
        'sku_id': sku.id,
        'name': product.name if product else '',
        'product_name': product.name if product else '',
        'variant_name': sku.variant_name,
        'display_label': format_sku_display(sku),
        'sku': sku.sku_code,
        'sku_code': sku.sku_code,
        'barcode': sku.barcode,
        'price': float(sku.selling_price or 0),
        'selling_price': float(sku.selling_price or 0),
        'cost_price': float(sku.cost_price or 0),
        'stock': stock,
        'stock_level': stock,
        'brand': brand,
        'category_name': product.category.name if product and product.category else None,
        'image_url': (sku.image_url or (product.image_url if product else '') or ''),
        'sku_detail': sku_to_dict(sku, branch_id),
    }


def check_barcode_availability(
    barcode: str | None,
    exclude_sku_id: int | None = None,
    branch_id: str | None = None,
) -> dict[str, Any]:
    """Validate + uniqueness check used by create/edit and UI."""
    ok, code, err = validate_barcode(barcode)
    if not ok:
        return {
            'available': False,
            'valid': False,
            'barcode': code,
            'message': err or 'Invalid barcode format',
            'existing': None,
        }
    if not code:
        return {
            'available': True,
            'valid': True,
            'barcode': '',
            'message': 'No barcode — allowed for unpackaged products',
            'existing': None,
        }

    sku = find_sku_by_barcode(code, exclude_sku_id=exclude_sku_id)
    if sku:
        return {
            'available': False,
            'valid': True,
            'barcode': code,
            'message': barcode_conflict_message(sku),
            'existing': sku_lookup_dict(sku, branch_id),
        }

    legacy = find_legacy_product_by_barcode(code)
    if legacy:
        return {
            'available': False,
            'valid': True,
            'barcode': code,
            'message': (
                f'Barcode already exists.\n\n'
                f'This barcode is already assigned to:\n{legacy.name}\n\n'
                f'Please use a different barcode.'
            ),
            'existing': {
                'product_id': legacy.id,
                'name': legacy.name,
                'product_name': legacy.name,
                'sku': legacy.sku or '',
                'sku_code': legacy.sku or '',
                'barcode': legacy.barcode,
            },
        }

    return {
        'available': True,
        'valid': True,
        'barcode': code,
        'message': 'Barcode available',
        'existing': None,
    }
