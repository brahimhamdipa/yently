import { Fragment, useEffect, useMemo, useState } from 'react'
import { fmtDate } from '../../lib/admin'
import { supabase } from '../../lib/supabaseClient'
import CancelOrderForm, { isGateableOrderTable, systemForOrderTable } from './CancelOrderForm'

// Cancellations: every customer cancellation request, newest first,
// each joined to its order_tracking row (matched on tracking_code).
// The join is done in JS — the request is fetched first, then each
// matching tracking row by code (same approach ShopOrders uses for
// its extra fetches). A request whose tracking row is gone still
// shows, with '—' for the plan and order status — never a blank page.
//
// Approve (pending rows only) opens the shared CancelOrderForm with
// the system + shop slug prefilled from the tracking row, then calls
// approve_cancellation (owner-only RPC). Reject asks in-page first
// with an optional note, then calls reject_cancellation. Restore
// (approved rows only) asks in-page first, then calls
// restore_cancelled_service with the tracking code — the service
// page goes back online. Every action shows a plain success/error
// line and refreshes the list. Never window.confirm.

// order_table -> plan label, copied from AdminSystemsOrders.jsx
// (which owns the map). The tracking row's plan name is shown first;
// this is only the fallback when the plan name is missing.
const PLAN_LABEL_BY_TABLE = {
  restaurant_order: 'Restaurant',
  pos_order: 'Point of sale',
  barbershop_order: 'Barbershop',
  dealer_order: 'Dealer',
  employee_order: 'Employee',
  bodyshop_order: 'Bodyshop',
  houses_order: 'Houses',
  doctor_order: 'Doctor',
  holiday_order: 'Holiday',
  rentals_order: 'Car Rental',
  laundry_order: 'Laundry',
  gym_order: 'Gym',
  barber_order: 'Simple Website',
  tv_gallery_order: 'TV Gallery',
  live_chat_order: 'Live Chat',
  clean_link_order: 'Clean Link',
  direct_upload_order: 'Direct Upload',
  kids_math_order: 'Kids Math',
  kids_english_order: 'Kids English',
  kids_arabic_order: 'Kids Arabic',
  kids_french_order: 'Kids French',
  kids_spanish_order: 'Kids Spanish',
  kids_science_order: 'Kids Science',
  kids_geography_order: 'Kids Geography',
  kids_coding_order: 'Kids Coding',
  kids_reading_order: 'Kids Reading',
}

const REQUEST_STATUSES = ['pending', 'approved', 'rejected']

const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'

const planLabel = (tracking) => {
  if (!tracking) return '—'
  return tracking.plan || PLAN_LABEL_BY_TABLE[tracking.order_table] || tracking.order_table || '—'
}

export default function AdminCancellations() {
  const [rows, setRows] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | pending | approved | rejected
  const [filterOpen, setFilterOpen] = useState(false)
  const [status, setStatus] = useState('')
  const [statusError, setStatusError] = useState('')
  const [approveReq, setApproveReq] = useState(null)
  const [rejectReq, setRejectReq] = useState(null)
  const [rejectNote, setRejectNote] = useState('')
  const [restoreReq, setRestoreReq] = useState(null)
  const [updating, setUpdating] = useState(false)

  const load = async () => {
    setRows(null)
    setLoadError('')
    setApproveReq(null)
    setRejectReq(null)
    setRestoreReq(null)
    try {
      const { data, error } = await supabase
        .from('cancellation_requests')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      const requests = data || []
      // Join each request to its tracking row by code, in JS.
      const codes = [...new Set(requests.map(r => r.tracking_code).filter(Boolean))]
      const trackingByCode = {}
      await Promise.all(codes.map(async (code) => {
        try {
          const { data: t, error: tErr } = await supabase.from('order_tracking').select('*').eq('code', code).maybeSingle()
          if (tErr) throw tErr
          if (t) trackingByCode[code] = t
        } catch {
          // One missing tracking row never blanks the page — that
          // request just shows '—' for plan and order status.
        }
      }))
      setRows(requests.map(r => ({ ...r, tracking: trackingByCode[r.tracking_code] || null })))
    } catch (err) {
      setLoadError('Could not load cancellation requests: ' + err.message)
      setRows([])
    }
  }

  useEffect(() => { load() }, [])

  const doApprove = async ({ system, slug, note }) => {
    if (!approveReq) return
    setUpdating(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('approve_cancellation', {
        p_request_id: approveReq.id,
        p_system: system || null,
        p_shop_slug: slug || null,
        p_note: note || null,
      })
      if (error) throw error
      const gated = approveReq.tracking?.kind === 'system' && system.trim() !== '' && slug.trim() !== ''
      setStatus(`✓ ${approveReq.tracking_code} — cancellation approved. The order is cancelled${gated ? ' and the service page is offline' : ''}.`)
      setApproveReq(null)
      load()
    } catch (err) {
      setStatusError('Cannot approve cancellation: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const doReject = async () => {
    if (!rejectReq) return
    setUpdating(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('reject_cancellation', {
        p_request_id: rejectReq.id,
        p_note: rejectNote.trim() || null,
      })
      if (error) throw error
      setStatus(`✓ ${rejectReq.tracking_code} — cancellation request rejected. The order stays as it was.`)
      setRejectReq(null)
      setRejectNote('')
      load()
    } catch (err) {
      setStatusError('Cannot reject cancellation: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const doRestore = async () => {
    if (!restoreReq) return
    setUpdating(true)
    setStatusError('')
    try {
      const { error } = await supabase.rpc('restore_cancelled_service', {
        p_tracking_code: restoreReq.tracking_code,
      })
      if (error) throw error
      setStatus(`✓ ${restoreReq.tracking_code} — service restored. The service page is back online.`)
      setRestoreReq(null)
      load()
    } catch (err) {
      setStatusError('Cannot restore service: ' + err.message)
    } finally {
      setUpdating(false)
    }
  }

  const summary = useMemo(() => {
    const out = { total: 0, pending: 0, approved: 0, rejected: 0 }
    for (const r of rows || []) {
      out.total += 1
      if (REQUEST_STATUSES.includes(r.status)) out[r.status] += 1
    }
    return out
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filter !== 'all' && r.status !== filter) return false
      if (q) {
        const t = r.tracking || {}
        const hay = [r.tracking_code, r.customer_name, r.customer_email, t.customer_name, t.customer_email, t.plan, planLabel(t)].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, search, filter])

  const filterLabel = filter === 'pending' ? 'Pending' : filter === 'approved' ? 'Approved' : filter === 'rejected' ? 'Rejected' : 'All'
  const filtersActive = search.trim() !== '' || filter !== 'all'

  const clearFilters = () => { setSearch(''); setFilter('all') }

  if (rows === null) return <div className="hero-card"><p>Loading cancellations…</p></div>

  return (
    <div>
      <div className="hero-card">
        <h2>🚫 Cancellations {summary.total > 0 && `(${summary.total})`}</h2>
        <p>Customer cancellation requests. Approving takes the service page offline and cancels the order; rejecting leaves the order as it was. An approved cancellation can be restored, which puts the service page back online.</p>
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

      {approveReq && (
        <CancelOrderForm
          key={'approve-' + approveReq.id}
          title={`Approve cancellation — ${approveReq.tracking_code}?`}
          initialSystem={systemForOrderTable(approveReq.tracking?.order_table)}
          initialSlug={approveReq.tracking?.shop_slug || ''}
          showSlug={isGateableOrderTable(approveReq.tracking?.order_table)}
          submitLabel="Approve cancellation"
          noteLabel="Note (optional)"
          onSubmit={doApprove}
          onClose={() => setApproveReq(null)}
          submitting={updating}
        />
      )}

      {rejectReq && (
        <div className="form-card">
          <h3>Reject this cancellation request?</h3>
          <p>Reject the cancellation request for “{rejectReq.tracking_code} — {rejectReq.customer_name || rejectReq.customer_email || '—'}”?</p>
          <p className="hint">The order stays as it was — nothing is cancelled and the service page stays online.</p>
          <label>
            Note (optional)
            <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="Optional — kept with the request" rows={3} />
          </label>
          <div className="store-actions">
            <button type="button" className="btn-primary" onClick={doReject} disabled={updating}>Reject request</button>
            <button type="button" className="btn-soft" onClick={() => { setRejectReq(null); setRejectNote('') }}>Cancel</button>
          </div>
        </div>
      )}

      {restoreReq && (
        <div className="form-card">
          <h3>Restore this service?</h3>
          <p>Restore the service for “{restoreReq.tracking_code} — {restoreReq.customer_name || restoreReq.customer_email || '—'}”?</p>
          <p className="hint">The service page goes back online, and the order goes back to the status it had before the cancellation.</p>
          <div className="store-actions">
            <button type="button" className="btn-primary" onClick={doRestore} disabled={updating}>Restore service</button>
            <button type="button" className="btn-soft" onClick={() => setRestoreReq(null)}>Cancel</button>
          </div>
        </div>
      )}

      <p><b>{summary.total} request{summary.total === 1 ? '' : 's'}</b> · Pending {summary.pending} · Approved {summary.approved} · Rejected {summary.rejected}</p>

      <div className="form-card">
        <div className="row">
          <input placeholder="Search order #, name, email..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ position: 'relative' }}>
            <button type="button" className="btn-soft" onClick={() => setFilterOpen(o => !o)} aria-expanded={filterOpen}>☰ Filter: {filterLabel}</button>
            {filterOpen && (
              <div className="form-card" style={{ position: 'absolute', right: 0, zIndex: 5, minWidth: 220, marginTop: 6 }}>
                {[
                  { value: 'all', label: 'All' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'rejected', label: 'Rejected' },
                ].map(opt => (
                  <div key={opt.value}>
                    <button type="button" className="link-btn" onClick={() => { setFilter(opt.value); setFilterOpen(false) }}>{filter === opt.value ? '● ' : '○ '}{opt.label}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="store-actions">
          <button type="button" className="btn-soft" onClick={load}>↻ Refresh</button>
          {filtersActive && <button type="button" className="btn-soft" onClick={clearFilters}>Clear filters</button>}
        </div>
      </div>

      <p><b>{filtered.length} request{filtered.length === 1 ? '' : 's'}</b></p>
      {filtered.length === 0 && <p className="hint">{summary.total === 0 ? 'No cancellation requests yet.' : 'No requests match these filters.'}</p>}
      {filtered.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>Order #</th><th>Date</th><th>Plan</th><th>Customer</th><th>Email</th><th>Reason</th><th>Request</th><th>Order status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const t = r.tracking || {}
                return (
                  <Fragment key={r.id}>
                    <tr>
                      <td>{r.tracking_code || '—'}</td>
                      <td>{r.created_at ? fmtDate(r.created_at) : '—'}</td>
                      <td>{planLabel(r.tracking)}</td>
                      <td>{r.customer_name || t.customer_name || '—'}</td>
                      <td>{r.customer_email || t.customer_email || '—'}</td>
                      <td>{r.reason || '—'}{r.note ? <><br /><span className="hint">Note: {r.note}</span></> : null}</td>
                      <td>{cap(r.status)}</td>
                      <td>{t.status ? cap(t.status) : '—'}</td>
                      <td>
                        {r.status === 'pending' && (
                          <>
                            <button type="button" className="btn-mini" onClick={() => setApproveReq(r)} disabled={updating}>Approve</button>{' '}
                            <button type="button" className="btn-mini" onClick={() => { setRejectReq(r); setRejectNote('') }} disabled={updating}>Reject</button>
                          </>
                        )}
                        {r.status === 'approved' && t.status === 'cancelled' && (
                          <button type="button" className="btn-mini" onClick={() => setRestoreReq(r)} disabled={updating}>Restore</button>
                        )}
                      </td>
                    </tr>
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
