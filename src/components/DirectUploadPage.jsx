import { useEffect, useRef, useState } from 'react'
import { useBusinessCart, DIRECT_PLAN_KEY, DIRECT_PLAN_PRICE } from '../lib/BusinessCartContext'
import { ADDON_SYSTEM_OPTIONS } from '../lib/addonSystems'
import { saveDirectUploadMeta } from '../lib/directUploadData'
import { BusinessTopBar } from './BusinessMenu'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for the Direct Upload add-on (reached from More ▾ →
// Business Systems → Add-ons → Direct Upload, and from the hub).
// $5/month, first month free. While it is switched on for their
// store, every upload they send (new items, new cars, changes to
// their page) goes live straight away, with no approval wait —
// and every upload is still logged for the admin, so nothing is
// lost track of. Works for every Business System, Store sellers,
// Car sellers and all Yently Kids subjects — the system list is
// the shared one (src/lib/addonSystems.js), so a new system
// appears here by itself. No card payment is taken here — the
// customer picks the system and page name in the form below, adds
// the plan to the cart (plan key 'direct:website'), and Yently
// switches it on for their page in Admin once they have ordered.
// There is no request form on this page and no contact fields:
// the order is placed through the cart, and checkout collects the
// customer's name, email and phone there. That is why the form
// below has only the two pickers — and why submitting it adds the
// plan straight to the cart. (The old request form and the admin
// Requests tab still exist for requests sent before this change —
// those still work and are still approved the same way.)
// The Add to cart button is disabled until the system and page name
// above it are filled in: Yently must know which page the switch
// is for before the order is placed. The system + page name travel
// with the order (see directUploadData.js).
// Nothing on this page explains how uploads are stored — only
// what happens when the customer sends them.
function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// Plain, detailed explanations for every field — shown when the
// customer taps the "?" next to a label, so nobody has to guess how
// to fill the form in. Same pattern as the Store Setup page.
const HELP = {
  system: 'Pick the kind of page Direct Upload is for. Restaurant is your restaurant page, POS is your till page, Barbershop your barber page, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym the same idea. Store is your own store page, where you sell your items. Cars is selling cars, and Kids is one of the nine school subjects — pick the subject.',
  shopSlug: 'The word Yently gave you for your page — it is in the email with your page link. For Cars, type your seller username instead. Small letters only, no spaces — capitals and spaces are removed for you.',
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

export default function DirectUploadPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const inCart = hasPlan(DIRECT_PLAN_KEY)
  const [form, setForm] = useState({ system: '', shop_slug: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const shopReady = Boolean(form.system && normSlug(form.shop_slug))

  const handleAddToCart = () => {
    if (!shopReady) return
    saveDirectUploadMeta({ system: form.system, shop_slug: normSlug(form.shop_slug) })
    addPlan(DIRECT_PLAN_KEY)
  }

  // The form IS the order form: picking the system and page name
  // and submitting adds Direct Upload to the cart (same handler as
  // the Add button below). There is nothing else to send — checkout
  // collects the contact details and writes the order row.
  const handleSubmit = (e) => {
    e.preventDefault()
    handleAddToCart()
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🚀 Your uploads, live straight away</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Direct Upload — skip the wait. Your new items, cars and page changes go live the moment you send them.</p>
        <p>$5/month. First month free, cancel anytime.</p>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit} style={{ border: '2px solid #f5c542' }}>
        <h3>Get Direct Upload for your page</h3>
        <p>Pick your system and type your page name — then add Direct Upload to your cart below. Yently switches it on for your page once you have ordered.</p>
        <div className="row">
          <div className="field">
            <span className="field-label">Which page is this for? <Help text={HELP.system} /></span>
            <select required value={form.system} onChange={set('system')}>
              <option value="">Which page is this for?</option>
              {ADDON_SYSTEM_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Your page name on Yently <Help text={HELP.shopSlug} /></span>
            <input required placeholder="The word Yently gave you for your page, or your seller username for Cars" value={form.shop_slug} onChange={set('shop_slug')} />
          </div>
        </div>
        <button type="submit" disabled={!shopReady}>Add to cart — ${DIRECT_PLAN_PRICE}/month</button>
        {!shopReady && <p className="hint">Pick your system and type your page name above first.</p>}
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment. First month free.</p>
      </form>

      <div className="hero-card" style={{ marginTop: 20 }}>
        <h3>What you get</h3>
        <ul>
          <li><b>Live the moment you send it</b> — your new items, cars and page changes go live straight away. No waiting for approval, no checking back.</li>
          <li><b>Works on your whole page</b> — items, cars, menu, words, scores — whatever you upload, it goes live the same way.</li>
          <li><b>Yently still sees everything</b> — every upload is logged for Yently, so nothing disappears and nothing is lost track of.</li>
          <li><b>You keep the normal way too</b> — turn it off any time and your uploads go back to approval first. Nothing is locked in.</li>
          <li><b>One add-on covers your whole store or school</b> — one Direct Upload, for everything on that page.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Add it above</b> — tell Yently which page it is for.</li>
          <li><b>Check out</b> — $5/month, first month free — and Yently switches Direct Upload on for your page.</li>
          <li><b>From then on your uploads go live straight away</b> — no waiting for approval.</li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>$5/month.</b> That's it — Direct Upload, for one store or school. No setup fee. First month free, cancel anytime.</p>
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Direct Upload — ${DIRECT_PLAN_PRICE}/month</h3>
        {inCart ? (
          <div>
            <p>✓ In your cart.</p>
            <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
          </div>
        ) : (
          <div>
            <button onClick={handleAddToCart} disabled={!shopReady}>Add to cart — ${DIRECT_PLAN_PRICE}/month</button>
            {!shopReady && <p className="hint">Pick your system and type your page name above first.</p>}
            <p className="hint">First month free — then $5/month, cancel anytime.</p>
          </div>
        )}
      </div>

      <FloatingAddToCart planKey={DIRECT_PLAN_KEY} name="Direct Upload" price={DIRECT_PLAN_PRICE} go={go} ready={shopReady} notReadyHint="Pick your system and type your page name above first." onAdd={handleAddToCart} />
    </div>
  )
}
