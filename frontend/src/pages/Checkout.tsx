import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useScanner } from '../hooks/useScanner';
import {
  ShoppingBag, Plus, Minus, Trash2, Loader2, CreditCard, Banknote,
  Pause, Play, RotateCcw, Usb, User, Tag, Percent, StickyNote,
  Eye, Keyboard, Star, AlertTriangle, X,
} from 'lucide-react';
import { formatCurrency } from '../utils/formatCurrency';
import { get, post, getUserMessage } from '../api';
import { showToast } from '../components/Toast';
import { showConfirm } from '../components/ConfirmDialog';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import SearchInput from '../components/ui/SearchInput';
import { formatSkuLabel, priceRange, type ProductSku } from '../utils/productSkus';
import { getBranchId } from '../branch';
import {
  useCheckoutStore,
  type CartItem,
  type HeldCart,
  type PaymentMethod,
} from '../stores/checkoutStore';

type Product = {
  id: number; name: string; base_price?: number; cost_price?: number;
  category_id?: number; category_name?: string; stock_level?: number;
  skus?: ProductSku[];
  min_price?: number; max_price?: number;
};
type Category = { id: number; name: string };
type Customer = { id: number; name: string; phone?: string; loyalty_points?: number };

type ReceiptSnapshot = {
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  loyaltyDiscount: number;
  taxAmount: number;
  total: number;
  saleId?: number;
};

const PAYMENT_METHODS: PaymentMethod[] = ['Cash', 'Card'];

export default function Checkout() {
  const { lastScannedBarcode, clearBarcode, scannerStatus } = useScanner();
  const searchRef = useRef<HTMLInputElement>(null);

  const cart = useCheckoutStore(s => s.cart);
  const setCart = useCheckoutStore(s => s.setCart);
  const paymentMethod = useCheckoutStore(s => s.paymentMethod);
  const setPaymentMethod = useCheckoutStore(s => s.setPaymentMethod);
  const returnMode = useCheckoutStore(s => s.returnMode);
  const setReturnMode = useCheckoutStore(s => s.setReturnMode);
  const selectedCustomer = useCheckoutStore(s => s.selectedCustomer);
  const setSelectedCustomer = useCheckoutStore(s => s.setSelectedCustomer);
  const discount = useCheckoutStore(s => s.discount);
  const setDiscount = useCheckoutStore(s => s.setDiscount);
  const loyaltyPointsToRedeem = useCheckoutStore(s => s.loyaltyPointsToRedeem);
  const setLoyaltyPointsToRedeem = useCheckoutStore(s => s.setLoyaltyPointsToRedeem);
  const couponCode = useCheckoutStore(s => s.couponCode);
  const setCouponCode = useCheckoutStore(s => s.setCouponCode);
  const saleNotes = useCheckoutStore(s => s.saleNotes);
  const setSaleNotes = useCheckoutStore(s => s.setSaleNotes);
  const cashReceived = useCheckoutStore(s => s.cashReceived);
  const setCashReceived = useCheckoutStore(s => s.setCashReceived);
  const activeCategory = useCheckoutStore(s => s.activeCategory);
  const setActiveCategory = useCheckoutStore(s => s.setActiveCategory);
  const searchQuery = useCheckoutStore(s => s.searchQuery);
  const setSearchQuery = useCheckoutStore(s => s.setSearchQuery);
  const activeHeldId = useCheckoutStore(s => s.activeHeldId);
  const setActiveHeldId = useCheckoutStore(s => s.setActiveHeldId);
  const heldCarts = useCheckoutStore(s => s.heldCarts);
  const setHeldCarts = useCheckoutStore(s => s.setHeldCarts);
  const clearSale = useCheckoutStore(s => s.clearSale);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingOut, setCheckingOut] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptSnapshot, setReceiptSnapshot] = useState<ReceiptSnapshot | null>(null);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [taxRate, setTaxRate] = useState(0);
  const [discountPresets, setDiscountPresets] = useState<{ id: string; name: string; type: 'percent' | 'fixed'; value: number }[]>([]);
  const [expiryBanner, setExpiryBanner] = useState<{ total: number; expired: number; near: number } | null>(null);

  const [qtyEditId, setQtyEditId] = useState<string | null>(null);
  const [qtyEditValue, setQtyEditValue] = useState('');
  const [skuPickerProduct, setSkuPickerProduct] = useState<Product | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  useEffect(() => {
    if (!mobileCartOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileCartOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileCartOpen]);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const branchId = getBranchId();
  const canOverridePrice = ['owner', 'manager'].includes(user?.role);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, catRes, custRes, settingsRes, expRes] = await Promise.all([
        get<{ products?: Product[] }>(`/products/?branch_id=${branchId}`),
        get<{ categories?: Category[] }>('/v1/categories/'),
        get<{ customers?: Customer[] }>('/v1/customers/'),
        get<{ config?: Record<string, unknown> }>(`/settings/?branch_id=${branchId}`),
        get<{ total_count?: number; expired_count?: number; near_expiry_count?: number }>(
          `/v1/expiry/alerts?branch_id=${branchId}`,
        ).catch(() => null),
      ]);
      setProducts(prodRes?.products ?? []);
      setCategories(catRes?.categories ?? []);
      setCustomers(custRes?.customers ?? []);
      if (expRes && (expRes.total_count || 0) > 0) {
        setExpiryBanner({
          total: expRes.total_count || 0,
          expired: expRes.expired_count || 0,
          near: expRes.near_expiry_count || 0,
        });
      } else {
        setExpiryBanner(null);
      }
      const cfg = settingsRes?.config ?? {};
      const taxEnabled = cfg.tax_enabled !== false;
      const rates = (cfg.tax_rates_by_payment_method as Record<string, number>) || {};
      const pmRate = rates[paymentMethod];
      if (taxEnabled && typeof pmRate === 'number') setTaxRate(pmRate / 100);
      else if (taxEnabled && typeof cfg.tax_percentage === 'number') setTaxRate(Number(cfg.tax_percentage) / 100);
      else setTaxRate(0);
      const discounts = (cfg.discounts as { id: string; name: string; type: 'percent' | 'fixed'; value: number; archived?: boolean }[]) || [];
      setDiscountPresets(discounts.filter(d => !d.archived));
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  }, [branchId, paymentMethod]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const addProductToCart = (item: {
    product_id: number; sku_id?: number; product_name: string; unit_price: number;
    cost_price: number; display_label?: string;
  }) => {
    setCart(prev => {
      const uid = item.sku_id ? `sku-${item.sku_id}` : String(item.product_id);
      const label = item.display_label ? ` ${item.display_label}` : '';
      const title = `${item.product_name}${label}`;
      const existing = prev.find(i => i.uniqueId === uid && !i.voided);
      if (existing) {
        return prev.map(i => i.uniqueId === uid && !i.voided ? { ...i, quantity: i.quantity + (returnMode ? -1 : 1) } : i).filter(i => i.quantity !== 0);
      }
      return [...prev, {
        uniqueId: uid,
        product_id: item.product_id,
        sku_id: item.sku_id,
        variant: item.display_label,
        title,
        price: item.unit_price,
        original_price: item.unit_price,
        cost_price: item.cost_price,
        quantity: returnMode ? -1 : 1,
      }];
    });
  };

  const scanAndAdd = async (barcode: string) => {
    try {
      const result = await post<{
        sku_id?: number; product_id: number; product_name: string; display_label?: string;
        unit_price: number; cost_price: number; variant?: string;
      }>('/v1/pos/scan', { barcode, branch_id: branchId, quantity: returnMode ? -1 : 1 });
      addProductToCart({
        product_id: result.product_id,
        sku_id: result.sku_id,
        product_name: result.product_name,
        unit_price: result.unit_price,
        cost_price: result.cost_price,
        display_label: result.display_label || result.variant,
      });
      const label = result.display_label || result.variant;
      showToast(`${returnMode ? 'Return' : 'Added'}: ${result.product_name}${label ? ` ${label}` : ''}`, 'success');
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    }
  };

  useEffect(() => {
    if (lastScannedBarcode) {
      scanAndAdd(lastScannedBarcode);
      clearBarcode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastScannedBarcode]);

  const getProductSkus = (p: Product): ProductSku[] => (p.skus || []).filter(s => s.status !== 'archived' && s.status !== 'inactive');

  const productHasStock = (p: Product): boolean => {
    const skus = getProductSkus(p);
    if (skus.length) return skus.some(s => (s.stock_level ?? 0) > 0);
    return (p.stock_level ?? 0) > 0;
  };

  const addToCartFromProduct = (p: Product, sku?: ProductSku) => {
    const skus = getProductSkus(p);
    if (skus.length > 1 && !sku) {
      setSkuPickerProduct(p);
      return;
    }
    const selected = sku ?? skus[0];
    if (!selected && skus.length === 0) {
      showToast(`${p.name} has no SKUs configured`, 'error');
      return;
    }
    if (!returnMode && selected && (selected.stock_level ?? 0) <= 0) {
      showToast(`${p.name} ${formatSkuLabel(selected)} is out of stock`, 'error');
      return;
    }
    addProductToCart({
      product_id: p.id,
      sku_id: selected?.id,
      product_name: p.name,
      unit_price: selected?.selling_price ?? p.base_price ?? 0,
      cost_price: selected?.cost_price ?? p.cost_price ?? 0,
      display_label: selected ? formatSkuLabel(selected) : undefined,
    });
    showToast(`Added: ${p.name}${selected ? ` ${formatSkuLabel(selected)}` : ''}`, 'success');
    setSkuPickerProduct(null);
  };

  const changeCartItemSku = (uniqueId: string, product: Product, sku: ProductSku) => {
    const label = formatSkuLabel(sku);
    const newUid = sku.id ? `sku-${sku.id}` : String(product.id);
    const item = cart.find(i => i.uniqueId === uniqueId && !i.voided);

    if (!item) return;

    if (!returnMode && (sku.stock_level ?? 0) <= 0) {
      showToast(`${product.name} ${label} is out of stock`, 'error');
      return;
    }
    if (!returnMode && sku.stock_level != null && sku.stock_level < item.quantity) {
      showToast(`Only ${sku.stock_level} available for ${label}`, 'error');
      return;
    }
    if (newUid === uniqueId) return;

    setCart(prev => {
      const existingTarget = prev.find(i => i.uniqueId === newUid && !i.voided && i.uniqueId !== uniqueId);
      if (existingTarget) {
        return prev
          .map(i => (i.uniqueId === existingTarget.uniqueId ? { ...i, quantity: i.quantity + item.quantity } : i))
          .filter(i => i.uniqueId !== uniqueId);
      }

      return prev.map(i => {
        if (i.uniqueId !== uniqueId) return i;
        return {
          ...i,
          uniqueId: newUid,
          sku_id: sku.id,
          variant: label,
          title: `${product.name} ${label}`,
          price: sku.selling_price,
          original_price: sku.selling_price,
          cost_price: sku.cost_price,
        };
      });
    });

    showToast(`Changed to ${label}`, 'success');
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.key === 'F1') { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'F2') { e.preventDefault(); handleCheckout(); }
      if (e.key === 'F3') { e.preventDefault(); holdCart(); }
      if (e.key === 'F4') { e.preventDefault(); setShowCustomerModal(true); }
      if (e.key === 'F5') { e.preventDefault(); setShowDiscountModal(true); }
      if (e.key === 'Escape') { clearSale(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, paymentMethod, discount]);

  const activeCart = cart.filter(i => !i.voided);
  const subtotal = activeCart.reduce((s, i) => s + i.price * i.quantity, 0);
  const presetDiscountAmount = discount
    ? discount.type === 'percent' ? subtotal * (discount.value / 100) : Math.min(discount.value, subtotal)
    : 0;
  const remainingAfterPreset = Math.max(0, subtotal - presetDiscountAmount);
  const availableLoyaltyPoints = selectedCustomer?.loyalty_points ?? 0;
  const maxLoyaltyRedeem = Math.min(availableLoyaltyPoints, Math.floor(remainingAfterPreset));
  const loyaltyDiscount = Math.min(loyaltyPointsToRedeem, maxLoyaltyRedeem);
  const discountAmount = presetDiscountAmount + loyaltyDiscount;
  const afterDiscount = subtotal - discountAmount;
  const taxAmount = afterDiscount * taxRate;
  const total = afterDiscount + taxAmount;

  const updateQty = (uid: string, delta: number) => {
    setCart(c => c.map(i => i.uniqueId === uid ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity !== 0));
  };

  const setManualQty = (uid: string, qty: number) => {
    if (qty <= 0) setCart(c => c.filter(i => i.uniqueId !== uid));
    else setCart(c => c.map(i => i.uniqueId === uid ? { ...i, quantity: qty } : i));
  };

  const snapshotReceipt = (): ReceiptSnapshot => ({
    items: activeCart,
    subtotal,
    discountAmount: presetDiscountAmount,
    loyaltyDiscount,
    taxAmount,
    total,
  });

  // Keep redeemed points within the current max (discount / cart changes)
  useEffect(() => {
    if (loyaltyPointsToRedeem > maxLoyaltyRedeem) {
      setLoyaltyPointsToRedeem(maxLoyaltyRedeem);
    }
  }, [loyaltyPointsToRedeem, maxLoyaltyRedeem, setLoyaltyPointsToRedeem]);

  const holdCart = () => {
    if (!activeCart.length) { showToast('Cart is empty', 'error'); return; }
    const id = activeHeldId ?? Date.now();
    setHeldCarts([...heldCarts, { id, cart, savedAt: new Date().toISOString(), customer: selectedCustomer?.name }]);
    clearSale();
    showToast('Sale suspended', 'success');
  };

  const resumeHeld = (held: HeldCart) => {
    setHeldCarts(heldCarts.filter(h => h.id !== held.id));
    setActiveHeldId(held.id);
    setCart(held.cart);
    setShowHeldModal(false);
    showToast('Sale resumed', 'success');
  };

  const openHeldModal = () => {
    setShowHeldModal(true);
  };

  const handleCheckout = async () => {
    if (!activeCart.length) return;
    if (paymentMethod === 'Cash') {
      const received = parseFloat(cashReceived);
      if (!Number.isFinite(received) || received < total) {
        showToast(`Cash received must be at least ${formatCurrency(total)}`, 'error');
        return;
      }
    }
    const confirmed = await showConfirm({ title: 'Complete Sale', message: `Charge ${formatCurrency(total)} via ${paymentMethod}?`, confirmLabel: 'Complete Sale' });
    if (!confirmed) return;
    setCheckingOut(true);
    try {
      const data = await post<{
        sale_id?: number; total?: number;
        loyalty_points_earned?: number; loyalty_points_redeemed?: number; customer_loyalty_points?: number;
      }>('/sales/checkout', {
        payment_method: paymentMethod,
        branch_id: branchId,
        terminal_id: 'TERM-001',
        customer_id: selectedCustomer?.id,
        notes: saleNotes,
        cash_received: paymentMethod === 'Cash' ? parseFloat(cashReceived) : undefined,
        discount: discount ? { type: discount.type, value: discount.value, name: discount.name } : undefined,
        loyalty_points_to_redeem: loyaltyDiscount > 0 ? loyaltyDiscount : undefined,
        items: activeCart.map(i => ({
          product_id: i.product_id,
          sku_id: i.sku_id,
          quantity: Math.abs(i.quantity),
          unit_price: i.price,
          variant: i.variant,
        })),
      });
      let toastMsg = `Sale #${data.sale_id} — ${formatCurrency(data.total ?? total)}`;
      if (selectedCustomer) {
        const earned = data.loyalty_points_earned ?? 0;
        const redeemed = data.loyalty_points_redeemed ?? 0;
        if (earned > 0) toastMsg += ` · +${earned} loyalty pt${earned !== 1 ? 's' : ''}`;
        if (redeemed > 0) toastMsg += ` · −${redeemed} redeemed`;
        if (earned > 0 || redeemed > 0 || data.customer_loyalty_points != null) {
          setCustomers(prev => prev.map(c =>
            c.id === selectedCustomer.id
              ? { ...c, loyalty_points: data.customer_loyalty_points ?? Math.max(0, (c.loyalty_points ?? 0) - redeemed + earned) }
              : c,
          ));
        }
      }
      showToast(toastMsg, 'success');
      clearSale();
      setMobileCartOpen(false);
    } catch (e) {
      showToast(getUserMessage(e), 'error');
    } finally {
      setCheckingOut(false);
    }
  };

  const filtered = products.filter(p => {
    const matchCat = activeCategory === 'all' || p.category_id === activeCategory;
    const q = searchQuery.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(q) ||
      (p.skus || []).some(s => s.barcode.includes(searchQuery) || s.sku_code.toLowerCase().includes(q));
    return matchCat && matchSearch;
  });

  const change = paymentMethod === 'Cash' && cashReceived ? parseFloat(cashReceived) - total : 0;
  const cashReceivedNum = parseFloat(cashReceived);
  const cashInsufficient = paymentMethod === 'Cash' && (!Number.isFinite(cashReceivedNum) || cashReceivedNum < total);
  const displayReceipt = receiptSnapshot ?? snapshotReceipt();

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.phone || '').includes(customerSearch.trim());
  });

  return (
    <div className="flex h-full bg-canvas relative">
      {/* Product grid */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="px-3 sm:px-5 py-3 sm:py-4 border-b border-border bg-surface">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">Checkout</h1>
              {returnMode && <Badge variant="warning">Return Mode</Badge>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant={scannerStatus === 'active' ? 'success' : 'default'} className="hidden sm:inline-flex">
                <Usb className="w-3 h-3 mr-1 inline" />{scannerStatus}
              </Badge>
              <button
                type="button"
                onClick={() => setReturnMode(!returnMode)}
                className={`min-h-9 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${returnMode ? 'border-warning bg-warning-soft text-warning' : 'border-border text-muted hover:text-foreground'}`}
              >
                {returnMode ? 'Exit Return' : 'Return'}
              </button>
            </div>
          </div>
          <SearchInput
            ref={searchRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && searchQuery) scanAndAdd(searchQuery); }}
            placeholder="Scan barcode or search… (F1)"
            autoFocus
          />

          {expiryBanner && (
            <Link
              to="/inventory"
              className="mt-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2 text-sm hover:border-warning transition-colors"
            >
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <span className="text-foreground">
                <span className="font-semibold">Expiry warning:</span>{' '}
                {expiryBanner.expired > 0 && (
                  <span className="text-danger font-medium">{expiryBanner.expired} expired</span>
                )}
                {expiryBanner.expired > 0 && expiryBanner.near > 0 ? ' · ' : ''}
                {expiryBanner.near > 0 && (
                  <span>{expiryBanner.near} lot{expiryBanner.near !== 1 ? 's' : ''} expiring soon</span>
                )}
                <span className="text-muted"> — open Inventory → Alerts</span>
              </span>
            </Link>
          )}

          {/* Category filter chips */}
          <div className="flex gap-2 mt-3 overflow-x-auto scroll-smooth pb-1 -mx-1 px-1">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`shrink-0 min-h-9 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                activeCategory === 'all'
                  ? 'bg-accent-600 text-white border-accent-600'
                  : 'bg-surface border-border text-muted hover:border-accent-300 hover:text-foreground'
              }`}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveCategory(c.id)}
                className={`shrink-0 min-h-9 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors truncate max-w-[140px] ${
                  activeCategory === c.id
                    ? 'bg-accent-600 text-white border-accent-600'
                    : 'bg-surface border-border text-muted hover:border-accent-300 hover:text-foreground'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          <div className="hidden md:flex gap-1.5 mt-2 overflow-x-auto">
            {[
              { key: 'F2', label: 'Pay' }, { key: 'F3', label: 'Hold' },
              { key: 'F4', label: 'Customer' }, { key: 'F5', label: 'Discount' },
              { key: 'Esc', label: 'Clear' },
            ].map(k => (
              <span key={k.key} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-canvas-subtle text-[10px] text-muted border border-border">
                <Keyboard className="w-2.5 h-2.5" />{k.key} {k.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-4 pb-24 lg:pb-4">
          {loading ? (
            <div className="flex justify-center py-20 text-muted gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading products…</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-2.5">
              {filtered.map(p => {
                const skus = getProductSkus(p);
                const priceLabel = skus.length ? priceRange(skus, formatCurrency) : formatCurrency(p.base_price ?? 0);
                const outOfStock = !returnMode && !productHasStock(p);
                return (
                <motion.button
                  key={p.id}
                  whileTap={{ scale: outOfStock ? 1 : 0.97 }}
                  onClick={() => addToCartFromProduct(p)}
                  className={`p-3 sm:p-3.5 rounded-xl bg-surface border text-left transition-all group min-h-[4.5rem] ${
                    outOfStock
                      ? 'border-border cursor-not-allowed'
                      : 'border-border hover:border-accent-400 hover:shadow-soft active:border-accent-500'
                  }`}
                >
                  <p className="font-medium text-sm truncate text-foreground group-hover:text-accent-600 dark:group-hover:text-accent-400 transition-colors">{p.name}</p>
                  <p className="text-accent-600 dark:text-accent-400 font-bold mt-1 text-sm">{priceLabel}</p>
                  {skus.length > 1 && (
                    <p className="text-[10px] text-muted mt-0.5">{skus.length} pack sizes</p>
                  )}
                  {outOfStock && (
                    <p className="text-[10px] font-medium text-danger mt-1">Out of stock</p>
                  )}
                </motion.button>
              );})}
            </div>
          )}
        </div>
      </div>

      {/* Mobile cart open backdrop */}
      {mobileCartOpen && (
        <button
          type="button"
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          aria-label="Close cart"
          onClick={() => setMobileCartOpen(false)}
        />
      )}

      {/* Cart panel — side on lg+, bottom sheet on smaller screens */}
      <div
        className={`
          bg-surface flex flex-col shrink-0
          fixed inset-x-0 bottom-0 z-50 max-h-[min(92dvh,100%)] rounded-t-2xl border-t border-border shadow-premium
          transition-transform duration-200 ease-out
          ${mobileCartOpen ? 'translate-y-0' : 'translate-y-full'}
          lg:static lg:z-auto lg:translate-y-0 lg:max-h-none lg:h-full lg:rounded-none lg:border-t-0 lg:border-l lg:w-[360px] xl:w-[400px] lg:shadow-none
        `}
        role="complementary"
        aria-label="Shopping cart"
      >
        <div className="lg:hidden flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border mx-auto absolute left-1/2 -translate-x-1/2 top-2.5 pointer-events-none" />
          <p className="text-sm font-semibold">Cart</p>
          <button
            type="button"
            onClick={() => setMobileCartOpen(false)}
            className="touch-target p-2 -mr-1 rounded-lg hover:bg-canvas-subtle text-muted"
            aria-label="Close cart"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart header */}
        <div className="px-4 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="font-bold text-sm">Cart ({activeCart.length})</h2>
            {selectedCustomer && (
              <p className="text-xs text-accent-600 flex items-center gap-1 mt-0.5">
                <User className="w-3 h-3" />{selectedCustomer.name}
                {availableLoyaltyPoints > 0 && (
                  <span className="text-muted">· {availableLoyaltyPoints} pts</span>
                )}
              </p>
            )}
          </div>
          <div className="flex gap-0.5">
            <button type="button" onClick={holdCart} title="Suspend (F3)" className="touch-target p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Pause className="w-4 h-4" /></button>
            <button type="button" onClick={openHeldModal} title="Resume" className="touch-target p-2 rounded-lg hover:bg-canvas-subtle text-muted"><Play className="w-4 h-4" /></button>
            <button type="button" onClick={() => { setShowCustomerModal(true); }} title="Customer (F4)" className="touch-target p-2 rounded-lg hover:bg-canvas-subtle text-muted"><User className="w-4 h-4" /></button>
            <button
              type="button"
              onClick={() => setShowDiscountModal(true)}
              title="Discount (F5)"
              className={`touch-target p-2 rounded-lg hover:bg-canvas-subtle ${discount ? 'text-accent-600 bg-accent-500/10' : 'text-muted'}`}
            >
              <Tag className="w-4 h-4" />
            </button>
            <button type="button" onClick={async () => { if (await showConfirm({ title: 'Clear Cart', message: 'Remove all items?', variant: 'danger' })) clearSale(); }} title="Clear" className="touch-target p-2 rounded-lg hover:bg-canvas-subtle text-muted"><RotateCcw className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-auto p-3 space-y-2 min-h-0">
          {activeCart.length === 0 ? (
            <div className="text-center py-16 text-muted">
              <ShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Scan or tap products to begin</p>
            </div>
          ) : (
            <AnimatePresence>
              {cart.map(item => (
                <motion.div
                  key={item.uniqueId}
                  layout
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: item.voided ? 0.4 : 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className={`p-3 rounded-xl border transition-colors ${item.voided ? 'bg-danger-soft/30 border-danger/20 line-through' : 'bg-canvas-subtle border-border'}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm truncate">
                        {products.find(p => p.id === item.product_id)?.name ?? item.title}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {(() => {
                          const product = products.find(p => p.id === item.product_id);
                          const skus = product ? getProductSkus(product) : [];
                          if (skus.length > 1 && product && !item.voided) {
                            return (
                              <select
                                value={item.sku_id != null ? String(item.sku_id) : ''}
                                onChange={e => {
                                  const sku = skus.find(s => String(s.id) === e.target.value);
                                  if (sku) changeCartItemSku(item.uniqueId, product, sku);
                                }}
                                className="max-w-[11rem] text-[10px] font-medium pl-1.5 pr-6 py-0.5 rounded-md border-0 bg-accent-500/10 text-accent-600 focus:outline-none focus:ring-1 focus:ring-accent-500/40 appearance-none bg-[length:0.7rem] bg-[right_0.35rem_center] bg-no-repeat cursor-pointer"
                                style={{
                                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%232563eb' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                }}
                                title="Change pack size"
                              >
                                {skus.map(sku => {
                                  const stock = sku.stock_level ?? 0;
                                  const out = !returnMode && stock <= 0;
                                  const insufficient = !returnMode && !out && stock < Math.abs(item.quantity);
                                  return (
                                    <option
                                      key={sku.id}
                                      value={sku.id}
                                      disabled={out || insufficient}
                                    >
                                      {formatSkuLabel(sku)} · {formatCurrency(sku.selling_price)}
                                      {out ? ' (out)' : insufficient ? ` (${stock} left)` : ''}
                                    </option>
                                  );
                                })}
                              </select>
                            );
                          }
                          if (item.variant) {
                            return <span className="text-[10px] text-muted">{item.variant}</span>;
                          }
                          return (
                            <span className="text-[10px] text-muted">
                              {item.quantity < 0 ? 'RETURN' : item.sku_id ? `SKU #${item.sku_id}` : `Product #${item.product_id}`}
                            </span>
                          );
                        })()}
                        {item.quantity < 0 && <span className="text-[10px] text-warning font-medium">RETURN</span>}
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {!item.voided && (
                        <button
                          type="button"
                          onClick={() => setCart(c => c.filter(i => i.uniqueId !== item.uniqueId))}
                          className="touch-target p-2 rounded text-muted hover:text-danger"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  {!item.voided && (
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1.5">
                        <button type="button" onClick={() => updateQty(item.uniqueId, -1)} className="w-10 h-10 rounded-lg bg-surface border border-border flex items-center justify-center hover:bg-canvas-subtle touch-target"><Minus className="w-3.5 h-3.5" /></button>
                        {qtyEditId === item.uniqueId ? (
                          <input
                            autoFocus
                            value={qtyEditValue}
                            onChange={e => setQtyEditValue(e.target.value)}
                            onBlur={() => { setManualQty(item.uniqueId, parseInt(qtyEditValue, 10) || 1); setQtyEditId(null); }}
                            onKeyDown={e => { if (e.key === 'Enter') { setManualQty(item.uniqueId, parseInt(qtyEditValue, 10) || 1); setQtyEditId(null); } }}
                            className="w-12 h-10 text-center text-sm font-bold rounded-lg border border-accent-500 bg-surface"
                          />
                        ) : (
                          <button type="button" onClick={() => { setQtyEditId(item.uniqueId); setQtyEditValue(String(item.quantity)); }} className="font-bold w-10 h-10 text-center text-sm hover:text-accent-600">{item.quantity}</button>
                        )}
                        <button type="button" onClick={() => updateQty(item.uniqueId, 1)} className="w-10 h-10 rounded-lg bg-accent-600 text-white flex items-center justify-center hover:bg-accent-700 touch-target"><Plus className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="text-right">
                        {canOverridePrice && item.price !== item.original_price && (
                          <p className="text-[10px] text-muted line-through">{formatCurrency(item.original_price)}</p>
                        )}
                        <span className="font-bold text-sm text-accent-600">{formatCurrency(item.price * item.quantity)}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Notes */}
        <div className="px-3 py-2 border-t border-border shrink-0">
          <div className="flex items-center gap-2">
            <StickyNote className="w-3.5 h-3.5 text-muted shrink-0" />
            <input value={saleNotes} onChange={e => setSaleNotes(e.target.value)} placeholder="Sale notes…" className="flex-1 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted min-h-9" />
          </div>
        </div>

        {/* Payment + totals */}
        <div className="p-4 border-t border-border space-y-3 bg-canvas-subtle shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-2 gap-1.5">
            {PAYMENT_METHODS.map(pm => {
              const icons: Record<string, typeof CreditCard> = { Cash: Banknote, Card: CreditCard };
              const Icon = icons[pm] || CreditCard;
              return (
                <button key={pm} type="button" onClick={() => setPaymentMethod(pm)} className={`min-h-12 py-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-0.5 transition-all ${paymentMethod === pm ? 'border-accent-600 bg-accent-600 text-white shadow-sm' : 'border-border text-muted hover:border-accent-300 bg-surface'}`}>
                  <Icon className="w-4 h-4" />{pm}
                </button>
              );
            })}
          </div>

          {paymentMethod === 'Cash' && (
            <>
              <Input label="Cash received" type="number" value={cashReceived} onChange={e => setCashReceived(e.target.value)} placeholder="0.00" />
              {cashInsufficient && cashReceived !== '' && (
                <p className="text-xs text-danger -mt-2">Need at least {formatCurrency(total)}</p>
              )}
            </>
          )}

          {selectedCustomer && availableLoyaltyPoints > 0 && (
            <div className="rounded-xl border border-border bg-surface p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Star className="w-3.5 h-3.5 text-accent-600 shrink-0" />
                  <span className="text-xs font-semibold truncate">Redeem loyalty</span>
                </div>
                <span className="text-[10px] text-muted shrink-0">{availableLoyaltyPoints} pts · 1 pt = Rs. 1</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={maxLoyaltyRedeem}
                  value={loyaltyPointsToRedeem ? String(loyaltyPointsToRedeem) : ''}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10);
                    setLoyaltyPointsToRedeem(Number.isFinite(n) ? Math.min(Math.max(0, n), maxLoyaltyRedeem) : 0);
                  }}
                  placeholder="Points to redeem"
                  className="input-base flex-1 text-sm"
                />
                <button
                  type="button"
                  disabled={maxLoyaltyRedeem <= 0}
                  onClick={() => setLoyaltyPointsToRedeem(maxLoyaltyRedeem)}
                  className="shrink-0 min-h-10 px-3 py-2 rounded-xl border border-border text-xs font-semibold text-accent-600 hover:bg-accent-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Max ({maxLoyaltyRedeem})
                </button>
              </div>
              {loyaltyDiscount > 0 && (
                <p className="text-[10px] text-success">−{formatCurrency(loyaltyDiscount)} off this sale</p>
              )}
            </div>
          )}

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            {discount && (
              <div className="flex justify-between items-center text-success gap-2">
                <span className="truncate">Discount ({discount.name})</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span>-{formatCurrency(presetDiscountAmount)}</span>
                  <button
                    type="button"
                    onClick={() => setDiscount(null)}
                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border border-danger/30 text-danger hover:bg-danger-soft transition-colors"
                    title="Remove discount"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between items-center text-success gap-2">
                <span className="truncate">Loyalty ({loyaltyDiscount} pts)</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span>-{formatCurrency(loyaltyDiscount)}</span>
                  <button
                    type="button"
                    onClick={() => setLoyaltyPointsToRedeem(0)}
                    className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border border-danger/30 text-danger hover:bg-danger-soft transition-colors"
                    title="Remove loyalty discount"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}
            <div className="flex justify-between text-muted"><span>Tax ({Math.round(taxRate * 100)}%)</span><span>{formatCurrency(taxAmount)}</span></div>
            {change > 0 && <div className="flex justify-between text-warning"><span>Change</span><span>{formatCurrency(change)}</span></div>}
            <div className="flex justify-between items-end pt-1 border-t border-border">
              <span className="font-semibold">Total</span>
              <span className="text-2xl font-bold">{formatCurrency(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => { setReceiptSnapshot(snapshotReceipt()); setShowReceipt(true); }} size="md"><Eye className="w-3.5 h-3.5" /> Preview</Button>
            <Button onClick={handleCheckout} disabled={!activeCart.length || checkingOut || cashInsufficient} size="md">
              {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingBag className="w-4 h-4" />}
              Pay
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile cart bar */}
      {!mobileCartOpen && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 p-3 pointer-events-none">
          <button
            type="button"
            onClick={() => setMobileCartOpen(true)}
            className="pointer-events-auto w-full min-h-14 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-accent-600 text-white shadow-premium font-semibold"
          >
            <span className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" />
              Cart ({activeCart.length})
            </span>
            <span className="text-lg tabular-nums">{formatCurrency(total)}</span>
          </button>
        </div>
      )}

      {/* SKU picker modal */}
      <Modal
        open={!!skuPickerProduct}
        onClose={() => setSkuPickerProduct(null)}
        title={skuPickerProduct ? `Select pack size — ${skuPickerProduct.name}` : 'Select SKU'}
        size="sm"
      >
        {skuPickerProduct && (
          <div className="grid grid-cols-2 gap-2">
            {getProductSkus(skuPickerProduct).map(sku => {
              const stock = sku.stock_level ?? 0;
              const out = !returnMode && stock <= 0;
              return (
              <button
                key={sku.id}
                type="button"
                onClick={() => !out && addToCartFromProduct(skuPickerProduct, sku)}
                className={`p-3 rounded-xl border text-left transition-colors ${
                  out
                    ? 'cursor-not-allowed border-border bg-canvas-subtle/40'
                    : 'border-border hover:border-accent-400 hover:bg-accent-500/5'
                }`}
              >
                <p className="font-semibold text-sm text-foreground">{formatSkuLabel(sku)}</p>
                <p className="text-accent-600 dark:text-accent-400 font-bold text-sm mt-1">{formatCurrency(sku.selling_price)}</p>
                {!returnMode && (
                  <p className={`text-[10px] mt-0.5 ${out ? 'text-danger font-medium' : 'text-muted'}`}>
                    {out ? 'Out of stock' : `${stock} in stock`}
                  </p>
                )}
              </button>
            );})}
          </div>
        )}
      </Modal>

      {/* Customer modal */}
      <Modal
        open={showCustomerModal}
        onClose={() => { setShowCustomerModal(false); setCustomerSearch(''); }}
        title="Select Customer"
        size="sm"
      >
        <SearchInput
          value={customerSearch}
          onChange={e => setCustomerSearch(e.target.value)}
          placeholder="Search by name or phone…"
          wrapperClassName="mb-3"
          autoFocus
        />
        <div className="space-y-1 max-h-60 overflow-auto">
          {!customerSearch.trim() && (
            <button
              onClick={() => { setSelectedCustomer(null); setShowCustomerModal(false); setCustomerSearch(''); }}
              className="w-full text-left px-3 py-2 rounded-xl hover:bg-canvas-subtle text-sm text-muted"
            >
              Walk-in customer
            </button>
          )}
          {filteredCustomers.map(c => (
              <button
                key={c.id}
                onClick={() => { setSelectedCustomer(c); setShowCustomerModal(false); setCustomerSearch(''); }}
                className="w-full text-left px-3 py-2 rounded-xl hover:bg-canvas-subtle flex justify-between items-center gap-2"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium block truncate">{c.name}</span>
                  {c.phone && <span className="text-[10px] text-muted">{c.phone}</span>}
                </div>
                {c.loyalty_points ? <span className="text-xs text-accent-600 shrink-0">{c.loyalty_points} pts</span> : null}
              </button>
            ))}
          {customerSearch.trim() && filteredCustomers.length === 0 && (
            <p className="text-sm text-muted text-center py-6">No customers found</p>
          )}
        </div>
      </Modal>

      {/* Discount modal */}
      <Modal
        open={showDiscountModal}
        onClose={() => setShowDiscountModal(false)}
        title="Apply Discount"
        size="sm"
        footer={
          <>
            {discount && (
              <Button
                variant="danger"
                onClick={() => { setDiscount(null); setCouponCode(''); setShowDiscountModal(false); }}
                className="mr-auto"
              >
                Remove discount
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowDiscountModal(false)}>Cancel</Button>
            <Button onClick={() => setShowDiscountModal(false)}>Done</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(discountPresets.length ? discountPresets : [
              { id: '1', type: 'percent' as const, name: '10% Off', value: 10 },
              { id: '2', type: 'percent' as const, name: '20% Off', value: 20 },
              { id: '3', type: 'fixed' as const, name: '$5 Off', value: 5 },
              { id: '4', type: 'fixed' as const, name: '$10 Off', value: 10 },
            ]).map(d => (
              <button key={d.id} onClick={() => setDiscount({ type: d.type, value: d.value, name: d.name })} className={`py-2.5 rounded-xl border text-sm font-medium transition-colors ${discount?.name === d.name ? 'border-accent-600 bg-accent-50 dark:bg-accent-900/30 text-accent-600' : 'border-border hover:border-accent-300'}`}>
                <Percent className="w-3.5 h-3.5 inline mr-1" />{d.name}
              </button>
            ))}
          </div>
          <Input label="Coupon code" value={couponCode} onChange={e => setCouponCode(e.target.value)} placeholder="Enter code" />
          {discount && (
            <p className="text-xs text-success">
              Applied: <span className="font-semibold">{discount.name}</span>
            </p>
          )}
        </div>
      </Modal>

      {/* Held carts modal */}
      <Modal open={showHeldModal} onClose={() => setShowHeldModal(false)} title="Suspended Sales" size="sm">
        {heldCarts.length === 0 ? <p className="text-sm text-muted text-center py-6">No suspended sales</p> : (
          <div className="space-y-2">
            {heldCarts.map(h => (
              <button key={h.id} onClick={() => resumeHeld(h)} className="w-full text-left p-3 rounded-xl border border-border hover:border-accent-300 transition-colors">
                <p className="text-sm font-medium">{h.cart.filter(i => !i.voided).length} items · {formatCurrency(h.cart.reduce((s, i) => s + i.price * i.quantity, 0))}</p>
                <p className="text-xs text-muted">{new Date(h.savedAt).toLocaleString()}{h.customer ? ` · ${h.customer}` : ''}</p>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* Receipt preview */}
      <Modal open={showReceipt} onClose={() => { setShowReceipt(false); setReceiptSnapshot(null); }} title="Receipt Preview" size="sm">
        <div className="font-mono text-xs space-y-1 bg-canvas-subtle p-4 rounded-xl border border-border">
          <p className="text-center font-bold text-sm mb-2">NYCTO RETAIL MART</p>
          {displayReceipt.saleId && <p className="text-center text-muted">Sale #{displayReceipt.saleId}</p>}
          <p className="text-center text-muted mb-3">{new Date().toLocaleString()}</p>
          {displayReceipt.items.map(i => (
            <div key={i.uniqueId} className="flex justify-between"><span>{i.title} x{i.quantity}</span><span>{formatCurrency(i.price * i.quantity)}</span></div>
          ))}
          <div className="border-t border-border pt-2 mt-2 space-y-0.5">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(displayReceipt.subtotal)}</span></div>
            {displayReceipt.discountAmount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(displayReceipt.discountAmount)}</span></div>}
            {(displayReceipt.loyaltyDiscount ?? 0) > 0 && <div className="flex justify-between"><span>Loyalty</span><span>-{formatCurrency(displayReceipt.loyaltyDiscount)}</span></div>}
            <div className="flex justify-between"><span>Tax</span><span>{formatCurrency(displayReceipt.taxAmount)}</span></div>
            <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{formatCurrency(displayReceipt.total)}</span></div>
          </div>
          <p className="text-center text-muted mt-3">Thank you for shopping!</p>
        </div>
      </Modal>
    </div>
  );
}
