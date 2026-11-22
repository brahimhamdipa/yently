import { useState, useEffect, useRef } from 'react'
import { submitAndNotify } from '../lib/notify'
import { useBusinessCart, CHAT_PLAN_KEY, CHAT_PLAN_PRICE } from '../lib/BusinessCartContext'
import { ADDON_SYSTEM_OPTIONS, addonSystemLabel } from '../lib/addonSystems'
import { saveLiveChatMeta } from '../lib/liveChatData'
import { BusinessTopBar } from './BusinessMenu'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for Live Chat (reached from More ▾ → Business
// Systems → Add-ons → Live Chat, and from the demo's "Want this
// for your business?" button). One product only: a chat bubble on
// the customer's own website, so their visitors can tap it and
// message them — no account needed for the visitor, and every
// message reaches the owner by email. $3/month, first month free,
// no setup fee. No card payment is taken here — the request form
// emails the owner, who switches chat on for the customer's page
// in Admin, and the Add to cart
// card puts a live_chat_order row in front of the owner the same
// way (shared Business cart, BusinessCartContext +
// live_chat_order table, same pattern as the other Business Systems
// pages and the TV Gallery add-on). Once ordered, Yently switches
// chat on for the customer's page in Admin — then the customer
// answers their visitors from the Chats tab in their Setup page.
// Nothing on this page promises instant signup. Connecting carts
// to the bank comes later.
// The Add to cart button is disabled until the system and page name
// above it are filled in: Yently must know which page the chat is
// for before the order is placed. The system + page name travel
// with the order (see liveChatData.js) and with the request form.
function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// Tiny "?" help buttons beside each field, same as the Store Setup,
// Clean Link and Direct Upload pages: tap to open a short
// explanation under the field, tap again or anywhere else to close.
const HELP = {
  name: 'Your own name — the person asking for live chat. Yently uses it to know who the request is from.',
  business: 'The name of your store, restaurant, school or business — the name customers know you by.',
  email: 'Your email address — the one you actually read. Yently sends the answer here.',
  phone: 'Your phone number, so Yently can reach you quickly if something about your request needs a word.',
  system: 'Pick the kind of page the chat is for. Restaurant is your restaurant page, POS is your till page, Barbershop your barber page, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym the same idea — Store is your own store page, Cars is selling cars, and Kids is one of the nine school subjects, pick the subject.',
  shopSlug: 'The word Yently gave you for your page — it is in the email with your page link. For Cars, type your seller username instead. Small letters only, no spaces — capitals and spaces are removed for you.',
  message: 'Anything else that helps — you can leave it empty.',
}

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

export default function LiveChatPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const inCart = hasPlan(CHAT_PLAN_KEY)
  const [form, setForm] = useState({ name: '', business: '', email: '', phone: '', system: '', shop_slug: '', message: '' })
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const shopReady = Boolean(form.system && normSlug(form.shop_slug))

  const handleAddToCart = () => {
    if (!shopReady) return
    saveLiveChatMeta({ system: form.system, shop_slug: normSlug(form.shop_slug) })
    addPlan(CHAT_PLAN_KEY)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setStatus('Sending your request...')
    try {
      // The request carries the system + page name up front, so
      // Yently knows which page the chat is for without asking back.
      const where = `System: ${addonSystemLabel(form.system)}, Page: ${normSlug(form.shop_slug)}. `
      await submitAndNotify({
        table: 'car_inquiries',
        data: { car_id: null, car_name: 'Live Chat Request', name: form.name, email: form.email, phone: form.phone, message: where + (form.message || '') },
        subject: `Live Chat request — ${form.name}`,
        emailExtras: { business_name: form.business.trim() },
      })
      setStatus('✓ Sent! Thanks — Yently will be in touch to set up live chat for your website.')
      // Keep the system and page name filled, so the Add to cart
      // button stays usable — only the contact fields reset.
      setForm((f) => ({ ...f, name: '', business: '', email: '', phone: '', message: '' }))
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setBusy(false)
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>💬 Chat with your visitors, right on your website</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Your own live chat for $3/month — first month free. No setup fee.</p>
        <p>A chat bubble on your website — visitors tap it and message you, no account needed for them.</p>
      </div>

      <div className="hero-card">
        <h3>What you get</h3>
        <ul>
          <li><b>A chat bubble on your own website</b> — visitors tap it and message you, without creating an account.</li>
          <li><b>Every message reaches you by email</b> — nothing to install, nothing to watch all day.</li>
          <li><b>Your business name on it</b> — the chat opens with your name and greeting, so visitors know they're talking to you.</li>
          <li><b>Works on any website Yently builds for you</b> — restaurant, shop, barber, dealer, clinic, any of the Business Systems pages.</li>
          <li><b>One chat per business</b> — the chat on your page talks only to you, never to another business.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Tell Yently you want it</b> — fill in the form below, or simply Add to cart.</li>
          <li><b>Yently switches chat on for your page</b> in Admin once you've ordered — then you answer your visitors from the Chats tab in your Setup page.</li>
          <li><b>Visitors tap the bubble and message you</b> — every message reaches you by email.</li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>$3/month.</b> That's it — the chat bubble on your website, your business name on it, and every message to your email. No setup fee. First month free, cancel anytime.</p>
        <p className="hint">Send your request below and Yently will be in touch to set up live chat for your website.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Live chat page — ${CHAT_PLAN_PRICE}/month</h3>
        {inCart ? (
          <div>
            <p>✓ In your cart.</p>
            <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
          </div>
        ) : (
          <div>
            <button onClick={handleAddToCart} disabled={!shopReady}>Add to cart — ${CHAT_PLAN_PRICE}/month</button>
            {!shopReady && <p className="hint">Pick your system and type your page name in the form below first.</p>}
          </div>
        )}
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Try the live demo</h3>
        <p>See the chat working before you ask for one — a demo café page with the chat bubble, ready to tap.</p>
        <button type="button" onClick={() => go && go('demo-live-chat')}>Open the live demo</button>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit}>
        <h3>Get live chat</h3>
        <div className="row">
          <div className="field">
            <span className="field-label">Your name <Help text={HELP.name} /></span>
            <input required placeholder="Your name" value={form.name} onChange={set('name')} />
          </div>
          <div className="field">
            <span className="field-label">Business name (optional) <Help text={HELP.business} /></span>
            <input placeholder="Business name (optional)" value={form.business} onChange={set('business')} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <span className="field-label">Email <Help text={HELP.email} /></span>
            <input required placeholder="Email" type="email" value={form.email} onChange={set('email')} />
          </div>
          <div className="field">
            <span className="field-label">Phone <Help text={HELP.phone} /></span>
            <input required placeholder="Phone" value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <span className="field-label">Which system is your page on? <Help text={HELP.system} /></span>
            <select required value={form.system} onChange={set('system')}>
              <option value="">Which system is your page on?</option>
              {ADDON_SYSTEM_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Your page name on Yently <Help text={HELP.shopSlug} /></span>
            <input required placeholder="Your page name on Yently (e.g. your-shop)" value={form.shop_slug} onChange={set('shop_slug')} />
          </div>
        </div>
        <div className="field">
          <span className="field-label">Message (optional) <Help text={HELP.message} /></span>
          <textarea className="big-message" placeholder="Tell us about your website (optional) — anything that helps" value={form.message} onChange={set('message')} />
        </div>
        <button type="submit" disabled={busy}>Send request</button>
        {status && <p className="status">{status}</p>}
      </form>

      <FloatingAddToCart planKey={CHAT_PLAN_KEY} name="Live chat page" price={CHAT_PLAN_PRICE} go={go} ready={shopReady} notReadyHint="Pick your system and type your page name in the form above first." onAdd={handleAddToCart} />
    </div>
  )
}
