import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { fetchAll, fmtDate } from '../lib/admin'

const TABLES = [
  ['car_sell_requests', '🚗 Sell a Car requests'],
  ['car_inquiries', '✉️ Car inquiries, Contact Us & Notify signups'],
  ['flight_bookings', '✈️ Flight bookings & estimations'],
]

const cellText = (v) => {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function SubmissionTable({ table, title }) {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  const load = async () => {
    try { setRows(await fetchAll(table)) }
    catch (e) { setError(e.message); setRows([]) }
  }
  useEffect(() => { load() }, [])

  const remove = async (row) => {
    if (!window.confirm('Delete this submission? This cannot be undone.')) return
    const { error: err } = await supabase.from(table).delete().eq('id', row.id)
    if (err) { setError(err.message); return }
    setRows(list => list.filter(r => r.id !== row.id))
  }

  if (rows === null) return <div className="hero-card"><p>Loading {title}...</p></div>
  const columns = rows.length > 0 ? Object.keys(rows[0]) : []

  // Search matches any cell in the row.
  const needle = (query || '').trim().toLowerCase()
  const filtered = rows.filter(r => !needle || Object.values(r).some(v => String(v ?? '').toLowerCase().includes(needle)))

  return (
    <div>
      <h3 className="admin-h3">{title} — {query.trim() ? `${filtered.length} of ${rows.length} rows` : `${rows.length} rows`}</h3>
      <input placeholder="Search this table…" style={{ fontSize: 16 }} value={query} onChange={e => setQuery(e.target.value)} />
      {rows.length === 500 && <p className="hint">Showing 500 rows — older ones may exist beyond this list.</p>}
      {error && <p className="status">Error: {error}</p>}
      {rows.length === 0 && !error && <p className="hint">Nothing here yet.</p>}
      {filtered.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>{columns.map(c => <th key={c}>{c}</th>)}<th className="no-print"></th></tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  {columns.map(c => (
                    <td key={c} title={cellText(r[c])}>
                      {c === 'created_at' ? fmtDate(r[c]) : cellText(r[c]).slice(0, 90)}
                    </td>
                  ))}
                  <td className="no-print">
                    <button type="button" className="btn-mini btn-danger" onClick={() => remove(r)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Read-everything view for the site's form tables. (Flight Reservation
// PDFs are emailed, not stored, so they aren't listed here.)
export default function AdminSubmissions() {
  return (
    <div>
      <div className="hero-card">
        <h2>✉️ Form Submissions</h2>
        <p>Everything visitors sent through the website's forms — newest first. You also get each one by email; this is the full record in one place. Delete removes a row forever.</p>
      </div>
      {TABLES.map(([table, title]) => <SubmissionTable key={table} table={table} title={title} />)}
    </div>
  )
}
