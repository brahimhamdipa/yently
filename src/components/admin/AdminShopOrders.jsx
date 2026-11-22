import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchAll, fmtDate } from '../../lib/admin'
import { money } from '../../lib/storeData'
import { supabase } from '../../lib/supabaseClient'
import CancelOrderForm from './CancelOrderForm'

// Shop Orders: every shop order — store_orders —
// each joined to its tracking row (kind='shop', matched on
// order_table + order_id). One row per source order, newest first.
//
// Status is the TRACKING status when a tracking row exists
// (received/preparing/ready/delivered/cancelled), otherwise the
// source row's own status if it has one, else '—' — never invent one.
// Filter definitions (same as Systems Orders): completed =
// delivered; not completed = received/preparing/ready. Cancelled
// rows show under All Orders ONLY.
//
// Status moves forward only: received → preparing → ready →
// delivered. A button that would not move the status forward is
// disabled; a 'delivered' or 'cancelled' row shows no status buttons.
// Only Mark delivered asks in-page first (same confirm-card pattern
// as AdminAllOrders — never window.confirm). Status changes call
// set_order_tracking_status with the tracking code and update local
// state + summary counts, no reload. If the order has NO tracking
// row, the buttons are hidden and the panel says so — this page
// never creates tracking rows; orders without one predate tracking.
//
// Holds: a store_orders row with is_hold true shows a "Hold" badge
// and NO status buttons — holds are arranged with the customer
// later, not fulfilled through tracking.
//
// store_orders columns — VERIFIED against the repo DDL
// (supabase/store-tables.sql + store-tables-part3.sql, live main):
// id, provider_id, customer_name, customer_email, customer_phone,
// fulfillment ('delivery'|'pickup'), delivery_address, items jsonb
// [{id, name, price, qty, delivery_address, pickup_address}],
// total numeric, status text default 'pending', payment_status
// default 'unpaid', is_hold boolean default false, created_at.
// Live confirmation is still the 3 quick checks at the top of the
// backfill paste 02b (the live table could have drifted from the
// repo DDL). Items are still read defensively below — never guessed:
// when the items cannot be resolved from the row, the panel says
// "Items: see the original order".
//
// One bad table never blanks the page: each source is grabbed on its
// own (same grab() pattern as AdminAllOrders) and a failure just
// records the table name and contributes no rows.

const STATUS_ORDER = { received: 0, preparing: 1, ready: 2, delivered: 3, cancelled: -1 }

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'

const rowTime = (r) => {
  const t = r.created_at ? new Date(r.created_at).getTime() : NaN
  return Number.isNaN(t) ? -Infinity : t
}

// Resolve an items list from a source row, or null when it cannot be
// resolved. store_orders may or may not carry an items column at all — the RPC
// result has it, the stored row might not.
const resolveItems = (row) => {
  const items = row?.items
  if (!Array.isArray(items) || items.length === 0) return null
  return items.map(it => ({
    name: it?.name || it?.item_name || it?.title || ('Item #' + (it?.id ?? '?')),
    qty: Number(it?.qty ?? it?.quantity ?? 1) || 1,
    price: it?.price !== undefined && it?.price !== null ? Number(it.price) : null,
    variant: it?.variant || null,
  }))
}

const itemsSummary = (row, items) => {
  if (!items) return '—'
  const count = items.reduce((s, it) => s + (it.qty || 1), 0)
  const priced = items.every(it => it.price !== null)
  const total = priced ? items.reduce((s, it) => s + (it.price || 0) * (it.qty || 1), 0) : null
  const shown = total !== null ? total : (row?.total !== undefined && row?.total !== null ? Number(row.total) : null)
  return `${count} item${count === 1 ? '' : 's'}${shown !== null ? ' · ' + money(shown) : ''}`
}

export default function AdminShopOrders() {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState([])
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [filter, setFilter] = useState('all') // all | completed | not-completed
  const [filterOpen, setFilterOpen] = useState(false)
  const [expandedKey, setExpandedKey] = useState(null)
  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState('')
  const [confirmDeliver, setConfirmDeliver] = useState(null)
  const [cancelRow, setCancelRow] = useState(null)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [updating, setUpdating] = useState(false)

  const load = async () => {
    setRows(null)
    setFailed([])
    setExpandedKey(null)
    setConfirmDeliver(null)
    setCancelRow(null)
    const failedTables = []
    // One bad table must never blank the page: fetchAll throws, so
    // each table is grabbed on its own and a failure just records
    // the table name and contributes no rows.
    const grab = async (table) => {
      try { return await fetchAll(table) }
      catch (e) { failedTables.push(table); return [] }
    }
    const [storeRows, trackingRows, providers] = await Promise.all([
      grab('store_orders'),
      (async () => {
        try {
          const { data, error } = await supabase.from('order_tracking').select('*').eq('kind', 'shop').order('created_at', { ascending: false })
          if (error) throw error
          return data || []
        } catch (e) { failedTables.push('order_tracking'); return [] }
      })(),
      (async () => {
        try {
          const { data, error } = await supabase.from('store_providers').select('id,name')
          if (error) throw error
          return data || []
        } catch (e) { failedTables.push('store_providers'); return [] }
      })(),
    ])
    const providerById = Object.fromEntries((providers || []).map(p => [p.id, p.name]))
    const trackingByKey = {}
    for (const t of trackingRows || []) trackingByKey[t.order_table + ':' + t.order_id] = t

    const all = []
    for (const o of storeRows || []) {
      const tracking = trackingByKey['store_orders:' + o?.id] || null
      const items = resolveItems(o)
      all.push({
        key: 'store_orders:' + o?.id,
        sourceTable: 'store_orders',
        id: o?.id,
        store: providerById[o?.provider_id] || '—',
        customer_name: o?.customer_name || '',
        customer_email: o?.customer_email || '',
        customer_phone: o?.customer_phone || '',
        fulfillment: o?.fulfillment || '',
        delivery_address: o?.delivery_address || '',
        pickup_address: o?.pickup_address || o?.pickup_location || '',
        items,
        total: o?.total !== undefined && o?.total !== null ? Number(o.total) : null,
        statusSource: o?.status || '',
        is_hold: o?.is_hold === true,
        created_at: o?.created_at || null,
        tracking,
        code: tracking?.code || null,
      })
    }
    setRows(all)
    setFailed(failedTables)
  }

  useEffect(() => { load() }, [])

  // Effective status: tracking wins, then the source row's own
  // status, else nothing — never invented.
  const effStatus = (r) => r.tracking?.status || r.statusSource || ''

  const doSetStatus = async (r, nextStatus) => {
    if (!r.code) return
    setUpdating(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('set_order_tracking_status', { p_code: r.code, p_status: nextStatus })
      if (error) throw error
      const at = new Date().toISOString()
      setRows(prev => (prev || []).map(o => {
        if (o.key !== r.key) return o
        const prevTracking = o.tracking || {}
        const history = Array.isArray(prevTracking.status_history) ? [...prevTracking.status_history, { status: nextStatus, at }] : [{ status: nextStatus, at }]
        return { ...o, tracking: { ...prevTracking, status: nextStatus, status_history: history, updated_at: at } }
      }))
      setStatus(`✓ ${r.code} — marked ${cap(nextStatus)}.`)
      setConfirmDeliver(null)
    } catch (err) {
      setStatusError('Cannot update status: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  // Shop orders have no service page to take offline, so the cancel
  // goes through with no system and no slug — the order is just
  // cancelled. The shared form still asks for a reason.
  const doCancelOrder = async ({ note }) => {
    if (!cancelRow || !cancelRow.code) return
    setCancelSubmitting(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('admin_cancel_order', {
        p_code: cancelRow.code,
        p_system: null,
        p_shop_slug: null,
        p_reason: note || null,
      })
      if (error) throw error
      setStatus(`✓ ${cancelRow.code} — cancelled.`)
      setCancelRow(null)
      load()
    } catch (err) {
      setStatusError('Cannot cancel order: ' + err.message)
    } finally {
      setCancelSubmitting(false)
    }
  }

  const summary = useMemo(() => {
    const out = { total: 0, received: 0, preparing: 0, ready: 0, delivered: 0, cancelled: 0, noStatus: 0 }
    for (const r of rows || []) {
      out.total += 1
      const s = effStatus(r)
      if (['received', 'preparing', 'ready', 'delivered', 'cancelled'].includes(s)) out[s] += 1
      else out.noStatus += 1
    }
    return out
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    const list = rows.filter(r => {
      const s = effStatus(r)
      if (filter === 'completed' && s !== 'delivered') return false
      if (filter === 'not-completed' && !['received', 'preparing', 'ready'].includes(s)) return false
      if (q) {
        const hay = [r.code, r.store, r.customer_name, r.customer_email, r.customer_phone, r.fulfillment, r.delivery_address, r.pickup_address].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    const byTimeDesc = (a, b) => (rowTime(b) - rowTime(a)) || (Number(b.id) - Number(a.id))
    const byTimeAsc = (a, b) => (rowTime(a) - rowTime(b)) || (Number(a.id) - Number(b.id))
    if (sort === 'oldest') list.sort(byTimeAsc)
    else if (sort === 'price-desc') list.sort((a, b) => (Number(b.total || 0) - Number(a.total || 0)) || byTimeDesc(a, b))
    else if (sort === 'price-asc') list.sort((a, b) => (Number(a.total || 0) - Number(b.total || 0)) || byTimeDesc(a, b))
    else if (sort === 'customer') list.sort((a, b) => (a.customer_name || '').localeCompare(b.customer_name || '') || byTimeDesc(a, b))
    else list.sort(byTimeDesc) // newest first (default)
    return list
  }, [rows, search, sort, filter])

  const filterLabel = filter === 'completed' ? 'Completed Orders' : filter === 'not-completed' ? 'Not Completed Orders' : 'All Orders'
  const filtersActive = search.trim() !== '' || sort !== 'newest' || filter !== 'all'

  const clearFilters = () => { setSearch(''); setSort('newest'); setFilter('all') }

  if (rows === null) return <div className="hero-card"><p>Loading shop orders…</p></div>

  return (
    <div>
      <div className="hero-card">
        <h2>🛒 Shop Orders {summary.total > 0 && `(${summary.total})`}</h2>
        <p>Every shop order — with its tracking status. Tap a row for the items, customer details and tracking history. Mark delivered asks first. Orders without a tracking code predate tracking; holds are arranged with the customer later, not fulfilled here.</p>
      </div>

      {status && <p>{status}</p>}
      {statusError && <p className="status">{statusError}</p>}

      {failed.length > 0 && (
        <p className="status">Could not load {failed.length} table{failed.length > 1 ? 's' : ''} ({failed.join(', ')}) — those orders are missing below. Tap Refresh to try again.</p>
      )}

      {confirmDeliver && (
        <div className="form-card">
          <h3>Mark this order delivered?</h3>
          <p>Mark “{confirmDeliver.code} — {confirmDeliver.store}” as delivered?</p>
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
          initialSystem=""
          initialSlug=""
          showSlug={false}
          submitLabel="Cancel order"
          noteLabel="Reason"
          onSubmit={doCancelOrder}
          onClose={() => setCancelRow(null)}
          submitting={cancelSubmitting}
        />
      )}

      <p><b>{summary.total} order{summary.total === 1 ? '' : 's'}</b> · Received {summary.received} · Preparing {summary.preparing} · Ready {summary.ready} · Delivered {summary.delivered} · Cancelled {summary.cancelled}{summary.noStatus > 0 && ` · No status ${summary.noStatus}`}</p>

      <div className="form-card">
        <div className="row">
          <input placeholder="Search order #, store, name, email, phone..." value={search} onChange={e => setSearch(e.target.value)} />
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
      {filtered.length === 0 && <p className="hint">{summary.total === 0 ? 'No shop orders yet.' : 'No orders match these filters.'}</p>}
      {filtered.length > 0 && (
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>Order #</th><th>Date</th><th>Store</th><th>Customer</th><th>Items</th><th>Delivery / Pickup</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const expanded = expandedKey === r.key
                const s = effStatus(r)
                const cur = STATUS_ORDER[s] ?? -1
                const canMove = !!r.code && !r.is_hold && s !== 'delivered' && s !== 'cancelled' && s !== ''
                const fulfillmentLabel = r.fulfillment ? cap(r.fulfillment) : '—'
                const place = r.fulfillment === 'delivery'
                  ? (r.delivery_address || '—')
                  : r.fulfillment === 'pickup'
                    ? (r.pickup_address || r.delivery_address || '—')
                    : '—'
                return (
                  <Fragment key={r.key}>
                    <tr onClick={() => setExpandedKey(expanded ? null : r.key)} style={{ cursor: 'pointer' }}>
                      <td>{r.code || '—'}</td>
                      <td>{r.created_at ? fmtDate(r.created_at) : '—'}</td>
                      <td>{r.store}</td>
                      <td>{r.customer_name || '—'}</td>
                      <td>{itemsSummary(r, r.items)}</td>
                      <td>{fulfillmentLabel}{place !== '—' ? ` · ${place}` : ''}</td>
                      <td>{cap(s)}{r.is_hold ? ' · Hold' : ''}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <button type="button" className="btn-mini" onClick={() => setExpandedKey(expanded ? null : r.key)}>{expanded ? 'Hide' : 'View'}</button>{' '}
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
                        <td colSpan={8}>
                          <p><b>Order {r.code || ('#' + (r.id ?? '—'))}</b> · {r.store} · Store order · <b>Status:</b> {cap(s) || '—'}{r.is_hold ? ' · Hold — arranged with the customer later, not fulfilled here' : ''}</p>
                          <p><b>Customer:</b> {r.customer_name || '—'}{r.customer_email ? ` · ${r.customer_email}` : ''}{r.customer_phone ? ` · ${r.customer_phone}` : ''}</p>
                          <p><b>{cap(r.fulfillment) || '—'}:</b> {place}</p>
                          <p><b>Items:</b></p>
                          {r.items ? (
                            <ul>
                              {r.items.map((it, i) => (
                                <li key={i}>{it.name}{it.variant ? ` (${it.variant})` : ''} × {it.qty}{it.price !== null ? ` — ${money(it.price * it.qty)}` : ''}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="hint">Items: see the original order</p>
                          )}
                          <p><b>Total:</b> {r.total !== null ? money(r.total) : (r.items && r.items.every(it => it.price !== null) ? money(r.items.reduce((sum, it) => sum + it.price * it.qty, 0)) : '—')}</p>
                          {r.tracking && Array.isArray(r.tracking.status_history) && r.tracking.status_history.length > 0 && (
                            <p><b>Tracking history:</b> {r.tracking.status_history.map(h => `${cap(h.status)} (${h.at ? fmtDate(h.at) : '—'})`).join(' → ')}</p>
                          )}
                          {!r.tracking && <p className="hint">No tracking code yet — this order predates tracking.</p>}
                          {r.tracking && <p className="hint">Tracking code {r.tracking.code} · source {r.tracking.order_table} #{r.tracking.order_id}</p>}
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
