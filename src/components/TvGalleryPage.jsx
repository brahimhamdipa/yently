import { useEffect, useRef, useState } from 'react'
import { useBusinessCart, TV_PLAN_KEY, TV_PLAN_PRICE } from '../lib/BusinessCartContext'
import { REPORTS_SYSTEM_OPTIONS } from '../lib/addonSystems'
import { saveTvGalleryMeta } from '../lib/tvGalleryData'
import { BusinessTopBar } from './BusinessMenu'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for the TV gallery (reached from More ▾ → Business
// Systems → Add-ons → TV Gallery, and from the hub). One product
// only: a fullscreen page for a TV that shows the customer's own
// pictures, with a rolling message at the bottom. Two display
// types, one price ($2/month for both): Slideshow plays the
// pictures one after the other; One picture holds a single picture
// on a TV — the customer opens the same link on each TV and picks
// which picture it shows, and each TV remembers its picture. Up
// to 7 pictures — one picture per TV, so seven TVs can each show
// a different picture. No card payment is taken here — the
// customer picks the system and page name in the form below, adds
// the plan to the cart (plan key 'tv:website'), and the customer
// uploads their own pictures from their Setup page, and the admin
// flips the switch on in Admin → TV Gallery → Switches once they
// have paid (same pattern as Reports). TV Gallery is for the 12
// Business Systems ONLY — never Yently Kids schools, Store
// sellers or Car sellers: the dropdown below lists only those 12,
// and the checkout insert refuses any other system outright (see
// tvGalleryData.js). There is no request form on this page and no
// contact fields: the order is placed through the cart, and
// checkout collects the customer's name, email and phone there.
// That is why the form below has only the two pickers — and why
// submitting it adds the plan straight to the cart.
// The Add to cart button is disabled until the system and page name
// above it are filled in: Yently must know which page the gallery
// is for before the order is placed. The system + page name travel
// with the order (see tvGalleryData.js).
// Nothing on this page promises instant signup. Connecting carts
// to the bank comes later.
function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// Plain, detailed explanations for every field — shown when the
// customer taps the "?" next to a label, so nobody has to guess how
// to fill the form in. Same pattern as the Store Setup page.
const HELP = {
  system: 'Pick the kind of page the TV gallery is for. Restaurant is your restaurant page, POS is your till page, Barbershop your barber page, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym the same idea. TV Gallery is only for these 12 Business Systems — Yently Kids schools, Store sellers and Car sellers are not listed here.',
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
      <button type="button" className="help-btn" aria-label="Help" onClick={() => setOpen((o) => !o)}>?</button>
      {open && <span className="help-pop">{text}</span>}
    </span>
  )
}

export default function TvGalleryPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const inCart = hasPlan(TV_PLAN_KEY)
  const [form, setForm] = useState({ system: '', shop_slug: '' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const shopReady = Boolean(form.system && normSlug(form.shop_slug))

  const handleAddToCart = () => {
    if (!shopReady) return
    saveTvGalleryMeta({ system: form.system, shop_slug: normSlug(form.shop_slug) })
    addPlan(TV_PLAN_KEY)
  }

  // The form IS the order form: picking the system and page name
  // and submitting adds TV Gallery to the cart (same handler as the
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
        <h2 style={{ color: '#fff' }}>📺 Your pictures, on the big screen</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Your own TV gallery for $2/month — slideshow and one-picture display both included. One picture per TV, up to seven.</p>
        <p>Turn any TV into your display — your pictures fullscreen, with your message rolling across the bottom.</p>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit} style={{ border: '2px solid #f5c542' }}>
        <h3>Get your TV gallery</h3>
        <p>Pick your system and type your page name — then add TV Gallery to your cart below. Once you have ordered, upload your own pictures from your Setup page — Yently switches the gallery on for your page.</p>
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
        <button type="submit" disabled={!shopReady}>Add to cart — ${TV_PLAN_PRICE}/month</button>
        {!shopReady && <p className="hint">Pick your system and type your page name above first.</p>}
        <p className="hint">Free for the rest of this month — the $2/month starts with your next payment. First month free.</p>
      </form>

      <div className="hero-card" style={{ marginTop: 20 }}>
        <h3>What you get</h3>
        <ul>
          <li><b>A fullscreen page for your TV</b> — your pictures fill the whole screen, with your message rolling across the bottom like the urgent messages on TV.</li>
          <li><b>Two ways to show them, both included</b> — Slideshow plays your pictures one after the other. One picture holds a single picture on a TV — open the same link on each TV and pick which picture it shows, and each TV remembers its picture.</li>
          <li><b>Up to 7 pictures</b> — one picture per TV, so seven TVs can each show a different picture.</li>
          <li><b>Change it anytime</b> — upload, replace, or delete pictures from your Setup page, and the TVs follow. No one has to touch the TV.</li>
          <li><b>Works in any TV browser</b> — no app to install, no stick to plug in. If the TV opens a website, it shows your gallery. Arrow keys on the remote move between pictures.</li>
          <li><b>Your own gallery link</b> — yently.com/tv-[your system]-[your page], shown on your Setup page once it is switched on. Only people you share it with can open your gallery.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Add it above</b> — tell Yently which page it is for.</li>
          <li><b>You get your gallery link</b> — shown on your Setup page, with the TV link for your screens.</li>
          <li><b>Upload up to 7 pictures from your Setup page, open the TV link on each TV, and pick slideshow or one picture per TV.</b></li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>$2/month.</b> That's it — your TV gallery, your pictures, and your message, with the slideshow and the one-picture display both included. No setup fee, no extra charge per TV or per display type. First month free, cancel anytime.</p>
        <p className="hint">Free for the rest of this month — the $2/month starts with your next payment.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>TV Gallery page — ${TV_PLAN_PRICE}/month</h3>
        {inCart ? (
          <div>
            <p>✓ In your cart.</p>
            <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
          </div>
        ) : (
          <div>
            <button onClick={handleAddToCart} disabled={!shopReady}>Add to cart — ${TV_PLAN_PRICE}/month</button>
            {!shopReady && <p className="hint">Pick your system and type your page name in the form above first.</p>}
            <p className="hint">First month free — then $2/month, cancel anytime.</p>
          </div>
        )}
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Try the demo gallery</h3>
        <p>See the TV gallery working — tap below to view the gallery.</p>
        <button type="button" onClick={() => go && go('provider-form', 'demo-tv-gallery')}>View the Gallery</button>
      </div>

      <FloatingAddToCart planKey={TV_PLAN_KEY} name="TV Gallery page" price={TV_PLAN_PRICE} go={go} ready={shopReady} notReadyHint="Pick your system and type your page name above first." onAdd={handleAddToCart} />
    </div>
  )
}
