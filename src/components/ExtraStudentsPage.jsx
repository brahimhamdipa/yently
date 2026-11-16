import { useEffect, useRef, useState } from 'react'
import {
  KIDS_BASE_PRICE,
  KIDS_INCLUDED_STUDENTS,
  KIDS_EXTRA_KID_PRICE,
  useBusinessCart,
} from '../lib/BusinessCartContext'
import { submitAndNotify } from '../lib/notify'
import { BusinessTopBar } from './BusinessMenu'

// Sales page for the Extra Students add-on (reached from the
// Business Systems hub → Add-ons → Extra Students, at
// /extra-students). For a school that already exists: the first 3
// students are included in the $5/month Kids price, and each extra
// student is +$1/month. No first month free on Kids. No payment is
// taken here — the form below inserts one row in that subject's
// kids_<subject>_order table (extra_kids = the number asked for,
// price = $1 x that number, plan = the subject's Kids plan key)
// and emails the owner, who then switches the extra places on for
// the school (Admin → All Passes → Kids → paid_extra_kids). It calls
// submitAndNotify directly — the same path the Kids checkout uses, so
// the row lands in front of the owner exactly like any other Kids
// order, with its own "Extra Students — <Subject>" subject. This page
// to the cart: the school already has its Kids plan, this only
// adds student places to it.
//
// TWO ways to ask, both kept on purpose. "Send request" submits
// straight away, exactly as before — the request lands in front of
// the owner at once, with no checkout and no other plans involved.
// "Add to cart" puts the same request (subject + school + number of
// places) in My Cart as an Extra Students line instead, so a
// customer ordering other plans at the same time sends everything in
// one checkout, with one name and email; the row and owner email it
// produces at checkout are the same shape as the direct request
// (see businessData.js). Neither path charges anything or switches
// the places on by itself — the admin still sets paid_extra_kids.
// The places are free for the rest of this month either way; the
// new monthly amount ($5 + $1 x places) starts with the next payment.
const SUBJECTS = [
  { label: 'Math', planKey: 'kids-math', extraPlanKey: 'kids-extra-math', table: 'kids_math_order' },
  { label: 'English', planKey: 'kids-english', extraPlanKey: 'kids-extra-english', table: 'kids_english_order' },
  { label: 'Arabic', planKey: 'kids-arabic', extraPlanKey: 'kids-extra-arabic', table: 'kids_arabic_order' },
  { label: 'French', planKey: 'kids-french', extraPlanKey: 'kids-extra-french', table: 'kids_french_order' },
  { label: 'Spanish', planKey: 'kids-spanish', extraPlanKey: 'kids-extra-spanish', table: 'kids_spanish_order' },
  { label: 'Science', planKey: 'kids-science', extraPlanKey: 'kids-extra-science', table: 'kids_science_order' },
  { label: 'Geography', planKey: 'kids-geography', extraPlanKey: 'kids-extra-geography', table: 'kids_geography_order' },
  { label: 'Coding', planKey: 'kids-coding', extraPlanKey: 'kids-extra-coding', table: 'kids_coding_order' },
  { label: 'Reading', planKey: 'kids-reading', extraPlanKey: 'kids-extra-reading', table: 'kids_reading_order' },
]

function normSlug(v) {
  return String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '').replace(/^-+|-+$/g, '')
}

// Plain explanations for every field — shown when the customer
// taps the "?" next to a label. Same pattern as the Direct Upload
// and Clean Link pages.
const HELP = {
  name: 'Your own name — the person asking for extra student places. Yently uses it to know who the request is from, and to address you in the reply. Type your first and last name.',
  email: 'Your email address — the one you actually read. Yently sends the answer here: once your extra places are switched on. Double-check the spelling — one wrong letter and the reply never reaches you.',
  phone: 'Your phone number, so Yently can reach you quickly if something about your request is unclear. Digits only is fine — spaces or dashes do no harm.',
  subject: 'Pick the subject your school is for — the same subject as your existing school page. Math, English, Arabic, French, Spanish, Science, Geography, Coding or Reading.',
  schoolSlug: 'The word Yently gave you for your school page — it is in the email with your school link. Small letters only, no spaces — capitals and spaces are removed for you. Yently uses it to know which school the extra places are for.',
  extraKids: 'How many extra students you want room for, beyond the first 3 that are already included. Each extra student is $1/month — so 2 extra students is $2/month on top of your $5/month.',
  message: 'Anything else that helps — you can leave it empty. For example the names of the new students, or when you need the places by.',
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

export default function ExtraStudentsPage({ go }) {
  const { addPlan } = useBusinessCart()
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', school_slug: '', extra_kids: '', message: '' })
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Prefill from ?subject= and ?slug= (e.g. a link shared with a
  // school: /extra-students?subject=kids-arabic&slug=hamdi).
  // ?subject= accepts the plan key (kids-arabic), the bare subject
  // (arabic) or the label (Arabic) — all three resolve to the same
  // subject. Nothing else is prefilled: name, email and phone stay
  // for the customer to type.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const qSubject = (params.get('subject') || '').trim()
    const qSlug = (params.get('slug') || '').trim()
    if (!qSubject && !qSlug) return
    setForm((f) => {
      const next = { ...f }
      if (qSubject) {
        const q = qSubject.toLowerCase()
        const hit = SUBJECTS.find((s) => s.planKey === q)
          || SUBJECTS.find((s) => s.label.toLowerCase() === q)
          || SUBJECTS.find((s) => s.planKey === 'kids-' + q)
        if (hit) next.subject = hit.planKey
      }
      if (qSlug) next.school_slug = normSlug(qSlug)
      return next
    })
  }, [])

  const extraKids = Math.max(0, parseInt(form.extra_kids, 10) || 0)
  const extraPrice = extraKids * KIDS_EXTRA_KID_PRICE

  // "Add to cart": the same request as "Send request", but as an
  // Extra Students cart line (subject + school + number of places)
  // instead of a direct submission — it goes in with the customer's
  // checkout, so one order can carry it alongside other plans.
  // Only subject, school and count are needed here; name, email and
  // phone are collected at checkout. If the line is already in the
  // cart, addPlan keeps the larger count and refreshes the slug.
  const handleAddToCart = () => {
    const subject = SUBJECTS.find((s) => s.planKey === form.subject)
    const slug = normSlug(form.school_slug)
    if (!subject || extraKids < 1 || !slug) {
      setStatus('To add extra places to your cart, pick a subject, type your school name on Yently, and ask for at least 1 extra student.')
      return
    }
    addPlan(subject.extraPlanKey, extraKids, slug)
    if (go) go('business-cart')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const subject = SUBJECTS.find((s) => s.planKey === form.subject)
    const slug = normSlug(form.school_slug)
    if (!subject || extraKids < 1 || !slug) {
      setStatus('Please pick a subject, type your school name on Yently, and ask for at least 1 extra student.')
      return
    }
    setBusy(true)
    setStatus('Sending your request...')
    try {
      // Same submitAndNotify path the Kids checkout uses (insert row +
      // owner email), but with this page's own subject so the owner can
      // tell an Extra Students request apart from a new Kids order.
      await submitAndNotify({
        table: subject.table,
        data: {
          customer_name: form.name,
          customer_email: form.email,
          customer_phone: form.phone,
          plan: subject.planKey,
          price: extraPrice,
          note: `Extra students for school "${slug}"${form.message ? ` — ${form.message}` : ''}`,
          extra_kids: extraKids,
        },
        subject: `Extra Students — ${subject.label} — ${form.name}`,
        emailExtras: {
          extra_kids: `Extra kids: ${extraKids}`,
          school_slug: slug,
        },
      })
      setStatus(`✓ Sent! Yently will switch on ${extraKids} extra student${extraKids === 1 ? '' : 's'} for your ${subject.label} school — $${extraPrice}/month on top of your $${KIDS_BASE_PRICE}/month.`)
      setForm({ name: '', email: '', phone: '', subject: '', school_slug: '', extra_kids: '', message: '' })
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setBusy(false)
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🧒 More room for more students</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Extra Students — $1/month per extra student, on top of your $5/month Kids price.</p>
        <p>Your first {KIDS_INCLUDED_STUDENTS} students are already included. When your class grows, add places here — Yently switches them on for your school.</p>
      </div>

      <form className="form-card wide direct-help" onSubmit={handleSubmit} style={{ border: '2px solid #f5c542' }}>
        <h3>Ask for extra student places</h3>
        <p>For a school you already have. Tell Yently which school and how many extra places you need.</p>
        <div className="row">
          <div className="field">
            <span className="field-label">Which subject is your school? <Help text={HELP.subject} /></span>
            <select required value={form.subject} onChange={set('subject')}>
              <option value="">Which subject is your school?</option>
              {SUBJECTS.map((s) => <option key={s.planKey} value={s.planKey}>{s.label}</option>)}
            </select>
          </div>
          <div className="field">
            <span className="field-label">Your school name on Yently <Help text={HELP.schoolSlug} /></span>
            <input required placeholder="The word Yently gave you for your school" value={form.school_slug} onChange={set('school_slug')} />
          </div>
        </div>
        <div className="row">
          <div className="field">
            <span className="field-label">How many extra students? <Help text={HELP.extraKids} /></span>
            <input required type="number" min="1" step="1" placeholder="e.g. 2" value={form.extra_kids} onChange={set('extra_kids')} />
            {extraKids > 0 && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {extraKids} extra student{extraKids === 1 ? '' : 's'} — ${extraPrice}/month extra, so ${KIDS_BASE_PRICE + extraPrice}/month in total. Your school will then have room for {KIDS_INCLUDED_STUDENTS + extraKids} students ({KIDS_INCLUDED_STUDENTS} included + {extraKids} extra).
              </p>
            )}
          </div>
        </div>
        <div className="row">
          <div className="field">
            <span className="field-label">Your name <Help text={HELP.name} /></span>
            <input required placeholder="Your name" value={form.name} onChange={set('name')} />
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
        <div className="field">
          <span className="field-label">Message (optional) <Help text={HELP.message} /></span>
          <textarea className="big-message" placeholder="Anything that helps (optional) — the new students' names, or when you need the places by" value={form.message} onChange={set('message')} />
        </div>
        <button type="submit" disabled={busy}>Send request</button>
        <button
          type="button"
          disabled={busy}
          onClick={handleAddToCart}
          style={{ background: '#2563eb', color: '#fff', marginLeft: 10 }}
        >
          Add to cart{extraKids > 0 ? ` — $${extraPrice}/month` : ''}
        </button>
        <p className="hint" style={{ margin: '8px 0 0' }}>
          Or add the extra places to your cart and check out with your other plans — the request goes in with your order, and the extra places are free for the rest of this month.
        </p>
        {status && <p className="status">{status}</p>}
      </form>

      <div className="hero-card">
        <h3>What you get</h3>
        <ul>
          <li><b>Room for every student</b> — your first {KIDS_INCLUDED_STUDENTS} students are included in the ${KIDS_BASE_PRICE}/month, and each extra place is just ${KIDS_EXTRA_KID_PRICE}/month.</li>
          <li><b>Nothing changes for the students you already have</b> — their scores, games and levels stay exactly as they are.</li>
          <li><b>New students join the same way</b> — once the places are switched on, add them in Setup like the others.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Ask above</b> — tell Yently your subject, your school, and how many extra places you need.</li>
          <li><b>Yently switches them on</b> — the extra places are added to your school.</li>
          <li><b>Add your new students in Setup</b> — they play and score like everyone else.</li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>${KIDS_BASE_PRICE}/month for your first {KIDS_INCLUDED_STUDENTS} students, +${KIDS_EXTRA_KID_PRICE}/month for each extra student.</b> No free month on Kids. Cancel free, any time.</p>
        <p className="hint">Send your request above and Yently will be in touch once your extra places are switched on.</p>
      </div>
    </div>
  )
}
