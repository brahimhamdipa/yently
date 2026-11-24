import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAll, fmtDate } from '../../lib/admin'
import { TV_SYSTEM_OPTIONS } from '../../lib/addonSystems'

// Admin → menu 4 (Systems) → Add-ons → TV Gallery.
//
// TV Gallery is a $2/month add-on, first month free: once it is on
// for a customer, their Setup page shows their gallery link — the
// fullscreen page for their TV, with their pictures and their
// rolling message. It is OFF by default for everyone — a customer
// can only get it by ordering it (ad page or the "Add TV Gallery"
// line in their Setup page), and the admin creates the customer's
// upload form and TV link by hand and flips the switch ON here once
// they have paid.
//
// ORDERS — every TV Gallery order, newest first. Read-only here:
// the system + page the order is for travel in the order note (see
// tvGalleryData.js), so the admin reads them off the row and flips
// the switch below. There is no request/approve step for TV Gallery
// and no activity log: the gallery itself is the customer's upload
// form, so there is nothing extra to log.
// SWITCHES — one row per shop with the switch on or off. The admin
// can flip a switch by hand or add one. OFF means the shop's Setup
// page shows the "Add TV Gallery" line instead of the gallery link.
// Only the 12 Business Systems are listed here — Yently Kids
// schools, Store sellers and Car sellers never get TV Gallery.

const PAY_LINK = 'https://yently.com/?system=tv-gallery'

function Switch({ on, disabled, onToggle }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={!!on}
        disabled={disabled}
        onChange={e => onToggle(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
      <span style={{
        display: 'inline-block', width: 44, height: 24, borderRadius: 999,
        background: on ? '#16a34a' : '#d1d5db', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </span>
      <b style={{ color: on ? '#16a34a' : '#6b7280' }}>{on ? 'ON' : 'OFF'}</b>
    </label>
  )
}

export default function AdminTvGallery() {
  const [view, setView] = useState('orders')
  const [orders, setOrders] = useState(null)
  const [switches, setSwitches] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [switchForm, setSwitchForm] = useState({ owner_type: 'diner', owner_key: '', enabled: false })
  const [search, setSearch] = useState('')

  const loadOrders = async () => {
    try { setOrders(await fetchAll('tv_gallery_order')) }
    catch (e) { setError(e.message); setOrders([]) }
  }
  const loadSwitches = async () => {
    try {
      const { data, error: err } = await supabase
        .from('tv_gallery_switches')
        .select('*')
        .order('updated_at', { ascending: false })
      if (err) throw err
      setSwitches(data || [])
    } catch (e) { setError(e.message); setSwitches([]) }
  }
  useEffect(() => { loadOrders(); loadSwitches() }, [])

  const toggleSwitch = async (row, enabled) => {
    setError('')
    const { error: err } = await supabase
      .from('tv_gallery_switches')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('owner_type', row.owner_type)
      .eq('owner_key', row.owner_key)
    if (err) { setError(err.message); return }
    setStatus(`✓ Switch for ${row.owner_key} (${row.owner_type}) is now ${enabled ? 'ON — the shop\'s Setup page shows the gallery link.' : 'OFF — the shop\'s Setup page shows the "Add TV Gallery" line instead.'}`)
    loadSwitches()
  }

  const addSwitch = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('Saving switch...')
    const { error: err } = await supabase.from('tv_gallery_switches').insert({
      owner_type: switchForm.owner_type,
      owner_key: switchForm.owner_key.trim(),
      enabled: switchForm.enabled,
    })
    if (err) { setStatus(''); setError(err.message); return }
    setStatus(`✓ Switch saved for ${switchForm.owner_key} (${switchForm.owner_type}) — ${switchForm.enabled ? 'ON' : 'OFF'}.`)
    setSwitchForm({ owner_type: 'diner', owner_key: '', enabled: false })
    loadSwitches()
  }

  // One search box filters whichever tab is open (name, email,
  // system, shop, note — whatever the row shows).
  const needle = search.trim().toLowerCase()
  const matches = (hay) => !needle || String(hay || '').toLowerCase().includes(needle)
  const shownOrders = (orders || []).filter(o => matches([o.customer_name, o.customer_email, o.customer_phone, o.plan, o.note].join(' ')))
  const shownSwitches = (switches || []).filter(s => matches([s.owner_type, s.owner_key].join(' ')))
  const countLine = (shown, total, word) => search.trim() ? `${shown} of ${total} ${word} match` : `${total} ${word}`

  return (
    <div>
      <div className="hero-card">
        <h2>📺 TV Gallery</h2>
        <p>TV Gallery is a $2/month add-on, first month free. A customer orders it, you create their upload form and TV link and flip the switch on here once they have paid, and from then on their Setup page shows their gallery link. It is OFF by default for everyone. Only the 12 Business Systems can have it — never Yently Kids schools, Store sellers or Car sellers.</p>
      </div>

      <div className="trip-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}>Orders</button>
        <button type="button" className={view === 'switches' ? 'active' : ''} onClick={() => setView('switches')}>Switches</button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="status">Error: {error}</p>}

      <input placeholder={view === 'orders' ? 'Search orders — name, email, system, shop…' : 'Search switches — system or shop…'} style={{ fontSize: 16 }} value={search} onChange={e => setSearch(e.target.value)} />
      <p className="hint">{view === 'orders' ? countLine(shownOrders.length, (orders || []).length, 'orders') : countLine(shownSwitches.length, (switches || []).length, 'switches')}</p>
      {view === 'orders' && (orders || []).length === 500 && <p className="hint">Showing 500 orders — older ones may exist beyond this list.</p>}

      {view === 'orders' && (
        <div>
          <p className="hint">The system and page each order is for are in its note — create that shop&apos;s upload form and TV link, then flip its switch on under Switches once they have paid. Orders are also the checkout record: the customer&apos;s name, email and phone are here, and the price is always $2/month, first month free.</p>
          {orders === null && <div className="hero-card"><p>Loading orders...</p></div>}
          {orders !== null && orders.length === 0 && <p className="hint">No TV Gallery orders yet.</p>}
          {orders !== null && shownOrders.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Date</th><th>Customer</th><th>Email</th><th>Phone</th><th>Plan</th><th>Price</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {shownOrders.map(o => (
                    <tr key={o.id}>
                      <td>{fmtDate(o.created_at)}</td>
                      <td>{o.customer_name}</td>
                      <td>{o.customer_email}</td>
                      <td>{o.customer_phone || ''}</td>
                      <td>{o.plan}</td>
                      <td>${o.price}</td>
                      <td>{o.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'switches' && (
        <div>
          <p className="hint">OFF means the shop&apos;s Setup page shows the &quot;Add TV Gallery&quot; line. ON means it shows the gallery link instead. Only the 12 Business Systems are listed below.</p>

          <form className="form-card wide" onSubmit={addSwitch}>
            <h3>Add a switch</h3>
            <div className="row">
              <select value={switchForm.owner_type} onChange={e => setSwitchForm({ ...switchForm, owner_type: e.target.value })}>
                {TV_SYSTEM_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label} ({s.value})</option>)}
              </select>
              <input required placeholder="Shop name (slug, e.g. demo-restaurant)" value={switchForm.owner_key} onChange={e => setSwitchForm({ ...switchForm, owner_key: e.target.value })} />
            </div>
            <div className="row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={switchForm.enabled} onChange={e => setSwitchForm({ ...switchForm, enabled: e.target.checked })} />
                Switch on (Setup shows the gallery link)
              </label>
            </div>
            <button type="submit">Save switch</button>
          </form>

          {switches === null && <div className="hero-card"><p>Loading switches...</p></div>}
          {switches !== null && switches.length === 0 && <p className="hint">No switches yet — every shop is OFF by default.</p>}
          {switches !== null && shownSwitches.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>System</th><th>Shop</th><th>Switch</th><th>Updated</th></tr>
                </thead>
                <tbody>
                  {shownSwitches.map(s => (
                    <tr key={`${s.owner_type}:${s.owner_key}`}>
                      <td>{s.owner_type}</td>
                      <td>{s.owner_key}</td>
                      <td><Switch on={s.enabled} onToggle={v => toggleSwitch(s, v)} /></td>
                      <td>{fmtDate(s.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
