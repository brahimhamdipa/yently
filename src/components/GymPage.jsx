import { useState } from 'react'
import { submitAndNotify } from '../lib/notify'
import { useBusinessCart, GYM_PLAN_KEY, GYM_PLAN_PRICE } from '../lib/BusinessCartContext'
import { BusinessTopBar } from './BusinessMenu'
import DemoInterestPopup from './DemoInterestPopup'
import FloatingAddToCart from './FloatingAddToCart'

// Sales page for the gym website (reached from More ▾ →
// Business Systems → Gym). One product only: a gym's own
// page with membership plans, classes, trainers and member
// check-in, for $20/month. No card payment is taken here — the
// request form emails the owner, who then creates the gym's
// link and login by hand. Nothing on this page promises instant
// signup. Connecting carts to the bank comes later.
export default function GymPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const inCart = hasPlan(GYM_PLAN_KEY)
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', message: '' })
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [demoOpen, setDemoOpen] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setStatus('Sending your request...')
    try {
      await submitAndNotify({
        table: 'car_inquiries',
        data: { car_id: null, car_name: 'Gym Request', name: form.name, email: form.email, phone: form.phone, message: form.message },
        subject: `Gym request — ${form.name}`,
        emailExtras: { company_name: form.company.trim() },
      })
      setStatus('✓ Sent! Thanks — Yently will be in touch to set up your gym page.')
      setForm({ name: '', company: '', email: '', phone: '', message: '' })
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
    setBusy(false)
  }

  return (
    <div>
      <BusinessTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🏋️ Your gym, online</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Your own gym page for $20/month. No apps, no hardware, no commission.</p>
        <p>Members join online, book classes, and check in at the front desk — and you see every member and booking the moment it comes in.</p>
      </div>

      <div className="hero-card">
        <h3>What your gym gets</h3>
        <ul>
          <li><b>Your own gym page</b> — your gym's name, membership plans, classes, trainers, hours and address. You'll get your own private link by email.</li>
          <li><b>Membership plans + join form</b> — members pick a plan and join online; you confirm each membership before it goes active.</li>
          <li><b>Class schedule + bookings</b> — your classes with trainer, day and time, and how many spots are left. Members book a class online and pay at the gym.</li>
          <li><b>Member check-in</b> — members check in by name or member id at the front desk, and you see every check-in in the log.</li>
          <li><b>Trainers list</b> — your trainers and what they teach, right on the page.</li>
          <li><b>Two passwords</b> — your own login for Setup, where you change your page, and one shared password you give your staff for Members and Bookings.</li>
          <li><b>Pay at the gym</b> — nothing is charged online. Members pay when they join or when they come in.</li>
          <li><b>No commission, ever</b> — you keep everything you earn. No hardware to buy, no app for members to install.</li>
        </ul>
      </div>

      <div className="hero-card">
        <h3>How it works</h3>
        <ol className="steps">
          <li><b>Tell Yently you want it</b> — fill in the form below, or simply Add to cart.</li>
          <li><b>You get your link and login</b> — your gym's own username and password, plus the employee password for your staff.</li>
          <li><b>Add your plans, classes and trainers in Setup, and start taking members.</b></li>
        </ol>
      </div>

      <div className="hero-card">
        <h3>Simple, honest pricing</h3>
        <p><b>$20/month.</b> That's it — your gym page, your plans, your classes, your trainers, and your members. No setup fee, no commission on your memberships. First month free, cancel anytime.</p>
        <p className="hint">Send your request below and Yently will be in touch to set up your gym page.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Gym page — ${GYM_PLAN_PRICE}/month</h3>
        {inCart ? (
          <div>
            <p>✓ In your cart.</p>
            <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
          </div>
        ) : (
          <button onClick={() => addPlan(GYM_PLAN_KEY)}>Add to cart — ${GYM_PLAN_PRICE}/month</button>
        )}
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Try the demo gym page</h3>
        <p>See the gym page working before you ask for one — tap below and we'll send you the demo link.</p>
        <button type="button" onClick={() => setDemoOpen(true)}>Interested in a demo?</button>
      </div>

      {demoOpen && <DemoInterestPopup systemName="Gym page" onClose={() => setDemoOpen(false)} />}

      <form className="form-card wide" onSubmit={handleSubmit}>
        <h3>Get your gym online</h3>
        <div className="row">
          <input required placeholder="Your name" value={form.name} onChange={set('name')} />
          <input required placeholder="Gym name" value={form.company} onChange={set('company')} />
        </div>
        <div className="row">
          <input required placeholder="Email" type="email" value={form.email} onChange={set('email')} />
          <input required placeholder="Phone" value={form.phone} onChange={set('phone')} />
        </div>
        <textarea className="big-message" placeholder="Tell us about your gym (optional) — your classes, trainers, membership prices, anything that helps" value={form.message} onChange={set('message')} />
        <button type="submit" disabled={busy}>Send request</button>
        {status && <p className="status">{status}</p>}
      </form>
      <FloatingAddToCart planKey={GYM_PLAN_KEY} name="Gym page" price={GYM_PLAN_PRICE} go={go} />
    </div>
  )
}
