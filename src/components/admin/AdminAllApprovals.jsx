import { Fragment, useEffect, useMemo, useState } from 'react'
import { fmtDate } from '../../lib/admin'
import { supabase } from '../../lib/supabaseClient'
import DraftView, { summarizeDraft } from './DraftView'

// All Approvals: every customer draft waiting for approval, in one
// place — all 21 dynamic shop tables (12 business systems + 9 Yently
// Kids subjects), each row where draft_status = 'pending'.
//
// One row per pending draft, grouped by system, with maximum
// information: the system, the shop/school name and link, the slug,
// the owner login (readable, like All Passes — this page is
// owner-only), the shop's note, when the shop was created, and what
// the draft changes (each new or changed field, with counts for
// lists). Per row:
//   - View: an expandable panel with the draft read out field by
//     field (DraftView), each field marked New / Changed / Unchanged
//     / Removed against what is live now — never a raw JSON dump.
//   - Approve: the same approve RPC All Passes uses for that system.
//   - Delete: discards the pending draft — clears draft_data and
//     puts draft_status back to 'editing' — the shop itself stays
//     live exactly as it is. There is no discard RPC in the database
//     and none is needed: the write is a direct owner update under
//     the admin session, the same write path All Passes already uses
//     for Save (every shop table has an "owner all" policy for the
//     admin email), and the same values the shop's own save-draft RPC
//     writes. It is guarded to pending rows only, so a draft that
//     was already approved or re-saved cannot be discarded by
//     accident.
//
// The page reads the shop tables live on every load, so a new pending
// draft appears here on its own. A completely NEW system needs one
// more entry in SYSTEMS below (table, label, link, approve RPC).
//
// NOT covered here, on purpose — each already has its own approval
// page and its own approve path, and none of them is a customer
// shop draft: store items / item batches (menu 1, Items Approval),
// car listings (menu 2, Cars), barber intake submissions (menu 4,
// Websites, Website Submission.Approval), and order/request queues
// (clean links, direct upload, cancellations) which are not drafts.

// The 21 dynamic shop tables. rpc/param copied exactly from
// AdminAllPasses (APPROVE_RPC); linkPrefix copied from its shopRow
// links. Diner takes p_restaurant_id, POS takes p_store_id, every
// other system takes p_shop_id.
const SYSTEMS = [
  { table: 'diner_restaurants', label: 'Diner', group: 'Diner', link: '/diner?r=', rpc: 'approve_diner_draft', param: 'p_restaurant_id' },
  { table: 'barbershop_shops', label: 'Barbershop', group: 'Barbers', link: '/barbers?s=', rpc: 'approve_barbershop_draft', param: 'p_shop_id' },
  { table: 'pos_stores', label: 'POS', group: 'POS', link: '/pos?s=', rpc: 'approve_pos_draft', param: 'p_store_id' },
  { table: 'dealer_shops', label: 'Dealer', group: 'Dealer', link: '/dealer?d=', rpc: 'approve_dealer_draft', param: 'p_shop_id' },
  { table: 'employee_shops', label: 'Employee', group: 'Employee', link: '/employee?e=', rpc: 'approve_employee_draft', param: 'p_shop_id' },
  { table: 'bodyshop_shops', label: 'Bodyshop', group: 'Bodyshop', link: '/bodyshop?b=', rpc: 'approve_bodyshop_draft', param: 'p_shop_id' },
  { table: 'houses_shops', label: 'Houses', group: 'Houses', link: '/houses?h=', rpc: 'approve_houses_draft', param: 'p_shop_id' },
  { table: 'doctor_shops', label: 'Doctor', group: 'Doctor', link: '/doctor?doc=', rpc: 'approve_doctor_draft', param: 'p_shop_id' },
  { table: 'holiday_shops', label: 'Holiday', group: 'Holiday', link: '/holiday?hol=', rpc: 'approve_holiday_draft', param: 'p_shop_id' },
  { table: 'rentals_shops', label: 'Car Rental', group: 'Car Rental', link: '/rentals?c=', rpc: 'approve_rentals_draft', param: 'p_shop_id' },
  { table: 'laundry_shops', label: 'Laundry', group: 'Laundry', link: '/laundry?l=', rpc: 'approve_laundry_draft', param: 'p_shop_id' },
  { table: 'gym_shops', label: 'Gym', group: 'Gym', link: '/gym?s=', rpc: 'approve_gym_draft', param: 'p_shop_id' },
  { table: 'kids_math_shops', label: 'Kids Math', group: 'Yently Kids', link: '/kids-math?s=', rpc: 'approve_kids_math_draft', param: 'p_shop_id' },
  { table: 'kids_english_shops', label: 'Kids English', group: 'Yently Kids', link: '/kids-english?s=', rpc: 'approve_kids_english_draft', param: 'p_shop_id' },
  { table: 'kids_arabic_shops', label: 'Kids Arabic', group: 'Yently Kids', link: '/kids-arabic?s=', rpc: 'approve_kids_arabic_draft', param: 'p_shop_id' },
  { table: 'kids_french_shops', label: 'Kids French', group: 'Yently Kids', link: '/kids-french?s=', rpc: 'approve_kids_french_draft', param: 'p_shop_id' },
  { table: 'kids_spanish_shops', label: 'Kids Spanish', group: 'Yently Kids', link: '/kids-spanish?s=', rpc: 'approve_kids_spanish_draft', param: 'p_shop_id' },
  { table: 'kids_science_shops', label: 'Kids Science', group: 'Yently Kids', link: '/kids-science?s=', rpc: 'approve_kids_science_draft', param: 'p_shop_id' },
  { table: 'kids_geography_shops', label: 'Kids Geography', group: 'Yently Kids', link: '/kids-geography?s=', rpc: 'approve_kids_geography_draft', param: 'p_shop_id' },
  { table: 'kids_coding_shops', label: 'Kids Coding', group: 'Yently Kids', link: '/kids-coding?s=', rpc: 'approve_kids_coding_draft', param: 'p_shop_id' },
  { table: 'kids_reading_shops', label: 'Kids Reading', group: 'Yently Kids', link: '/kids-reading?s=', rpc: 'approve_kids_reading_draft', param: 'p_shop_id' },
]

const SYSTEM_BY_TABLE = Object.fromEntries(SYSTEMS.map(s => [s.table, s]))

const rowTime = (r) => {
  const t = r.created_at ? new Date(r.created_at).getTime() : NaN
  return Number.isNaN(t) ? -Infinity : t
}

export default function AdminAllApprovals() {
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState([])
  const [search, setSearch] = useState('')
  const [systemFilter, setSystemFilter] = useState('all')
  const [sort, setSort] = useState('newest')
  const [status, setStatus] = useState('')
  const [expandedKey, setExpandedKey] = useState(null)
  const [approving, setApproving] = useState(null)

  // Delete state: the row waiting for its in-page confirmation
  // (never a browser popup — those are ignored on the live site).
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    setRows(null)
    setFailed([])
    setExpandedKey(null)
    setConfirmDelete(null)
    const failedTables = []
    const grab = async (sys) => {
      const { data, error } = await supabase.from(sys.table)
        .select('id, slug, name, u, epass, note, draft_status, draft_data, live_data, created_at')
        .eq('draft_status', 'pending')
        .order('name')
      if (error) { failedTables.push(sys.table); return [] }
      return (data || []).map(r => ({ ...r, system: sys }))
    }
    const lists = await Promise.all(SYSTEMS.map(grab))
    setRows(lists.flat())
    setFailed(failedTables)
  }

  useEffect(() => { load() }, [])

  // One tap makes a pending draft live, through the same approve RPC
  // All Passes uses for that system.
  const approveRow = async (r) => {
    setApproving(r.key)
    try {
      const { error } = await supabase.rpc(r.system.rpc, { [r.system.param]: r.id })
      if (error) { setStatus('Cannot approve: ' + error.message); return }
      setStatus(`✓ Draft approved — ${r.name} is live now.`)
      await load()
    } catch (err) {
      setStatus('Cannot approve: ' + err.message)
    } finally {
      setApproving(null)
    }
  }

  // Discard the pending draft: clear draft_data, back to 'editing'.
  // The shop row itself is never touched beyond those two fields, so
  // the shop stays live exactly as it is. Guarded to pending rows
  // only — if the draft was already approved or re-saved, the update
  // matches nothing and reports so instead of touching the row.
  const doDelete = async () => {
    const r = confirmDelete
    if (!r) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { data, error } = await supabase.from(r.system.table)
        .update({ draft_data: null, draft_status: 'editing' })
        .eq('id', r.id)
        .eq('draft_status', 'pending')
        .select('id')
      if (error) { setDeleteError('Cannot discard the draft: ' + error.message); return }
      if (!data || data.length === 0) {
        setDeleteError('That draft was already handled — it is no longer pending, so nothing was discarded.')
        await load()
        return
      }
      setStatus(`✓ Draft discarded — ${r.name} stays live as it is. The owner can upload a new draft any time.`)
      setConfirmDelete(null)
      await load()
    } catch (err) {
      setDeleteError('Cannot discard the draft: ' + err.message)
    } finally {
      setDeleting(false)
    }
  }

  const summary = useMemo(() => {
    const perSystem = {}
    for (const r of rows || []) perSystem[r.system.table] = (perSystem[r.system.table] || 0) + 1
    return { total: (rows || []).length, perSystem }
  }, [rows])

  const filtered = useMemo(() => {
    if (!rows) return []
    const q = search.trim().toLowerCase()
    const list = rows.filter(r => {
      if (systemFilter !== 'all' && r.system.table !== systemFilter) return false
      if (!q) return true
      const changes = summarizeDraft(r.draft_data, r.live_data).join(' ')
      const hay = [r.system.label, r.name, r.slug, r.u, r.note, changes].join(' ').toLowerCase()
      return hay.includes(q)
    })
    if (sort === 'oldest') list.sort((a, b) => (rowTime(a) - rowTime(b)) || (a.id - b.id))
    else if (sort === 'name') list.sort((a, b) => (a.name || '').localeCompare(b.name || '') || (rowTime(b) - rowTime(a)))
    else if (sort === 'system') list.sort((a, b) => (a.system.label.localeCompare(b.system.label)) || (a.name || '').localeCompare(b.name || ''))
    else list.sort((a, b) => (rowTime(b) - rowTime(a)) || (a.id - b.id)) // newest first (default)
    return list
  }, [rows, search, systemFilter, sort])

  if (rows === null) return <div className="hero-card"><p>Loading all approvals…</p></div>

  return (
    <div>
      <div className="hero-card">
        <h2>✅ All Approvals {summary.total > 0 && `(${summary.total})`}</h2>
        <p>Every customer draft waiting for approval, from all 21 systems — 12 business systems and 9 Yently Kids subjects. View shows exactly what the draft would put live, Approve makes it live, and Delete discards the draft only — the shop stays live as it is, and the owner can upload a new draft any time. The shop's created date is shown; the draft itself carries no submission date, so the wait time is not shown.</p>
      </div>

      {status && <p>{status}</p>}
      {failed.length > 0 && (
        <p className="hint">Could not load: {failed.map(t => SYSTEM_BY_TABLE[t]?.label || t).join(', ')} — tap Refresh to try again.</p>
      )}

      {confirmDelete && (
        <div className="form-card">
          <h3>Discard this draft?</h3>
          <p>Discard the pending draft for “{confirmDelete.name}” ({confirmDelete.system.label})?</p>
          <p className="hint">Only the draft is discarded — the shop stays live exactly as it is, and the owner can upload a new draft any time. This cannot be undone.</p>
          <div className="store-actions">
            <button type="button" className="btn-primary" onClick={doDelete} disabled={deleting}>Discard draft</button>
            <button type="button" className="btn-soft" onClick={() => { setConfirmDelete(null); setDeleteError('') }}>Cancel</button>
          </div>
          {deleteError && <p className="hint">{deleteError}</p>}
        </div>
      )}

      <div className="form-card">
        <div className="row">
          <input placeholder="Search system, shop, slug, login, note, or what changed..." value={search} onChange={e => setSearch(e.target.value)} />
          <select value={systemFilter} onChange={e => setSystemFilter(e.target.value)} aria-label="System">
            <option value="all">All systems ({summary.total})</option>
            {SYSTEMS.map(s => (
              <option key={s.table} value={s.table} disabled={!summary.perSystem[s.table]}>
                {s.label}{summary.perSystem[s.table] ? ` (${summary.perSystem[s.table]})` : ' — none pending'}
              </option>
            ))}
          </select>
        </div>
        <div className="row">
          <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort">
            <option value="newest">Newest shop first</option>
            <option value="oldest">Oldest shop first</option>
            <option value="name">Shop name A–Z</option>
            <option value="system">System A–Z</option>
          </select>
        </div>
        <div className="store-actions">
          <button type="button" className="btn-soft" onClick={load}>↻ Refresh</button>
          {(search.trim() !== '' || systemFilter !== 'all' || sort !== 'newest') && (
            <button type="button" className="btn-soft" onClick={() => { setSearch(''); setSystemFilter('all'); setSort('newest') }}>Clear filters</button>
          )}
        </div>
      </div>

      <p><b>{filtered.length} draft{filtered.length === 1 ? '' : 's'} waiting</b></p>
      {filtered.length === 0 && <p className="hint">{summary.total === 0 ? 'Nothing waiting for approval — every draft is handled.' : 'No drafts match these filters.'}</p>}
      {filtered.length > 0 && (
        <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr><th>System</th><th>Shop / School</th><th>Login</th><th>What changed</th><th>Shop created</th><th>Note</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                const key = r.system.table + ':' + r.id
                const expanded = expandedKey === key
                const changes = summarizeDraft(r.draft_data, r.live_data)
                return (
                  <Fragment key={key}>
                    <tr>
                      <td><b>{r.system.label}</b><br /><span className="hint">{r.system.group}</span></td>
                      <td>
                        <a href={r.system.link + r.slug} target="_blank" rel="noreferrer">{r.name || '—'}</a>
                        <br /><span className="hint">Slug: {r.slug}</span>
                      </td>
                      <td>
                        {r.u || '—'}
                        {r.epass ? <><br /><span className="hint">Team: {r.epass}</span></> : <><br /><span className="hint">No team password</span></>}
                      </td>
                      <td>
                        {changes.length === 0
                          ? <span className="hint">No field differs from live — the draft matches what visitors already see.</span>
                          : changes.map((c, i) => <span key={i} style={{ display: 'block' }}>{c}</span>)}
                      </td>
                      <td>{r.created_at ? fmtDate(r.created_at) : '—'}</td>
                      <td>{r.note || '—'}</td>
                      <td>
                        <button type="button" className="btn-mini" onClick={() => setExpandedKey(expanded ? null : key)}>{expanded ? 'Hide' : 'View'}</button>{' '}
                        <button type="button" className="btn-mini" onClick={() => approveRow({ ...r, key })} disabled={approving === key}>Approve</button>{' '}
                        <button type="button" className="btn-mini" onClick={() => { setConfirmDelete({ ...r, key }); setDeleteError('') }}>🗑 Delete</button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7}>
                          <p><b>What “{r.name}” ({r.system.label}) is asking to put live</b> — against what visitors see now:</p>
                          <DraftView draft={r.draft_data} live={r.live_data} />
                          <p className="hint">Tap View again to close. Approving makes exactly this draft live; discarding it leaves the shop as it is.</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
