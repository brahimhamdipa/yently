import { useEffect, useRef, useState } from 'react'
import { useBusinessCart, BRANDING_PLAN_KEY, BRANDING_PLAN_PRICE } from '../lib/BusinessCartContext'
import { BRANDING_SYSTEM_OPTIONS } from '../lib/addonSystems'
import { saveBrandingMeta } from '../lib/brandingData'
import { BusinessTopBar } from './BusinessMenu'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for the Remove Branding add-on (reached from More ▾ →
// Business Systems → Add-ons → Remove Branding, and from the hub).
// $5/month, first month free. Every system page carries two
// "Powered by YENTLY.com" banners — a thin one under the menu and a
// small one at the bottom — this add-on takes them off one page.
// The customer picks the system and page name in the
// form below, adds the plan to the cart (plan key
// 'branding:website'), and the admin flips the switch on by hand
// in Admin → Remove Branding → Switches once they pay. Works for
// the 21 folder-app systems ONLY — the 12 Business Systems plus
// the 9 Yently Kids subjects. Store sellers and Car sellers have
// no folder-app page and no banner to remove, so they are not in
// the dropdown, and the checkout insert refuses any other system
// outright (see brandingData.js). No payment is taken here.
// The Add to cart button is disabled until the system and page name
// above it are filled in: Yently must know which page the banners
// come off before the order is placed. The system + page name
// travel with the order (see brandingData.js).
// There is no request/approve step for Remove Branding, and no
// contact fields on this page: the order is placed through the
// cart, and checkout collects the customer's name, email and phone
// there. That is why the form below has only the two pickers — and
// why submitting it adds the plan straight to the cart.
// There is no demo section: the banners are already live on every
// demo page (open any demo shop and look under the menu and at the
// bottom), so there is nothing extra to show.
function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// Plain, detailed explanations for every field — shown when the
// customer taps the "?" next to a label, so nobody has to guess how
// to fill the form in. Same pattern as the Store Setup page.
const HELP = {
  system: 'Pick the kind of page the banner comes off. Restaurant is your restaurant page, POS is your till page, Barbershop your barber page, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym the same idea — and Kids Math, English, Arabic, French, Spanish, Science, Geography, Coding and Reading are the school pages. Store sellers and Car sellers are not listed here: their pages carry no banner.',
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

export default function BrandingPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const inCart = hasPlan(BRANDING_PLAN_KEY)
  const [form, setForm] = useState({ system: '', shop_slug: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const shopReady = Boolean(form.system && normSlug(form.shop_slug))

  const handleAddToCart = () => {
    if (!shopReady) return
    saveBrandingMeta({ system: form.system, shop_slug: normSlug(form.shop_slug) })
    addPlan(BRANDING_PLAN_KEY)
  }

  // The form IS the order form: picking the system and page name
  // and submitting adds Remove Branding to the cart (same handler as
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
        <h2 style={{ color: '#fff' }}>🏷️ Your page, nothing about Yently</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Remove Branding — take the "Powered by YENTLY.com" banners off your page, the one under your menu and the one at the bottom, so visitors see only you.</p>
        <p>$5/month. First month free, cancel anytime.</p>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit} style={{ border: '2px solid #f5c542' }}>
        <h3>Remove the banner from your page</h3>
        <p>Pick your system and type your page name — then add Remove Branding to your cart below. Yently switches it off for your page once you have ordered.</p>
        <div className="row">
          <div className="field">
            <span className="field-label">Which page is this for? <Help text={HELP.system} /></span>
            <select required value={form.system} onChange={set('system')}>
              <option value="">Which page is this for?</option>
              {BRANDING_SYSTEM_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Your page name on Yently <Help text={HELP.shopSlug} /></span>
            <input required placeholder="The word Yently gave you for your page" value={form.shop_slug} onChange={set('shop_slug')} />
          </div>
        </div>
        <button type="submit" disabled={!shopReady}>Add to cart — ${BRANDING_PLAN_PRICE}/month</button>
        {!shopReady && <p className="hint">Pick your system and type your page name above first.</p>}
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment. First month free.</p>
      </form>

      <div className="hero-card" style={{ marginTop: 20 }}>
        <h3>What you get</h3>
        <ul>
          <li><b>A page that is only yours</b> — no "Powered by YENTLY.com" banners, under your menu or at the bottom, no Yently logo, no link away from your page.</li>
          <li><b>Nothing else changes</b> — your page, your menu, your bookings and your orders all stay exactly as they are. Only the banners go.</li>
          <li><b>One add-on covers your whole page</b> — one Remove Branding, for everything on that page. A second page needs its own.</li>
          <li><b>See it before you buy it</b> — open any demo page, for example the Demo Restaurant, and look under the menu and at the bottom: the banners there are the ones this add-on removes.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Add it above</b> — tell Yently which page the banner comes off.</li>
          <li><b>Check out</b> — $5/month, first month free — and Yently switches the banner off for your page.</li>
          <li><b>That is it</b> — the next time anyone opens your page, the banners are gone. Cancel anytime and it comes back.</li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>$5/month.</b> That&apos;s it — Remove Branding, for one page. No setup fee. First month free, cancel anytime.</p>
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Remove Branding — ${BRANDING_PLAN_PRICE}/month</h3>
        {inCart ? (
          <div>
            <p>✓ In your cart.</p>
            <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
          </div>
        ) : (
          <div>
            <button onClick={handleAddToCart} disabled={!shopReady}>Add to cart — ${BRANDING_PLAN_PRICE}/month</button>
            {!shopReady && <p className="hint">Pick your system and type your page name in the form above first.</p>}
            <p className="hint">First month free — then $5/month, cancel anytime.</p>
          </div>
        )}
      </div>

      <FloatingAddToCart planKey={BRANDING_PLAN_KEY} name="Remove Branding" price={BRANDING_PLAN_PRICE} go={go} ready={shopReady} notReadyHint="Pick your system and type your page name above first." onAdd={handleAddToCart} />
    </div>
  )
}
