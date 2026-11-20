import { COUNTRIES, useCountryFilter } from '../lib/countryFilter'

// Country filter bar for the Shop and Cars top bars.
// itemLabel: what is being filtered, e.g. "products and stores" (Shop)
// or "cars" (Cars). Shows the browsing country at once — the fallback
// (browser language, then US) renders immediately while the IP lookup
// is still running, so the bar is never empty.
export default function CountryFilterBar({ itemLabel = 'items' }) {
  const { country, countryName, setCountry, clearCountry, ready } = useCountryFilter()

  const text = country
    ? `Shopping in ${countryName || country} — ${itemLabel} shown for this country`
    : `Showing ${itemLabel} from all countries`

  return (
    <div
      className="country-filter-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '6px 8px',
        minWidth: 0,
        flex: 1,
        fontSize: '13px',
        lineHeight: 1.35,
      }}
    >
      <span style={{ minWidth: 0 }}>{text}{!ready && country ? '…' : ''}</span>
      <select
        aria-label="Choose country"
        value={country}
        onChange={e => (e.target.value ? setCountry(e.target.value) : clearCountry())}
        style={{ maxWidth: '170px', padding: '4px 6px', fontSize: '13px' }}
      >
        <option value="">All countries</option>
        {COUNTRIES.map(c => (
          <option key={c.code} value={c.code}>{c.name}</option>
        ))}
      </select>
      <button
        type="button"
        className="btn-soft"
        onClick={clearCountry}
        disabled={!country}
        style={{ padding: '4px 8px', fontSize: '12px', whiteSpace: 'nowrap' }}
      >
        Show all countries
      </button>
    </div>
  )
}
