import { useState, useEffect, useRef } from 'react'
import { useBusinessCart, CLEAN_PLAN_KEY, CLEAN_PLAN_PRICE, CLEAN_GOLDEN_PLAN_KEY, CLEAN_GOLDEN_PLAN_PRICE, CLEAN_DOMAIN_PLAN_KEY, CLEAN_DOMAIN_PLAN_PRICE } from '../lib/BusinessCartContext'
import { ADDON_SYSTEM_OPTIONS } from '../lib/addonSystems'
import { saveCleanLinkMeta } from '../lib/cleanLinkData'
import { BusinessTopBar } from './BusinessMenu'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for the Clean Link add-on (reached from More ▾ →
// Business Systems → Add-ons → Clean Link, and from the hub).
// Four kinds of link, one page:
//   - Free Link: the standard link every system already comes with
//     (yently.com/pos?s=your-shop) — free, included, no button.
//   - Clean Link: yently.com/[name of your choice] — $5/month.
//   - Golden Link: [name of your choice].yently.com — $10/month.
//   - Your Own Domain: [name of your choice].com (or .us, .fr,
//     .app, .io, .us.com, …) — $20/month.
// All three paid types are FULLY WIRED (cart, checkout, deep links,
// admin) — but only Clean Link is orderable today: the Golden Link
// and Your Own Domain buttons are disabled with an "Available soon"
// note, and their options in the request form are disabled too.
// LAUNCH — to sell a type, flip its `available` below from false
// to true (one word): its section button, its form option and its
// badge all follow. Nothing else needs changing for that type.
// All paid types need the name to be available, first come first
// served. No card payment is taken here — the customer picks the
// system, page name and wanted names in the form below, adds the
// plan to the cart, and Yently checks the names and activates the
// link in Admin (Clean Link Orders) once they have ordered. There
// is no request form on this page and no contact fields: the order
// is placed through the cart, and checkout collects the customer's
// name, email and phone there. That is why the form below has only
// the system, page name, link type and wanted names — and why
// submitting it adds the selected type straight to the cart.
// The shop details travel with the order (see cleanLinkData.js)
// because the shared cart has no per-item slot for them. Nothing
// on this page promises instant setup. Golden Link and Your Own
// Domain are NOT switched on by the activate_clean_link RPC — the
// admin sets them up by hand.
const LINK_TYPES = [
  { id: 'clean', key: CLEAN_PLAN_KEY, name: 'Clean Link', price: CLEAN_PLAN_PRICE, available: true },
  { id: 'golden', key: CLEAN_GOLDEN_PLAN_KEY, name: 'Golden Link', price: CLEAN_GOLDEN_PLAN_PRICE, available: false },
  { id: 'domain', key: CLEAN_DOMAIN_PLAN_KEY, name: 'Your Own Domain', price: CLEAN_DOMAIN_PLAN_PRICE, available: false },
]

function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// A domain name keeps its dots: mybusiness.com, not mybusinesscom.
function normDomain(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9.-]+/g, '').replace(/^[.-]+|[.-]+$/g, '')
}

// The names the customer wants, one per line, in order of
// preference — normalised for the type, empties dropped, repeats
// removed (first occurrence wins).
function parseNames(text, typeId) {
  const norm = typeId === 'domain' ? normDomain : normSlug
  const seen = new Set()
  const out = []
  for (const line of String(text || '').split('\n')) {
    const n = norm(line.trim())
    if (n && !seen.has(n)) { seen.add(n); out.push(n) }
  }
  return out
}

// Tiny "?" help buttons beside each field, same as the Store Setup and
// Direct Upload pages: tap to open a short explanation under the field,
// tap again or anywhere else to close. The popups never show link
// patterns or code names — they say "the word Yently gave you".
const HELP = {
  system: 'Pick the kind of page your clean link is for. Restaurant is your restaurant page, POS is your till page, Barbershop your barber page, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym the same idea — Store is your own store page, Cars is selling cars, and Kids is one of the nine school subjects, pick the subject.',
  shopSlug: 'The word Yently gave you for your page — it is in the email with your page link. For Cars, type your seller username instead. Small letters only, no spaces — capitals and spaces are removed for you.',
  linkType: 'Which kind of link you want. Clean Link is yently.com/your-name, $5/month. Golden Link and Your Own Domain are coming soon — they cannot be picked yet.',
  names: 'The names you want, one per line, in the order you prefer them — your first choice first. Yently checks them in that order and comes back with the ones that are free. Small letters only, no spaces, and a name must not be one somebody else already has.',
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

// One Add to cart button per paid link type, same style in every
// section. `ready` already includes the type's `available` flag, so
// a type that has not launched yet renders greyed out with its
// "Available soon" note, and launching it is only flipping that
// flag — the button itself never changes.
function TypeAddButton({ type, ready, inCart, onAdd, go }) {
  return (
    <div style={{ textAlign: 'center' }}>
      {inCart ? (
        <div>
          <p>✓ In your cart.</p>
          <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
        </div>
      ) : (
        <div>
          <button onClick={onAdd} disabled={!ready} style={!ready ? { background: '#9ca3af', borderColor: '#9ca3af', cursor: 'not-allowed', opacity: 0.7 } : undefined}>Add to cart — ${type.price}/month</button>
          {!type.available && <p className="hint">Available soon — this button is switched off until {type.name} launches.</p>}
          {type.available && !ready && <p className="hint">Pick your system and type your page name and the names you want in the form above first.</p>}
        </div>
      )}
    </div>
  )
}

export default function CleanLinkPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const [form, setForm] = useState({ system: '', shop_slug: '', names: '', linkType: 'clean' })
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const selectedType = LINK_TYPES.find((t) => t.id === form.linkType) || LINK_TYPES[0]

  // One type is ready to add when it is launched (available), the
  // system + page name are filled in, and at least one wanted name
  // is typed. The button's `disabled` follows this one value, so
  // launching a type is only its `available` flag above.
  const typeReady = (typeId) => {
    const t = LINK_TYPES.find((x) => x.id === typeId) || LINK_TYPES[0]
    return Boolean(t.available && form.system && normSlug(form.shop_slug) && parseNames(form.names, typeId).length > 0)
  }
  const shopReady = typeReady(form.linkType)

  const handleAddType = (typeId) => {
    const t = LINK_TYPES.find((x) => x.id === typeId) || LINK_TYPES[0]
    const names = parseNames(form.names, typeId)
    if (!t.available || !form.system || !normSlug(form.shop_slug) || names.length === 0) return
    saveCleanLinkMeta({ system: form.system, shop_slug: normSlug(form.shop_slug), clean_slug: names[0], linkType: t.key })
    addPlan(t.key)
  }
  const handleAddToCart = () => handleAddType(form.linkType)

  // The form IS the order form: picking the system, page name and
  // wanted names and submitting adds the selected link type to the
  // cart (same handler as the Add button below). There is nothing
  // else to send — checkout collects the contact details and
  // writes the order row.
  const handleSubmit = (e) => {
    e.preventDefault()
    handleAddToCart()
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🔗 Your shop, at a clean address</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Your own clean link for $5/month — yently.com/your-name instead of a long link with a question mark in it.</p>
        <p>Short enough to print on a menu, a card, or a shop window — and easy for your customers to remember and type.</p>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit} style={{ border: '2px solid #f5c542' }}>
        <h3>Get your clean link</h3>
        <p>Pick your system and type your page name and the names you want — then add your link to your cart below. Yently checks the names and sets up the ones that are free once you have ordered.</p>
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
        <div className="row">
          <div className="field">
            <span className="field-label">Which link do you want? <Help text={HELP.linkType} /></span>
            <select required value={form.linkType} onChange={set('linkType')}>
              {LINK_TYPES.map((t) => (
                <option key={t.id} value={t.id} disabled={!t.available}>
                  {t.name} — ${t.price}/month{t.available ? '' : ' (Available soon)'}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <span className="field-label">The names you want, in order <Help text={HELP.names} /></span>
          <textarea className="big-message" placeholder={'One name per line, your first choice first — for example:\nmyrestaurant\nmy-restaurant\nmyrestaurantfood'} value={form.names} onChange={set('names')} />
        </div>
        <button type="submit" disabled={!shopReady}>Add to cart — ${selectedType.price}/month</button>
        {!shopReady && <p className="hint">Pick your system and type your page name and the names you want in the form above first.</p>}
        <p className="hint">Free for the rest of this month — the ${selectedType.price}/month starts with your next payment. First month free.</p>
      </form>

      <div className="hero-card" style={{ marginTop: 20 }}>
        <h3>🆓 Free Link — included with your system</h3>
        <p><b>yently.com/pos?s=your-shop</b> — the link your page already comes with. Every system Yently builds for you has one, and it is free: it comes with the system you already bought, and it already works. Share it anywhere — it opens your page straight away.</p>
        <p className="hint">A Free Link is the standard address for your page. The three links below are shorter, cleaner versions of it — easier to say, print and remember.</p>
      </div>

      <div className="hero-card">
        <h3>🔗 Clean Link — ${CLEAN_PLAN_PRICE}/month</h3>
        <p><b>yently.com/[name of your choice]</b> — your shop at a clean address, with nothing after the name. Easy to remember, easy to say on the phone, easy to print on a menu, a card or a shop window, and easy to type — no question mark, no code, nothing to mistype.</p>
        <p>First come, first served: the name you pick is yours alone once it is yours, and nobody else can take it. Your old link keeps working — the clean link is an extra address for the same shop, and nothing you already shared stops working.</p>
        <p className="hint">First month free, cancel anytime.</p>
        <TypeAddButton type={LINK_TYPES[0]} ready={typeReady('clean')} inCart={hasPlan(CLEAN_PLAN_KEY)} onAdd={() => handleAddType('clean')} go={go} />
      </div>

      <div className="hero-card">
        <h3>✨ Golden Link — ${CLEAN_GOLDEN_PLAN_PRICE}/month <span style={{ display: 'inline-block', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>Available soon</span></h3>
        <p><b>[name of your choice].yently.com</b> — your name first, unmistakably yours. The premium one: your customers see your name before anything else, and there is no mistaking whose page it is. A golden address for a business that wants to stand out.</p>
        <p>First come, first served, like Clean Link — the name you pick is yours alone once it is yours.</p>
        <TypeAddButton type={LINK_TYPES[1]} ready={typeReady('golden')} inCart={hasPlan(CLEAN_GOLDEN_PLAN_KEY)} onAdd={() => handleAddType('golden')} go={go} />
      </div>

      <div className="hero-card">
        <h3>🌐 Your Own Domain — ${CLEAN_DOMAIN_PLAN_PRICE}/month <span style={{ display: 'inline-block', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 10px', fontSize: 13, fontWeight: 700 }}>Available soon</span></h3>
        <p><b>[name of your choice].com</b> — or any other ending (.us, .fr, .app, .io, .us.com, …). Your own domain, fully yours: the address is your business name and nothing else, on the ending you choose.</p>
        <p>First come, first served — the domain you pick is yours alone once it is yours.</p>
        <TypeAddButton type={LINK_TYPES[2]} ready={typeReady('domain')} inCart={hasPlan(CLEAN_DOMAIN_PLAN_KEY)} onAdd={() => handleAddType('domain')} go={go} />
      </div>

      <div className="hero-card">
        <h3>How it works — availability</h3>
        <p>Every paid link needs its name to be free — that is how it works:</p>
        <ol className="steps">
          <li><b>Tell Yently the name — or names — you want</b>, in the order you prefer them. Send a list if you like: your first choice first, then the next ones.</li>
          <li><b>Yently checks availability</b> and gets back to you with a list of the links that are free — starting with your choices, if they are free. If they are not, Yently tries to find the closest free ones to what you asked for.</li>
          <li><b>You check the list and get back to Yently with your pick</b> — or another list of names, if nothing on it is right for you — and the process starts again, until you find one you are happy with.</li>
          <li><b>Yently sets it up</b> — your link is switched on for your shop, and your old link still works too.</li>
        </ol>
        <p className="hint">Golden Link and Your Own Domain will work the same way when they launch.</p>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>Clean Link — $5/month.</b> That's it — your clean link, for one shop. No setup fee, no charge per click. First month free, cancel anytime.</p>
        <p>Golden Link ($10/month) and Your Own Domain ($20/month) are coming soon — same first month free when they launch.</p>
        <p className="hint">Free for the rest of this month — the $5/month starts with your next payment.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Try a clean link</h3>
        <p>See one working — tap below to open the demo at its clean link.</p>
        <a href="/demo-chat" target="_blank" rel="noreferrer" style={{ display: 'inline-block', background: '#2563eb', color: '#fff', padding: '12px 22px', borderRadius: 10, fontWeight: 700, textDecoration: 'none' }}>Open yently.com/demo-chat</a>
      </div>


      <FloatingAddToCart planKey={selectedType.key} name={selectedType.name} price={selectedType.price} go={go} ready={shopReady} notReadyHint="Pick your system and type your page name and the names you want in the form above first." onAdd={handleAddToCart} />
    </div>
  )
}
