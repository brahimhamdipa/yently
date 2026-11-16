// DraftView: the read-only view of a pending shop draft, shared by
// All Approvals and All Passes. The draft is NEVER dumped as raw
// JSON: every top-level field gets a plain label, a New / Changed /
// Unchanged / Removed badge against the live data, and a readable
// rendering — scalars as text, lists as "N items" plus the first few
// names, objects as their scalar fields. Passwords and logins are
// not in draft_data (they live on the shop row), so nothing secret
// can leak through this view.

const prettyLabel = (key) => {
  const s = String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—'
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// One readable line for a single list item: prefer a name-like field,
// then any short scalar, then a short JSON fallback.
const itemSummary = (item) => {
  if (item === null || item === undefined) return '—'
  if (typeof item !== 'object') return String(item)
  const nameKeys = ['name', 'title', 'label', 'student', 'word', 'ar', 'en', 'service', 'plan', 'class', 'subject', 'country', 'topic', 'book']
  for (const k of nameKeys) {
    if (item[k] !== undefined && item[k] !== null && item[k] !== '') return String(item[k])
  }
  const parts = []
  for (const [k, v] of Object.entries(item)) {
    if (v === null || v === undefined || v === '') continue
    if (typeof v === 'object') continue
    parts.push(prettyLabel(k) + ': ' + String(v))
    if (parts.length >= 3) break
  }
  if (parts.length > 0) return parts.join(' · ')
  return JSON.stringify(item).slice(0, 80)
}

const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

// Compare one top-level draft field against the live field. Returns
// { kind, text }: kind is 'new' | 'changed' | 'removed' | 'same',
// text is the one-line summary used in table rows.
export const summarizeField = (key, draftVal, liveVal) => {
  const label = prettyLabel(key)
  const hasDraft = draftVal !== undefined && draftVal !== null
  const hasLive = liveVal !== undefined && liveVal !== null
  if (!hasDraft && hasLive) return { kind: 'removed', text: label + ' — removed' }
  if (!hasDraft && !hasLive) return { kind: 'same', text: label + ' — empty' }
  if (Array.isArray(draftVal)) {
    const liveCount = Array.isArray(liveVal) ? liveVal.length : 0
    const changed = !sameValue(draftVal, liveVal)
    const kind = !hasLive ? 'new' : changed ? 'changed' : 'same'
    const delta = hasLive && draftVal.length !== liveCount
      ? ` (was ${liveCount})`
      : ''
    return { kind, text: `${label}: ${draftVal.length} item${draftVal.length === 1 ? '' : 's'}${delta}` }
  }
  if (isPlainObject(draftVal)) {
    const keys = Object.keys(draftVal)
    const changed = !sameValue(draftVal, liveVal)
    const kind = !hasLive ? 'new' : changed ? 'changed' : 'same'
    return { kind, text: `${label}: ${keys.length} field${keys.length === 1 ? '' : 's'}${changed && hasLive ? ' (changed)' : ''}` }
  }
  const shown = String(draftVal)
  if (!hasLive) return { kind: 'new', text: `${label}: ${shown}` }
  if (sameValue(draftVal, liveVal)) return { kind: 'same', text: `${label}: ${shown}` }
  return { kind: 'changed', text: `${label}: ${shown} (was: ${String(liveVal)})` }
}

// One-line "what changed" summary for a whole draft: every top-level
// field that is new or changed, in draft order. Unchanged fields are
// left out so the line stays short.
export const summarizeDraft = (draft, live) => {
  const d = isPlainObject(draft) ? draft : {}
  const l = isPlainObject(live) ? live : {}
  const out = []
  for (const key of Object.keys(d)) {
    const s = summarizeField(key, d[key], l[key])
    if (s.kind === 'new' || s.kind === 'changed') out.push(s.text)
  }
  for (const key of Object.keys(l)) {
    if (!(key in d)) out.push(prettyLabel(key) + ' — removed')
  }
  return out
}

// Readable rendering of one value inside the detail panel.
const ValueView = ({ value, depth }) => {
  if (value === null || value === undefined || value === '') return <span className="hint">—</span>
  if (typeof value === 'string' && /^https?:\/\//.test(value)) {
    return <a href={value} target="_blank" rel="noreferrer">{value.length > 80 ? value.slice(0, 80) + '…' : value}</a>
  }
  if (typeof value !== 'object') return <span>{String(value)}</span>
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="hint">Empty list</span>
    const shown = value.slice(0, 10)
    return (
      <span>
        {value.length} item{value.length === 1 ? '' : 's'}: {shown.map((it, i) => (
          <span key={i}>{i > 0 ? ', ' : ''}{itemSummary(it)}</span>
        ))}
        {value.length > 10 && <span className="hint"> …and {value.length - 10} more</span>}
      </span>
    )
  }
  // Plain object: show its scalar fields, one per line, one level deep.
  const entries = Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== '')
  if (entries.length === 0) return <span className="hint">—</span>
  if (depth >= 1) {
    return <span>{entries.slice(0, 6).map(([k, v]) => prettyLabel(k) + ': ' + (typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v))).join(' · ')}</span>
  }
  return (
    <span>
      {entries.slice(0, 8).map(([k, v]) => (
        <span key={k} style={{ display: 'block' }}>
          <b>{prettyLabel(k)}:</b> <ValueView value={v} depth={depth + 1} />
        </span>
      ))}
      {entries.length > 8 && <span className="hint">…and {entries.length - 8} more fields</span>}
    </span>
  )
}

const BADGE = {
  new: 'New',
  changed: 'Changed',
  removed: 'Removed',
  same: 'Unchanged',
}

export default function DraftView({ draft, live }) {
  const d = isPlainObject(draft) ? draft : {}
  const l = isPlainObject(live) ? live : {}
  const keys = [...Object.keys(d), ...Object.keys(l).filter(k => !(k in d))]
  if (keys.length === 0) return <p className="hint">The pending draft is empty — there is nothing to show.</p>
  return (
    <div>
      {keys.map(key => {
        const s = summarizeField(key, d[key], l[key])
        const liveVal = l[key]
        const showLive = s.kind === 'changed' && liveVal !== undefined && liveVal !== null && typeof liveVal !== 'object'
        return (
          <p key={key} style={{ margin: '6px 0' }}>
            <b>{prettyLabel(key)}</b>{' '}
            <span className="hint">[{BADGE[s.kind]}]</span>
            <br />
            <ValueView value={d[key]} depth={0} />
            {showLive && (
              <span className="hint"><br />Live now: {String(liveVal)}</span>
            )}
          </p>
        )
      })}
    </div>
  )
}
