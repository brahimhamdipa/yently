import { Fragment, useEffect, useMemo, useState } from 'react'
import { fmtDate } from '../../lib/admin'
import { money } from '../../lib/storeData'
import { supabase } from '../../lib/supabaseClient'
import CancelOrderForm, { isGateableOrderTable, systemForOrderTable } from './CancelOrderForm'

// Systems Orders: the fulfilment view of every Business-cart plan
// order, driven by the order_tracking table (kind='system').
//
// One row per tracking row, newest first. The tracking row is the
// source of truth for status — never invent one: a row shows exactly
// the status stored on it, capitalised. Price is the plan's monthly
// list price, shown as "$X/month" (system orders are monthly plans).
//
// Filter definitions (chosen for this page, stated here so the choice
// is visible): completed = status 'delivered'; not completed =
// 'received' / 'preparing' / 'ready'. Cancelled rows show under All
// Orders ONLY — they are neither completed nor not completed, so they
// disappear from both filtered views and are found again under All.
//
// Status moves forward only: received → preparing → ready →
// delivered. A button that would not move the status forward is
// disabled; a 'delivered' or 'cancelled' row shows no status buttons
// at all. Only Mark delivered asks in-page first (same confirm-card
// pattern as AdminAllOrders — never window.confirm). Status changes
// call set_order_tracking_status (owner-only RPC, from the signed-in
// Admin session) and update local state + summary counts, no reload.
// The RPC also mirrors the status into the source order table when
// that table has a status column.
//
// View expands an in-row panel with the full tracking row plus the
// SOURCE order row, fetched live on click from its order_table by
// order_id. A fetch failure inside the panel shows "Could not load
// the original order." and never blanks the page.
//
// Load failure of the tracking table shows an error line + Retry,
// never a blank page.

// group: 'systems' | 'addons' | 'kids'. The label is the plan name —
// never the table name (barber_order is the Simple Website, while
// barbershop_order is the Barber system). Copied from
// AdminAllOrders.jsx, which owns this map.
const PLANS = [
  // Systems (13)
  { table: 'restaurant_order', label: 'Restaurant', group: 'systems', price: 40 },
  { table: 'pos_order', label: 'Point of sale', group: 'systems', price: 50 },
  { table: 'barbershop_order', label: 'Barbershop', group: 'systems', price: 15 },
  { table: 'dealer_order', label: 'Dealer', group: 'systems', price: 20 },
  { table: 'employee_order', label: 'Employee', group: 'systems', price: 20 },
  { table: 'bodyshop_order', label: 'Bodyshop', group: 'systems', price: 20 },
  { table: 'houses_order', label: 'Houses', group: 'systems', price: 20 },
  { table: 'doctor_order', label: 'Doctor', group: 'systems', price: 20 },
  { table: 'holiday_order', label: 'Holiday', group: 'systems', price: 20 },
  { table: 'rentals_order', label: 'Car Rental', group: 'systems', price: 20 },
  { table: 'laundry_order', label: 'Laundry', group: 'systems', price: 20 },
  { table: 'gym_order', label: 'Gym', group: 'systems', price: 20 },
  { table: 'barber_order', label: 'Simple Website', group: 'systems', price: 10 },
  // Add-ons (4)
  { table: 'tv_gallery_order', label: 'TV Gallery', group: 'addons', price: 2 },
  { table: 'live_chat_order', label: 'Live Chat', group: 'addons', price: 3 },
  { table: 'clean_link_order', label: 'Clean Link', group: 'addons', price: 2 },
  { table: 'direct_upload_order', label: 'Direct Upload', group: 'addons', price: 5 },
  // Yently Kids (9)
  { table: 'kids_math_order', label: 'Kids Math', group: 'kids', price: 10 },
  { table: 'kids_english_order', label: 'Kids English', group: 'kids', price: 10 },
  { table: 'kids_arabic_order', label: 'Kids Arabic', group: 'kids', price: 10 },
  { table: 'kids_french_order', label: 'Kids French', group: 'kids', price: 10 },
  { table: 'kids_spanish_order', label: 'Kids Spanish', group: 'kids', price: 10 },
  { table: 'kids_science_order', label: 'Kids Science', group: 'kids', price: 10 },
  { table: 'kids_geography_order', label: 'Kids Geography', group: 'kids', price: 10 },
  { table: 'kids_coding_order', label: 'Kids Coding', group: 'kids', price: 10 },
  { table: 'kids_reading_order', label: 'Kids Reading', group: 'kids', price: 10 },
]

const PLAN_BY_TABLE = Object.fromEntries(PLANS.map(p => [p.table, p]))

const STATUSES = ['received', 'preparing', 'ready', 'delivered', 'cancelled']
const STATUS_ORDER = { received: 0, preparing: 1, ready: 2, delivered: 3, cancelled: -1 }

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'

const rowTime = (r) => {
  const t = r.created_at ? new Date(r.created_at).getTime() : NaN
  return Number.isNaN(t) ? -Infinity : t
}

export default function AdminSystemsOrders() {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [filter, setFilter] = useState('all') // all | completed | not-completed
  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState(null)
  const [sourceByKey, setSourceByKey] = useState({})
  const [sourceErrorByKey, setSourceErrorByKey] = useState({})
  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState('')
  const [confirmDeliver, setConfirmDeliver] = useState(null)
  const [cancelRow, setCancelRow] = useState(null)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)

  const load = async () => {
    setRows(null)
    setLoadError('')
    setExpandedKey(null)
    setConfirmDeliver(null)
    setCancelRow(null)
    try {
      const { data, error } = await supabase
        .from('order_tracking')
        .select('*')
        .eq('kind', 'system')
        .order('created_at', { ascending: false })
      if (error) throw error
      setRows(data || [])
    } catch (err) {
      setLoadError('Could not load system orders: ' + err.message)
      setRows([])
    }
  }

  useEffect(() => { load() }, [])

  // Fetch the source order row live, on first expand only; a failure
  // is recorded per row and shown inside that row's panel.
  const loadSource = async (r) => {
    const key = r.code || (r.order_table + ':' + r.order_id)
    if (sourceByKey[key] || sourceErrorByKey[key] || !r.order_table || r.order_id === null || r.order_id === undefined) return
    try {
      const { data, error } = await supabase.from(r.order_table).select('*').eq('id', r.order_id).maybeSingle()
      if (error) throw error
      setSourceByKey(prev => ({ ...prev, [key]: data || null }))
      if (!data) setSourceErrorByKey(prev => ({ ...prev, [key]: 'Could not load the original order.' }))
    } catch (err) {
      setSourceErrorByKey(prev => ({ ...prev, [key]: 'Could not load the original order.' }))
    }
  }

  const toggleExpand = (r) => {
    const key = r.code || (r.order_table + ':' + r.order_id)
    const next = expandedKey === key ? null : key
    setExpandedKey(next)
    if (next) loadSource(r)
  }

  const doSetStatus = async (r, nextStatus) => {
    setUpdating(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('set_order_tracking_status', { p_code: r.code, p_status: nextStatus })
      if (error) throw error
      const at = new Date().toISOString()
      setRows(prev => (prev || []).map(o => {
        if (o.code !== r.code) return o
        const history = Array.isArray(o.status_history) ? [...o.status_history, { status: nextStatus, at }] : [{ status: nextStatus, at }]
        return { ...o, status: nextStatus, status_history: history, updated_at: at }
      }))
      setStatus(`✓ ${r.code} — marked ${cap(nextStatus)}.`)
      setConfirmDeliver(null)
    } catch (err) {
      setStatusError('Cannot update status: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const doCancelOrder = async ({ system, slug, note }) => {
    if (!cancelRow) return
    setCancelSubmitting(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('admin_cancel_order', {
        p_code: cancelRow.code,
        p_system: system || null,
        p_shop_slug: slug || null,
        p_reason: note || null,
      })
      if (error) throw error
      const gated = cancelRow.kind === 'system' && isGateableOrderTable(cancelRow.order_table) && system.trim() !== '' && slug.trim() !== ''
      setStatus(`✓ ${cancelRow.code} — cancelled${gated ? '. The service page is offline' : '.'}`)
      setCancelRow(null)
      load()
    } catch (err) {
      setStatusError('Cannot cancel order: ' + err.message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  const summary = useMemo(() => {
    const out = { total: 0 }
    for (const s of STATUSES) out[s] = 0
    for (const r of rows || []) {
      out.total += 1
      if (STATUSES.includes(r.status)) out[r.status] += 1
    }
    return out
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    const list = rows.filter(r => {
      if (filter === 'completed' && r.status !== 'delivered') return false
      if (filter === 'not-completed' && !['received', 'preparing', 'ready'].includes(r.status)) return false
      if (q) {
        const plan = PLAN_BY_TABLE[r.order_table]?.label || r.plan || ''
        const hay = [r.code, r.customer_name, r.customer_email, r.customer_phone, r.plan, plan, r.shop_slug].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const byTimeDesc = (a, b) => (rowTime(b) - rowTime(a)) || (Number(b.order_id) - Number(a.order_id))
    const byTimeAsc = (a, b) => (rowTime(a) - rowTime(b)) || (Number(a.order_id) - Number(b.order_id))
    if (sort === 'oldest') list.sort(byTimeAsc)
    else if (sort === 'price-desc') list.sort((a, b) => (Number(b.price || 0) - Number(a.price || 0)) || byTimeDesc(a, b))
    else if (sort === 'price-asc') list.sort((a, b) => (Number(a.price || 0) - Number(b.price || 0)) || byTimeDesc(a, b))
    else if (sort === 'customer') list.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '') || byTimeDesc(a, b))
    else list.sort(byTimeDesc) // newest first (default)
    return list
  }, [rows, search, sort, filter])

  const filterLabel = filter === 'completed' ? 'Completed Orders' : filter === 'not-completed' ? 'Not Completed Orders' : 'All Orders'
  const filtersActive = search.trim() !== '' || sort !== 'newest' || filter !== 'all'

  const clearFilters = () => { setSearch(''); setSort('newest'); setFilter('all') }

  if (rows === null) return <div className="hero-card"><p>Loading system orders…</p></div>

  return (
    <div>
      <div className="hero-card">
        <h2>📦 Systems Orders {summary.total > 0 && `(${summary.total})`}</h2>
        <p>Every system plan order, tracked from received to delivered. Tap a row for the full details and the original order. Mark delivered asks first. Cancelled orders show under All Orders only.</p>
      </div>

      {status && <p>{status}</p>}
      {statusError && <p className="status">{statusError}</p>}

      {loadError && (
        <div className="form-card">
          <p className="status">{loadError}</p>
          <div className="store-actions">
            <button type="button" className="btn-soft" onClick={load}>↻ Retry</button>
          </div>
        </div>
      )}

      {confirmDeliver && (
        <div className="form-card">
          <h3>Mark this order delivered?</h3>
          <p>Mark “{confirmDeliver.code} — {PLAN_BY_TABLE[confirmDeliver.order_table]?.label || confirmDeliver.plan || confirmDeliver.order_table}” as delivered?</p>
          <p className="hint">This moves the order to the final step of tracking. The customer sees it as delivered.</p>
          <div className="store-actions">
            <button type="button" className="btn-primary" onClick={() => doSetStatus(confirmDeliver, 'delivered')} disabled={updating}>Mark delivered</button>
            <button type="button" className="btn-soft" onClick={() => setConfirmDeliver(null)}>Cancel</button>
          </div>
        </div>
      )}

      {cancelRow && (
        <CancelOrderForm
          key={'cancel-' + cancelRow.code}
          title={`Cancel order ${cancelRow.code}?`}
          initialSystem={systemForOrderTable(cancelRow.order_table)}
          initialSlug={cancelRow.shop_slug || ''}
          showSlug={isGateableOrderTable(cancelRow.order_table)}
          submitLabel="Cancel order"
          noteLabel="Reason"
          onSubmit={doCancelOrder}
          onClose={() => setCancelRow(null)}
          submitting={cancelSubmitting}
        />
      )}

      <p><b>{summary.total} order{summary.total === 1 ? '' : 's'}</b> · Received {summary.received} · Preparing {summary.preparing} · Ready {summary.ready} · Delivered {summary.delivered} · Cancelled {summary.cancelled}</p>

      <div className="form-card">
        <div className="row">
          <input placeholder="Search order #, name, email, phone, plan..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn-soft" onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen}>☰ Filter: {filterLabel}</button>
            {filterOpen && (
              <div className="form-card" style={{ position: 'absolute', right: 0, zIndex: 5, minWidth: 220, marginTop: 6 }}>
                {[
                  { value: 'all', label: 'All Orders' },
                  { value: 'completed', label: 'Completed Orders' },
                  { value: 'not-completed', label: 'Not Completed Orders' },
                ].map(opt => (
                  <div key={opt.value}>
                    <button type="button" className="link-btn" onClick={() => { setFilter(opt.value); setFilterOpen(false) }}>{filter === opt.value ? '● ' : '○ '}{opt.label}</button>
                  </div>
                ))}
                <p className="hint">Completed = delivered. Not completed = received, preparing or ready. Cancelled shows under All Orders only.</p>
              </div>
            )}
          </div>
        </div>
        <div className="row">
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="price-desc">Price: high to low</option>
            <option value="price-asc">Price: low to high</option>
            <option value="customer">Customer A–Z</option>
          </select>
        </div>
        <div className="store-actions">
          <button type="button" className="btn-soft" onClick={load}>↻ Refresh</button>
          {filtersActive && <button type="button" className="btn-soft" onClick={clearFilters}>Clear filters</button>}
        </div>
      </div>

      <p><b>{filtered.length} order{filtered.length === 1 ? '' : 's'}</b></p>
      {filtered.length === 0 && <p className="hint">{summary.total === 0 ? 'No system orders yet.' : 'No orders match these filters.'}</p>}
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Order #</th><th>Date</th><th>System / Plan</th><th>Customer</th><th>Email</th><th>Phone</th><th>Price</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const key = r.code || (r.order_table + ':' + r.order_id)
                const expanded = expandedKey === key
                const plan = PLAN_BY_TABLE[r.order_table]
                const cur = STATUS_ORDER[r.status] ?? -1
                const canMove = r.status !== 'delivered' && r.status !== 'cancelled'
                const src = sourceByKey[key]
                const srcErr = sourceErrorByKey[key]
                return (
                  <Fragment key={key}>
                    <tr onClick={() => toggleExpand(r)} style={{ cursor: 'pointer' }}>
                      <td>{r.code || '—'}</td>
                      <td>{r.created_at ? fmtDate(r.created_at) : '—'}</td>
                      <td>{plan?.label || r.plan || r.order_table || '—'}</td>
                      <td>{r.customer_name || '—'}</td>
                      <td>{r.customer_email || '—'}</td>
                      <td>{r.customer_phone || '—'}</td>
                      <td>{money(r.price)}/month</td>
                      <td>{cap(r.status)}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <button type="button" className="btn-mini" onClick={() => toggleExpand(r)}>{expanded ? 'Hide' : 'View'}</button>{' '}
                        {canMove && (
                          <>
                            <button type="button" className="btn-mini" onClick={() => doSetStatus(r, 'preparing')} disabled={updating || cur >= 1}>Mark preparing</button>{' '}
                            <button type="button" className="btn-mini" onClick={() => doSetStatus(r, 'ready')} disabled={updating || cur >= 2}>Mark ready</button>{' '}
                            <button type="button" className="btn-mini" onClick={() => setConfirmDeliver(r)} disabled={updating || cur >= 3}>Mark delivered</button>{' '}
                            <button type="button" className="btn-mini" onClick={() => setCancelRow(r)} disabled={updating}>Cancel order</button>
                          </>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={9}>
                          <p><b>Order {r.code || '—'}</b> · {plan?.label || r.plan || r.order_table || '—'} · <b>Status:</b> {cap(r.status)} · <b>Price:</b> {money(r.price)}/month</p>
                          <p><b>Customer:</b> {r.customer_name || '—'}{r.customer_email ? ` · ${r.customer_email}` : ''}{r.customer_phone ? ` · ${r.customer_phone}` : ''}</p>
                          {r.shop_slug && <p><b>Shop link:</b> <a href={'https://yently.com/' + r.shop_slug} target="_blank" rel="noreferrer">yently.com/{r.shop_slug}</a></p>}
                          {Array.isArray(r.status_history) && r.status_history.length > 0 && (
                            <p><b>Tracking history:</b> {r.status_history.map(h => `${cap(h.status)} (${h.at ? fmtDate(h.at) : '—'})`).join(' → ')}</p>
                          )}
                          <p><b>Original order</b> ({r.order_table || '—'} #{r.order_id ?? '—'}):</p>
                          {srcErr && <p className="hint">{srcErr}</p>}
                          {!src && !srcErr && <p className="hint">Loading the original order…</p>}
                          {src && (
                            <>
                              <p><b>Note:</b> {src.note || '—'}</p>
                              {(src.business_name || src.system || src.shop_slug || src.clean_slug) && (
                                <p><b>Clean link:</b> {src.clean_slug ? 'yently.com/' + src.clean_slug : '—'} · <b>System:</b> {src.system || '—'} · <b>Shop:</b> {src.shop_slug || '—'} · <b>Business name:</b> {src.business_name || '—'}</p>
                              )}
                              <p><b>Customer on the original order:</b> {src.customer_name || '—'}{src.customer_email ? ` · ${src.customer_email}` : ''}{src.customer_phone ? ` · ${src.customer_phone}` : ''} · <b>Price:</b> {src.price !== undefined && src.price !== null ? money(src.price) + '/month' : '—'}</p>
                              <p className="hint">Ordered {src.created_at ? fmtDate(src.created_at) : '—'} · source table {r.order_table} · row #{src.id ?? r.order_id}</p>
                            </>
                          )}
                          <p className="hint">Tap the row again to close.</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
