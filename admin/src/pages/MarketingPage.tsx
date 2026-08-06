import { useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2, X, Check, Plus } from 'lucide-react';
import { useMarketingStore, type Coupon, type GiftCard, type Promo } from '../stores/marketing';
import { TableSearch, SortableTh, useTableSort } from '../components/TableTools';
import { NumberField, NumberFieldString } from '../components/NumberField';

type EditGiftCard = Omit<GiftCard, 'balance'> & { balance: number | '' };

export function MarketingPage() {
  const {
    coupons,
    giftCards,
    promos,
    message,
    load,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    createGiftCard,
    updateGiftCard,
    deleteGiftCard,
    createPromo,
    updatePromo,
    deletePromo,
  } = useMarketingStore();
  const [tab, setTab] = useState<'coupons' | 'gift_cards' | 'promotions'>('coupons');
  const [q, setQ] = useState('');

  const [couponForm, setCouponForm] = useState({ code: '', discount_type: 'percent', discount_value: '10', name: '' });
  const [giftForm, setGiftForm] = useState({ code: '', balance: '1000' });
  const [promoForm, setPromoForm] = useState({ name: '', promo_type: 'discount', percent: '10' });

  const [editCoupon, setEditCoupon] = useState<Coupon | null>(null);
  const [editCard, setEditCard] = useState<EditGiftCard | null>(null);
  const [editPromo, setEditPromo] = useState<Promo | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCoupons = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return coupons;
    return coupons.filter((c) => c.code.toLowerCase().includes(t) || (c.name || '').toLowerCase().includes(t));
  }, [coupons, q]);
  const filteredCards = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return giftCards;
    return giftCards.filter((c) => c.code.toLowerCase().includes(t));
  }, [giftCards, q]);
  const filteredPromos = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return promos;
    return promos.filter((p) => p.name.toLowerCase().includes(t) || (p.promo_type || '').toLowerCase().includes(t));
  }, [promos, q]);

  const couponSort = useTableSort(filteredCoupons, 'code');
  const cardSort = useTableSort(filteredCards, 'code');
  const promoSort = useTableSort(filteredPromos, 'name');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="text-sm text-muted mt-1">Coupons, gift cards, and promotions</p>
        </div>
        <TableSearch value={q} onChange={setQ} placeholder="Search marketing…" />
      </div>

      <div className="flex flex-wrap gap-2">
        {([
          ['coupons', 'Coupons'],
          ['gift_cards', 'Gift cards'],
          ['promotions', 'Promotions'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border ${
              tab === id ? 'bg-accent-600 text-white border-accent-600' : 'border-border text-foreground-secondary'
            }`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {message && <div className="text-sm text-success">{message}</div>}

      {tab === 'coupons' && (
        <>
          <form
            className="panel p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              await createCoupon({
                code: couponForm.code,
                name: couponForm.name || couponForm.code,
                discount_type: couponForm.discount_type,
                discount_value: Number(couponForm.discount_value),
              });
              setCouponForm({ code: '', discount_type: 'percent', discount_value: '10', name: '' });
            }}
          >
            <div>
              <label className="section-label">Code</label>
              <input className="input mt-1 h-10" value={couponForm.code} onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value })} required />
            </div>
            <div>
              <label className="section-label">Display name</label>
              <input className="input mt-1 h-10" value={couponForm.name} onChange={(e) => setCouponForm({ ...couponForm, name: e.target.value })} />
            </div>
            <div>
              <label className="section-label">Type</label>
              <select className="input mt-1 h-10" value={couponForm.discount_type} onChange={(e) => setCouponForm({ ...couponForm, discount_type: e.target.value })}>
                <option value="percent">Percent off</option>
                <option value="fixed">Fixed amount</option>
              </select>
            </div>
            <div>
              <label className="section-label">Value</label>
              <NumberFieldString className="input mt-1 h-10" value={couponForm.discount_value} onValueChange={(v) => setCouponForm({ ...couponForm, discount_value: v })} required />
            </div>
            <button className="btn-primary h-10" type="submit"><Plus size={16} /> Create coupon</button>
          </form>

          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas-subtle">
                <tr>
                  <SortableTh label="Code" sortKey="code" activeKey={couponSort.sortKey} dir={couponSort.sortDir} onToggle={couponSort.toggle} />
                  <SortableTh label="Name" sortKey="name" activeKey={couponSort.sortKey} dir={couponSort.sortDir} onToggle={couponSort.toggle} />
                  <SortableTh label="Type" sortKey="discount_type" activeKey={couponSort.sortKey} dir={couponSort.sortDir} onToggle={couponSort.toggle} />
                  <SortableTh label="Value" sortKey="discount_value" activeKey={couponSort.sortKey} dir={couponSort.sortDir} onToggle={couponSort.toggle} align="right" />
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {couponSort.sorted.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    {editCoupon?.id === c.id ? (
                      <>
                        <td className="px-4 py-2" colSpan={4}>
                          <div className="flex flex-wrap gap-2">
                            <input className="input h-9 font-mono" value={editCoupon.code} onChange={(e) => setEditCoupon({ ...editCoupon, code: e.target.value })} />
                            <NumberField
                              className="input h-9 w-24"
                              value={editCoupon.discount_value ?? ''}
                              onValueChange={(v) => setEditCoupon({ ...editCoupon, discount_value: v === '' ? undefined : v })}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" className="btn-ghost p-1 text-success" onClick={async () => {
                            await updateCoupon(c.id, {
                              name: editCoupon.name,
                              discount_type: editCoupon.discount_type || 'percent',
                              discount_value: editCoupon.discount_value,
                              active: true,
                            });
                            setEditCoupon(null);
                          }}><Check size={14} /></button>
                          <button type="button" className="btn-ghost p-1" onClick={() => setEditCoupon(null)}><X size={14} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono">{c.code}</td>
                        <td className="px-4 py-3">{c.name || '—'}</td>
                        <td className="px-4 py-3">{c.discount_type}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.discount_value}{c.discount_type === 'percent' ? '%' : ''}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" className="btn-ghost p-1" onClick={() => setEditCoupon(c)}><Pencil size={14} /></button>
                          <button type="button" className="btn-ghost p-1 text-danger" onClick={() => void deleteCoupon(c.id)}><Trash2 size={14} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!couponSort.sorted.length && <div className="p-8 text-center text-sm text-muted">No coupons</div>}
          </div>
        </>
      )}

      {tab === 'gift_cards' && (
        <>
          <form
            className="panel p-4 grid sm:grid-cols-3 gap-3 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const code = giftForm.code.trim() || `GC${Date.now().toString(36).toUpperCase()}`;
              await createGiftCard({ code, balance: Number(giftForm.balance) });
              setGiftForm({ code: '', balance: '1000' });
            }}
          >
            <div>
              <label className="section-label">Card code (optional — auto if blank)</label>
              <input className="input mt-1 h-10 font-mono" value={giftForm.code} onChange={(e) => setGiftForm({ ...giftForm, code: e.target.value })} placeholder="Leave blank to auto-generate" />
            </div>
            <div>
              <label className="section-label">Initial balance</label>
              <NumberFieldString className="input mt-1 h-10" min={1} value={giftForm.balance} onValueChange={(v) => setGiftForm({ ...giftForm, balance: v })} required />
            </div>
            <button className="btn-primary h-10" type="submit"><Plus size={16} /> Issue gift card</button>
          </form>

          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas-subtle">
                <tr>
                  <SortableTh label="Code" sortKey="code" activeKey={cardSort.sortKey} dir={cardSort.sortDir} onToggle={cardSort.toggle} />
                  <SortableTh label="Balance" sortKey="balance" activeKey={cardSort.sortKey} dir={cardSort.sortDir} onToggle={cardSort.toggle} align="right" />
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cardSort.sorted.map((g) => (
                  <tr key={g.id} className="border-t border-border">
                    {editCard?.id === g.id ? (
                      <>
                        <td className="px-4 py-2" colSpan={2}>
                          <div className="flex gap-2">
                            <input className="input h-9 font-mono" value={editCard.code} onChange={(e) => setEditCard({ ...editCard, code: e.target.value })} />
                            <NumberField
                              className="input h-9 w-28"
                              value={editCard.balance}
                              onValueChange={(v) => setEditCard({ ...editCard, balance: v })}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" className="btn-ghost p-1 text-success" onClick={async () => {
                            await updateGiftCard(g.id, { code: editCard.code, balance: Number(editCard.balance) || 0, active: true });
                            setEditCard(null);
                          }}><Check size={14} /></button>
                          <button type="button" className="btn-ghost p-1" onClick={() => setEditCard(null)}><X size={14} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-mono">{g.code}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">{g.balance}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" className="btn-ghost p-1" onClick={() => setEditCard(g)}><Pencil size={14} /></button>
                          <button type="button" className="btn-ghost p-1 text-danger" onClick={() => void deleteGiftCard(g.id)}><Trash2 size={14} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!cardSort.sorted.length && <div className="p-8 text-center text-sm text-muted">No gift cards</div>}
          </div>
        </>
      )}

      {tab === 'promotions' && (
        <>
          <form
            className="panel p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              await createPromo({
                name: promoForm.name,
                promo_type: promoForm.promo_type,
                config: { percent: Number(promoForm.percent) },
                active: true,
              });
              setPromoForm({ name: '', promo_type: 'discount', percent: '10' });
            }}
          >
            <div>
              <label className="section-label">Promotion name</label>
              <input className="input mt-1 h-10" value={promoForm.name} onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })} required />
            </div>
            <div>
              <label className="section-label">Type</label>
              <select className="input mt-1 h-10" value={promoForm.promo_type} onChange={(e) => setPromoForm({ ...promoForm, promo_type: e.target.value })}>
                <option value="discount">Discount</option>
                <option value="bogo">Buy one get one</option>
                <option value="bundle">Bundle</option>
              </select>
            </div>
            <div>
              <label className="section-label">Discount %</label>
              <NumberFieldString className="input mt-1 h-10" value={promoForm.percent} onValueChange={(v) => setPromoForm({ ...promoForm, percent: v })} />
            </div>
            <button className="btn-primary h-10" type="submit"><Plus size={16} /> Create promotion</button>
          </form>

          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas-subtle">
                <tr>
                  <SortableTh label="Name" sortKey="name" activeKey={promoSort.sortKey} dir={promoSort.sortDir} onToggle={promoSort.toggle} />
                  <SortableTh label="Type" sortKey="promo_type" activeKey={promoSort.sortKey} dir={promoSort.sortDir} onToggle={promoSort.toggle} />
                  <th className="px-4 py-3 text-[10px] uppercase tracking-wider text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-wider text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promoSort.sorted.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    {editPromo?.id === p.id ? (
                      <>
                        <td className="px-4 py-2" colSpan={3}>
                          <div className="flex flex-wrap gap-2 items-center">
                            <input className="input h-9" value={editPromo.name} onChange={(e) => setEditPromo({ ...editPromo, name: e.target.value })} />
                            <label className="flex items-center gap-1 text-xs">
                              <input type="checkbox" checked={editPromo.active !== false} onChange={(e) => setEditPromo({ ...editPromo, active: e.target.checked })} />
                              Active
                            </label>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button type="button" className="btn-ghost p-1 text-success" onClick={async () => {
                            await updatePromo(p.id, {
                              name: editPromo.name,
                              active: editPromo.active !== false,
                              promo_type: editPromo.promo_type,
                              config: editPromo.config,
                            });
                            setEditPromo(null);
                          }}><Check size={14} /></button>
                          <button type="button" className="btn-ghost p-1" onClick={() => setEditPromo(null)}><X size={14} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3">{p.promo_type || '—'}</td>
                        <td className="px-4 py-3">{p.active === false ? 'Inactive' : 'Active'}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" className="btn-ghost p-1" onClick={() => setEditPromo(p)}><Pencil size={14} /></button>
                          <button type="button" className="btn-ghost p-1 text-danger" onClick={() => void deletePromo(p.id)}><Trash2 size={14} /></button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!promoSort.sorted.length && <div className="p-8 text-center text-sm text-muted">No promotions</div>}
          </div>
        </>
      )}
    </div>
  );
}
