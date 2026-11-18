import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fmtDate } from '../../lib/admin'

// Admin → menu 6 → Advanced Search (before My Vault).
//
// One page to find anything, anywhere on the site: orders across all
// systems, shops and schools, requests and inquiries, bookings and
// receipts — by name, email, phone, slug, order code (YEN-000001) or
// any other text. The searching happens in the database, in the
// owner-only RPC admin_advanced_search (SECURITY DEFINER, the
// caller's JWT email must be the owner's) — this page only renders
// whatever groups the RPC returns, so a group the RPC does not know
// about can never leak in from the client.
//
// The RPC returns:
//   { query, total, groups: [
//       { key, label, count, rows: [
//           { title, sub, meta, nav: { section?, table?, label? } }
//       ] } ] }
// or { error } when the query is rejected (too short). A group with
// count 0 is omitted by the RPC, so this page only ever renders
// groups that matched.
//
// RULE: passwords are never shown here — a shop row shows its name,
// slug, system, owner email and clean link, never its logins. Passes
// are viewed and changed from All Passes, not from search results.

const RECENT_KEY = 'yently-advanced-search-recent-v1'

const AREA_OPTIONS = [
  { value: 'all', label: 'All areas' },
  { value: 'orders', label: 'Orders' },
  { value: 'shops', label: 'Shops & schools' },
  { value: 'requests', label: 'Requests & inquiries' },
  { value: 'bookings', label: 'Bookings & receipts' },
]

// The 21 folder-app systems, in the same order as the owner-email
// list (set_shop_owner_email). The system filter picks which tables
// the RPC searches — it never filters on a plan text column.
const SYSTEM_OPTIONS = [
  { value: 'all', label: 'All systems' },
  { value: 'diner', label: 'Restaurant (Diner)' },
  { value: 'pos', label: 'Point of sale' },
  { value: 'barbers', label: 'Barbershop' },
  { value: 'dealer', label: 'Dealer' },
  { value: 'employee', label: 'Employee' },
  { value: 'bodyshop', label: 'Bodyshop' },
  { value: 'houses', label: 'Houses' },
  { value: 'doctor', label: 'Doctor' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'rentals', label: 'Car Rental' },
  { value: 'laundry', label: 'Laundry' },
  { value: 'gym', label: 'Gym' },
  { value: 'shop', label: 'Shop (stores & orders)' },
  { value: 'cars', label: 'Cars (sellers & listings)' },
  { value: 'flights', label: 'Flights (bookings)' },
  { value: 'kids-math', label: 'Kids Math' },
  { value: 'kids-english', label: 'Kids English' },
  { value: 'kids-arabic', label: 'Kids Arabic' },
  { value: 'kids-french', label: 'Kids French' },
  { value: 'kids-spanish', label: 'Kids Spanish' },
  { value: 'kids-science', label: 'Kids Science' },
  { value: 'kids-geography', label: 'Kids Geography' },
  { value: 'kids-coding', label: 'Kids Coding' },
  { value: 'kids-reading', label: 'Kids Reading' },
]

const PER_GROUP_OPTIONS = [10, 20, 50]

function loadRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY))
    return Array.isArray(raw) ? raw.filter(q => typeof q === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}

function saveRecent(q) {
  try {
    const next = [q, ...loadRecent().filter(x => x !== q)].slice(0, 5)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    // A private window or a full store must never break search.
  }
}

export default function AdminAdvancedSearch({ onGoSection = () => {}, onGoTable = () => {} }) {
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('all')
  const [system, setSystem] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [perGroup, setPerGroup] = useState(20)
  const [results, setResults] = useState(null)
  const [searched, setSearched] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [recent, setRecent] = useState(loadRecent)

  const runSearch = async (q) => {
    const text = (q !== undefined ? q : query).trim()
    if (text.length < 2) {
      setError('Type at least 2 characters to search.')
      return
    }
    setSearching(true)
    setError('')
    setResults(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('admin_advanced_search', {
        p_query: text,
        p_area: area,
        p_system: system,
        p_from: dateFrom || null,
        p_to: dateTo || null,
        p_limit: perGroup,
      })
      if (rpcError) throw rpcError
      if (data && data.error) {
        setError(String(data.error))
        return
      }
      setResults(data || { query: text, total: 0, groups: [] })
      setSearched(text)
      saveRecent(text)
      setRecent(loadRecent())
    } catch (err) {
      setError('Search failed: ' + err.message)
    } finally {
      setSearching(false)
    }
  }

  const openRow = (row) => {
    if (!row || !row.nav) return
    if (row.nav.section) onGoSection(row.nav.section)
    else if (row.nav.table) onGoTable(row.nav.table)
  }

  const total = results ? (results.total || 0) : 0
  const groups = results ? (results.groups || []) : []

  return (
    <div>
      <div className="hero-card">
        <h2>🔍 Advanced Search</h2>
        <p>Find anything, anywhere on the site — orders, shops and schools, requests, bookings and receipts — by name, email, phone, slug, order code (YEN-000001) or any other text. Passwords are never shown here; change them from All Passes.</p>
      </div>

      <div className="form-card wide">
        <label style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>Search for</label>
        <input
          placeholder="Name, email, phone, slug, YEN-000001, or any text…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); runSearch() } }}
        />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
          <label style={{ flex: '1 1 160px' }}>
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>Area</span>
            <select value={area} onChange={e => setArea(e.target.value)} style={{ width: '100%' }}>
              {AREA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 160px' }}>
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>System</span>
            <select value={system} onChange={e => setSystem(e.target.value)} style={{ width: '100%' }}>
              {SYSTEM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>From date</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label style={{ flex: '1 1 130px' }}>
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>To date</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%' }} />
          </label>
          <label style={{ flex: '0 1 130px' }}>
            <span style={{ display: 'block', fontWeight: 700, marginBottom: 4 }}>Per group</span>
            <select value={perGroup} onChange={e => setPerGroup(Number(e.target.value))} style={{ width: '100%' }}>
              {PER_GROUP_OPTIONS.map(n => <option key={n} value={n}>{n} results</option>)}
            </select>
          </label>
        </div>
        <p className="hint">Dates filter every group by its date — orders, requests and bookings by their date, shops and schools by when they were created.</p>

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="button" onClick={() => runSearch()} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
          <button
            type="button"
            className="link-btn"
            onClick={() => { setQuery(''); setArea('all'); setSystem('all'); setDateFrom(''); setDateTo(''); setResults(null); setSearched(''); setError('') }}
          >
            Clear
          </button>
        </div>
        {error && <p className="status">{error}</p>}

        {recent.length > 0 && (
          <p className="hint" style={{ marginTop: 12 }}>
            Recent:{' '}
            {recent.map((q, i) => (
              <span key={q}>
                {i > 0 && ' · '}
                <button type="button" className="link-btn" onClick={() => { setQuery(q); runSearch(q) }}>{q}</button>
              </span>
            ))}
          </p>
        )}
      </div>

      {results && (
        <div>
          <p className="status" style={{ margin: '14px 0 4px' }}>
            {total === 0
              ? <>No matches anywhere for “{searched}”. Try fewer words, or a different area or system.</>
              : <>{total} match{total === 1 ? '' : 'es'} for “{searched}” in {groups.length} group{groups.length === 1 ? '' : 's'}.</>}
          </p>
          {results.warnings && results.warnings.length > 0 && (
            <p className="hint">Could not search: {results.warnings.join(' · ')} — those tables may not exist yet.</p>
          )}
          {groups.map(g => (
            <div key={g.key} style={{ marginTop: 16 }}>
              <h3 style={{ margin: '0 0 6px' }}>{g.label} — {g.count}{g.count > g.rows.length ? ` (showing ${g.rows.length})` : ''}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.rows.map((row, i) => (
                  <div key={g.key + ':' + i} className="hero-card" style={{ padding: '10px 12px', margin: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{row.title}</div>
                        {row.sub && <div style={{ fontSize: 13, marginTop: 2 }}>{row.sub}</div>}
                        {row.meta && <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>{row.meta}</div>}
                        {row.date && <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>{fmtDate(row.date)}</div>}
                      </div>
                      {row.nav && (
                        <button type="button" className="link-btn" style={{ whiteSpace: 'nowrap' }} onClick={() => openRow(row)}>
                          {row.nav.label || 'Open'} →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
