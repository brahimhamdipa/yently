import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

// Admin → menu 5 → Demo Passwords.
//
// Every demo shop / school on the site shares ONE login set: a setup
// username, a setup password, and an employee (business systems) /
// teacher (Yently Kids) password. All 21 demo rows — one per system,
// slug LIKE 'demo-%' — currently use demo / demo / demo, and the
// demo pages hand those values out to visitors trying the systems.
//
// This page changes that shared set in one place. Enter the three
// new values and tap submit: the demo_passwords_set RPC updates
// every demo row in all 21 tables in a single transaction, and
// nothing else is touched — no real (non-demo) shop or school, no
// other table, no Kids student PINs. The RPC itself checks the
// signed-in admin email, so only the admin account can run it.
//
// The current values are read live from the demo rows on every
// load and shown next to each field. If any demo row ever drifts
// away from the shared set, the page says "varies" and lists the
// differing rows (table + slug + which field differs) so the drift
// is visible before the next update puts them all back in line.

// The 21 shop / school tables. All share the same columns:
// slug, u (setup username), p (setup password), epass
// (employee / teacher password). Diner's demo slug is
// 'demo-restaurant' and rentals' is 'demo-rental' — the
// slug LIKE 'demo-%' filter covers every demo row without
// enumerating slugs, so no trap here.
const DEMO_TABLES = [
  { table: 'diner_restaurants', label: 'Diner' },
  { table: 'barbershop_shops', label: 'Barbers' },
  { table: 'pos_stores', label: 'POS' },
  { table: 'dealer_shops', label: 'Dealer' },
  { table: 'employee_shops', label: 'Employee' },
  { table: 'bodyshop_shops', label: 'Bodyshop' },
  { table: 'houses_shops', label: 'Houses' },
  { table: 'doctor_shops', label: 'Doctor' },
  { table: 'holiday_shops', label: 'Holiday' },
  { table: 'rentals_shops', label: 'Car Rental' },
  { table: 'laundry_shops', label: 'Laundry' },
  { table: 'gym_shops', label: 'Gym' },
  { table: 'kids_arabic_shops', label: 'Kids Arabic' },
  { table: 'kids_coding_shops', label: 'Kids Coding' },
  { table: 'kids_english_shops', label: 'Kids English' },
  { table: 'kids_french_shops', label: 'Kids French' },
  { table: 'kids_geography_shops', label: 'Kids Geography' },
  { table: 'kids_math_shops', label: 'Kids Math' },
  { table: 'kids_reading_shops', label: 'Kids Reading' },
  { table: 'kids_science_shops', label: 'Kids Science' },
  { table: 'kids_spanish_shops', label: 'Kids Spanish' },
]

// The value every row agrees on, or null when rows disagree.
function sharedValue(rows, field) {
  if (!rows || rows.length === 0) return null
  const first = rows[0][field]
  return rows.every(r => r[field] === first) ? first : null
}

// The most common value of a field across the rows (for drift listing).
function commonValue(rows, field) {
  const counts = {}
  rows.forEach(r => { counts[r[field]] = (counts[r[field]] || 0) + 1 })
  let best = null
  let bestCount = -1
  Object.keys(counts).forEach(v => { if (counts[v] > bestCount) { best = v; bestCount = counts[v] } })
  return best
}

export default function AdminDemoPasswords() {
  const [rows, setRows] = useState(null) // null = loading; [] = no demo rows found
  const [loadErrors, setLoadErrors] = useState([])
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ epass: '', u: '', p: '' })

  const loadDemoRows = async () => {
    setLoadErrors([])
    const found = []
    const errs = []
    // One query per table; a failure in one table must not hide the rest.
    await Promise.all(DEMO_TABLES.map(async ({ table, label }) => {
      try {
        const { data, error: err } = await supabase
          .from(table)
          .select('slug,u,p,epass')
          .like('slug', 'demo-%')
        if (err) throw err
        ;(data || []).forEach(r => found.push({ table, label, slug: r.slug, u: r.u, p: r.p, epass: r.epass }))
      } catch (e) {
        errs.push(`${label} (${table}): ${e.message}`)
      }
    }))
    found.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    setRows(found)
    setLoadErrors(errs)
    if (errs.length > 0) setError('Some demo tables could not be read: ' + errs.join(' | '))
    // Prefill the form with the current shared values (only when all
    // rows agree — when they vary there is no single value to prefill).
    const curEpass = sharedValue(found, 'epass')
    const curU = sharedValue(found, 'u')
    const curP = sharedValue(found, 'p')
    setForm({
      epass: curEpass === null ? '' : curEpass,
      u: curU === null ? '' : curU,
      p: curP === null ? '' : curP,
    })
  }
  useEffect(() => { loadDemoRows() }, [])

  const currentEpass = sharedValue(rows, 'epass')
  const currentU = sharedValue(rows, 'u')
  const currentP = sharedValue(rows, 'p')
  const varies = rows !== null && rows.length > 0 &&
    (currentEpass === null || currentU === null || currentP === null)

  // Rows that differ from the most common value on at least one field.
  const differingRows = (rows || []).filter(r => {
    if (currentEpass === null && r.epass !== commonValue(rows, 'epass')) return true
    if (currentU === null && r.u !== commonValue(rows, 'u')) return true
    if (currentP === null && r.p !== commonValue(rows, 'p')) return true
    return false
  })
  const differingFields = (r) => {
    const out = []
    if (currentEpass === null && r.epass !== commonValue(rows, 'epass')) out.push(`employee / teacher password is "${r.epass}"`)
    if (currentU === null && r.u !== commonValue(rows, 'u')) out.push(`setup username is "${r.u}"`)
    if (currentP === null && r.p !== commonValue(rows, 'p')) out.push(`setup password is "${r.p}"`)
    return out.join('; ')
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('')
    const epass = form.epass.trim()
    const u = form.u.trim()
    const p = form.p.trim()
    if (!epass || !u || !p) {
      setError('Fill in all three fields — employee / teacher password, setup username and setup password.')
      return
    }
    setSaving(true)
    setStatus('Updating all demo passwords...')
    try {
      const { data, error: err } = await supabase.rpc('demo_passwords_set', {
        p_epass: epass,
        p_u: u,
        p_p: p,
      })
      if (err) throw err
      const counts = data || []
      const total = counts.reduce((sum, r) => sum + (r.n || 0), 0)
      const zeroTables = counts.filter(r => (r.n || 0) === 0).map(r => r.t)
      setStatus(`✓ Updated ${total} demo row${total === 1 ? '' : 's'} across 21 tables.` +
        (zeroTables.length > 0 ? ` No demo row found in: ${zeroTables.join(', ')}.` : ''))
      await loadDemoRows()
    } catch (err) {
      setStatus('')
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="hero-card">
        <h2>🔑 Demo Passwords</h2>
        <p>Every demo shop and school on the site shares one login set: a setup username, a setup password, and an employee / teacher password. Change the three values below and tap submit — every demo row in all 21 tables is updated at once. Only demo rows (slug starting with demo-) change; real shops and schools are never touched.</p>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="status">Error: {error}</p>}

      {rows === null && <div className="hero-card"><p>Loading demo logins...</p></div>}

      {rows !== null && (
        <div>
          <p className="hint">{rows.length} demo row{rows.length === 1 ? '' : 's'} found across the 21 systems.</p>

          {varies && (
            <div>
              <p className="status">Some demo rows differ from the shared values — the differing rows are listed below. Saving here puts them all back to the same three values.</p>
              <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>System</th><th>Demo page</th><th>Differs</th></tr>
                  </thead>
                  <tbody>
                    {differingRows.map(r => (
                      <tr key={`${r.table}:${r.slug}`}>
                        <td>{r.label}</td>
                        <td>{r.slug}</td>
                        <td>{differingFields(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <form className="form-card wide" onSubmit={submit}>
            <h3>Shared demo login</h3>
            <div className="row">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                Employee / teacher password
                <input required value={form.epass} onChange={e => setForm({ ...form, epass: e.target.value })} />
                <span className="hint">Current: {currentEpass === null ? 'varies — see list above' : currentEpass}</span>
              </label>
            </div>
            <div className="row">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                Setup username
                <input required value={form.u} onChange={e => setForm({ ...form, u: e.target.value })} />
                <span className="hint">Current: {currentU === null ? 'varies — see list above' : currentU}</span>
              </label>
            </div>
            <div className="row">
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                Setup password
                <input required value={form.p} onChange={e => setForm({ ...form, p: e.target.value })} />
                <span className="hint">Current: {currentP === null ? 'varies — see list above' : currentP}</span>
              </label>
            </div>
            <button type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update all demo passwords'}</button>
            <p className="hint">This updates every demo row in all 21 tables at once — the demo restaurant, barber, POS, dealer, employee, bodyshop, houses, doctor, holiday, car rental, laundry, gym, and the 9 Yently Kids subjects. Real shops and schools keep their own logins.</p>
          </form>

          <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr><th>System</th><th>Demo page</th><th>Setup username</th><th>Setup password</th><th>Employee / teacher password</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={`${r.table}:${r.slug}`}>
                    <td>{r.label}</td>
                    <td>{r.slug}</td>
                    <td>{r.u}</td>
                    <td>{r.p}</td>
                    <td>{r.epass}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="hint">No demo rows found — check that the demo shops still exist.</p>}
        </div>
      )}
    </div>
  )
}
