import { useEffect, useRef, useState } from 'react'
import { useBusinessCart, bundleFor, isKidsPlanKey, isKidsExtraPlanKey, KIDS_BASE_PRICE, KIDS_EXTRA_KID_PRICE, KIDS_INCLUDED_STUDENTS } from '../lib/BusinessCartContext'
import { placeBusinessOrder } from '../lib/businessData'
import { storeTrackingCodes } from '../lib/orderTracking'
import { BusinessTopBar } from './BusinessMenu'

// My Cart for all Business Systems pages — mirrors PosCartPage's
// shape (top bar, hero intro, empty state, cart lines, checkout block
// at the bottom) but for the whole shared cart: every website plan
// the customer added, each on its own line. Placing the order inserts
// one row per plan into that plan's own order table and emails the
// owner once per plan, then clears the cart; the confirmation
// survives via lastOrder, same as the old per-system carts. No
// payment is taken here — the owner follows up to set each page up.
// Connecting carts to the bank comes later.
const PLAN_HINTS = {
  'r:website': 'Your own ordering page + live kitchen, for your restaurant.',
  'p:website': 'Your own register page + live stock + receipts, for your store.',
  'bb:website': 'Your own booking page + live queue + stopwatch, for your barbershop.',
  'd:website': 'Your own dealer page + test drives + trade-ins, for your dealership.',
  'e:website': 'Your own time page + records, for your team.',
  'bs:website': 'Your own bodyshop page + estimates + jobs, for your shop.',
  'b:website': 'Your own simple website, for your business.',
  'tv:website': 'Your own TV gallery page + up to 7 pictures, for your screens.',
  'chat:website': 'Your own chat bubble + every message by email, for your website.',
  'clean:website': 'A short, clean link for your system — your own yently.com address.',
  'clean:golden': 'A golden link for your system — your own <name>.yently.com address.',
  'clean:domain': 'Your own domain for your system — your own <name>.com address.',
  'direct:website': 'Your uploads go live straight away — no waiting for approval.',
}

// The three Clean Link types, for the cart lines and the order
// confirmation: the address each type points at.
const CLEAN_LINK_KEYS = ['clean:website', 'clean:golden', 'clean:domain']
function cleanLinkAddress(key, cleanSlug) {
  const slug = String(cleanSlug || '')
  if (key === 'clean:golden') return slug + '.yently.com'
  if (key === 'clean:domain') return slug
  return 'yently.com/' + slug
}

export default function BusinessCartPage({ go }) {
  const { cart, count, removePlan, updateExtraKids, clearCart, lastOrder, setLastOrder } = useBusinessCart()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [status, setStatus] = useState('')

  const bundle = bundleFor(cart)
  const orderBundle = lastOrder ? bundleFor(lastOrder) : null
  const hasExtras = cart.some(i => isKidsExtraPlanKey(i.key))
  const hasCleanAddon = cart.some(i => CLEAN_LINK_KEYS.includes(i.key) && i.isAddon === true)
  const hasDirectAddon = cart.some(i => i.key === 'direct:website' && i.isAddon === true)

  // Save the placed order's tracking codes once, for the Tracking
  // page (/track) to auto-fill. The ref holds the signature of the
  // codes already stored, so this runs once per order, not on every
  // render — a later order has a different signature and stores again.
  const storedCodesRef = useRef('')
  useEffect(() => {
    if (!lastOrder || lastOrder.length === 0) return
    const codes = lastOrder.map(i => i.tracking_code).filter(Boolean)
    if (codes.length === 0) return
    const sig = codes.join('|')
    if (storedCodesRef.current === sig) return
    storedCodesRef.current = sig
    storeTrackingCodes(codes)
  }, [lastOrder])

  const placeOrder = async (e) => {
    e.preventDefault()
    setSubmitting(true); setStatus('')
    try {
      const items = await placeBusinessOrder({ name, email, phone, note, items: cart })
      if (items.length === 0) {
        // Every line was a 0-place Extra Students line (skipped at
        // checkout, see businessData.js): nothing was placed, so keep
        // the cart and say so instead of showing an empty cart.
        setStatus('Nothing was placed — your extra-students line has 0 places. Add students above, or remove the line.')
        setSubmitting(false)
        return
      }
      setLastOrder(items.map(i => ({ ...i, customer_name: name })))
      clearCart()
      setName(''); setEmail(''); setPhone(''); setNote('')
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setSubmitting(false)
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card">
        <h2>🛒 My Cart</h2>
        <p>Your Business Systems order. Place it below and Yently will be in touch to set up your pages.</p>
        <p className="hint">Bundle &amp; save: 2 systems 10% off, 3 systems 15% off, 4+ systems 20% off — applied automatically, no code needed.</p>
      </div>

      {count === 0 && (!lastOrder || lastOrder.length === 0) && (
        <div className="hero-card">
          <p>Your cart is empty.</p>
          <p className="hint">Tip: bundle 2 or more systems and save up to 20% — the discount applies automatically.</p>
          <button onClick={() => go && go('restaurants')}>Browse Business Systems</button>
        </div>
      )}

      {lastOrder && lastOrder.length > 0 && (
        <div className="hero-card">
          <h3>✓ Order placed — thank you, {lastOrder[0].customer_name}!</h3>
          {lastOrder.map(i => (
            <div key={i.key}>
              <p>{i.name} — ${Number(i.price).toFixed(2)}/month.
                {isKidsPlanKey(i.key) && Number(i.extraKids) > 0 && (
                  <> Includes {i.extraKids} extra student{Number(i.extraKids) === 1 ? '' : 's'} beyond the first {KIDS_INCLUDED_STUDENTS} (${KIDS_BASE_PRICE.toFixed(2)} base + ${Number(i.extraKids) * KIDS_EXTRA_KID_PRICE}.00).</>
                )}
                {isKidsPlanKey(i.key) && !i.extraKids && (
                  <> First {KIDS_INCLUDED_STUDENTS} students included.</>
                )}
                {isKidsExtraPlanKey(i.key) && Number(i.extraKids) > 0 && (
                  <> Includes {i.extraKids} extra student{Number(i.extraKids) === 1 ? '' : 's'}{i.schoolSlug ? <> for school “{i.schoolSlug}”</> : null} — free for the rest of this month; your new monthly amount is ${(KIDS_BASE_PRICE + Number(i.extraKids) * KIDS_EXTRA_KID_PRICE).toFixed(2)}/month from the next payment.</>
                )}
                {CLEAN_LINK_KEYS.includes(i.key) && i.isAddon && (
                  <> {i.name} add-on for “{i.cleanShopSlug}” — free for the rest of this month; your new monthly amount is ${Number(i.price).toFixed(2)}/month from the next payment. Your link will be {cleanLinkAddress(i.key, i.cleanSlug)}.</>
                )}
                {i.key === 'direct:website' && i.isAddon && (
                  <> Direct Upload add-on for “{i.directShopSlug}” — free for the rest of this month; your new monthly amount is $5.00/month from the next payment. Your uploads will go live right away.</>
                )}
              </p>
              {i.tracking_code && (
                <p>Your order number: <b>{i.tracking_code}</b>{' '}
                  <button type="button" className="btn-soft" onClick={() => go && go('track')}>Track your order</button>
                </p>
              )}
            </div>
          ))}
          {orderBundle && orderBundle.rate > 0 && (
            <p><b>Monthly total after bundle discount: ${orderBundle.total.toFixed(2)}/month</b> — you're saving ${orderBundle.savings.toFixed(2)}/month.</p>
          )}
          <p>Yently will be in touch to set up your pages.</p>
          <button onClick={() => go && go('restaurants')}>Back to Business Systems</button>
        </div>
      )}

      {count > 0 && (
        <div>
          {cart.map(i => (
            <div className="hero-card" key={i.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <b>{i.name}</b>
                  <div className="hint">{PLAN_HINTS[i.key] || ''}</div>
                  {isKidsPlanKey(i.key) && (
                    <div style={{ marginTop: 8 }}>
                      <div className="hint">${KIDS_BASE_PRICE.toFixed(2)}/month for the first {KIDS_INCLUDED_STUDENTS} students
                        {Number(i.extraKids) > 0 && <> + ${Number(i.extraKids) * KIDS_EXTRA_KID_PRICE}.00/month for {i.extraKids} extra student{Number(i.extraKids) === 1 ? '' : 's'}</>}
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{ fontSize: 14 }}>Extra students:</span>
                        <button type="button" onClick={() => updateExtraKids(i.key, (Number(i.extraKids) || 0) - 1)} disabled={(Number(i.extraKids) || 0) <= 0} aria-label="One fewer extra student" style={{ minWidth: 32, fontSize: 16, lineHeight: 1, padding: '4px 8px' }}>−</button>
                        <b>{Number(i.extraKids) || 0}</b>
                        <button type="button" onClick={() => updateExtraKids(i.key, (Number(i.extraKids) || 0) + 1)} aria-label="One more extra student" style={{ minWidth: 32, fontSize: 16, lineHeight: 1, padding: '4px 8px' }}>+</button>
                      </div>
                    </div>
                  )}
                  {isKidsExtraPlanKey(i.key) && (
                    <div style={{ marginTop: 8 }}>
                      <div className="hint">Base $0.00/month — this line only adds student places to a school you already have{i.schoolSlug ? <> (“{i.schoolSlug}”)</> : null}. $1.00/month per extra student, free for the rest of this month — your new monthly amount (${(KIDS_BASE_PRICE + Number(i.extraKids) * KIDS_EXTRA_KID_PRICE).toFixed(2)}/month) starts with the next payment.</div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                        <span style={{ fontSize: 14 }}>Extra students:</span>
                        <button type="button" onClick={() => updateExtraKids(i.key, (Number(i.extraKids) || 0) - 1)} disabled={(Number(i.extraKids) || 0) <= 0} aria-label="One fewer extra student" style={{ minWidth: 32, fontSize: 16, lineHeight: 1, padding: '4px 8px' }}>−</button>
                        <b>{Number(i.extraKids) || 0}</b>
                        <button type="button" onClick={() => updateExtraKids(i.key, (Number(i.extraKids) || 0) + 1)} aria-label="One more extra student" style={{ minWidth: 32, fontSize: 16, lineHeight: 1, padding: '4px 8px' }}>+</button>
                      </div>
                      {Number(i.extraKids) === 0 && (
                        <div className="hint" style={{ marginTop: 6 }}>0 extra students — this line will be skipped at checkout. Add students above, or remove the line.</div>
                      )}
                    </div>
                  )}
                  {CLEAN_LINK_KEYS.includes(i.key) && i.isAddon && (
                    <div style={{ marginTop: 8 }}>
                      <div className="hint">Add-on for your page “{i.cleanShopSlug}” — ${Number(i.price).toFixed(2)}/month from the next payment, free for the rest of this month. Your link will be {cleanLinkAddress(i.key, i.cleanSlug)}.</div>
                    </div>
                  )}
                  {i.key === 'direct:website' && i.isAddon && (
                    <div style={{ marginTop: 8 }}>
                      <div className="hint">Add-on for your page “{i.directShopSlug}” — $5.00/month from the next payment, free for the rest of this month. Your uploads will go live right away once Yently switches it on.</div>
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b>${Number(i.price).toFixed(2)}/month</b>
                  <div><button type="button" className="btn-mini" onClick={() => removePlan(i.key)}>Remove</button></div>
                </div>
              </div>
            </div>
          ))}

          <form onSubmit={placeOrder} className="form-card">
            <h3>Checkout</h3>
            <label>Your name
              <input required placeholder="Full name" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label>Email
              <input required placeholder="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            <label>Phone
              <input required placeholder="Phone" value={phone} onChange={e => setPhone(e.target.value)} />
            </label>
            <label>Note (optional)
              <textarea placeholder="Your business name, city, anything that helps us set up your pages — or a web address word you would prefer for your page, for example: my-shop" value={note} onChange={e => setNote(e.target.value)} />
              <span className="hint" style={{ fontWeight: 400 }}>If you have a preferred web address word for your page (for example: my-shop), list it here — we will use one if it is available, but we cannot guarantee it.</span>
            </label>
            <p>List total: ${bundle.listTotal.toFixed(2)}/month</p>
            {bundle.rate > 0 && (
              <p>Bundle discount ({Math.round(bundle.rate * 100)}% off): −${bundle.savings.toFixed(2)}/month</p>
            )}
            <p><b>Total: ${bundle.total.toFixed(2)}/month</b></p>
            {bundle.rate > 0 && (
              <p>You're saving ${bundle.savings.toFixed(2)}/month with the bundle.</p>
            )}
            {hasExtras && (
              <p className="hint">Extra student places are added in full — they don't count toward the bundle discount.</p>
            )}
            {hasCleanAddon && (
              <p className="hint">Clean Link add-ons are added in full — they don't count toward the bundle discount.</p>
            )}
            {hasDirectAddon && (
              <p className="hint">Direct Upload add-ons are added in full — they don't count toward the bundle discount.</p>
            )}
            <button type="submit" disabled={submitting}>{submitting ? 'Placing…' : 'Place order'}</button>
            {status && <p className="status">{status}</p>}
          </form>
        </div>
      )}
    </div>
  )
}
