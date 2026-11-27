import { useEffect, useState } from 'react'

import { supabase } from '../../lib/supabaseClient'
import { SYSTEM_KEYS, SYSTEM_LABELS, fetchSystemSwitches } from '../../lib/systemSwitches'

// Admin → menu 4 → Systems On/Off: one switch per folder-app system
// (12 Business Systems + 9 Yently Kids subjects), all ON by default.
// On = the system works normally. Off = the whole system is down for
// customers — it disappears from the Systems hub, its ad page shows
// "currently unavailable", and its folder app shows the same notice
// instead of the shop/school. Setup stays reachable for the owner,
// with its own notice. A switch never rewrites anything else: turning
// a system back On restores it exactly as it was. Writes go straight
// to system_switches (owner-only RLS, paste 8); reads go through the
// public list_system_switches RPC, same as the site itself.
export default function AdminSystemSwitches() {
  const [rows, setRows] = useState(null) // null = loading; { key: visible }
  const [status, setStatus] = useState('')

  const load = async () => {
    setRows(await fetchSystemSwitches())
  }
  useEffect(() => { load() }, [])

  const toggle = async (key) => {
    const next = !(rows[key] !== false)
    setStatus('')
    const { error } = await supabase.from('system_switches').upsert({ system: key, visible: next })
    if (error) {
      setStatus('Error: ' + error.message)
      return
    }
    setRows({ ...rows, [key]: next })
    setStatus(`✓ ${SYSTEM_LABELS[key]} is now ${next ? 'ON — working normally.' : 'OFF — the whole system is down for customers.'}`)
  }

  if (rows === null) {
    return (
      <div className="hero-card">
        <h2>Systems On/Off</h2>
        <p>Loading switches…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="hero-card">
        <h2>Systems On/Off</h2>
        <p>One switch per system — all On by default. On means the system works normally. Off means the whole system is down for customers: it disappears from the Systems hub, its ad page and its folder app show "currently unavailable", and nothing works until you switch it back On. The owner's Setup stays reachable either way.</p>
        {status && <p className="status">{status}</p>}
      </div>
      <div className="form-card wide">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid #e5e7eb' }}>System</th>
              <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid #e5e7eb' }}>Shown</th>
              <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid #e5e7eb' }}></th>
            </tr>
          </thead>
          <tbody>
            {SYSTEM_KEYS.map((key) => (
              <tr key={key}>
                <td style={{ padding: '8px 4px', borderBottom: '1px solid #f1f2f5' }}>{SYSTEM_LABELS[key]}</td>
                <td style={{ padding: '8px 4px', borderBottom: '1px solid #f1f2f5' }}>{rows[key] !== false ? 'Yes' : 'Hidden'}</td>
                <td style={{ padding: '8px 4px', borderBottom: '1px solid #f1f2f5' }}>
                  <button type="button" className="btn-mini" onClick={() => toggle(key)}>{rows[key] !== false ? 'Turn Off' : 'Turn On'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
