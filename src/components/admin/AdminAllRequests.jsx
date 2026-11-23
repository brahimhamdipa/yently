import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchAll, fmtDate } from '../../lib/admin'
import { supabase } from '../../lib/supabaseClient'
import ReplyEmailModal, { PLANS } from './ReplyEmailModal'

// All Requests: every unpaid request / submission / question from a
// visitor, in one place — so the owner can see it, reply to it, and
// mark it done. Orders are NOT here: they already have Systems
// Orders, Shop Orders and All Orders (menu 5).
//
// INCLUDE AUDIT (checked by grepping the repo for every insert path):
//   - car_inquiries — every request form on the site writes here:
//     the "Get your ..." request form on each Business Systems ad
//     page (car_name '<System> Request'), the DemoInterestPopup
//     ('Demo Request — <system>'), Live Chat / TV Gallery / Direct
//     Upload add-on request forms, the Contact Us forms, NotifyMe
//     signups ('Notify me (<topic>)'), Books for Kids notify, the
//     Pay Flight form ('Pay Flight'), and plain car inquiries
//     (car_name = the car name). Columns: id, car_name, name, email,
//     phone, message, created_at.
//   - car_sell_requests — the Sell your car form. Columns: make,
//     model, year, mileage, condition, vin, name, email, phone,
//     message, created_at.
//   - flight_bookings — flight estimations and reservations from the
//     Flights form. Columns: trip_type, from_city, to_city,
//     depart_date, return_date, travelers, adults, children,
//     cabin_class, direct_only, name, email, phone, message,
//     created_at.
//
// EXCLUDED, on purpose:
//   - direct_upload_requests — it already has its own review queue
//     (menu 4 → Add-ons → Direct Upload) with an approve/deny RPC
//     that flips the customer's switch; replying from here would
//     bypass that switch.
//   - cancellation_requests, and car_inquiries rows with car_name
//     'Cancellation Request' — cancellations already have their own
//     queue (menu 5 → Cancellations) with approve / reject / restore
//     and the service-offline gating; the car_inquiries rows are the
//     email copy of the same request.
//   - Every *_order table + order_tracking — Systems Orders, Shop
//     Orders and All Orders (menu 5).
//   - Per-shop bookings: dealer test drives / trade-ins, doctor
//     appointments, holiday / car-rental / barbershop / gym
//     bookings, diner orders, POS sales — these live INSIDE each
//     shop's live_data JSON, written by RPCs (place_dealer_testdrive,
//     place_doctor_appointment, …). There is no separate readable
//     table for them in the repo, and no new SQL/RPC may be created
//     here, so they stay where the shop owner already sees them
//     (inside the shop app). houses_inquiries does not exist at all
//     in the repo — Houses requests come through car_inquiries
//     ('Houses Request') and houses_order.
//   - intake_submissions / barber_intake_submissions /
//     barber_reservations — website intake submissions, which have
//     their own approval queue (menu 4 → Websites).
//   - car_listings (menu 2, Cars approval), store_item_batches
//     (menu 1, Items Approval), chat_messages / chat_conversations
//     (menu 5, Live Chat), grocery_orders (Shop Orders), vault_*
//     (My Vault, personal, not customer requests).
//
// STATUS: none of the three tables has a status column, and no new
// SQL may be created here, so Done / New lives in this browser only
// (localStorage 'yently-requests-done-v1', keyed by table:id). It is
// a reminder for the owner, not a shared state.
//
// REPLY: nothing is ever sent from this page. Reply opens a modal
// with an editable subject + body prefilled from a template for the
// request's source; "Open in email app" is a mailto: link built from
// the edited draft (the owner sends from his own email), and Copy
// copies the draft to the clipboard.

// PLANS, the reply templates and the Reply modal live in the
// shared ReplyEmailModal.jsx (also used by All Orders) — this page
// only keeps PLAN_BY_SYSTEM_NAME + inquirySource below.

// Demo requests name the system after the dash: 'Demo Request — POS',
// 'Demo Request — Kids Math', … Map the system name to its plan key.
const PLAN_BY_SYSTEM_NAME = {
  Restaurant: 'r:website',
  POS: 'p:website',
  Barbershop: 'bb:website',
  Dealer: 'd:website',
  Employee: 'e:website',
  Bodyshop: 'bs:website',
  Houses: 'h:website',
  Doctor: 'dr:website',
  Holiday: 'hol:website',
  'Car Rental': 'cr:website',
  Laundry: 'la:website',
  Gym: 'gy:website',
  'Simple Website': 'b:website',
  'TV Gallery': 'tv:website',
  'Live Chat': 'chat:website',
  'Clean Link': 'clean:website',
  'Direct Upload': 'direct:website',
  'Kids Math': 'kids-math',
  'Kids English': 'kids-english',
  'Kids Arabic': 'kids-arabic',
  'Kids French': 'kids-french',
  'Kids Spanish': 'kids-spanish',
  'Kids Science': 'kids-science',
  'Kids Geography': 'kids-geography',
  'Kids Coding': 'kids-coding',
  'Kids Reading': 'kids-reading',
}

// car_inquiries rows carry their source in car_name. Returns the
// plain-words source label and the template key for the reply, or
// null to leave the row out (cancellations — see the header comment).
const inquirySource = (carName) => {
  const tag = (carName || '').trim()
  if (tag === 'Cancellation Request') return null
  if (tag === 'POS Request') return { source: 'POS — request form', template: 'p:website' }
  if (tag === 'Restaurant Request') return { source: 'Restaurant — request form', template: 'r:website' }
  if (tag === 'Barbershop Booking Request') return { source: 'Barbershop — booking request', template: 'bb:website' }
  if (tag === 'Live Chat Request') return { source: 'Live Chat add-on — request form', template: 'chat:website' }
  if (tag === 'TV Gallery Request') return { source: 'TV Gallery add-on — request form', template: 'tv:website' }
  if (tag === 'Services Request') return { source: 'Services — request form', template: 'generic' }
  if (tag === 'Books for Kids — Notify Me') return { source: 'Books for Kids — notify me', template: 'generic' }
  if (tag === 'Pay Flight') return { source: 'Pay Flight — ready to pay', template: 'flights' }
  const kids = tag.match(/^Kids (Math|English|Arabic|French|Spanish|Science|Geography|Coding|Reading) Request$/)
  if (kids) return { source: `Yently Kids ${kids[1]} — request form`, template: 'kids-' + kids[1].toLowerCase() }
  const sys = tag.match(/^([A-Za-z ]+) Request$/)
  if (sys && PLANS[PLAN_BY_SYSTEM_NAME[sys[1]]]) {
    const key = PLAN_BY_SYSTEM_NAME[sys[1]]
    return { source: `${PLANS[key].label} — request form`, template: key }
  }
  if (tag.startsWith('Demo Request — ')) {
    const name = tag.slice('Demo Request — '.length).trim()
    const key = PLAN_BY_SYSTEM_NAME[name]
    if (key) return { source: `Demo request — ${PLANS[key].label}`, template: key }
    return { source: `Demo request — ${name}`, template: 'generic' }
  }
  if (tag.startsWith('Notify me (')) {
    return { source: `Notify me — ${tag.slice('Notify me ('.length).replace(/\)$/, '')}`, template: 'generic' }
  }
  if (tag.startsWith('Contact Us (')) {
    const dept = tag.slice('Contact Us ('.length).replace(/\)$/, '')
    return { source: `Contact Us — ${dept}`, template: dept === 'Flights Department' ? 'flights' : 'generic' }
  }
  if (!tag) return { source: 'Cars — inquiry', template: 'generic' }
  return { source: `Cars — interested in ${tag}`, template: 'generic' }
}

const DONE_KEY = 'yently-requests-done-v1'

const loadDone = () => {
  try { return JSON.parse(localStorage.getItem(DONE_KEY)) || {} } catch { return {} }
}

const rowTime = (r) => {
  const t = r.created_at ? new Date(r.created_at).getTime() : NaN
  return Number.isNaN(t) ? -Infinity : t
}

const truncate = (s, n = 90) => {
  const t = (s || '').trim()
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

export default function AdminAllRequests() {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState([])
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all') // all | new | done
  const [sort, setSort] = useState('newest')
  const [status, setStatus] = useState('')
  const [expandedKey, setExpandedKey] = useState(null)
  const [doneMap, setDoneMap] = useState(loadDone)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [replyRow, setReplyRow] = useState(null)

  const load = async () => {
    setRows(null)
    setFailed([])
    setExpandedKey(null)
    setConfirmDelete(null)
    setReplyRow(null)
    const failedTables = []
    const grab = async (table) => {
      try { return await fetchAll(table) } catch { failedTables.push(table); return [] }
    }
    const [inquiries, sells, flights] = await Promise.all([
      grab('car_inquiries'),
      grab('car_sell_requests'),
      grab('flight_bookings'),
    ])
    const out = []
    for (const r of inquiries) {
      const src = inquirySource(r.car_name)
      if (!src) continue // cancellation copy — handled on the Cancellations page
      out.push({
        key: 'car_inquiries:' + r.id, table: 'car_inquiries', id: r.id,
        source: src.source, template: src.template,
        name: r.name, email: r.email, phone: r.phone,
        summary: truncate(r.message) || '—',
        message: r.message || '',
        details: [['Message', r.message || '—'], ['Form tag', r.car_name || '—']],
        created_at: r.created_at,
      })
    }
    for (const r of sells) {
      const summary = [r.year, r.make, r.model].filter(Boolean).join(' ') +
        (r.mileage ? ` · ${Number(r.mileage).toLocaleString()} miles` : '') +
        (r.condition ? ` · ${r.condition}` : '')
      out.push({
        key: 'car_sell_requests:' + r.id, table: 'car_sell_requests', id: r.id,
        source: 'Sell your car', template: 'sell-car',
        name: r.name, email: r.email, phone: r.phone,
        summary: summary || '—',
        message: r.message || '',
        details: [
          ['Car', summary || '—'], ['VIN', r.vin || '—'],
          ['Condition', r.condition || '—'], ['Message', r.message || '—'],
        ],
        created_at: r.created_at,
      })
    }
    for (const r of flights) {
      const route = `${r.from_city || '—'} → ${r.to_city || '—'}`
      const summary = `${r.trip_type || 'Flight'}: ${route}` +
        (r.depart_date ? ` · ${r.depart_date}` : '') +
        (r.return_date ? ` – ${r.return_date}` : '') +
        (r.travelers ? ` · ${r.travelers} traveler${r.travelers === 1 ? '' : 's'}` : '') +
        (r.cabin_class ? ` · ${r.cabin_class}` : '')
      out.push({
        key: 'flight_bookings:' + r.id, table: 'flight_bookings', id: r.id,
        source: 'Flights — booking / estimation', template: 'flights',
        name: r.name, email: r.email, phone: r.phone,
        summary,
        message: r.message || '',
        details: [
          ['Route', route],
          ['Trip', `${r.trip_type || '—'} · depart ${r.depart_date || '—'}${r.return_date ? ` · return ${r.return_date}` : ''}`],
          ['Travelers', `${r.travelers ?? '—'}${r.adults != null ? ` (adults ${r.adults}, children ${r.children ?? 0})` : ''}`],
          ['Cabin', r.cabin_class || '—'],
          ['Direct only', r.direct_only ? 'Yes' : 'No'],
          ['Message', r.message || '—'],
        ],
        created_at: r.created_at,
      })
    }
    setRows(out)
    setFailed(failedTables)
  }

  useEffect(() => { load() }, [])

  const markDone = (key, done) => {
    setDoneMap(prev => {
      const next = { ...prev }
      if (done) next[key] = true
      else delete next[key]
      try { localStorage.setItem(DONE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  // Delete removes the row forever (same direct owner delete the
  // Form Submissions page already uses for these tables). In-page
  // confirm only — never window.confirm.
  const doDelete = async () => {
    const r = confirmDelete
    if (!r) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { error } = await supabase.from(r.table).delete().eq('id', r.id)
      if (error) { setDeleteError('Cannot delete: ' + error.message); return }
      setStatus(`✓ Deleted the request from ${r.name || 'the customer'} (${r.source}).`)
      setConfirmDelete(null)
      await load()
    } catch (err) {
      setDeleteError('Cannot delete: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  const summary = useMemo(() => {
    const perSource = {}
    let done = 0
    for (const r of rows || []) {
      perSource[r.source] = (perSource[r.source] || 0) + 1
      if (doneMap[r.key]) done += 1
    }
    return { total: (rows || []).length, done, perSource }
  }, [rows, doneMap])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    const list = rows.filter(r => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false
      if (statusFilter === 'new' && doneMap[r.key]) return false
      if (statusFilter === 'done' && !doneMap[r.key]) return false
      if (!q) return true
      const hay = [r.source, r.name, r.email, r.phone, r.summary, r.message].join(' ').toLowerCase()
      return hay.includes(q)
    })
    if (sort === 'oldest') list.sort((a, b) => (rowTime(a) - rowTime(b)) || (a.id - b.id))
    else if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '') || (rowTime(b) - rowTime(a)))
    else if (sort === 'source') list.sort((a, b) => (a.source.localeCompare(b.source)) || (rowTime(b) - rowTime(a)))
    else list.sort((a, b) => (rowTime(b) - rowTime(a)) || (a.id - b.id)) // newest first (default)
    return list
  }, [rows, search, sourceFilter, statusFilter, sort, doneMap])

  if (rows === null) return <div className="hero-card"><p>Loading all requests…</p></div>

  return (
    <div>
      <div className="hero-card">
        <h2>✉️ All Requests {summary.total > 0 && `(${summary.total})`}</h2>
        <p>Every unpaid request, submission and question from a visitor — system request forms, demo requests, contact forms, notify-me signups, sell-your-car requests, and flight bookings / estimations — in one place. Orders are not here: they live under Systems Orders, Shop Orders and All Orders. View shows the full details, Reply opens an editable email draft (nothing is sent from this page — you send it from your own email), and Delete removes the request forever. “Done” is a reminder on this device only.</p>
      </div>

      {status && <p>{status}</p>}
      {failed.length > 0 && (
        <p className="hint">Could not load: {failed.join(', ')} — tap Refresh to try again.</p>
      )}

      {confirmDelete && (
        <div className="form-card">
          <h3>Delete this request?</h3>
          <p>Delete the {confirmDelete.source} request from “{confirmDelete.name || 'the customer'}” ({confirmDelete.email || 'no email'})?</p>
          <p className="hint">This removes the row forever. It cannot be undone.</p>
          <div className="store-actions">
            <button type="button" className="btn-primary" onClick={doDelete} disabled={deleting}>Delete request</button>
            <button type="button" className="btn-soft" onClick={() => { setConfirmDelete(null); setDeleteError('') }}>Cancel</button>
          </div>
          {deleteError && <p className="hint">{deleteError}</p>}
        </div>
      )}

      <div className="form-card">
        <div className="row">
          <input placeholder="Search source, name, email, phone, or message..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="Source">
            <option value="all">All sources ({summary.total})</option>
            {Object.keys(summary.perSource).sort().map(s => (
              <option key={s} value={s}>{s} ({summary.perSource[s]})</option>
            ))}
          </select>
        </div>
        <div className="row">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Status">
            <option value="all">All — new and done</option>
            <option value="new">New only ({summary.total - summary.done})</option>
            <option value="done">Done only ({summary.done})</option>
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">Customer A–Z</option>
            <option value="source">Source A–Z</option>
          </select>
        </div>
        <div className="store-actions">
          <button type="button" className="btn-soft" onClick={load}>↻ Refresh</button>
          {(search.trim() !== '' || sourceFilter !== 'all' || statusFilter !== 'all' || sort !== 'newest') && (
            <button type="button" className="btn-soft" onClick={() => { setSearch(''); setSourceFilter('all'); setStatusFilter('all'); setSort('newest') }}>Clear filters</button>
          )}
        </div>
      </div>

      <p><b>{filtered.length} request{filtered.length === 1 ? '' : 's'}</b> · {summary.total - summary.done} new · {summary.done} done</p>
      {filtered.length === 0 && <p className="hint">{summary.total === 0 ? 'No requests yet — nothing waiting for a reply.' : 'No requests match these filters.'}</p>}
      {filtered.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>Date</th><th>Source</th><th>Customer</th><th>Email</th><th>Phone</th><th>Summary</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const expanded = expandedKey === r.key
                const isDone = !!doneMap[r.key]
                return (
                  <Fragment key={r.key}>
                    <tr>
                      <td>{r.created_at ? fmtDate(r.created_at) : '—'}</td>
                      <td><b>{r.source}</b></td>
                      <td>{r.name || '—'}</td>
                      <td>{r.email ? <a href={'mailto:' + r.email}>{r.email}</a> : '—'}</td>
                      <td>{r.phone || '—'}</td>
                      <td>{r.summary}</td>
                      <td>{isDone ? '✓ Done' : 'New'}</td>
                      <td>
                        <button type="button" className="btn-mini" onClick={() => setExpandedKey(expanded ? null : r.key)}>{expanded ? 'Hide' : 'View'}</button>{' '}
                        <button type="button" className="btn-mini" onClick={() => setReplyRow(r)}>Reply</button>{' '}
                        <button type="button" className="btn-mini" onClick={() => { setConfirmDelete(r); setDeleteError('') }}>🗑 Delete</button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={8}>
                          <p><b>{r.source}</b> — {r.created_at ? fmtDate(r.created_at) : '—'} · {isDone ? '✓ Done' : 'New'}</p>
                          <p><b>Customer:</b> {r.name || '—'}{r.email ? ` · ${r.email}` : ''}{r.phone ? ` · ${r.phone}` : ''}</p>
                          {r.details.map(([label, value]) => (
                            <p key={label}><b>{label}:</b> {value}</p>
                          ))}
                          <div className="store-actions">
                            <button type="button" className="btn-mini" onClick={() => setReplyRow(r)}>Reply</button>{' '}
                            <button type="button" className="btn-mini" onClick={() => markDone(r.key, !isDone)}>
                              {isDone ? 'Mark as new' : '✓ Mark done'}
                            </button>
                          </div>
                          <p className="hint">Tap View again to close. Marking done is a reminder on this device only.</p>
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

      {replyRow && (
        <ReplyEmailModal
          row={replyRow}
          defaultTemplate={replyRow.template}
          doneHint="Mark the request done in View once you've sent it."
          onClose={() => setReplyRow(null)}
        />
      )}
    </div>
  )
}
