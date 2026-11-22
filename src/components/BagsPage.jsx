import { useEffect, useMemo, useState } from 'react'
import { GroceryTopBar } from './GroceryMenu'
import { useCart } from '../lib/CartContext'
import { loadItems, loadBagSlots, loadBagSlotItems, money } from '../lib/storeData'
import { StockLine } from './StoreBits'
import ScrollTopButton from './ScrollTopButton'
import { useCountryFilter, matchesCountry } from '../lib/countryFilter'

// Yently Bags: curated snack bags from the Yently store, cheapest first.
// Each bag is one store item (category 'yently-bags'); its recipe lives
// in store_bag_slots — one row per slot (label, category, qty). The
// customer picks one product per slot when adding the bag to the cart
// (a slot with only one product is picked for them); the bag price is
// flat, whatever they pick. Delivery only — bags never offer pickup.
// Bags never appear on the Products page, and the item detail page
// never adds one plain, so a bag in the cart always has its picks.
export default function BagsPage({ go }) {
  const [items, setItems] = useState(null)
  const [slots, setSlots] = useState(null)
  // Explicit picks per bag: { [bagId]: { [slot_no]: [itemId, ...] } }.
  // A slot with picks shows ONLY those products; a slot with none falls
  // back to the whole category pool (see optionsFor).
  const [slotPicks, setSlotPicks] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [justAdded, setJustAdded] = useState('')
  const [detailsBag, setDetailsBag] = useState(null)
  const [detailImg, setDetailImg] = useState(0)
  const [pickerBag, setPickerBag] = useState(null)
  // slot_no -> picked component item id, for the open picker.
  const [pickerChoices, setPickerChoices] = useState({})
  const { count, addBag } = useCart()
  const { country, countryName } = useCountryFilter()

  useEffect(() => {
    loadItems({ providerId: 3 }).then(setItems).catch(e => setError(e.message))
  }, [])

  const bags = useMemo(() => {
    if (!items) return null
    return items
      .filter(i => (i.categories || []).some(c => c.slug === 'yently-bags'))
      .filter(i => matchesCountry(i.provider?.country, country))
      .sort((a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name))
  }, [items, country])

  useEffect(() => {
    if (!bags) return
    if (bags.length === 0) { setSlots([]); setSlotPicks({}); return }
    loadBagSlots(bags.map(b => b.id)).then(setSlots).catch(e => setError(e.message))
    loadBagSlotItems(bags.map(b => b.id)).then(rows => {
      const map = {}
      for (const r of rows || []) {
        if (!map[r.bag_item_id]) map[r.bag_item_id] = {}
        if (!map[r.bag_item_id][r.slot_no]) map[r.bag_item_id][r.slot_no] = []
        map[r.bag_item_id][r.slot_no].push(r.item_id)
      }
      setSlotPicks(map)
    }).catch(e => setError(e.message))
  }, [bags])

  const slotsByBag = useMemo(() => {
    const out = {}
    for (const s of slots || []) {
      if (!out[s.bag_item_id]) out[s.bag_item_id] = []
      out[s.bag_item_id].push(s)
    }
    return out
  }, [slots])

  // Choice products for a slot: active store-3 items in the slot's
  // category (bags themselves are never options). If the admin picked
  // explicit products for this slot, ONLY those are offered; otherwise
  // the whole category pool is offered, as before.
  const optionsFor = (bag, slot) => {
    const pool = (items || [])
      .filter(i => i.is_active && !(i.categories || []).some(c => c.slug === 'yently-bags'))
      .filter(i => (i.categories || []).some(c => c.slug === slot.category_slug))
      .sort((a, b) => a.name.localeCompare(b.name))
    const picks = (slotPicks && bag && slotPicks[bag.id] && slotPicks[bag.id][slot.slot_no]) || null
    if (picks && picks.length > 0) return pool.filter(i => picks.includes(i.id))
    return pool
  }

  // What the same picks would cost bought one by one, at the cheapest
  // choice on each line — the honest floor for the saving. The bag
  // price sits ~15% under this; pricier picks save even more.
  const separateTotal = (bag) => {
    const bagSlots = slotsByBag[bag.id] || []
    if (bagSlots.length === 0) return null
    let total = 0
    for (const s of bagSlots) {
      const opts = optionsFor(bag, s)
      if (opts.length === 0) return null
      total += Math.min(...opts.map(o => Number(o.price))) * (s.qty || 1)
    }
    return total
  }

  const filtered = useMemo(() => {
    if (!bags) return []
    const needle = query.trim().toLowerCase()
    if (!needle) return bags
    return bags.filter(b => [b.name, b.description || '', String(b.price), b.barCode || ''].join(' ').toLowerCase().includes(needle))
  }, [bags, query])

  const openPicker = (bag) => {
    const bagSlots = slotsByBag[bag.id] || []
    const choices = {}
    for (const s of bagSlots) {
      const opts = optionsFor(bag, s)
      if (opts.length === 1) choices[s.slot_no] = opts[0].id
    }
    setPickerChoices(choices)
    setPickerBag(bag)
  }

  const pickerSlots = pickerBag ? (slotsByBag[pickerBag.id] || []) : []
  const pickerReady = pickerBag && pickerSlots.length > 0 && pickerSlots.every(s => pickerChoices[s.slot_no])
  const confirmAdd = () => {
    if (!pickerReady) return
    const pickIds = pickerSlots.map(s => pickerChoices[s.slot_no])
    addBag(pickerBag, pickIds, 1)
    setJustAdded(pickerBag.name)
    setTimeout(() => setJustAdded(''), 4000)
    setPickerBag(null)
  }

  const closePopups = () => { setDetailsBag(null); setPickerBag(null) }
  const openDetails = (bag) => { setDetailImg(0); setDetailsBag(bag) }
  const detailsSep = detailsBag ? separateTotal(detailsBag) : null
  const pickerSep = pickerBag ? separateTotal(pickerBag) : null
  const detailImgs = detailsBag ? (detailsBag.pics || []) : []

  useEffect(() => {
    if (!detailsBag && !pickerBag) return
    const onKey = (e) => { if (e.key === 'Escape') closePopups() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [detailsBag, pickerBag])

  return (
    <div>
      <GroceryTopBar go={go} />
      <div className="hero-card">
        <h2>🎒 Yently Bags</h2>
        <p>Snack bags put together by Yently — a mix of chips, drinks, sweets and more in every bag, for less than buying each one on its own. Pick your flavors for each bag when you add it to your cart. Delivery only.</p>
        {count > 0 && (
          <p><button type="button" className="link-btn" onClick={() => go('grocery-cart')}>🛒 View My Cart ({count})</button></p>
        )}
        {justAdded && <p className="status">✓ “{justAdded}” added to your cart.</p>}
        <div className="filters">
          <input placeholder="Search bags (e.g. lunch, chips, energy)" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {bags && <p className="hint">{filtered.length} bag{filtered.length === 1 ? '' : 's'} — cheapest first{country ? ` in ${countryName || country}` : ''}</p>}
      </div>

      {error && (
        <div className="hero-card"><p>Couldn't load the bags: {error}.</p></div>
      )}
      {!error && items === null && <div className="hero-card"><p>Loading bags...</p></div>}
      {!error && items && filtered.length === 0 && (
        <div className="hero-card"><p>No bags match.{country ? ` Nothing is listed for ${countryName || country} yet — try switching country in the bar above, or tap “All” above.` : ''} Try a different search.</p></div>
      )}

      <div className="grid">
        {filtered.map(bag => {
          const images = bag.pics || []
          const out = bag.stock !== null && bag.stock !== undefined && bag.stock <= 0
          const bagSlots = slotsByBag[bag.id] || []
          const hasSlots = slots !== null && bagSlots.length > 0
          const sep = separateTotal(bag)
          return (
            <div className="card" key={bag.id}>
              <div className="slideshow">
                {images.length > 0 ? (
                  <img src={images[0]} alt={bag.name} />
                ) : (
                  <div className="no-photo">No photos yet</div>
                )}
              </div>
              <div className="card-body">
                <h3 className="clickable-title" onClick={() => openDetails(bag)}>{bag.name}</h3>
                <p className="g-price">{money(bag.price)}</p>
                {sep !== null && sep > Number(bag.price) && <p className="hint">Bought separately {money(sep)} · This bag {money(bag.price)} · <b>You save {money(sep - Number(bag.price))}</b></p>}
                <StockLine stock={bag.stock} />
                {bag.description && <p className="car-desc desc-clamp">{bag.description}</p>}
                {bag.barCode && <p className="hint">Barcode: {bag.barCode}</p>}
                <p className="item-badges">
                  {bag.delivery && <span className="badge">🚚 Delivery</span>}
                </p>
                <div className="item-actions">
                  <button disabled={out || !hasSlots} onClick={() => openPicker(bag)}>{out ? 'Out of stock' : 'Add to cart'}</button>
                  <button className="btn-soft" onClick={() => openDetails(bag)}>View details →</button>
                </div>
                {!hasSlots && slots !== null && <p className="hint">This bag's contents are being set up — check back soon.</p>}
              </div>
            </div>
          )
        })}
      </div>

      <ScrollTopButton />

      {detailsBag && (
        <div onClick={closePopups} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', position: 'relative' }}>
            <button type="button" onClick={closePopups} aria-label="Close" style={{ position: 'absolute', top: 8, right: 12, fontSize: 20, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            <h3 style={{ marginTop: 0, paddingRight: 24 }}>{detailsBag.name} — {money(detailsBag.price)}</h3>
            {detailsSep !== null && detailsSep > Number(detailsBag.price) && <p className="hint">Bought separately {money(detailsSep)} · This bag {money(detailsBag.price)} · <b>You save {money(detailsSep - Number(detailsBag.price))}</b></p>}
            {detailImgs.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <img src={detailImgs[Math.min(detailImg, detailImgs.length - 1)]} alt={detailsBag.name} style={{ width: '100%', borderRadius: 8 }} />
                {detailImgs.length > 1 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {detailImgs.map((src, i) => (
                      <img key={i} src={src} alt="" onClick={() => setDetailImg(i)} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: i === detailImg ? '2px solid #161d44' : '2px solid transparent' }} />
                    ))}
                  </div>
                )}
              </div>
            )}
            {detailsBag.description && <p>{detailsBag.description}</p>}
            <p className="hint">Everything inside this bag — you pick one of the choices on each line when you add it to your cart. The price stays {money(detailsBag.price)} whatever you pick.</p>
            {(slotsByBag[detailsBag.id] || []).map(s => (
              <div key={s.slot_no} style={{ padding: '10px 0', borderBottom: '1px solid #e5e7eb' }}>
                <b>{s.slot_label}{s.qty > 1 ? ` × ${s.qty}` : ''}</b>
                <p className="hint" style={{ margin: '4px 0 0' }}>{optionsFor(detailsBag, s).map(o => o.name).join(' · ') || 'Choices coming soon.'}</p>
              </div>
            ))}
            <div className="item-actions" style={{ marginTop: 16 }}>
              <button type="button" onClick={() => { setDetailsBag(null); openPicker(detailsBag) }}>Add to cart — pick your flavors</button>
              <button type="button" className="btn-soft" onClick={closePopups}>Close</button>
            </div>
          </div>
        </div>
      )}

      {pickerBag && (
        <div onClick={closePopups} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 520, maxHeight: '80vh', overflowY: 'auto', position: 'relative' }}>
            <button type="button" onClick={closePopups} aria-label="Close" style={{ position: 'absolute', top: 8, right: 12, fontSize: 20, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
            <h3 style={{ marginTop: 0, paddingRight: 24 }}>{pickerBag.name} — {money(pickerBag.price)}</h3>
            <p className="hint">Pick one on each line.{pickerSep !== null && pickerSep > Number(pickerBag.price) ? ` Bought separately from ${money(pickerSep)} — the` : ' The'} price stays {money(pickerBag.price)} whatever you pick. Delivery only.</p>
            {pickerSlots.map(s => {
              const opts = optionsFor(pickerBag, s)
              const onlyOne = opts.length === 1
              return (
                <div key={s.slot_no} style={{ padding: '10px 0', borderBottom: '1px solid #e5e7eb' }}>
                  <b>{s.slot_label}{s.qty > 1 ? ` × ${s.qty}` : ''}</b>
                  {onlyOne && <p className="hint" style={{ margin: '4px 0 0' }}>Only one choice — picked for you.</p>}
                  <div style={{ marginTop: 6 }}>
                    {opts.map(o => (
                      <label key={o.id} style={{ display: 'block', padding: '6px 0', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`bag-slot-${pickerBag.id}-${s.slot_no}`}
                          checked={pickerChoices[s.slot_no] === o.id}
                          disabled={onlyOne}
                          onChange={() => setPickerChoices(prev => ({ ...prev, [s.slot_no]: o.id }))}
                        />{' '}
                        {o.name}
                      </label>
                    ))}
                    {opts.length === 0 && <p className="hint">No choices for this line yet.</p>}
                  </div>
                </div>
              )
            })}
            <div className="item-actions" style={{ marginTop: 16 }}>
              <button type="button" disabled={!pickerReady} onClick={confirmAdd}>Add to cart — {money(pickerBag.price)}</button>
              <button type="button" className="btn-soft" onClick={closePopups}>Cancel</button>
            </div>
            {!pickerReady && <p className="hint">Pick one on each line to add the bag.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
