import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAll, fmtDate } from '../../lib/admin'
import { BRANDING_SYSTEM_OPTIONS } from '../../lib/addonSystems'

// Admin → menu 4 (Systems) → Add-ons → Remove Branding.
//
// Remove Branding is a $5/month add-on, first month free: once it
// is on for a customer, the small "Powered by Yently" banners at the
// top and bottom of their page disappear. They are OFF by default for
// everyone — the banners show on every system page unless the
// customer orders this add-on (ad page or the "Remove Branding"
// line in their Setup page) and the admin flips the switch ON here
// once they have paid.
//
// ORDERS — every Remove Branding order, newest first. Read-only
// here: the system + page the order is for travel in the order
// note (see brandingData.js), so the admin reads them off the row
// and flips the switch below. There is no request/approve step for
// Remove Branding and no activity log: the banners themselves are
// the only thing that changes.
// SWITCHES — one row per shop with the switch on or off. The admin
// can flip a switch by hand or add one. OFF means the shop's page
// shows the "Powered by Yently" banners; ON means the banners are
// gone. The 21 folder-app systems are listed here — the 12 Business
// Systems plus the 9 Yently Kids subjects. Store sellers and Car
// sellers never get Remove Branding: their pages carry no banners.

const PAY_LINK = 'https://yently.com/?system=branding'

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

export default function AdminBranding() {
  const [view, setView] = useState('orders')
  const [orders, setOrders] = useState(null)
  const [switches, setSwitches] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [switchForm, setSwitchForm] = useState({ owner_type: 'diner', owner_key: '', enabled: false })
  const [search, setSearch] = useState('')

  const loadOrders = async () => {
    try { setOrders(await fetchAll('branding_order')) }
    catch (e) { setError(e.message); setOrders([]) }
  }
  const loadSwitches = async () => {
    try {
      const { data, error: err } = await supabase
        .from('branding_switches')
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
      .from('branding_switches')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('owner_type', row.owner_type)
      .eq('owner_key', row.owner_key)
    if (err) { setError(err.message); return }
    setStatus(`✓ Switch for ${row.owner_key} (${row.owner_type}) is now ${enabled ? 'ON — the Yently banners are off for that page.' : 'OFF — the Yently banners show on that page again.'}`)
    loadSwitches()
  }

  const addSwitch = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('Saving switch...')
    const { error: err } = await supabase.from('branding_switches').insert({
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
        <h2>🏷️ Remove Branding</h2>
        <p>Remove Branding is a $5/month add-on, first month free. A customer orders it, you flip the switch on here once they have paid, and from then on their page shows no "Powered by Yently" banners. They are OFF by default for everyone — the banners show unless this switch is ON. The 21 folder-app systems can have it — the 12 Business Systems plus the 9 Yently Kids subjects — never Store sellers or Car sellers.</p>
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
          <p className="hint">The system and page each order is for are in its note — flip its switch on under Switches once they have paid. Orders are also the checkout record: the customer&apos;s name, email and phone are here, and the price is always $5/month, first month free.</p>
          {orders === null && <div className="hero-card"><p>Loading orders...</p></div>}
          {orders !== null && orders.length === 0 && <p className="hint">No Remove Branding orders yet.</p>}
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
          <p className="hint">OFF means the shop&apos;s page shows the &quot;Powered by Yently&quot; banners. ON means the banners are gone from that page. The 21 folder-app systems are listed below.</p>

          <form className="form-card wide" onSubmit={addSwitch}>
            <h3>Add a switch</h3>
            <div className="row">
              <select value={switchForm.owner_type} onChange={e => setSwitchForm({ ...switchForm, owner_type: e.target.value })}>
                {BRANDING_SYSTEM_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label} ({s.value})</option>)}
              </select>
              <input required placeholder="Shop name (slug, e.g. demo-restaurant)" value={switchForm.owner_key} onChange={e => setSwitchForm({ ...switchForm, owner_key: e.target.value })} />
            </div>
            <div className="row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={switchForm.enabled} onChange={e => setSwitchForm({ ...switchForm, enabled: e.target.checked })} />
                Switch on (banners off for that page)
              </label>
            </div>
            <button type="submit">Save switch</button>
          </form>

          {switches === null && <div className="hero-card"><p>Loading switches...</p></div>}
          {switches !== null && switches.length === 0 && <p className="hint">No switches yet — every page shows the banners by default.</p>}
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
