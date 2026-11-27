import { useEffect, useMemo, useState } from 'react'

import { supabase } from '../../lib/supabaseClient'
import { SYSTEM_KEYS, SYSTEM_LABELS } from '../../lib/systemSwitches'
import { fetchShopSwitches } from '../../lib/shopSwitches'

// Admin → menu 4 → Shops On/Off: the second level under the master
// system switches — one switch for EVERY shop (customer) of every
// folder-app system (12 Business Systems + 9 Yently Kids subjects),
// all ON by default. On = the shop works normally. Off = only that
// customer's pages are down (its folder app and its TV gallery show
// "currently unavailable"); every other shop in the same system stays
// up. A switch never rewrites anything else: turning a shop back On
// restores it exactly as it was. Reads go through the public
// list_shop_switches RPC (paste 9 — it unions the 21 live shop
// tables, so every shop is listed, including ones created after the
// paste; a shop with no row yet counts as On). Writes go straight to
// shop_switches (owner-only RLS, paste 9) — the upsert creates the
// row the first time a shop is toggled.
export default function AdminShopSwitches() {
  const [rows, setRows] = useState(null) // null = loading; [{ system, slug, visible }]
  const [status, setStatus] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    setRows(await fetchShopSwitches())
  }
  useEffect(() => { load() }, [])

  const toggle = async (system, slug) => {
    const row = (rows || []).find((r) => r.system === system && r.slug === slug)
    const next = !(row ? row.visible !== false : true)
    setStatus('')
    const { error } = await supabase.from('shop_switches').upsert({ system, slug, visible: next })
    if (error) {
      setStatus('Error: ' + error.message)
      return
    }
    setRows((rows || []).map((r) => (r.system === system && r.slug === slug ? { ...r, visible: next } : r)))
    setStatus(`✓ ${SYSTEM_LABELS[system] || system} — ${slug} is now ${next ? 'ON — working normally.' : 'OFF — only this shop is down for customers.'}`)
  }

  const grouped = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    const filtered = q
      ? rows.filter((r) => r.slug.toLowerCase().includes(q) || (SYSTEM_LABELS[r.system] || r.system).toLowerCase().includes(q))
      : rows
    return SYSTEM_KEYS.map((system) => ({
      system,
      shops: filtered.filter((r) => r.system === system),
    })).filter((g) => g.shops.length > 0)
  }, [rows, query])

  if (rows === null) {
    return (
      <div className="hero-card">
        <h2>Shops On/Off</h2>
        <p>Loading shops…</p>
      </div>
    )
  }

  return (
    <div>
      <div className="hero-card">
        <h2>Shops On/Off</h2>
        <p>One switch per shop — all On by default. On means the shop works normally. Off means only that customer's pages are down: its folder app and its TV gallery show "currently unavailable", while every other shop in the same system stays up. The owner's Setup stays reachable either way, with a notice. Turning a shop back On restores it exactly as it was.</p>
        <input type="text" placeholder="Search shops…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: '100%', marginTop: 8 }} />
        {status && <p className="status">{status}</p>}
      </div>
      {grouped.length === 0 && (
        <div className="form-card wide"><p>{query ? 'No shops match that search.' : 'No shops yet.'}</p></div>
      )}
      {grouped.map((g) => (
        <div key={g.system} className="form-card wide">
          <h3 style={{ margin: '0 0 8px' }}>{SYSTEM_LABELS[g.system] || g.system} ({g.shops.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid #e5e7eb' }}>Shop</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid #e5e7eb' }}>Shown</th>
                <th style={{ textAlign: 'left', padding: '8px 4px', borderBottom: '1px solid #e5e7eb' }}></th>
              </tr>
            </thead>
            <tbody>
              {g.shops.map((r) => (
                <tr key={r.system + ':' + r.slug}>
                  <td style={{ padding: '8px 4px', borderBottom: '1px solid #f1f2f5' }}>{r.slug}</td>
                  <td style={{ padding: '8px 4px', borderBottom: '1px solid #f1f2f5' }}>{r.visible !== false ? 'Yes' : 'Hidden'}</td>
                  <td style={{ padding: '8px 4px', borderBottom: '1px solid #f1f2f5' }}>
                    <button type="button" className="btn-mini" onClick={() => toggle(r.system, r.slug)}>{r.visible !== false ? 'Turn Off' : 'Turn On'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
