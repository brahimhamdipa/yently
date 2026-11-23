import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AGREEMENT_VERSION } from '../../lib/agreement'

// Admin → menu 6 → Customer Welcome.
//
// For a customer who has paid for a system: pick their shop, and the
// page composes the welcome email with everything they need — their
// page link (clean link when one is active, otherwise the standard
// link), their Setup username + password, their team / teacher
// password, the add-ons they bought, a "Manage my access" magic link
// (so they can change the username and passwords themself, instead
// of emailing passwords back and forth), and a link to sign the
// Customer Agreement.
//
// Sending, honestly: Yently's own sender is still Resend's test
// address (onboarding@resend.dev), which only delivers to the
// owner's own inbox until the Resend domain fix lands (planned
// Jan 3). So there is deliberately NO "send from Yently" button
// here — the page opens the email in the admin's own email app
// (mailto:) or copies it, which delivers from his own Gmail today.
// The email content is built in one place (buildEmail), so the same
// content can later go through the Edge Function directly once the
// Resend fix lands. The "Signed agreements" tab lists the
// customer_agreements rows (signed at checkout or on /agreement).
//
// The magic link is generated only when the admin taps the button:
// ensure_access_token REGENERATES the token on every issue, so
// generating a new one replaces any link already sent.

const SITE = 'https://yently.com'

// One row per shop system: the shop table, the order table, and how
// the standard page link is built (yently.com/<folder>?<param>=slug).
const SYSTEMS = [
  { key: 'diner', label: 'Restaurant', table: 'diner_restaurants', orderTable: 'restaurant_order', folder: 'diner', param: 'r', price: 40 },
  { key: 'barbers', label: 'Barbershop', table: 'barbershop_shops', orderTable: 'barbershop_order', folder: 'barbers', param: 's', price: 20 },
  { key: 'pos', label: 'POS', table: 'pos_stores', orderTable: 'pos_order', folder: 'pos', param: 's', price: 50 },
  { key: 'dealer', label: 'Dealer', table: 'dealer_shops', orderTable: 'dealer_order', folder: 'dealer', param: 'd', price: 20 },
  { key: 'employee', label: 'Employee', table: 'employee_shops', orderTable: 'employee_order', folder: 'employee', param: 'e', price: 20 },
  { key: 'bodyshop', label: 'Bodyshop', table: 'bodyshop_shops', orderTable: 'bodyshop_order', folder: 'bodyshop', param: 'b', price: 20 },
  { key: 'houses', label: 'Houses', table: 'houses_shops', orderTable: 'houses_order', folder: 'houses', param: 'h', price: 20 },
  { key: 'doctor', label: 'Doctor', table: 'doctor_shops', orderTable: 'doctor_order', folder: 'doctor', param: 'doc', price: 20 },
  { key: 'holiday', label: 'Holiday', table: 'holiday_shops', orderTable: 'holiday_order', folder: 'holiday', param: 'hol', price: 20 },
  { key: 'rentals', label: 'Car Rental', table: 'rentals_shops', orderTable: 'rentals_order', folder: 'rentals', param: 'c', price: 20 },
  { key: 'laundry', label: 'Laundry', table: 'laundry_shops', orderTable: 'laundry_order', folder: 'laundry', param: 'l', price: 20 },
  { key: 'gym', label: 'Gym', table: 'gym_shops', orderTable: 'gym_order', folder: 'gym', param: 's', price: 20 },
  { key: 'kids-math', label: 'Kids Math', table: 'kids_math_shops', orderTable: 'kids_math_order', folder: 'kids-math', param: 's', price: 5 },
  { key: 'kids-english', label: 'Kids English', table: 'kids_english_shops', orderTable: 'kids_english_order', folder: 'kids-english', param: 's', price: 5 },
  { key: 'kids-arabic', label: 'Kids Arabic', table: 'kids_arabic_shops', orderTable: 'kids_arabic_order', folder: 'kids-arabic', param: 's', price: 5 },
  { key: 'kids-french', label: 'Kids French', table: 'kids_french_shops', orderTable: 'kids_french_order', folder: 'kids-french', param: 's', price: 5 },
  { key: 'kids-spanish', label: 'Kids Spanish', table: 'kids_spanish_shops', orderTable: 'kids_spanish_order', folder: 'kids-spanish', param: 's', price: 5 },
  { key: 'kids-science', label: 'Kids Science', table: 'kids_science_shops', orderTable: 'kids_science_order', folder: 'kids-science', param: 's', price: 5 },
  { key: 'kids-geography', label: 'Kids Geography', table: 'kids_geography_shops', orderTable: 'kids_geography_order', folder: 'kids-geography', param: 's', price: 5 },
  { key: 'kids-coding', label: 'Kids Coding', table: 'kids_coding_shops', orderTable: 'kids_coding_order', folder: 'kids-coding', param: 's', price: 5 },
  { key: 'kids-reading', label: 'Kids Reading', table: 'kids_reading_shops', orderTable: 'kids_reading_order', folder: 'kids-reading', param: 's', price: 5 },
]

const ADDON_TABLES = [
  { table: 'clean_link_order', label: 'Clean Link' },
  { table: 'direct_upload_order', label: 'Direct Upload' },
  { table: 'live_chat_order', label: 'Live Chat' },
  { table: 'tv_gallery_order', label: 'TV Gallery' },
]

const isKids = (key) => String(key || '').startsWith('kids-')

function standardLink(sys, slug) {
  return `${SITE}/${sys.folder}?${sys.param}=${slug}`
}

function cleanLinkUrl(row) {
  return `${SITE}/${row.slug}`
}

// A dropdown with a text field that filters while typing — the plain
// <select> lists get unusable once there are many shops. Typing
// filters the options; tapping one picks it; the picked value shows
// as text; clearing the text (Shop only) clears the pick; Escape or
// an outside tap closes the list and shows the picked value again.
// The list reuses the .car-submenu dropdown style from the site menus.
function SearchablePick({ label, value, options, onPick, placeholder, allowClear }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const ref = useRef(null)
  const inputRef = useRef(null)
  const selected = options.find(o => o.value === value) || null
  const needle = text.trim().toLowerCase()
  const shown = needle ? options.filter(o => String(o.label || '').toLowerCase().includes(needle)) : options
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setText('') } }
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setText('') } }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])
  // The label text is a plain div, NOT a <label>: the option buttons
  // sit inside this picker, and a <label> re-focuses the input on
  // every tap, re-opening the list right after a pick. Blurring the
  // input on pick dismisses the keyboard and leaves the picked
  // value showing with the list closed.
  const pick = (v) => { onPick(v); setOpen(false); setText(''); inputRef.current?.blur() }
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div className="car-submenu-wrap" ref={ref} style={{ marginBottom: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            ref={inputRef}
            placeholder={placeholder}
            autoComplete="off"
            style={{ fontSize: 16, paddingRight: allowClear && selected && !open ? 30 : undefined }}
            value={open ? text : (selected ? selected.label : '')}
            onFocus={() => { setOpen(true); setText('') }}
            onChange={e => {
              const v = e.target.value
              setText(v)
              setOpen(true)
              if (allowClear && v === '') onPick('')
            }}
          />
          {allowClear && selected && !open && (
            <button type="button" aria-label="Clear picked shop" onClick={() => { onPick(''); setText(''); setOpen(true); inputRef.current?.focus() }} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px', color: '#6b7280' }}>×</button>
          )}
        </div>
        {open && (
          <div className="car-submenu" style={{ width: '100%', maxHeight: 260, overflowY: 'auto' }}>
            {shown.length === 0 && <p className="hint" style={{ padding: '12px 16px', margin: 0 }}>{options.length === 0 ? 'Nothing here yet' : 'No match — try another word'}</p>}
            {shown.map(o => (
              <button key={o.value} type="button" onClick={() => pick(o.value)}>{o.label}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AdminCustomerWelcome() {
  const [tab, setTab] = useState('welcome') // welcome | agreements
  const [systemKey, setSystemKey] = useState('dealer')
  const [shops, setShops] = useState([])
  const [shopSlug, setShopSlug] = useState('')
  const [shop, setShop] = useState(null)
  const [email, setEmail] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [orders, setOrders] = useState([])
  const [addons, setAddons] = useState([])
  const [cleanLinks, setCleanLinks] = useState([])
  const [loading, setLoading] = useState('')
  const [status, setStatus] = useState('')
  const [magicLink, setMagicLink] = useState('')
  const [magicState, setMagicState] = useState('') // '' | 'loading' | 'ready' | 'failed'
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [bodyEdited, setBodyEdited] = useState(false)
  const [copied, setCopied] = useState(false)
  const [agreements, setAgreements] = useState([])
  const [agreementsLoading, setAgreementsLoading] = useState(false)
  const [agreementsQuery, setAgreementsQuery] = useState('')
  const emailTimer = useRef(null)

  const sys = SYSTEMS.find(s => s.key === systemKey) || SYSTEMS[0]
  const teamLabel = isKids(sys.key) ? 'Teacher password' : 'Team password'
  const pageLink = shop ? (cleanLinks.length > 0 ? cleanLinkUrl(cleanLinks[0]) : standardLink(sys, shop.slug)) : ''
  const latestOrder = orders.length > 0 ? orders[0] : null
  const monthlyPrice = latestOrder && latestOrder.price != null ? Number(latestOrder.price) : sys.price

  // The composed email: subject + plain-text body. The HTML preview
  // below renders the same facts from the same data.
  const buildEmail = (o) => {
    const name = o.customerName || o.shop?.name || 'there'
    const lines = []
    lines.push(`Hi ${name},`)
    lines.push('')
    lines.push(`Your ${o.sys.label} page is ready — welcome to Yently!`)
    lines.push('')
    lines.push(`Your page: ${o.pageLink}`)
    if (o.cleanLinks.length > 0) {
      lines.push(`Your short link: ${cleanLinkUrl(o.cleanLinks[0])}`)
    }
    lines.push(`Setup username: ${o.shop?.u || '—'}`)
    lines.push(`Setup password: ${o.shop?.p || '—'}`)
    lines.push(`${o.teamLabel}: ${o.shop?.epass || 'none set — the page is open'}`)
    lines.push('')
    lines.push(`${o.sys.label} — $${o.monthlyPrice}/month${o.sys.key.startsWith('kids-') ? ' for the first 3 students (+$1/month per extra student)' : ''}. First month free where stated on yently.com.`)
    if (o.addons.length > 0) {
      lines.push('')
      lines.push('Your add-ons:')
      for (const a of o.addons) {
        lines.push(`- ${a.plan || a.label}${a.price != null ? ` — $${Number(a.price)}/month` : ''}`)
      }
    }
    lines.push('')
    lines.push('Manage your access — change your username and passwords yourself, any time:')
    lines.push(o.magicLink || '(Tap "Generate Manage my access link" above first, then rebuild this email.)')
    lines.push('')
    lines.push('Please read and sign the Yently Customer Agreement:')
    lines.push(`${SITE}/agreement`)
    lines.push('')
    lines.push('If you have any questions, just reply to this email.')
    lines.push('')
    lines.push('— Yently')
    lines.push('Everything you need, gently in one place.')
    return lines.join('\n')
  }

  const rebuildEmail = (o) => {
    setSubject(`Your Yently page is ready — ${o.shop?.name || o.shop?.slug || o.sys.label}`)
    setBody(buildEmail(o))
    setBodyEdited(false)
  }

  const snapshot = () => ({ sys, shop, customerName, pageLink, cleanLinks, addons, magicLink, teamLabel, monthlyPrice })

  // Shops for the picked system.
  useEffect(() => {
    let alive = true
    setShops([]); setShopSlug(''); setShop(null); setOrders([]); setAddons([]); setCleanLinks([])
    setEmail(''); setCustomerName(''); setMagicLink(''); setMagicState(''); setSubject(''); setBody('')
    setLoading('Loading shops…')
    supabase.from(sys.table).select('id, slug, name, u, p, epass, note').order('name').then(({ data, error }) => {
      if (!alive) return
      setLoading('')
      if (error) { setStatus('Could not load shops: ' + error.message); return }
      setShops(Array.isArray(data) ? data : [])
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemKey])

  // The picked shop: its logins, its owner email, its clean links.
  useEffect(() => {
    if (!shopSlug) { setShop(null); return }
    const row = shops.find(s => s.slug === shopSlug) || null
    setShop(row)
    if (!row) return
    setLoading('Loading shop details…')
    Promise.all([
      supabase.from('shop_owner_emails').select('owner_email').eq('owner_type', sys.key).eq('owner_key', shopSlug).maybeSingle(),
      supabase.from('clean_links').select('id, slug, system, shop_slug').eq('system', sys.key).eq('shop_slug', shopSlug).order('slug'),
    ]).then(([em, cl]) => {
      setLoading('')
      const linked = em?.data?.owner_email || ''
      if (linked) setEmail(linked)
      setCleanLinks(Array.isArray(cl?.data) ? cl.data : [])
      if (em?.error && !String(em.error.message || '').includes('0 rows')) setStatus('Owner email lookup: ' + em.error.message)
      if (cl?.error) setStatus('Clean link lookup: ' + cl.error.message)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopSlug])

  // Orders for the customer email (debounced while typing): the
  // system's own orders + the four add-on order tables.
  useEffect(() => {
    if (emailTimer.current) clearTimeout(emailTimer.current)
    const addr = (email || '').trim()
    if (!addr || !addr.includes('@')) { setOrders([]); setAddons([]); return }
    emailTimer.current = setTimeout(() => {
      Promise.all([
        supabase.from(sys.orderTable).select('id, customer_name, customer_email, customer_phone, plan, price, note, created_at').eq('customer_email', addr).order('created_at', { ascending: false }).limit(5),
        ...ADDON_TABLES.map(a => supabase.from(a.table).select('id, customer_name, customer_email, plan, price, created_at').eq('customer_email', addr).order('created_at', { ascending: false }).limit(5)),
      ]).then(([main, ...rest]) => {
        const mainRows = Array.isArray(main?.data) ? main.data : []
        setOrders(mainRows)
        if (mainRows.length > 0 && mainRows[0].customer_name && !customerName) setCustomerName(mainRows[0].customer_name)
        const addonRows = []
        rest.forEach((r, i) => {
          for (const row of (Array.isArray(r?.data) ? r.data : [])) addonRows.push({ ...row, table: ADDON_TABLES[i].table, label: ADDON_TABLES[i].label })
        })
        addonRows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
        setAddons(addonRows)
      })
    }, 500)
    return () => { if (emailTimer.current) clearTimeout(emailTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, sys.orderTable])

  // Rebuild the draft when the facts change — unless the admin has
  // edited the draft by hand (a hand-edited draft is left alone).
  useEffect(() => {
    if (!shop || bodyEdited) return
    rebuildEmail(snapshot())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, orders, addons, cleanLinks, magicLink, customerName])

  const generateMagicLink = async () => {
    const addr = (email || '').trim()
    if (!addr) { setStatus('Type the customer email first — the link is made for that email.'); return }
    setMagicState('loading'); setStatus('')
    try {
      const { data, error } = await supabase.rpc('ensure_access_token', { p_email: addr })
      if (error || !data || !data.ok || !data.token) {
        setMagicState('failed')
        setStatus('Could not generate the link: ' + (error?.message || data?.error || 'please try again.'))
        return
      }
      setMagicLink(`${SITE}/pass-recovery?t=${data.token}`)
      setMagicState('ready')
    } catch (err) {
      setMagicState('failed')
      setStatus('Could not generate the link: ' + (err.message || 'please try again.'))
    }
  }

  const mailto = email
    ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : ''

  const copyEmail = async () => {
    const text = `To: ${email}\nSubject: ${subject}\n\n${body}`
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
    setTimeout(() => setCopied(false), 4000)
  }

  const loadAgreements = async () => {
    setAgreementsLoading(true)
    const { data, error } = await supabase.from('customer_agreements').select('id, customer_name, customer_email, signature_name, agreement_version, plan, order_code, source, created_at').order('created_at', { ascending: false }).limit(200)
    setAgreementsLoading(false)
    if (error) { setStatus('Could not load signed agreements: ' + error.message); return }
    setAgreements(Array.isArray(data) ? data : [])
  }

  useEffect(() => { if (tab === 'agreements') loadAgreements() }, [tab])

  const q = agreementsQuery.trim().toLowerCase()
  const shownAgreements = q
    ? agreements.filter(a => String(a.customer_email || '').toLowerCase().includes(q) || String(a.customer_name || '').toLowerCase().includes(q) || String(a.signature_name || '').toLowerCase().includes(q))
    : agreements

  return (
    <div>
      <div className="hero-card">
        <h2>👋 Customer Welcome</h2>
        <p>Welcome a paying customer: pick their shop and the page composes the welcome email with their page link, logins, add-ons, a link to change their passwords themself, and a link to sign the Customer Agreement.</p>
        <p className="hint">Sending today goes through your own email app (the buttons below) — Yently cannot send directly to customers yet. Direct sending from Yently arrives with the Resend domain fix (planned Jan 3). The email content is built in one place, so the same content can be sent directly once that fix lands.</p>
        <div className="trip-tabs">
          <button type="button" className={tab === 'welcome' ? 'active' : ''} onClick={() => setTab('welcome')}>Welcome email</button>
          <button type="button" className={tab === 'agreements' ? 'active' : ''} onClick={() => setTab('agreements')}>Signed agreements</button>
        </div>
      </div>

      {status && <div className="hero-card"><p className="status">{status}</p></div>}

      {tab === 'welcome' && (
        <div>
          <div className="hero-card">
            <h3>1. Pick the shop</h3>
            <SearchablePick label="System" value={systemKey} options={SYSTEMS.map(s => ({ value: s.key, label: s.label }))} onPick={setSystemKey} placeholder="Type to filter systems…" allowClear={false} />
            <SearchablePick label="Shop" value={shopSlug} options={shops.map(s => ({ value: s.slug, label: `${s.name || s.slug} (${s.slug})` }))} onPick={setShopSlug} placeholder="Type to filter shops…" allowClear />
            {loading && <p className="hint">{loading}</p>}
            {shop && (
              <div style={{ marginTop: 10, fontSize: 14 }}>
                <p><b>{shop.name || shop.slug}</b> — page: <a href={pageLink} target="_blank" rel="noreferrer">{pageLink}</a>{cleanLinks.length > 0 ? ' (short link)' : ''}</p>
                <p>Setup username: <b>{shop.u || '—'}</b> · Setup password: <b>{shop.p || '—'}</b> · {teamLabel}: <b>{shop.epass || 'none set — the page is open'}</b></p>
                {cleanLinks.length > 0 && <p>Clean link{cleanLinks.length > 1 ? 's' : ''}: {cleanLinks.map(c => `${SITE}/${c.slug}`).join(', ')}</p>}
                {orders.length > 0 && <p>Orders found: {orders.map(o => `${o.plan || sys.label} — $${Number(o.price || 0)}/month`).join(' · ')}</p>}
                {addons.length > 0 && <p>Add-ons bought: {addons.map(a => `${a.plan || a.label}${a.price != null ? ` — $${Number(a.price)}/month` : ''}`).join(' · ')}</p>}
                {orders.length === 0 && addons.length === 0 && email.includes('@') && <p className="hint">No orders found for this email yet — the email still composes; check the email is the one they ordered with.</p>}
              </div>
            )}
          </div>

          {shop && (
            <div className="hero-card">
              <h3>2. Customer</h3>
              <label>Customer email
                <input type="email" placeholder="customer@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" />
              </label>
              <p className="hint">Prefilled from the shop's linked owner email when there is one — change it if the customer ordered with a different email. Orders are looked up by this email.</p>
              <label>Customer name
                <input placeholder="Full name" value={customerName} onChange={e => setCustomerName(e.target.value)} autoComplete="off" />
              </label>
              <div style={{ marginTop: 10 }}>
                <button type="button" onClick={generateMagicLink} disabled={magicState === 'loading'}>
                  {magicState === 'loading' ? 'Generating…' : magicLink ? 'Generate a new "Manage my access" link' : 'Generate "Manage my access" link'}
                </button>
                {magicState === 'ready' && magicLink && (
                  <p style={{ marginTop: 8, wordBreak: 'break-all' }}>Link: <a href={magicLink} target="_blank" rel="noreferrer">{magicLink}</a></p>
                )}
                {magicState === 'ready' && <p className="hint">This link opens My Access without a code for 30 days — the customer can change their username and passwords there. Generating a new link replaces the previous one.</p>}
              </div>
            </div>
          )}

          {shop && (
            <div className="hero-card">
              <h3>3. The welcome email</h3>
              <label>Subject
                <input value={subject} onChange={e => setSubject(e.target.value)} />
              </label>
              <label>Email text (edit anything before sending)
                <textarea rows={18} value={body} onChange={e => { setBody(e.target.value); setBodyEdited(true) }} style={{ fontSize: 14 }} />
              </label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                <button type="button" onClick={() => rebuildEmail(snapshot())}>Reset email to the composed version</button>
                <a className="btn-soft" href={mailto} style={{ textDecoration: 'none', display: 'inline-block', padding: '8px 14px' }}>✉️ Open in my email</a>
                <button type="button" className="btn-soft" onClick={copyEmail}>{copied ? '✓ Copied' : '📋 Copy email'}</button>
              </div>
              <p className="hint">“Open in my email” opens your own email app with the customer, subject and text filled in — send it from there. “Copy email” copies the same, so you can paste it anywhere.</p>

              <h3 style={{ marginTop: 20 }}>How it looks to the customer</h3>
              <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', maxWidth: 640 }}>
                <div style={{ background: '#161d44', color: '#fff', padding: '18px 20px' }}>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>Your Yently page is ready</div>
                  <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>{shop.name || shop.slug} — {sys.label}</div>
                </div>
                <div style={{ padding: '16px 20px', fontSize: 14, lineHeight: 1.6, background: '#fff' }}>
                  <p>Hi {customerName || shop.name || 'there'},</p>
                  <p>Your {sys.label} page is ready — welcome to Yently!</p>
                  <p>Your page: <a href={pageLink}>{pageLink}</a>{cleanLinks.length > 0 ? ' (your short link)' : ''}</p>
                  <div style={{ background: '#eef4ff', borderRadius: 6, padding: '10px 12px', margin: '10px 0' }}>
                    <div>Setup username: <b>{shop.u || '—'}</b></div>
                    <div>Setup password: <b>{shop.p || '—'}</b></div>
                    <div>{teamLabel}: <b>{shop.epass || 'none set — the page is open'}</b></div>
                  </div>
                  <p>{sys.label} — <b>${monthlyPrice}/month</b>. First month free where stated on yently.com.</p>
                  {addons.length > 0 && (
                    <div>
                      <p><b>Your add-ons:</b></p>
                      <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
                        {addons.map(a => (
                          <li key={a.table + ':' + a.id}>{a.plan || a.label}{a.price != null ? ` — $${Number(a.price)}/month` : ''}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {magicLink ? (
                    <p>Manage your access — change your username and passwords yourself, any time:<br /><a href={magicLink} style={{ wordBreak: 'break-all' }}>{magicLink}</a></p>
                  ) : (
                    <p className="hint">Manage your access link: generate it above and it appears here.</p>
                  )}
                  <p>Please read and sign the Yently Customer Agreement:<br /><a href={`${SITE}/agreement`}>{SITE}/agreement</a></p>
                  <p>If you have any questions, just reply to this email.</p>
                  <p>— Yently<br />Everything you need, gently in one place.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'agreements' && (
        <div className="hero-card">
          <h3>Signed agreements</h3>
          <p className="hint">Every signature saved at checkout or on yently.com/agreement — newest first. Agreement version {AGREEMENT_VERSION} is current.</p>
          <label>Search by email or name
            <input placeholder="customer@example.com" value={agreementsQuery} onChange={e => setAgreementsQuery(e.target.value)} autoComplete="off" />
          </label>
          <button type="button" className="btn-soft" onClick={loadAgreements} disabled={agreementsLoading} style={{ marginTop: 10 }}>{agreementsLoading ? 'Loading…' : 'Refresh'}</button>
          {shownAgreements.length === 0 && !agreementsLoading && <p className="hint" style={{ marginTop: 10 }}>No signed agreements found{agreementsQuery ? ' for this search' : ' yet'}.</p>}
          {shownAgreements.map(a => (
            <div key={a.id} style={{ borderTop: '1px solid #e5e7eb', padding: '10px 0', fontSize: 14 }}>
              <p style={{ margin: '0 0 4px' }}><b>{a.customer_name}</b> — {a.customer_email}</p>
              <p style={{ margin: '0 0 4px' }}>Signed as “{a.signature_name}” · version {a.agreement_version || '—'} · {a.source || '—'}{a.plan ? ` · ${a.plan}` : ''}{a.order_code ? ` · order ${a.order_code}` : ''}</p>
              <p className="hint" style={{ margin: 0 }}>{a.created_at ? new Date(a.created_at).toLocaleString() : ''}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
