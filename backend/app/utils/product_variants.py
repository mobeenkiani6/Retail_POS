"""Product variant parsing and pricing helpers."""


def variant_names_from_raw(raw):
    names = []
    for item in (raw or []):
        if isinstance(item, str):
            n = item.strip()
            if n:
                names.append(n)
        elif isinstance(item, dict):
            n = str(item.get('name') or '').strip()
            if n:
                names.append(n)
    return names


def variant_names_from_product(product):
    return variant_names_from_raw(getattr(product, 'variants', None))


def resolve_variant_pricing(product, variant_name):
    fallback = {
        'base_price': float(product.base_price or 0),
        'cost_price': float(getattr(product, 'cost_price', 0) or 0),
    }
    if not variant_name:
        return fallback
    for item in (getattr(product, 'variants', None) or []):
        if isinstance(item, dict) and str(item.get('name') or '').strip() == variant_name:
            return {
                'base_price': float(item.get('base_price', fallback['base_price']) or 0),
                'cost_price': float(item.get('cost_price', fallback['cost_price']) or 0),
            }
    return fallback
