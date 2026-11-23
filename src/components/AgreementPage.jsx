import { useState } from 'react'
import AgreementText from './AgreementText'
import { AGREEMENT_VERSION, signCustomerAgreement } from '../lib/agreement'

// /agreement — the standalone Customer Agreement page. A customer
// who ordered before the checkout agreement box existed (or who was
// sent here from the welcome email) reads the agreement and signs
// it here: email + full name + "I agree" checkbox + typed
// signature. The signature is saved by sign_customer_agreement;
// nothing else is stored.
export default function AgreementPage({ go }) {
  const [email, setEmail] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('email') || '' } catch { return '' }
  })
  const [name, setName] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [signed, setSigned] = useState(false)

  const canSubmit = email.trim() && name.trim() && agreed && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true); setStatus('')
    try {
      const res = await signCustomerAgreement({
        email, customerName: name, signatureName: name, agreed,
        plan: null, orderCode: null, source: 'agreement-page',
      })
      if (!res || !res.ok) {
        setStatus('Could not save the signature: ' + (res?.error || 'please try again.'))
        setBusy(false)
        return
      }
      setSigned(true)
      setStatus('')
    } catch (err) {
      setStatus('Could not save the signature: ' + (err.message || 'please try again.'))
    }
    setBusy(false)
  }

  return (
    <div>
      <div className="hero-card">
        <h2>📄 Yently Customer Agreement</h2>
        <p>Read the agreement below, then sign it with your name. Your signature is saved with the date, so Yently has a record that you agreed.</p>
      </div>

      <div className="hero-card">
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, background: '#fff' }}>
          <AgreementText />
        </div>
      </div>

      {signed ? (
        <div className="hero-card">
          <h3>✓ Thank you, {name} — your signature is saved.</h3>
          <p>You agreed to the Yently Customer Agreement (version {AGREEMENT_VERSION}). A copy of the agreement is always at yently.com/agreement.</p>
          <button type="button" onClick={() => go && go('business-hub')}>← Back to Yently</button>
        </div>
      ) : (
        <form onSubmit={submit} className="form-card">
          <h3>Sign the agreement</h3>
          <label>Email you ordered with
            <input required type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>Your full name
            <input required placeholder="Full name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" />
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 4 }} />
            <span>I have read and agree to the Yently Customer Agreement (version {AGREEMENT_VERSION})</span>
          </label>
          <p className="hint">Your typed name above is your signature.</p>
          <button type="submit" disabled={!canSubmit}>{busy ? 'Saving…' : 'Sign the agreement'}</button>
          {status && <p className="status">{status}</p>}
        </form>
      )}

      <div className="hero-card">
        <button type="button" className="btn-soft" onClick={() => go && go('business-hub')}>← Back to Yently</button>
      </div>
    </div>
  )
}
