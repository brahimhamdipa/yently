import { useEffect, useRef, useState } from 'react'
import { useBusinessCart, REPORTS_PLAN_KEY, REPORTS_PLAN_PRICE } from '../lib/BusinessCartContext'
import { REPORTS_SYSTEM_OPTIONS } from '../lib/addonSystems'
import { saveReportsMeta } from '../lib/reportsData'
import { BusinessTopBar } from './BusinessMenu'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for the Reports add-on (reached from More ▾ →
// Business Systems → Add-ons → Reports, and from the hub).
// $5/month, first month free. Reports is a clear view of a shop's
// own orders and bookings: totals, counts by status, and the full
// list with date filters, in a popup on the shop's Setup page —
// once Yently switches it on for that shop. The customer picks the
// system and page name in the form below, adds the plan to the
// cart (plan key 'reports:website'), and the admin flips the
// switch on by hand in Admin → Reports → Switches once they pay.
// Works for the 12 Business Systems ONLY — never Yently Kids
// schools, Store sellers or Car sellers: the dropdown below lists
// only those 12, and the checkout insert refuses any other system
// outright (see reportsData.js). No payment is taken here.
// The Add to cart button is disabled until the system and page name
// above it are filled in: Yently must know which page the reports
// are for before the order is placed. The system + page name travel
// with the order (see reportsData.js).
// There is no request/approve step for Reports, and no contact
// fields on this page: the order is placed through the cart, and
// checkout collects the customer's name, email and phone there.
// That is why the form below has only the two pickers — and why
// submitting it adds the plan straight to the cart.
function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// Plain, detailed explanations for every field — shown when the
// customer taps the "?" next to a label, so nobody has to guess how
// to fill the form in. Same pattern as the Store Setup page.
const HELP = {
  system: 'Pick the kind of page Reports is for. Restaurant is your restaurant page, POS is your till page, Barbershop your barber page, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym the same idea. Reports is only for these 12 Business Systems — Yently Kids schools, Store sellers and Car sellers are not listed here.',
  shopSlug: 'The word Yently gave you for your page — it is in the email with your page link. Small letters only, no spaces — capitals and spaces are removed for you.',
}

// The "?" button next to a field label. Tap once to open the
// explanation under it, tap again — or tap anywhere else on the
// page — to close it. Only one help is open at a time: tapping
// another "?" closes this one first.
function Help({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  return (
    <span className="help" ref={ref}>
      <button type="button" className="help-btn" aria-label="Help" onClick={() => setOpen(o => !o)}>?</button>
      {open && <span className="help-pop">{text}</span>}
    </span>
  )
}

export default function ReportsPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const inCart = hasPlan(REPORTS_PLAN_KEY)
  const [form, setForm] = useState({ system: '', shop_slug: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const shopReady = Boolean(form.system && normSlug(form.shop_slug))

  const handleAddToCart = () => {
    if (!shopReady) return
    saveReportsMeta({ system: form.system, shop_slug: normSlug(form.shop_slug) })
    addPlan(REPORTS_PLAN_KEY)
  }

  // The form IS the order form: picking the system and page name
  // and submitting adds Reports to the cart (same handler as the
  // Add button below). There is nothing else to send — checkout
  // collects the contact details and writes the order row.
  const handleSubmit = (e) => {
    e.preventDefault()
    handleAddToCart()
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>📊 Your orders and bookings, in one clear view</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Reports — see how your page is doing: totals, counts, and every order and booking, with date filters. Print it or save it as a PDF.</p>
        <p>$5/month. First month free, cancel anytime.</p>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit} style={{ border: '2px solid #f5c542' }}>
        <h3>Get Reports for your page</h3>
        <p>Pick your system and type your page name — then add Reports to your cart below. Yently switches it on for your page once you have ordered.</p>
        <div className="row">
          <div className="field">
            <span className="field-label">Which page is this for? <Help text={HELP.system} /></span>
            <select required value={form.system} onChange={set('system')}>
              <option value="">Which page is this for?</option>
              {REPORTS_SYSTEM_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Your page name on Yently <Help text={HELP.shopSlug} /></span>
            <input required placeholder="The word Yently gave you for your page" value={form.shop_slug} onChange={set('shop_slug')} />
          </div>
        </div>
        <button type="submit" disabled={!shopReady}>Add to cart — ${REPORTS_PLAN_PRICE}/month</button>
        {!shopReady && <p className="hint">Pick your system and type your page name above first.</p>}
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment. First month free.</p>
      </form>

      <div className="hero-card">
        <h3>What you get</h3>
        <ul>
          <li><b>One clear view of your page</b> — totals, counts by status, and the full list of orders and bookings, in a popup on your Setup page.</li>
          <li><b>Date filters</b> — pick a from and to date and see just that stretch: a week, a month, the whole year so far.</li>
          <li><b>Print it or save it as a PDF</b> — the report prints cleanly, so you can keep it on file or hand it to someone.</li>
          <li><b>Made for your system</b> — a restaurant sees orders and what they sold, a barbershop sees bookings and takings, a bodyshop sees jobs, estimates and customers, a gym sees bookings, check-ins and members. Systems with no prices show counts only — never a made-up total.</li>
          <li><b>One add-on covers your whole page</b> — one Reports, for everything on that page.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Add it above</b> — tell Yently which page it is for.</li>
          <li><b>Check out</b> — $5/month, first month free — and Yently switches Reports on for your page.</li>
          <li><b>Open Setup and tap View Reports</b> — your orders and bookings are there, with date filters, print and PDF.</li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>$5/month.</b> That&apos;s it — Reports, for one page. No setup fee. First month free, cancel anytime.</p>
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Reports — ${REPORTS_PLAN_PRICE}/month</h3>
        {inCart ? (
          <div>
            <p>✓ In your cart.</p>
            <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
          </div>
        ) : (
          <div>
            <button onClick={handleAddToCart} disabled={!shopReady}>Add to cart — ${REPORTS_PLAN_PRICE}/month</button>
            {!shopReady && <p className="hint">Pick your system and type your page name in the form above first.</p>}
            <p className="hint">First month free — then $5/month, cancel anytime.</p>
          </div>
        )}
      </div>

      <FloatingAddToCart planKey={REPORTS_PLAN_KEY} name="Reports" price={REPORTS_PLAN_PRICE} go={go} ready={shopReady} notReadyHint="Pick your system and type your page name above first." onAdd={handleAddToCart} />
    </div>
  )
}
