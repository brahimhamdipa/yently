import { useEffect, useMemo, useRef, useState } from 'react'
import { COUNTRIES, useCountryFilter } from '../lib/countryFilter'

// Country picker for the Shop and Cars top bars — one compact line:
// a pill showing the current country (globe + name, truncated), and a
// small "All" button for showing every country. No long text: the old
// "Shopping in … — products and stores shown for this country" line is
// gone. Tapping the pill opens a panel with a search box (type to
// filter the 249 countries as you type) and a scrollable list; tapping
// a country sets it and closes the panel. Clicking outside the panel
// or pressing Escape closes it. "All" shows as selected (navy + gold)
// while no country filter is active. A manual pick lasts for this visit
// only: the hook keeps it in memory and never stores it, so a refresh
// re-detects the browsing country.
export default function CountryFilterBar() {
  const { country, countryName, setCountry, clearCountry, ready } = useCountryFilter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    return COUNTRIES.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase().startsWith(q))
  }, [query])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  // Focus the search box when the panel opens — the tap on the pill is
  // a user gesture, so the keyboard opens on phones too.
  useEffect(() => { if (open) inputRef.current?.focus() }, [open])

  const togglePanel = () => { setQuery(''); setOpen(o => !o) }
  const pick = (code) => { setCountry(code); setOpen(false) }
  const label = country ? (countryName || country) : 'All countries'

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
      <button
        type="button"
        onClick={togglePanel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Choose country"
        title="Choose country"
        style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, maxWidth: 220, padding: '7px 10px', borderRadius: 999, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(17,24,39,.08)', fontSize: 13.5, fontWeight: 600, color: '#111827', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        <span aria-hidden="true">🌍</span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{label}{!ready && country ? '…' : ''}</span>
        <span aria-hidden="true" style={{ fontSize: 10, color: '#6b7280', flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </button>
      <button
        type="button"
        onClick={clearCountry}
        aria-pressed={!country}
        title="Show all countries"
        aria-label="Show all countries"
        style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, border: '1px solid #e5e7eb', background: country ? '#fff' : '#161d44', color: country ? '#111827' : '#f5c542', cursor: 'pointer' }}
      >
        All
      </button>
      {open && (
        <div
          role="listbox"
          style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 'min(280px, calc(100vw - 32px))', maxHeight: 320, display: 'flex', flexDirection: 'column', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, boxShadow: '0 10px 28px rgba(17,24,39,.14)', zIndex: 70, overflow: 'hidden' }}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search countries…"
            aria-label="Search countries"
            style={{ margin: 8, marginBottom: 4, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 16, outline: 'none' }}
          />
          <div style={{ overflowY: 'auto', padding: '4px 0 8px' }}>
            {filtered.length === 0 && (
              <p style={{ margin: 0, padding: '10px 14px', fontSize: 14, color: '#6b7280' }}>No country matches “{query.trim()}”.</p>
            )}
            {filtered.map(c => (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={c.code === country}
                onClick={() => pick(c.code)}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, width: '100%', background: c.code === country ? '#eff6ff' : '#fff', color: '#111827', textAlign: 'left', padding: '9px 14px', borderRadius: 0, fontSize: 14, fontWeight: c.code === country ? 700 : 400 }}
              >
                <span>{c.name}</span>
                {c.code === country && <span aria-hidden="true" style={{ color: '#2563eb' }}>✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
