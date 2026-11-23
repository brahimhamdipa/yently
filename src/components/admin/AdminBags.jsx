import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { loadItems, loadBagSlots, loadBagSlotItems, loadItemCategories, loadFromDel, syncItemLinks, money } from '../../lib/storeData'
import { PicField } from './StoreFormBits'
import { removeStorePictureUrl } from '../../lib/storeUpload'

// Yently Bags — admin: full control over every bag in the Shop.
// A bag is one store item (provider 3, category 'yently-bags'); its
// recipe is store_bag_slots (label, category, qty per slot). On top of
// that, a slot can have EXPLICIT product picks in store_bag_slot_items:
// when picks exist, the shop offers ONLY those products for the slot;
// when a slot has no picks, it offers the whole category pool, as
// before — so the 9 existing bags behave exactly as today until picks
// are set for them. Bags are delivery only, never pickup.
//
// Add a bag creates the item + its category link + delivery-location
// links (all fromDel rows, the same 6 the existing bags have). Deleting
// a bag removes its slots, picks and links, then the item itself.
// is_active is the Live/Hidden switch (hidden bags never reach the shop).
const BAG_CATEGORY_SLUG = 'yently-bags'
const STORE_ID = 3

// Suggested price: cheapest-per-slot total × 0.85, rounded to the
// nearest .50 minus a cent, so it lands on .49/.99. A suggestion only
// — the admin sets the real price.
const suggestedPrice = (sep) => sep === null ? null : Math.round(sep * 0.85 * 2) / 2 - 0.01

const blankDraft = () => ({
  name: '', price: '', description: '', stock: 100, barCode: '',
  is_active: true, pics: [],
})

export default function AdminBags() {
  const [items, setItems] = useState(null)
  const [slots, setSlots] = useState([])
  const [picks, setPicks] = useState([])
  const [categories, setCategories] = useState([])
  const [fromdel, setFromdel] = useState([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null) // null = list, 'new' = new bag, id = edit
  const [draft, setDraft] = useState(null)
  // slot_no -> { slot_label, category_slug, qty } for the open editor.
  const [slotEdits, setSlotEdits] = useState({})
  const [newSlot, setNewSlot] = useState({ slot_label: '', category_slug: '', qty: 1 })
  // slot_no -> item id picked in the "add a product" select.
  const [addPickSel, setAddPickSel] = useState({})
  // `${slot_no}:${itemId}` -> item id picked in a "replace" select.
  const [replaceSel, setReplaceSel] = useState({})

  const loadAll = async () => {
    setError('')
    try {
      const [loadedItems, loadedCats, loadedFromdel] = await Promise.all([
        loadItems({ providerId: STORE_ID, activeOnly: false }),
        loadItemCategories(),
        loadFromDel(),
      ])
      setItems(loadedItems)
      setCategories(loadedCats)
      setFromdel(loadedFromdel)
      const bagIds = (loadedItems || [])
        .filter(i => (i.categories || []).some(c => c.slug === BAG_CATEGORY_SLUG))
        .map(i => i.id)
      const [loadedSlots, loadedPicks] = await Promise.all([
        loadBagSlots(bagIds),
        loadBagSlotItems(bagIds),
      ])
      setSlots(loadedSlots)
      setPicks(loadedPicks)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { loadAll() }, [])

  const bags = useMemo(() => {
    if (!items) return null
    return items
      .filter(i => (i.categories || []).some(c => c.slug === BAG_CATEGORY_SLUG))
      .sort((a, b) => Number(a.price) - Number(b.price) || a.name.localeCompare(b.name))
  }, [items])

  // Search filters the bag cards by name, description or barcode.
  const needle = search.trim().toLowerCase()
  const shownBags = (bags || []).filter(b => !needle || [b.name, b.description, b.barCode].join(' ').toLowerCase().includes(needle))

  const slotsByBag = useMemo(() => {
    const out = {}
    for (const s of slots) {
      if (!out[s.bag_item_id]) out[s.bag_item_id] = []
      out[s.bag_item_id].push(s)
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.slot_no - b.slot_no)
    return out
  }, [slots])

  const picksByBag = useMemo(() => {
    const out = {}
    for (const p of picks) {
      if (!out[p.bag_item_id]) out[p.bag_item_id] = {}
      if (!out[p.bag_item_id][p.slot_no]) out[p.bag_item_id][p.slot_no] = []
      out[p.bag_item_id][p.slot_no].push(p.item_id)
    }
    return out
  }, [picks])

  // Full category pool for a slot (before picks narrow it).
  const poolFor = (slot) => (items || [])
    .filter(i => i.is_active && !(i.categories || []).some(c => c.slug === BAG_CATEGORY_SLUG))
    .filter(i => (i.categories || []).some(c => c.slug === slot.category_slug))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Choice products for a slot: active store-3 items in the slot's
  // category (bags themselves are never options). Explicit picks win.
  const optionsFor = (bag, slot) => {
    const pool = poolFor(slot)
    const picked = (picksByBag[bag.id] && picksByBag[bag.id][slot.slot_no]) || null
    if (picked && picked.length > 0) return pool.filter(i => picked.includes(i.id))
    return pool
  }

  // What the same contents would cost bought one by one, at the
  // cheapest choice on each line — the honest floor for the saving.
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

  // A slot with no choices at all (empty category pool) blocks the bag
  // from being added to the cart — flag it wherever bags are listed.
  const emptySlots = (bag) => (slotsByBag[bag.id] || [])
    .filter(s => optionsFor(bag, s).length === 0)
    .map(s => s.slot_label)

  const bagsCategoryId = (categories.find(c => c.slug === BAG_CATEGORY_SLUG) || {}).id
  const slotCategories = categories.filter(c => c.slug !== BAG_CATEGORY_SLUG)

  const openEdit = (bag) => {
    setEditingId(bag.id)
    setDraft({
      name: bag.name, price: String(bag.price ?? ''), description: bag.description || '',
      stock: bag.stock ?? 100, barCode: bag.barCode || '', is_active: !!bag.is_active,
      pics: bag.pics || [],
    })
    const edits = {}
    for (const s of slotsByBag[bag.id] || []) {
      edits[s.slot_no] = { slot_label: s.slot_label, category_slug: s.category_slug, qty: s.qty || 1 }
    }
    setSlotEdits(edits)
    setNewSlot({ slot_label: '', category_slug: '', qty: 1 })
    setAddPickSel({})
    setReplaceSel({})
    setStatus('')
  }

  const openNew = () => {
    setEditingId('new')
    setDraft(blankDraft())
    setSlotEdits({})
    setNewSlot({ slot_label: '', category_slug: '', qty: 1 })
    setStatus('')
  }

  const saveBag = async (e) => {
    e.preventDefault()
    setStatus('Saving...')
    const price = Number(draft.price)
    if (!draft.name.trim()) { setStatus('Give the bag a name first.'); return }
    if (!(price > 0)) { setStatus('Set a price above $0.'); return }
    const stock = draft.stock === '' || draft.stock === null || draft.stock === undefined
      ? 100 : Math.max(0, Math.floor(Number(draft.stock) || 0))
    const fields = {
      name: draft.name.trim(),
      price,
      description: (draft.description || '').trim(),
      stock,
      barCode: (draft.barCode || '').trim() || null,
      is_active: !!draft.is_active,
      pics: draft.pics || [],
    }
    try {
      if (editingId === 'new') {
        const { data, error } = await supabase.from('store_items').insert({
          ...fields,
          provider_id: STORE_ID,
          delivery_address: 'YENTLY',
          pickup_address: null,
          delivery: true,
          pickup: false,
          pending_approval: false,
        }).select('id').single()
        if (error) throw error
        const newId = data.id
        // Category link + delivery-location links, like the existing bags.
        await syncItemLinks(newId, {
          categoryIds: bagsCategoryId ? [bagsCategoryId] : [],
          fromdelIds: fromdel.map(f => f.id),
          topickIds: [],
          subcategoryIds: [],
        })
        await loadAll()
        openEdit({ ...fields, id: newId, categories: [{ slug: BAG_CATEGORY_SLUG }] })
        setStatus(`✓ Bag "${fields.name}" created — now add its slots below.`)
      } else {
        const { error } = await supabase.from('store_items').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', editingId)
        if (error) throw error
        await loadAll()
        setStatus(`✓ Saved "${fields.name}".`)
      }
    } catch (err) {
      setStatus('Cannot save: ' + err.message)
    }
  }

  const deleteBag = async (bag) => {
    if (!window.confirm(`Delete "${bag.name}"? Its slots and product picks go with it. This cannot be undone.`)) return
    setStatus('Deleting...')
    try {
      const { error: pErr } = await supabase.from('store_bag_slot_items').delete().eq('bag_item_id', bag.id)
      if (pErr) throw pErr
      const { error: sErr } = await supabase.from('store_bag_slots').delete().eq('bag_item_id', bag.id)
      if (sErr) throw sErr
      await syncItemLinks(bag.id, { categoryIds: [], fromdelIds: [], topickIds: [], subcategoryIds: [] })
      for (const u of bag.pics || []) removeStorePictureUrl(u)
      const { error } = await supabase.from('store_items').delete().eq('id', bag.id)
      if (error) throw error
      setEditingId(null)
      setDraft(null)
      await loadAll()
      setStatus(`✓ Deleted "${bag.name}".`)
    } catch (err) {
      setStatus('Cannot delete: ' + err.message)
    }
  }

  const duplicateBag = async (bag) => {
    setStatus('Duplicating...')
    try {
      const { data, error } = await supabase.from('store_items').insert({
        provider_id: STORE_ID,
        name: bag.name + ' copy',
        price: bag.price,
        description: bag.description || '',
        delivery_address: 'YENTLY',
        pickup_address: null,
        delivery: true,
        pickup: false,
        is_active: false,
        stock: bag.stock ?? 100,
        pics: bag.pics || [],
        barCode: null,
        pending_approval: false,
      }).select('id').single()
      if (error) throw error
      const newId = data.id
      await syncItemLinks(newId, {
        categoryIds: bagsCategoryId ? [bagsCategoryId] : [],
        fromdelIds: fromdel.map(f => f.id),
        topickIds: [],
        subcategoryIds: [],
      })
      const bagSlots = slotsByBag[bag.id] || []
      if (bagSlots.length > 0) {
        const { error: sErr } = await supabase.from('store_bag_slots').insert(
          bagSlots.map(s => ({ bag_item_id: newId, slot_no: s.slot_no, slot_label: s.slot_label, category_slug: s.category_slug, qty: s.qty }))
        )
        if (sErr) throw sErr
      }
      const bagPicks = picks.filter(p => p.bag_item_id === bag.id)
      if (bagPicks.length > 0) {
        const { error: pErr } = await supabase.from('store_bag_slot_items').insert(
          bagPicks.map(p => ({ bag_item_id: newId, slot_no: p.slot_no, item_id: p.item_id }))
        )
        if (pErr) throw pErr
      }
      await loadAll()
      setStatus(`✓ Duplicated as "${bag.name} copy" — it starts Hidden so it never shows in the shop until you switch it Live and rename it.`)
    } catch (err) {
      setStatus('Cannot duplicate: ' + err.message)
    }
  }

  const addSlot = async (e) => {
    e.preventDefault()
    if (!newSlot.slot_label.trim()) { setStatus('Give the slot a label first (e.g. Chips).'); return }
    if (!newSlot.category_slug) { setStatus('Pick a product category for the slot first.'); return }
    const qty = Math.max(1, Math.floor(Number(newSlot.qty) || 1))
    const bagSlots = slotsByBag[editingId] || []
    const slotNo = bagSlots.length === 0 ? 1 : Math.max(...bagSlots.map(s => s.slot_no)) + 1
    try {
      const { error } = await supabase.from('store_bag_slots').insert({
        bag_item_id: editingId, slot_no: slotNo,
        slot_label: newSlot.slot_label.trim(), category_slug: newSlot.category_slug, qty,
      })
      if (error) throw error
      setNewSlot({ slot_label: '', category_slug: '', qty: 1 })
      await loadAll()
      // Keep the editor open on the same bag with fresh slot edits.
      const bag = (items || []).find(i => i.id === editingId)
      if (bag) {
        const edits = { ...slotEdits }
        edits[slotNo] = { slot_label: newSlot.slot_label.trim(), category_slug: newSlot.category_slug, qty }
        setSlotEdits(edits)
      }
      setStatus(`✓ Added slot "${newSlot.slot_label.trim()}".`)
    } catch (err) {
      setStatus('Cannot add slot: ' + err.message)
    }
  }

  const saveSlot = async (slot) => {
    const edit = slotEdits[slot.slot_no] || {}
    const label = (edit.slot_label || '').trim()
    const category = edit.category_slug || slot.category_slug
    const qty = Math.max(1, Math.floor(Number(edit.qty) || 1))
    if (!label) { setStatus('A slot needs a label.'); return }
    if (!category) { setStatus('Pick a product category for the slot.'); return }
    try {
      const { error } = await supabase.from('store_bag_slots').update({
        slot_label: label, category_slug: category, qty,
      }).eq('bag_item_id', slot.bag_item_id).eq('slot_no', slot.slot_no)
      if (error) throw error
      // Picks belong to the old category — they no longer apply, so
      // clear them rather than leaving picks that can never be offered.
      if (category !== slot.category_slug) {
        await supabase.from('store_bag_slot_items').delete()
          .eq('bag_item_id', slot.bag_item_id).eq('slot_no', slot.slot_no)
        setStatus(`✓ Saved slot "${label}" — its category changed, so its picked products were cleared; pick new ones below.`)
      } else {
        setStatus(`✓ Saved slot "${label}".`)
      }
      await loadAll()
    } catch (err) {
      setStatus('Cannot save slot: ' + err.message)
    }
  }

  const deleteSlot = async (slot) => {
    if (!window.confirm(`Delete the "${slot.slot_label}" slot and its picked products? This cannot be undone.`)) return
    try {
      await supabase.from('store_bag_slot_items').delete()
        .eq('bag_item_id', slot.bag_item_id).eq('slot_no', slot.slot_no)
      const { error } = await supabase.from('store_bag_slots').delete()
        .eq('bag_item_id', slot.bag_item_id).eq('slot_no', slot.slot_no)
      if (error) throw error
      await loadAll()
      setStatus(`✓ Deleted slot "${slot.slot_label}".`)
    } catch (err) {
      setStatus('Cannot delete slot: ' + err.message)
    }
  }

  const addPick = async (bag, slot) => {
    const itemId = Number(addPickSel[slot.slot_no])
    if (!itemId) { setStatus('Pick a product to add first.'); return }
    try {
      const { error } = await supabase.from('store_bag_slot_items').insert({
        bag_item_id: bag.id, slot_no: slot.slot_no, item_id: itemId,
      })
      if (error) throw error
      setAddPickSel(prev => ({ ...prev, [slot.slot_no]: '' }))
      await loadAll()
      const item = (items || []).find(i => i.id === itemId)
      setStatus(`✓ Added "${item ? item.name : itemId}" to the "${slot.slot_label}" slot — now only the picked products are offered there.`)
    } catch (err) {
      setStatus('Cannot add product: ' + err.message)
    }
  }

  const removePick = async (bag, slot, itemId) => {
    try {
      const { error } = await supabase.from('store_bag_slot_items').delete()
        .eq('bag_item_id', bag.id).eq('slot_no', slot.slot_no).eq('item_id', itemId)
      if (error) throw error
      await loadAll()
      const item = (items || []).find(i => i.id === itemId)
      const left = ((picksByBag[bag.id] || {})[slot.slot_no] || []).filter(id => id !== itemId)
      setStatus(left.length === 0
        ? `✓ Removed "${item ? item.name : itemId}" — the slot now offers the whole category again.`
        : `✓ Removed "${item ? item.name : itemId}" from the "${slot.slot_label}" slot.`)
    } catch (err) {
      setStatus('Cannot remove product: ' + err.message)
    }
  }

  const replacePick = async (bag, slot, oldItemId) => {
    const key = slot.slot_no + ':' + oldItemId
    const newItemId = Number(replaceSel[key])
    if (!newItemId || newItemId === oldItemId) return
    try {
      // Insert first, then remove the old one — if the insert fails
      // (already picked), nothing is lost.
      const { error: insErr } = await supabase.from('store_bag_slot_items').insert({
        bag_item_id: bag.id, slot_no: slot.slot_no, item_id: newItemId,
      })
      if (insErr) throw insErr
      const { error: delErr } = await supabase.from('store_bag_slot_items').delete()
        .eq('bag_item_id', bag.id).eq('slot_no', slot.slot_no).eq('item_id', oldItemId)
      if (delErr) throw delErr
      setReplaceSel(prev => ({ ...prev, [key]: '' }))
      await loadAll()
      const oldItem = (items || []).find(i => i.id === oldItemId)
      const newItem = (items || []).find(i => i.id === newItemId)
      setStatus(`✓ Replaced "${oldItem ? oldItem.name : oldItemId}" with "${newItem ? newItem.name : newItemId}" in the "${slot.slot_label}" slot.`)
    } catch (err) {
      setStatus('Cannot replace product: ' + err.message)
    }
  }

  if (error) {
    return (
      <div>
        <div className="hero-card"><h2>🎒 Yently Bags</h2></div>
        <div className="hero-card"><p>Couldn't load the bags: {error}</p></div>
      </div>
    )
  }

  if (!bags) {
    return (
      <div>
        <div className="hero-card"><h2>🎒 Yently Bags</h2></div>
        <div className="hero-card"><p>Loading bags...</p></div>
      </div>
    )
  }

  const editingBag = editingId !== null && editingId !== 'new'
    ? bags.find(b => b.id === editingId) || null
    : null

  if (editingId !== null && draft) {
    const bagSlots = editingId === 'new' ? [] : (slotsByBag[editingId] || [])
    return (
      <div>
        <div className="hero-card">
          <h2>🎒 {editingId === 'new' ? 'Add a bag' : `Edit — ${editingBag ? editingBag.name : ''}`}</h2>
          <p><button type="button" className="btn-soft" onClick={() => { setEditingId(null); setDraft(null); setStatus('') }}>← Back to bags</button></p>
          {status && <p className="status">{status}</p>}
        </div>

        <form className="form-card" onSubmit={saveBag}>
          <input required placeholder="Bag name (e.g. Traditional YENTLY)" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <input required placeholder="Price" type="number" step="0.01" min="0" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} />
          <textarea placeholder="Description — about 3 lines, what is inside" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
          <input placeholder="Stock (how many available)" type="number" min="0" value={draft.stock ?? ''} onChange={e => setDraft({ ...draft, stock: e.target.value })} />
          <input placeholder="Barcode (optional — generate one in the Barcode Generator)" value={draft.barCode} onChange={e => setDraft({ ...draft, barCode: e.target.value })} />
          <label><input type="checkbox" checked={!!draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} /> Live on the shop (uncheck to hide it)</label>
          <PicField pics={draft.pics || []} setPics={pics => setDraft({ ...draft, pics })} />
          <div className="store-actions">
            <button type="submit" className="btn-primary">{editingId === 'new' ? 'Create bag' : 'Save bag'}</button>
            <button type="button" className="btn-soft" onClick={() => { setEditingId(null); setDraft(null); setStatus('') }}>Cancel</button>
          </div>
          {editingBag && (() => {
            const sep = separateTotal(editingBag)
            const sug = suggestedPrice(sep)
            return (
              <p className="hint">
                {sep !== null
                  ? <>Bought separately {money(sep)} · This bag {money(editingBag.price)} · You save {money(Math.max(0, sep - Number(editingBag.price)))} · Suggested price {sug !== null ? money(sug) : '—'} (cheapest × 0.85).</>
                  : 'Add slots with choices to see the bought-separately total and suggested price.'}
              </p>
            )
          })()}
        </form>

        {editingId === 'new' && (
          <div className="hero-card"><p>Save the bag first — then add its slots below.</p></div>
        )}

        {editingId !== 'new' && editingBag && (
          <div>
            <div className="hero-card">
              <h3>What's inside — {bagSlots.length} slot{bagSlots.length === 1 ? '' : 's'}</h3>
              <p className="hint">Each slot is one line the customer picks from. A slot with picked products offers ONLY those products; a slot with no picks offers every product in its category. Pick products to control exactly what goes in the bag.</p>
            </div>
            {bagSlots.map(slot => {
              const edit = slotEdits[slot.slot_no] || { slot_label: slot.slot_label, category_slug: slot.category_slug, qty: slot.qty || 1 }
              const pool = poolFor(slot)
              const pickedIds = ((picksByBag[editingBag.id] || {})[slot.slot_no]) || []
              const pickedItems = pickedIds
                .map(id => (items || []).find(i => i.id === id))
                .filter(Boolean)
              const unpicked = pool.filter(i => !pickedIds.includes(i.id))
              const offered = optionsFor(editingBag, slot)
              return (
                <div className="form-card" key={slot.slot_no}>
                  <h3 style={{ marginTop: 0 }}>Slot {slot.slot_no} — {slot.slot_label}{slot.qty > 1 ? ` × ${slot.qty}` : ''}</h3>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input placeholder="Label (e.g. Chips)" value={edit.slot_label} onChange={e => setSlotEdits(prev => ({ ...prev, [slot.slot_no]: { ...edit, slot_label: e.target.value } }))} />
                    <select value={edit.category_slug} onChange={e => setSlotEdits(prev => ({ ...prev, [slot.slot_no]: { ...edit, category_slug: e.target.value } }))}>
                      <option value="">— Category —</option>
                      {slotCategories.map(c => <option key={c.id} value={c.slug}>{c.label}</option>)}
                    </select>
                    <input placeholder="Qty" type="number" min="1" style={{ width: 80 }} value={edit.qty} onChange={e => setSlotEdits(prev => ({ ...prev, [slot.slot_no]: { ...edit, qty: e.target.value } }))} />
                    <button type="button" onClick={() => saveSlot(slot)}>Save slot</button>
                    <button type="button" className="btn-soft" onClick={() => deleteSlot(slot)}>Delete slot</button>
                  </div>
                  {edit.category_slug !== slot.category_slug && (
                    <p className="hint">⚠️ Changing the category clears this slot's picked products — they belong to the old category.</p>
                  )}
                  {pool.length === 0 && (
                    <p className="status">⚠️ No products in this category — customers can't add this bag until you add products to the category (in Items) or change the slot's category.</p>
                  )}
                  {pickedItems.length > 0 ? (
                    <div>
                      <p style={{ marginBottom: 4 }}><b>Only these {pickedItems.length} product{pickedItems.length === 1 ? '' : 's'} are offered:</b></p>
                      {pickedItems.map(it => {
                        const key = slot.slot_no + ':' + it.id
                        return (
                          <div key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
                            <span style={{ flex: 1 }}>{it.name} — {money(it.price)}</span>
                            <select value={replaceSel[key] || ''} onChange={e => setReplaceSel(prev => ({ ...prev, [key]: e.target.value }))}>
                              <option value="">Replace with…</option>
                              {unpicked.map(u => <option key={u.id} value={u.id}>{u.name} — {money(u.price)}</option>)}
                            </select>
                            <button type="button" className="btn-soft" disabled={!replaceSel[key]} onClick={() => replacePick(editingBag, slot, it.id)}>Replace</button>
                            <button type="button" className="btn-soft" onClick={() => removePick(editingBag, slot, it.id)}>Remove</button>
                          </div>
                        )
                      })}
                      <p className="hint">Remove the last picked product and the slot offers the whole category again.</p>
                    </div>
                  ) : (
                    <p className="hint">Offering all {pool.length} product{pool.length === 1 ? '' : 's'} in this category: {pool.map(o => o.name).join(' · ') || '—'}</p>
                  )}
                  {unpicked.length > 0 ? (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <select value={addPickSel[slot.slot_no] || ''} onChange={e => setAddPickSel(prev => ({ ...prev, [slot.slot_no]: e.target.value }))}>
                        <option value="">Add a product to this slot…</option>
                        {unpicked.map(u => <option key={u.id} value={u.id}>{u.name} — {money(u.price)}</option>)}
                      </select>
                      <button type="button" onClick={() => addPick(editingBag, slot)}>Add product</button>
                    </div>
                  ) : (
                    pool.length > 0 && <p className="hint">Every product in this category is already picked for this slot.</p>
                  )}
                  <p className="hint">Offering now: {offered.map(o => o.name).join(' · ') || 'nothing yet'}</p>
                </div>
              )
            })}
            <form className="form-card" onSubmit={addSlot}>
              <h3 style={{ marginTop: 0 }}>Add a slot</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input placeholder="Label (e.g. Chips)" value={newSlot.slot_label} onChange={e => setNewSlot({ ...newSlot, slot_label: e.target.value })} />
                <select value={newSlot.category_slug} onChange={e => setNewSlot({ ...newSlot, category_slug: e.target.value })}>
                  <option value="">— Category —</option>
                  {slotCategories.map(c => <option key={c.id} value={c.slug}>{c.label}</option>)}
                </select>
                <input placeholder="Qty" type="number" min="1" style={{ width: 80 }} value={newSlot.qty} onChange={e => setNewSlot({ ...newSlot, qty: e.target.value })} />
                <button type="submit">Add slot</button>
              </div>
            </form>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="hero-card">
        <h2>🎒 Yently Bags</h2>
        <p>Every bag in the Shop, cheapest first. Edit a bag to change its price, photo, barcode or stock — and to control exactly which products each slot offers. A slot with picked products offers only those; a slot with no picks offers its whole category.</p>
        {status && <p className="status">{status}</p>}
        <button type="button" onClick={openNew}>＋ Add a bag</button>
      </div>
      {bags.length === 0 && (
        <div className="hero-card"><p>No bags yet — tap "＋ Add a bag" above.</p></div>
      )}
      <input placeholder="Search bags — name or barcode…" style={{ fontSize: 16 }} value={search} onChange={e => setSearch(e.target.value)} />
      <p className="hint">{search.trim() ? `${shownBags.length} of ${(bags || []).length} bags match` : `${(bags || []).length} bags`}</p>
      <div className="grid" style={{ maxHeight: 560, overflowY: 'auto' }}>
        {shownBags.map(bag => {
          const bagSlots = slotsByBag[bag.id] || []
          const sep = separateTotal(bag)
          const sug = suggestedPrice(sep)
          const empties = emptySlots(bag)
          const out = bag.stock !== null && bag.stock !== undefined && bag.stock <= 0
          return (
            <div className="card" key={bag.id}>
              <div className="slideshow">
                {(bag.pics || []).length > 0 ? (
                  <img src={bag.pics[0]} alt={bag.name} />
                ) : (
                  <div className="no-photo">No photos yet</div>
                )}
              </div>
              <div className="card-body">
                <h3>{bag.name}</h3>
                <p className="g-price">{money(bag.price)}</p>
                <p className="hint">
                  {bag.is_active ? '🟢 Live' : '⚪ Hidden'} · Stock: {bag.stock ?? '—'}{out ? ' · OUT OF STOCK' : ''}
                  {bag.barCode ? ` · Barcode: ${bag.barCode}` : ' · No barcode yet'}
                </p>
                {sep !== null && <p className="hint">Bought separately {money(sep)} · You save {money(Math.max(0, sep - Number(bag.price)))} · Suggested {sug !== null ? money(sug) : '—'}</p>}
                {sep === null && <p className="hint">Add slots with choices to see the bought-separately total.</p>}
                {empties.length > 0 && <p className="status">⚠️ Empty slot{empties.length === 1 ? '' : 's'}: {empties.join(', ')} — no choices there.</p>}
                <p className="hint">{bagSlots.length} slot{bagSlots.length === 1 ? '' : 's'}: {bagSlots.map(s => {
                  const picked = ((picksByBag[bag.id] || {})[s.slot_no] || []).length
                  return `${s.slot_label}${s.qty > 1 ? ` ×${s.qty}` : ''}${picked > 0 ? ` (${picked} picked)` : ''}`
                }).join(' · ') || 'No slots yet'}</p>
                {bag.description && <p className="car-desc desc-clamp">{bag.description}</p>}
                <div className="item-actions">
                  <button type="button" onClick={() => openEdit(bag)}>Edit</button>
                  <button type="button" className="btn-soft" onClick={() => duplicateBag(bag)}>Duplicate</button>
                  <button type="button" className="btn-soft" onClick={() => deleteBag(bag)}>Delete</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
