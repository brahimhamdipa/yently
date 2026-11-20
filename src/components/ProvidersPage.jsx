import { useEffect, useMemo, useState } from 'react'
import { Lightbox } from './CarSection'
import { GroceryTopBar } from './GroceryMenu'
import { loadProviders } from '../lib/storeData'
import ScrollTopButton from './ScrollTopButton'
import { useCountryFilter, matchesCountry } from '../lib/countryFilter'

// Stores list — data now comes from the store_providers table
// (replaces the old Stores/*/store.txt folders). Search matches name,
// country, city, zip code, phone, about text and provider ID.
// Cards look like Online Store cards: picture, name, place, a 3-line
// description, then a blue "Shop with us" (the store's order page) and
// a gray "View details →" (the store page itself).
// Stores are also filtered by the browsing country (top bar): a store
// shows only when its country matches, and a store with no country set
// is hidden while any country filter is active.
function ProviderCard({ store, onShop, onView }) {
  const [idx, setIdx] = useState(0)
  const [zoom, setZoom] = useState(false)
  const images = store.pics || []
  const n = images.length
  const place = [store.city, store.country].filter(Boolean).join(', ')
  return (
    <div className="card">
      <div className="slideshow">
        {n > 0 ? (
          <img src={images[idx]} alt={store.name} onClick={() => setZoom(true)} title="Click to enlarge" />
        ) : (
          <div className="no-photo">No photos yet</div>
        )}
        {n > 1 && (
          <>
            <button className="slide-btn prev" onClick={() => setIdx(i => (i - 1 + n) % n)} aria-label="Previous photo">‹</button>
            <button className="slide-btn next" onClick={() => setIdx(i => (i + 1) % n)} aria-label="Next photo">›</button>
            <span className="slide-count">{idx + 1} / {n}</span>
          </>
        )}
      </div>
      <div className="card-body">
        <h3>{store.name}</h3>
        {place && <p>📍 {place}{store.zip ? ` ${store.zip}` : ''}</p>}
        {store.phone && <p>📞 {store.phone}</p>}
        {store.about && <p className="car-desc desc-clamp">{store.about}</p>}
        <div className="item-actions">
          <button onClick={() => onShop(store.id)}>Shop with us</button>
          <button className="btn-soft" onClick={() => onView(store.id)}>View details →</button>
        </div>
      </div>
      {zoom && n > 0 && <Lightbox images={images} start={idx} onClose={() => setZoom(false)} />}
    </div>
  )
}

export default function ProvidersPage({ go, onShop, onView }) {
  const [stores, setStores] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const { country, countryName } = useCountryFilter()

  useEffect(() => {
    loadProviders().then(setStores).catch(e => setError(e.message))
  }, [])

  const filtered = useMemo(() => {
    if (!stores) return []
    const needle = query.trim().toLowerCase()
    return stores.filter(s => {
      if (!matchesCountry(s.country, country)) return false
      if (!needle) return true
      return [s.id, s.name, s.country, s.city, s.zip, s.address, s.phone, s.email, s.about]
        .join(' ').toLowerCase().includes(needle)
    })
  }, [stores, query, country])

  return (
    <div>
      <GroceryTopBar go={go} />

      <div className="hero-card">
        <h2>🏬 Yently Stores</h2>
        <p>Our stores are virtual for now — we deliver snacks and lunches straight to your workplace. Order today and everything arrives early tomorrow morning, in your company's delivery window. Search by store name, country, city or zip code.</p>
        <p><strong>How it works:</strong> Order 24 hours before midnight. We prepare the orders and deliver them to the delivery location you picked when ordering. Delivery time is based on the agreement with your organization — it can be a couple of times a day. Track your orders at yently.com — from the “Track your order” link in the footer at the bottom of every page, or from More → Track Order.</p>
        <p className="scope-banner">📍 We serve the Harrisburg area only — Carlisle, Mechanicsburg, Dillsburg, Camp Hill, Enola and Harrisburg — and we're growing slowly. Closed June and July. Full service from August 2027.</p>
        <div className="filters">
          <input placeholder="Search stores (e.g. Paris, Morocco, 10007)" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        {stores && <p className="hint">{filtered.length} store{filtered.length === 1 ? '' : 's'} found{country ? ` in ${countryName || country}` : ''}</p>}
      </div>

      {error && (
        <div className="hero-card"><p>Couldn't load stores: {error}. If the store tables are not set up yet, run <b>supabase/store-tables.sql</b> in the Supabase SQL editor.</p></div>
      )}
      {!error && stores === null && <div className="hero-card"><p>Loading stores...</p></div>}
      {!error && stores && filtered.length === 0 && (
        <div className="hero-card"><p>No stores match.{country ? ` Nothing is listed for ${countryName || country} yet — try switching country in the bar above, or choose “Show all countries”.` : ''} Add stores from Admin → ➕ Add: Provider / Item / Category.</p></div>
      )}

      <div className="grid">
        {filtered.map(store => (
          <ProviderCard key={store.id} store={store} onShop={onShop} onView={onView} />
        ))}
      </div>
      <ScrollTopButton />
    </div>
  )
}
