import { Fragment, useEffect, useMemo, useState } from 'react'
import { fetchAll, fmtDate } from '../../lib/admin'
import { supabase } from '../../lib/supabaseClient'

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

const SITE = 'https://yently.com'

// Every plan that can be paid for through the shared Business cart:
// key → { label, tab, price, blurb, freeMonth }. Prices copied from
// BusinessCartContext (the single source of truth) — this page never
// sets a price, it only quotes it. freeMonth is stated only where
// the site says so: first month free on every business system (hub
// hero), Live Chat and Direct Upload (their ad pages); TV Gallery
// and Clean Link carry no free-month claim here; Kids has no free
// month at all.
const PLANS = {
  'r:website': { label: 'Restaurant', tab: 'restaurants', price: 40, blurb: 'a restaurant ordering page with a live kitchen', freeMonth: true },
  'p:website': { label: 'POS', tab: 'pos', price: 50, blurb: 'a point of sale page — your own register, with stock that updates itself and receipts kept', freeMonth: true },
  'bb:website': { label: 'Barbershop', tab: 'barbers', price: 15, blurb: 'a barbershop booking page with a live queue', freeMonth: true },
  'd:website': { label: 'Dealer', tab: 'dealer', price: 20, blurb: 'a dealer page with test drives and trade-ins', freeMonth: true },
  'e:website': { label: 'Employee', tab: 'employee', price: 20, blurb: 'an employee time page with records', freeMonth: true },
  'bs:website': { label: 'Bodyshop', tab: 'bodyshop', price: 20, blurb: 'a bodyshop page with estimates and jobs', freeMonth: true },
  'h:website': { label: 'Houses', tab: 'houses', price: 20, blurb: 'a houses page', freeMonth: true },
  'dr:website': { label: 'Doctor', tab: 'doctor', price: 20, blurb: 'a doctor booking page', freeMonth: true },
  'hol:website': { label: 'Holiday', tab: 'holiday', price: 20, blurb: 'a holiday rentals page', freeMonth: true },
  'cr:website': { label: 'Car Rental', tab: 'rentals', price: 20, blurb: 'a car rental page with bookings', freeMonth: true },
  'la:website': { label: 'Laundry', tab: 'laundry', price: 20, blurb: 'a laundry page', freeMonth: true },
  'gy:website': { label: 'Gym', tab: 'gym', price: 20, blurb: 'a gym page with members, classes and bookings', freeMonth: true },
  'b:website': { label: 'Simple Website', tab: 'simple-barbershop', price: 10, blurb: 'a simple website for your business', freeMonth: true },
  'tv:website': { label: 'TV Gallery', tab: 'tv-gallery', price: 2, blurb: 'a TV gallery page for your screens', freeMonth: false },
  'chat:website': { label: 'Live Chat', tab: 'live-chat', price: 3, blurb: 'a live chat bubble for your website', freeMonth: true },
  'clean:website': { label: 'Clean Link', tab: 'clean-link', price: 2, blurb: 'a short, clean yently.com link for your page', freeMonth: false },
  'direct:website': { label: 'Direct Upload', tab: 'direct-upload', price: 5, blurb: 'Direct Upload — your uploads go live straight away, no waiting for approval', freeMonth: true },
  'kids-math': { label: 'Kids Math', tab: 'kids-math', price: 5, kids: 'Math' },
  'kids-english': { label: 'Kids English', tab: 'kids-english', price: 5, kids: 'English' },
  'kids-arabic': { label: 'Kids Arabic', tab: 'kids-arabic', price: 5, kids: 'Arabic' },
  'kids-french': { label: 'Kids French', tab: 'kids-french', price: 5, kids: 'French' },
  'kids-spanish': { label: 'Kids Spanish', tab: 'kids-spanish', price: 5, kids: 'Spanish' },
  'kids-science': { label: 'Kids Science', tab: 'kids-science', price: 5, kids: 'Science' },
  'kids-geography': { label: 'Kids Geography', tab: 'kids-geography', price: 5, kids: 'Geography' },
  'kids-coding': { label: 'Kids Coding', tab: 'kids-coding', price: 5, kids: 'Coding' },
  'kids-reading': { label: 'Kids Reading', tab: 'kids-reading', price: 5, kids: 'Reading' },
}

// The pay link for a plan: a deep link that opens the ad page, adds
// the plan to the customer's cart and opens My Cart (see App.jsx —
// ?system=<tab>&add=<plan key>). Direct Upload is a real route, so
// its link is the page itself, matching AdminDirectUpload. Flights
// pay through the Pay Flight page (no money is taken on the page —
// the customer enters the agreed amount and we send the secure
// payment link). The generic template links to the Systems hub.
const payLinkFor = (key) => {
  if (key === 'direct:website') return `${SITE}/direct-upload`
  if (key === 'flights') return `${SITE}/?system=flight-pay`
  if (key === 'generic' || key === 'sell-car') return SITE + '/'
  const plan = PLANS[key]
  if (!plan) return SITE + '/'
  return `${SITE}/?system=${plan.tab}&add=${key}`
}

const firstName = (name) => (name || '').trim().split(/\s+/)[0] || 'there'

// One template per reply situation. Each has: a short greeting, one
// line about the service + price, the pay link, one closing line,
// and a sign-off as Yently. build() takes the row so the draft can
// name the service, the route, or the car the customer asked about.
const TEMPLATES = {}
for (const [key, plan] of Object.entries(PLANS)) {
  if (plan.kids) {
    TEMPLATES[key] = {
      label: `Yently Kids ${plan.kids} — $5/month`,
      build: (row) => ({
        subject: `Yently Kids ${plan.kids} — for your school`,
        body:
`Hi ${firstName(row.name)},

Thanks for asking about Yently Kids ${plan.kids} for your school. It's $5/month for the first 3 students, then $1/month for each extra student — no free month, and you can cancel anytime.

You can add it to your cart here: ${payLinkFor(key)} — when you check out, we'll set up your school and send your link and login by email. If you have more than 3 students, you can add the extra ones in your cart.

Any questions, just reply to this email.

— Yently`,
      }),
    }
  } else {
    TEMPLATES[key] = {
      label: `${plan.label} — $${plan.price}/month`,
      build: (row) => ({
        subject: plan.label === 'POS' ? 'Your point of sale — Yently' : `Your ${plan.label.toLowerCase()} page — Yently`,
        body:
`Hi ${firstName(row.name)},

Thanks for asking about ${plan.blurb}. It's $${plan.price}/month${plan.freeMonth ? ', first month free' : ''}.

You can add it to your cart here: ${payLinkFor(key)} — when you check out, we'll set up your page and send your link and login by email.

Any questions, just reply to this email.

— Yently`,
      }),
    }
  }
}
TEMPLATES.flights = {
  label: 'Flights — Pay Flight page',
  build: (row) => ({
    subject: 'Your flight — Yently',
    body:
`Hi ${firstName(row.name)},

Thanks for your flight request${row.summary && row.table === 'flight_bookings' ? ` — ${row.summary}` : ''}. When you're ready, open the Pay Flight page here: ${payLinkFor('flights')} and enter the exact amount we agreed. We'll send your secure payment link right away, and your confirmation and receipt follow by email once it's paid.

Any questions, just reply to this email.

— Yently`,
  }),
}
TEMPLATES.generic = {
  label: 'Generic — thanks + link to Yently',
  build: (row) => ({
    subject: 'Thanks for getting in touch — Yently',
    body:
`Hi ${firstName(row.name)},

Thanks for your message — we'll get back to you shortly.

You can see everything Yently offers here: ${SITE}/

Any questions, just reply to this email.

— Yently`,
  }),
}
TEMPLATES['sell-car'] = {
  label: 'Sell your car — no pay link',
  build: (row) => ({
    subject: 'Selling your car — Yently',
    body:
`Hi ${firstName(row.name)},

Thanks for telling us about your car${row.summary ? ` — ${row.summary}` : ''}. We'll look at the details you sent and be in touch shortly about the next step.

Any questions, just reply to this email.

— Yently`,
  }),
}

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
  const [replyTemplate, setReplyTemplate] = useState('generic')
  const [replySubject, setReplySubject] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [copied, setCopied] = useState(false)

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

  const openReply = (row) => {
    const draft = TEMPLATES[row.template].build(row)
    setReplyRow(row)
    setReplyTemplate(row.template)
    setReplySubject(draft.subject)
    setReplyBody(draft.body)
    setCopied(false)
  }

  const switchTemplate = (key) => {
    if (!replyRow) return
    setReplyTemplate(key)
    const draft = TEMPLATES[key].build(replyRow)
    setReplySubject(draft.subject)
    setReplyBody(draft.body)
    setCopied(false)
  }

  const copyDraft = async () => {
    const text = `To: ${replyRow.email || ''}\nSubject: ${replySubject}\n\n${replyBody}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopied(true) } catch { setCopied(false) }
      document.body.removeChild(ta)
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

  const mailto = replyRow && replyRow.email
    ? `mailto:${replyRow.email}?subject=${encodeURIComponent(replySubject)}&body=${encodeURIComponent(replyBody)}`
    : ''

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
        <div className="table-wrap">
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
                        <button type="button" className="btn-mini" onClick={() => openReply(r)}>Reply</button>{' '}
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
                            <button type="button" className="btn-mini" onClick={() => openReply(r)}>Reply</button>{' '}
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
        <div className="modal-overlay" onClick={() => setReplyRow(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <button className="modal-close" onClick={() => setReplyRow(null)} aria-label="Close">✕</button>
            <h3>Reply to {replyRow.name || 'the customer'}</h3>
            <p className="hint">{replyRow.source} · {replyRow.email || 'no email on file'}{replyRow.phone ? ` · ${replyRow.phone}` : ''}</p>
            <div className="modal-form">
              <label>Template
                <select value={replyTemplate} onChange={e => switchTemplate(e.target.value)}>
                  {Object.entries(TEMPLATES).map(([key, t]) => (
                    <option key={key} value={key}>{t.label}</option>
                  ))}
                </select>
              </label>
              <p className="hint">Switching templates replaces the draft below with that template&apos;s wording. Edit anything before sending.</p>
              <label>Subject
                <input value={replySubject} onChange={e => setReplySubject(e.target.value)} />
              </label>
              <label>Message
                <textarea rows={12} value={replyBody} onChange={e => setReplyBody(e.target.value)} style={{ width: '100%' }} />
              </label>
              <div className="store-actions">
                {mailto ? (
                  <a className="btn-primary" href={mailto} style={{ textDecoration: 'none', padding: '11px 18px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 600, display: 'inline-block' }}>Open in email app</a>
                ) : (
                  <button type="button" className="btn-primary" disabled>No email on file</button>
                )}
                <button type="button" className="btn-soft" onClick={copyDraft}>{copied ? '✓ Copied' : 'Copy'}</button>
                <button type="button" className="btn-soft" onClick={() => setReplyRow(null)}>Close</button>
              </div>
              <p className="hint">Nothing is sent from this page. “Open in email app” opens the draft in your own email app, and Copy puts the subject + message on your clipboard. Mark the request done in View once you&apos;ve sent it.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
