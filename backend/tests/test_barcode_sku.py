"""Unit tests for barcode validation and SKU generation (no DB)."""
import unittest
from unittest.mock import patch, MagicMock


class TestBarcodeValidation(unittest.TestCase):
    def test_normalize_and_empty(self):
        from app.services.barcode_service import normalize_barcode, validate_barcode
        self.assertEqual(normalize_barcode('  8964001234567  '), '8964001234567')
        ok, code, err = validate_barcode('')
        self.assertTrue(ok)
        self.assertEqual(code, '')
        self.assertIsNone(err)

    def test_ean13_and_code128(self):
        from app.services.barcode_service import validate_barcode
        ok, code, err = validate_barcode('8964001234567')
        self.assertTrue(ok)
        self.assertEqual(code, '8964001234567')
        ok, _, err = validate_barcode('ABC-12345')
        self.assertTrue(ok)
        ok, _, err = validate_barcode('ab')
        self.assertFalse(ok)


class TestSkuGeneration(unittest.TestCase):
    def test_normalize_segment(self):
        from app.services.sku_service import normalize_sku_segment, build_sku_base
        self.assertEqual(normalize_sku_segment("Lay's Classic"), 'LAYS-CLASSIC')
        self.assertEqual(build_sku_base("Lay's Classic", quantity_value=30, unit_abbr='g'), 'LAYS-CLASSIC-30G')

    @patch('app.services.sku_service.ProductSku')
    @patch('app.services.sku_service.Product')
    def test_unique_suffix(self, mock_product, mock_sku):
        from app.services.sku_service import generate_sku_code

        # First base taken, second free
        def filter_side_effect(**kwargs):
            q = MagicMock()
            code = kwargs.get('sku_code') or (kwargs.get('sku') if False else None)
            return q

        taken = {'LAYS-CLASSIC-30G'}

        class Q:
            def __init__(self, code_attr='sku_code'):
                self._code = None
            def filter(self, *a, **k):
                return self
            def filter_by(self, **k):
                self._code = k.get('sku_code') or k.get('sku')
                return self
            def first(self):
                return object() if self._code in taken else None

        mock_sku.query = Q()
        mock_product.query = Q()

        # Monkeypatch _sku_code_taken via query behavior is fragile; call build + generate with patch
        with patch('app.services.sku_service._sku_code_taken', side_effect=lambda c, exclude_sku_id=None: c in taken):
            code = generate_sku_code("Lay's Classic", variant_name=None, quantity_value=30, unit_abbr='g')
            self.assertEqual(code, 'LAYS-CLASSIC-30G-001')


if __name__ == '__main__':
    unittest.main()
