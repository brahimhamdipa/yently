import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Pass Recovery — /pass-recovery.
// A customer who forgot their page link, setup username/password or
// teacher/team password gets their access back here, after proving
// they own the email they ordered with. Two ways in, one My Access
// view:
//   (a) Email code: enter the order email, get a 6-digit code by
//       email (request_recovery_code RPC), enter it (verify_
//       recovery_code RPC) — 15 minutes, 5 tries, 3 codes an hour.
//   (b) Magic link: https://yently.com/pass-recovery?t=<token>,
//       from the "Your page is ready" email (verify_magic_token
//       RPC) — 30 days, skips the code step.
// Either way mints a 30-minute recovery session (kept in memory
// only, never on the device) and opens the My Access view: every
// system/school linked to that email, with its page link and its
// logins, plus a per-system change form. Writes go through
// update_shop_login, which updates ONLY u/p/epass — the All Passes
// rule. The RPCs may not exist yet (the SQL lands separately), so
// every call is wrapped: a missing function shows a plain error and
// never crashes the page.
//
// Security, on purpose: the page never says whether an email has
// orders, whether a code was wrong or expired, or whether a link
// was ever valid — the same generic message covers all of it.

const GREEN = '#059669'
const GOLD = '#f5a623'
const RED = '#dc2626'

const MISSING_RPC = /could not find the function/i

function rpcErrorMessage(err) {
  if (!err) return ''
  if (MISSING_RPC.test(String(err.message || ''))) {
    return 'Pass Recovery is not ready yet — please try again in a moment.'
  }
  return String(err.message || 'Something went wrong — please try again.')
}

export default function PassRecoveryPage({ go }) {
  const [step, setStep] = useState('email') // email | code | access
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [session, setSession] = useState(null)
  const [magicToken, setMagicToken] = useState('')
  const [magicExpires, setMagicExpires] = useState('')
  const [access, setAccess] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [forms, setForms] = useState({})
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})
  const magicTried = useRef(false)

  const openAccess = async (sess, magic, magicExp) => {
    setSession(sess)
    if (magic) setMagicToken(magic)
    if (magicExp) setMagicExpires(magicExp)
    const { data, error: rpcError } = await supabase.rpc('get_my_access', { p_session: sess })
    if (rpcError) throw rpcError
    setAccess(Array.isArray(data) ? data : [])
    setStep('access')
  }

  // Magic link (?t=...): verify it on arrival and skip the code step.
  // The token is cleared from the address bar once it has been used.
  useEffect(() => {
    if (magicTried.current) return
    magicTried.current = true
    const params = new URLSearchParams(window.location.search)
    const t = params.get('t')
    if (!t) return
    setBusy(true)
    setError('')
    supabase.rpc('verify_magic_token', { p_token: t }).then(async ({ data, error: rpcError }) => {
      window.history.replaceState(null, '', '/pass-recovery')
      if (rpcError) throw rpcError
      if (!data || !data.ok || !data.session_token) {
        setError('That link is not valid any more — ask for a code below, or ask Yently for a new link.')
        setBusy(false)
        return
      }
      try {
        await openAccess(data.session_token, data.magic_token || t, data.magic_expires_at || '')
      } catch (err) {
        setError(rpcErrorMessage(err))
      }
      setBusy(false)
    }).catch((err) => {
      setError(rpcErrorMessage(err))
      setBusy(false)
    })
  }, [])

  const requestCode = async (e) => {
    if (e) e.preventDefault()
    const addr = email.trim()
    if (!addr) { setError('Type the email you ordered with.'); return }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('request_recovery_code', { p_email: addr })
      if (rpcError) throw rpcError
      // Always the same message, whether or not the email has orders.
      setNotice('If that email has any Yently orders, a code is on its way — check your inbox (and spam). Codes expire in 15 minutes.')
      setStep('code')
    } catch (err) {
      setError(rpcErrorMessage(err))
    }
    setBusy(false)
  }

  const verifyCode = async (e) => {
    if (e) e.preventDefault()
    const digits = code.trim()
    if (!/^[0-9]{6}$/.test(digits)) { setError('Type the 6-digit code from the email.'); return }
    setBusy(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('verify_recovery_code', { p_email: email.trim(), p_code: digits })
      if (rpcError) throw rpcError
      if (!data || !data.ok || !data.session_token) {
        setError('That code did not work — check it and try again, or ask for a new one.')
        setBusy(false)
        return
      }
      await openAccess(data.session_token, data.magic_token || '', data.magic_expires_at || '')
    } catch (err) {
      setError(rpcErrorMessage(err))
    }
    setBusy(false)
  }

  const signOut = () => {
    setSession(null)
    setMagicToken('')
    setMagicExpires('')
    setAccess(null)
    setForms({})
    setSaved({})
    setCode('')
    setNotice('')
    setError('')
    setStep('email')
  }

  const saveLogin = async (row) => {
    const key = row.system_key + '|' + row.shop_slug
    const f = forms[key] || {}
    const nu = (f.u || '').trim()
    const np = f.p || ''
    const ne = f.epass || ''
    if (!nu && !np && !ne) return
    setSaving(prev => ({ ...prev, [key]: true }))
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('update_shop_login', {
        p_session: session,
        p_owner_type: row.system_key,
        p_owner_key: row.shop_slug,
        p_u: nu || null,
        p_p: np || null,
        p_epass: ne || null,
      })
      if (rpcError) throw rpcError
      if (!data || !data.ok) {
        setError(data?.error || 'Could not save — please try again.')
        setSaving(prev => ({ ...prev, [key]: false }))
        return
      }
      setAccess(prev => (prev || []).map(r => (
        r.system_key === row.system_key && r.shop_slug === row.shop_slug
          ? { ...r, setup_user: nu || r.setup_user, setup_pass: np || r.setup_pass, emp_pass: ne || r.emp_pass }
          : r
      )))
      setForms(prev => ({ ...prev, [key]: {} }))
      setSaved(prev => ({ ...prev, [key]: true }))
      setTimeout(() => setSaved(prev => ({ ...prev, [key]: false })), 5000)
    } catch (err) {
      setError(rpcErrorMessage(err))
    }
    setSaving(prev => ({ ...prev, [key]: false }))
  }

  const magicLink = magicToken ? `https://yently.com/pass-recovery?t=${magicToken}` : ''

  return (
    <div>
      <div className="hero-card">
        <h2>🔑 Pass Recovery</h2>
        <p>Forgot your page link, your setup username and password, or your teacher / team password? Enter the email you ordered with and we will send you a code — or open the “Manage my access” link from your “Your page is ready” email.</p>
      </div>

      {error && <div className="hero-card"><p style={{ color: RED }}>{error}</p></div>}

      {step === 'email' && (
        <div className="hero-card">
          <form onSubmit={requestCode}>
            <label>Email you ordered with
              <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send me a code'}</button>
            </div>
          </form>
          <p className="hint">We only send a code when that email has Yently orders — but we always say the same thing either way, so nobody can use this page to check whether an email is a customer.</p>
        </div>
      )}

      {step === 'code' && (
        <div className="hero-card">
          {notice && <p>{notice}</p>}
          <form onSubmit={verifyCode}>
            <label>6-digit code
              <input type="text" inputMode="numeric" placeholder="123456" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))} autoComplete="one-time-code" />
            </label>
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Show my access'}</button>
              {' '}
              <button type="button" className="btn-soft" onClick={requestCode} disabled={busy}>Send a new code</button>
              {' '}
              <button type="button" className="btn-soft" onClick={() => { setStep('email'); setError(''); setNotice('') }}>Use a different email</button>
            </div>
          </form>
        </div>
      )}

      {step === 'access' && (
        <div>
          {magicLink && (
            <div className="hero-card" style={{ borderLeft: `4px solid ${GOLD}` }}>
              <p><b>Save this link</b> — it opens this page without a code for 30 days{magicExpires ? ` (until ${new Date(magicExpires).toLocaleDateString()})` : ''}:</p>
              <p style={{ wordBreak: 'break-all' }}><a href={magicLink}>{magicLink}</a></p>
              <p className="hint">Keep it somewhere safe — anyone with this link can see and change your logins, the same as with a code.</p>
            </div>
          )}

          {access && access.length === 0 && (
            <div className="hero-card">
              <p>No Yently pages are linked to this email yet. If you think this is wrong, contact Yently — the link between your email and your page may not be set up yet.</p>
            </div>
          )}

          {(access || []).map(row => {
            const key = row.system_key + '|' + row.shop_slug
            const f = forms[key] || {}
            const isKids = String(row.system_key || '').startsWith('kids-')
            const teamLabel = isKids ? 'Teacher password' : 'Team password'
            const pageLink = row.clean_url || row.page_url
            return (
              <div className="hero-card" key={key}>
                <h3>{row.system_label} — {row.shop_name || row.shop_slug}</h3>
                <p>Your page: <a href={pageLink} target="_blank" rel="noreferrer">{pageLink}</a>{row.clean_url ? ' (your short link)' : ''}</p>
                <p>Setup username: <b>{row.setup_user}</b></p>
                <p>Setup password: <b>{row.setup_pass}</b></p>
                <p>{teamLabel}: <b>{row.emp_pass || '— none set, the page is open —'}</b></p>
                <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 12, paddingTop: 12 }}>
                  <p className="hint">Change your logins — leave a field blank to keep it as it is.</p>
                  <label>New setup username
                    <input placeholder={row.setup_user || ''} value={f.u || ''} onChange={e => setForms(prev => ({ ...prev, [key]: { ...f, u: e.target.value } }))} autoComplete="off" />
                  </label>
                  <label>New setup password
                    <input placeholder="Leave blank to keep" value={f.p || ''} onChange={e => setForms(prev => ({ ...prev, [key]: { ...f, p: e.target.value } }))} autoComplete="new-password" />
                  </label>
                  <label>New {teamLabel.toLowerCase()}
                    <input placeholder="Leave blank to keep" value={f.epass || ''} onChange={e => setForms(prev => ({ ...prev, [key]: { ...f, epass: e.target.value } }))} autoComplete="new-password" />
                  </label>
                  <div style={{ marginTop: 10 }}>
                    <button type="button" onClick={() => saveLogin(row)} disabled={saving[key] || (!((f.u || '').trim()) && !f.p && !f.epass)}>{saving[key] ? 'Saving…' : 'Save new logins'}</button>
                    {saved[key] && <span style={{ color: GREEN, marginLeft: 10 }}>✓ Saved — use the new logins from now on.</span>}
                  </div>
                </div>
              </div>
            )
          })}

          <div className="hero-card">
            <button type="button" className="btn-soft" onClick={signOut}>Sign out</button>
            <span className="hint" style={{ marginLeft: 10 }}>Your access here lasts 30 minutes — after that, verify again.</span>
          </div>
        </div>
      )}

      <div className="hero-card">
        <button type="button" className="btn-soft" onClick={() => go && go('business-hub')}>← Back to Yently</button>
      </div>
    </div>
  )
}
