"""Supplier ledger — purchases, payments, returns; keeps outstanding_balance in sync."""
from datetime import datetime
from app.models import db, Supplier, SupplierLedgerEntry, AuditLog


def _code_from_name(name: str) -> str:
    slug = ''.join(ch if ch.isalnum() else '-' for ch in (name or '').upper())
    while '--' in slug:
        slug = slug.replace('--', '-')
    slug = slug.strip('-') or 'SUPPLIER'
    return f'SUP-{slug[:40]}'


def ensure_supplier_code(supplier: Supplier) -> str:
    if supplier.supplier_code:
        return supplier.supplier_code
    base = _code_from_name(supplier.name)
    code = base
    n = 1
    while Supplier.query.filter(Supplier.supplier_code == code, Supplier.id != supplier.id).first():
        n += 1
        code = f'{base}-{n}'
    supplier.supplier_code = code
    return code


def post_ledger_entry(
    supplier_id,
    entry_type,
    amount,
    *,
    reference_type=None,
    reference_id=None,
    reference_number=None,
    payment_method=None,
    notes=None,
    user_id=None,
    created_at=None,
    commit=False,
):
    """
    amount: signed — positive increases balance due (purchase),
    negative decreases due (payment / return credit).
    """
    supplier = Supplier.query.get(supplier_id)
    if not supplier:
        raise ValueError('Supplier not found')

    amount = float(amount)
    current = float(supplier.outstanding_balance or 0)
    balance_after = round(current + amount, 2)

    entry = SupplierLedgerEntry(
        supplier_id=supplier_id,
        entry_type=entry_type,
        amount=amount,
        balance_after=balance_after,
        reference_type=reference_type,
        reference_id=reference_id,
        reference_number=reference_number,
        payment_method=payment_method,
        notes=notes,
        created_by=user_id,
        created_at=created_at or datetime.utcnow(),
    )
    db.session.add(entry)
    supplier.outstanding_balance = balance_after
    supplier.updated_at = datetime.utcnow()

    db.session.add(AuditLog(
        user_id=user_id,
        action=f'supplier.{entry_type}',
        entity_type='supplier',
        entity_id=supplier_id,
        details={
            'amount': amount,
            'balance_after': balance_after,
            'reference_number': reference_number,
            'payment_method': payment_method,
        },
    ))
    if commit:
        db.session.commit()
    else:
        db.session.flush()
    return entry


def post_purchase(
    supplier_id, amount, *,
    grn_id=None, grn_number=None, reference_number=None,
    notes=None, user_id=None, created_at=None, commit=False,
):
    if not supplier_id or amount is None:
        return None
    amount = float(amount)
    if amount <= 0:
        if commit:
            raise ValueError('Purchase amount must be positive')
        return None
    ref = reference_number or grn_number
    return post_ledger_entry(
        supplier_id, 'purchase', amount,
        reference_type='grn' if grn_id else 'invoice',
        reference_id=grn_id,
        reference_number=ref,
        notes=notes,
        user_id=user_id,
        created_at=created_at,
        commit=commit,
    )


def post_payment(
    supplier_id, amount, *,
    payment_method='cash', reference_number=None, notes=None,
    user_id=None, created_at=None, commit=True,
):
    amount = float(amount)
    if amount <= 0:
        raise ValueError('Payment amount must be positive')
    return post_ledger_entry(
        supplier_id, 'payment', -amount,
        reference_type='payment',
        reference_number=reference_number,
        payment_method=payment_method,
        notes=notes,
        user_id=user_id,
        created_at=created_at,
        commit=commit,
    )


def post_return(supplier_id, amount, *, reference_number=None, notes=None, user_id=None, commit=True):
    amount = float(amount)
    if amount <= 0:
        raise ValueError('Return amount must be positive')
    return post_ledger_entry(
        supplier_id, 'return', -amount,
        reference_type='return',
        reference_number=reference_number,
        notes=notes,
        user_id=user_id,
        commit=commit,
    )


def apply_opening_balance(supplier: Supplier, opening, user_id=None):
    opening = float(opening or 0)
    prior = float(supplier.opening_balance or 0)
    delta = opening - prior
    supplier.opening_balance = opening
    if abs(delta) < 0.0001:
        return None
    return post_ledger_entry(
        supplier.id, 'adjustment', delta,
        reference_type='opening_balance',
        notes='Opening balance',
        user_id=user_id,
    )
