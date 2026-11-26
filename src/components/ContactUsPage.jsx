import { useState } from 'react'
import { submitCarInquiry } from './CarSection'

// ContactUsPage — the general Contact Us page (More menu, right after
// About Us). For feedback, website issues, any problem with Yently,
// concerns or questions — anything. Same 4-field form as the Cars /
// Shop / Flights contact pages (ContactPage.jsx), plus a topic
// dropdown. Submits through submitCarInquiry with the topic prepended
// to the message, so it lands in car_inquiries and emails
// brahimhamdipa@gmail.com like every other contact form. Tab-only
// (tab name 'contact-us'); no clean URL.

const TOPICS = ['Feedback', 'Website issue', 'Problem with Yently', 'Question', 'Something else']

export default function ContactUsPage() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: 'Feedback', message: '' })
  const [status, setStatus] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('Sending your message...')
    try {
      await submitCarInquiry({ carName: 'Contact Us (General)', name: form.name, email: form.email, phone: form.phone, message: `[${form.topic}] ${form.message}` })
      setStatus('✓ Sent! Thanks for reaching out — we read every message and will get back to you shortly.')
      setForm({ name: '', email: '', phone: '', topic: 'Feedback', message: '' })
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
  }

  return (
    <div>
      <div className="hero-card">
        <h2>Contact Us</h2>
        <p>We are listening — good or bad. Feedback, a problem with the website, something wrong with Yently, a concern, or just a question: tell us anything. Every message goes straight to a real person on our team, and we usually reply by email within 24 hours.</p>
      </div>
      <form className="form-card wide" onSubmit={handleSubmit}>
        <div className="row">
          <input required placeholder="Your name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input required placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <input placeholder="Phone (optional)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        <select required value={form.topic} onChange={e => setForm({ ...form, topic: e.target.value })} aria-label="What is this about?">
          {TOPICS.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <textarea required placeholder="Your message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
        <button type="submit">Send message</button>
        {status && <p className="status">{status}</p>}
      </form>
    </div>
  )
}
