import { useState } from 'react'

// Shared reply-email modal (Admin menu 5 → All Requests and All
// Orders). Nothing is ever sent from this page: the modal shows an
// editable subject + body prefilled from a template, "Open in email
// app" is a mailto: link built from the edited draft (the owner
// sends from his own email), and Copy puts the draft on the
// clipboard.
//
// The row passed in carries: name, email, phone, source (plain
// words, shown in the header), summary and table (used by the
// source templates), plus planKey / planPrice / serviceLabel /
// isExtraStudents / extraKids (used by the two customer templates
// below). defaultTemplate is the template key the modal opens with.
// doneHint is an optional extra sentence in the footer (All
// Requests passes its "mark done" reminder; All Orders passes
// nothing).

const SITE = 'https://yently.com'

// Every plan that can be paid for through the shared Business cart:
// key → { label, tab, price, blurb, freeMonth }. Prices copied from
// BusinessCartContext (the single source of truth) — this module
// never sets a price, it only quotes it. freeMonth is stated only
// where the site says so: first month free on every business system
// (hub hero), Live Chat and Direct Upload (their ad pages); TV
// Gallery and Clean Link carry no free-month claim here; Kids has
// no free month at all.
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

// Which plan a row is about: the order's plan key when the caller
// set one, otherwise the request's template key when it is a plan
// key. Returns the PLANS entry (plus its key) or null.
const planInfo = (row) => {
  const key = row.planKey || (row.template && PLANS[row.template] ? row.template : null)
  if (!key || !PLANS[key]) return null
  return { key, ...PLANS[key] }
}

// The service name for the two customer templates below: the plan
// label where the row names a plan, the caller's serviceLabel
// otherwise, null when neither is known.
const serviceName = (row) => {
  const info = planInfo(row)
  if (info) return info.kids ? `Yently Kids ${info.kids}` : info.label
  return row.serviceLabel || null
}

// One template per reply situation. Each has: a short greeting, one
// line about the service + price, the pay link (source templates
// only), one closing line, and a sign-off as Yently. build() takes
// the row so the draft can name the service, the route, or the car
// the customer asked about.
const TEMPLATES = {}

// --- The two customer emails: listed first in the dropdown, since
// they are the ones the owner reaches for after a purchase. ---

TEMPLATES['thank-you'] = {
  label: 'Thank you for your purchase',
  build: (row) => {
    const info = planInfo(row)
    let service
    let priceLine = ''
    if (row.isExtraStudents && info) {
      // An Extra Students order: the purchase is the extra places,
      // not the subject itself.
      const n = Number(row.extraKids) || 0
      service = `Extra Students for your ${info.label} school`
      priceLine = `$${Number(row.planPrice) || info.price}/month for ${n} extra student place${n === 1 ? '' : 's'}`
    } else if (info) {
      service = info.kids ? `Yently Kids ${info.kids}` : info.label
      priceLine = info.kids
        ? '$5/month for the first 3 students, then $1/month for each extra student'
        : `$${info.price}/month${info.freeMonth ? ', first month free' : ''}`
    } else if (row.serviceLabel) {
      service = row.serviceLabel
      priceLine = row.planPrice ? `$${Number(row.planPrice)}/month` : ''
    } else {
      service = 'your Yently plan'
    }
    return {
      subject: 'Thank you for your purchase — Yently',
      body:
`Hi ${firstName(row.name)},

Thank you for your purchase — and for trusting Yently.

You bought ${service}${priceLine ? ` (${priceLine})` : ''}. We'll set it up for you and send your link and login by email once it's ready.

Any questions, just reply to this email.

— Yently`,
    }
  },
}

TEMPLATES.ready = {
  label: 'Your page is ready — login details',
  build: (row) => {
    const service = serviceName(row)
    return {
      subject: service ? `Your ${service} page is ready — Yently` : 'Your Yently page is ready',
      body:
`Hi ${firstName(row.name)},

Good news — your ${service || 'page'} is ready and live.

Here is everything you need to open it:

Website link: [PASTE THE LINK HERE]
Username: [PASTE THE USERNAME HERE]
Password: [PASTE THE PASSWORD HERE]
Employee password: [PASTE THE EMPLOYEE PASSWORD HERE — delete this line if the service has none]

How to start: open the link above and log in with the username and password.

Any questions, just reply to this email.

— Yently`,
    }
  },
}

// --- Source templates (moved unchanged from AdminAllRequests) ---

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

export { PLANS, TEMPLATES, payLinkFor, firstName, planInfo, serviceName }

export default function ReplyEmailModal({ row, defaultTemplate, doneHint, onClose }) {
  const startTemplate = TEMPLATES[defaultTemplate] ? defaultTemplate : 'generic'
  const initial = TEMPLATES[startTemplate].build(row)
  const [template, setTemplate] = useState(startTemplate)
  const [subject, setSubject] = useState(initial.subject)
  const [body, setBody] = useState(initial.body)
  const [copied, setCopied] = useState(false)

  const switchTemplate = (key) => {
    setTemplate(key)
    const draft = (TEMPLATES[key] || TEMPLATES.generic).build(row)
    setSubject(draft.subject)
    setBody(draft.body)
    setCopied(false)
  }

  const copyDraft = async () => {
    const text = `To: ${row.email || ''}\nSubject: ${subject}\n\n${body}`
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

  const mailto = row.email
    ? `mailto:${row.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : ''

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h3>Reply to {row.name || 'the customer'}</h3>
        <p className="hint">{row.source || row.label || ''}{row.source || row.label ? ' · ' : ''}{row.email || 'no email on file'}{row.phone ? ` · ${row.phone}` : ''}</p>
        <div className="modal-form">
          <label>Template
            <select value={template} onChange={e => switchTemplate(e.target.value)}>
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <option key={key} value={key}>{t.label}</option>
              ))}
            </select>
          </label>
          <p className="hint">Switching templates replaces the draft below with that template&apos;s wording. Edit anything before sending.</p>
          <label>Subject
            <input value={subject} onChange={e => setSubject(e.target.value)} />
          </label>
          <label>Message
            <textarea rows={12} value={body} onChange={e => setBody(e.target.value)} style={{ width: '100%' }} />
          </label>
          <div className="store-actions">
            {mailto ? (
              <a className="btn-primary" href={mailto} style={{ textDecoration: 'none', padding: '11px 18px', borderRadius: 10, background: '#2563eb', color: '#fff', fontWeight: 600, display: 'inline-block' }}>Open in email app</a>
            ) : (
              <button type="button" className="btn-primary" disabled>No email on file</button>
            )}
            <button type="button" className="btn-soft" onClick={copyDraft}>{copied ? '✓ Copied' : 'Copy'}</button>
            <button type="button" className="btn-soft" onClick={onClose}>Close</button>
          </div>
          <p className="hint">Nothing is sent from this page. “Open in email app” opens the draft in your own email app, and Copy puts the subject + message on your clipboard.{doneHint ? ` ${doneHint}` : ''}</p>
        </div>
      </div>
    </div>
  )
}
