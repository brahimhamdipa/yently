import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { submitAndNotify } from '../lib/notify'
import { useCountryFilter, matchesCountry } from '../lib/countryFilter'
import { CarsTopBar } from './CarsMenu'

// ---------------------------------------------------------------------------
// Database-driven inventory (2026-11-09 rebuild).
// Cars live in the `car_listings` table (approved rows only) — sellers add
// theirs through the seller form (username/password from the admin) and the
// admin approves them. The old repo folders (Cars/<name>/car.txt + photos)
// are gone; the 3 example cars were seeded into the table with their photos
// now at /car-photos/<slug>/.
// ---------------------------------------------------------------------------

// One car row, shaped for the listing: `images` is the photos array.
function shapeCar(row) {
  return {
    id: row.id,
    seller_id: row.seller_id,
    name: row.name,
    year: row.year,
    make: row.make,
    model: row.model,
    mileage: row.mileage,
    price: row.price,
    description: row.description,
    phone: row.phone,
    email: row.email,
    country: row.country,
    images: Array.isArray(row.photos) ? row.photos : [],
  }
}

// Approved listings, newest first. Used by the Cars page and by the
// test-drive form's car-name autocomplete.
export async function loadCars() {
  const { data, error } = await supabase
    .from('car_listings')
    .select('*')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(shapeCar)
}

export const fmtNum = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  const n = Number(s.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n.toLocaleString() : s
}
const priceNum = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0

// Insert an inquiry; falls back to legacy columns if the car_name
// migration hasn't been run yet in Supabase. carId is the real
// listing id (the owner email names the seller when sellerName is
// given), so the owner can match an inquiry to its car and seller.
export async function submitCarInquiry({ carId, carName, sellerName, name, email, phone, message }) {
  const subject = sellerName
    ? `New inquiry: ${carName} (${sellerName}) — ${name}`
    : `New inquiry: ${carName} — ${name}`
  try {
    return await submitAndNotify({
      table: 'car_inquiries',
      data: { car_id: carId ?? null, car_name: carName, name, email, phone, message },
      subject,
    })
  } catch (err) {
    if (/car_name/i.test(err.message || '')) {
      return await submitAndNotify({
        table: 'car_inquiries',
        data: { car_id: 0, name, email, phone, message: `[${carName}] ${message}` },
        subject,
      })
    }
    throw err
  }
}

// Public seller directory for the Buy a Car page: id, name, path
// (seller_type: 'onetime' = individual, 'monthly' = dealer) and
// country only — no logins or contact details. Served by the
// SECURITY DEFINER RPC list_car_sellers_public; if the RPC is not
// there yet (or errors), the page still works — cars just show
// without a seller tag until it is.
export async function loadSellers() {
  const { data, error } = await supabase.rpc('list_car_sellers_public')
  if (error) return []
  return data || []
}

export function Lightbox({ images, start, onClose }) {
  const [idx, setIdx] = useState(start)
  const n = images.length
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + n) % n)
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % n)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [n, onClose])
  if (!n) return null
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
      {n > 1 && <button className="slide-btn prev" onClick={e => { e.stopPropagation(); setIdx(i => (i - 1 + n) % n) }} aria-label="Previous">‹</button>}
      <img src={images[idx]} alt="" onClick={e => e.stopPropagation()} />
      {n > 1 && <button className="slide-btn next" onClick={e => { e.stopPropagation(); setIdx(i => (i + 1) % n) }} aria-label="Next">›</button>}
      <span className="slide-count">{idx + 1} / {n}</span>
    </div>
  )
}

function CarSlideshow({ car, height }) {
  const [idx, setIdx] = useState(0)
  const [zoom, setZoom] = useState(false)
  const n = car.images.length
  return (
    <div className="slideshow">
      {n > 0 ? (
        <img src={car.images[idx]} alt={car.name} onClick={() => setZoom(true)} title="Click to enlarge" style={height ? { height } : undefined} />
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
      {zoom && n > 0 && <Lightbox images={car.images} start={idx} onClose={() => setZoom(false)} />}
    </div>
  )
}

function CarCard({ car, seller, onDetails, onInterested }) {
  return (
    <div className="card">
      <CarSlideshow car={car} />
      <div className="card-body">
        <h3>{car.name}</h3>
        {seller && <p className="hint" style={{ margin: '2px 0' }}>{seller.seller_type === 'monthly' ? 'Dealer' : 'Individual'} • {seller.country}</p>}
        {car.mileage && <p>{fmtNum(car.mileage)} miles</p>}
        {car.description && <p className="car-desc desc-clamp">{car.description}</p>}
        {car.price && <p className="price">${fmtNum(car.price)}</p>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onDetails(car)} style={{ flex: 1, background: '#e5e7eb', color: '#111827' }}>View details</button>
          <button onClick={() => onInterested(car)} style={{ flex: 1 }}>I'm interested</button>
        </div>
      </div>
    </div>
  )
}

// Full details popup (like the "I'm interested" popup): all photos, every
// field the seller shared, and the whole description — no clamp here.
// The seller line (name • Dealer/Individual • country) is always shown
// when the seller is known, and the "About seller" button next to
// "I'm interested" expands the seller block: their path, country,
// how many approved cars they have, and their other cars (tap one to
// open it). The seller directory comes from list_car_sellers_public
// (public fields only — no logins or contact details).
function DetailsModal({ car, seller, otherCars, onClose, onInterested, onOpenCar }) {
  const [showSeller, setShowSeller] = useState(false)
  const sellerType = seller?.seller_type === 'monthly' ? 'Dealer' : 'Individual'
  const rows = [
    ['Year', car.year],
    ['Make', car.make],
    ['Model', car.model],
    ['Mileage', car.mileage ? `${fmtNum(car.mileage)} miles` : ''],
    ['Price', car.price ? `$${fmtNum(car.price)}` : ''],
    ['Country', car.country],
    ['Phone', car.phone],
    ['Email', car.email],
  ].filter(([, v]) => v !== '' && v !== null && v !== undefined)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        <h3>{car.name}</h3>
        <CarSlideshow car={car} />
        <div style={{ marginTop: 14 }}>
          {rows.map(([label, value]) => (
            <p key={label} style={{ margin: '4px 0', fontSize: 14 }}>
              <b>{label}:</b> {value}
            </p>
          ))}
          {seller && (
            <p style={{ margin: '4px 0', fontSize: 14 }}>
              <b>Seller:</b> {seller.name} • {sellerType} • {seller.country}
            </p>
          )}
          {car.description && <p className="car-desc" style={{ marginTop: 10 }}>{car.description}</p>}
        </div>
        {showSeller && seller && (
          <div style={{ marginTop: 14, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
            <h4 style={{ margin: '0 0 6px' }}>About the seller</h4>
            <p style={{ margin: '4px 0', fontSize: 14 }}><b>{seller.name}</b> — {sellerType}</p>
            <p style={{ margin: '4px 0', fontSize: 14 }}>Country: {seller.country}</p>
            <p style={{ margin: '4px 0', fontSize: 14 }}>
              {sellerType === 'Dealer'
                ? 'A YENTLY Car Seller — a dealer with unlimited listings while subscribed.'
                : 'An individual seller — one car listed at a time.'}
            </p>
            {otherCars && otherCars.length > 0 ? (
              <>
                <p style={{ margin: '8px 0 4px', fontSize: 14 }}><b>Their other cars ({otherCars.length}):</b></p>
                {otherCars.map(other => (
                  <button key={other.id || other.name} onClick={() => onOpenCar(other)} style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 6, background: '#e5e7eb', color: '#111827' }}>
                    {other.name}{other.price ? ` — $${fmtNum(other.price)}` : ''}
                  </button>
                ))}
              </>
            ) : (
              <p style={{ margin: '8px 0 0', fontSize: 14 }}>This is their only car listed right now.</p>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {seller && (
            <button onClick={() => setShowSeller(s => !s)} style={{ flex: 1, background: '#e5e7eb', color: '#111827' }}>
              {showSeller ? 'Hide seller' : 'About seller'}
            </button>
          )}
          <button onClick={() => onInterested(car)} style={{ flex: 1 }}>I'm interested</button>
        </div>
      </div>
    </div>
  )
}

function InterestModal({ car, sellerName, onClose }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: `I'm interested in the ${car.name}.` })
  const [status, setStatus] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setStatus('Sending...')
    try {
      await submitCarInquiry({ carId: car.id, carName: car.name, sellerName, ...form })
      setSent(true)
      setStatus('')
    } catch (err) {
      setStatus('Error: ' + err.message)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        {sent ? (
          <div className="confirm">
            <h3>✓ Sent!</h3>
            <p>Thanks {form.name.split(' ')[0] || 'there'} — your interest in the <b>{car.name}</b> was sent. We'll be in touch shortly.</p>
            <button onClick={onClose}>Close</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-form">
            <h3>I'm interested — {car.name}</h3>
            <input required placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            <input required placeholder="Email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            <input required placeholder="Tel" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            <textarea required placeholder="Write us a message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
            <button type="submit">Submit</button>
            {status && <p className="hint">{status}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

export default function CarSection({ go }) {
  const [cars, setCars] = useState([])
  const [sellers, setSellers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filterText, setFilterText] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [detailsCar, setDetailsCar] = useState(null)
  const [interestCar, setInterestCar] = useState(null)
  const { country, countryName } = useCountryFilter()

  useEffect(() => {
    let alive = true
    loadCars()
      .then(list => { if (alive) { setCars(list); setLoading(false) } })
      .catch(err => { if (alive) { setLoadError(err.message || 'Could not load the cars.'); setLoading(false) } })
    return () => { alive = false }
  }, [])

  // Public seller directory (name, path, country only). If the RPC is
  // not there yet it resolves to [] and the page works without tags.
  useEffect(() => {
    let alive = true
    loadSellers().then(list => { if (alive) setSellers(list) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const sellersById = useMemo(() => {
    const map = {}
    for (const s of sellers) map[s.id] = s
    return map
  }, [sellers])

  const filtered = cars.filter(c => {
    if (!matchesCountry(c.country, country)) return false
    if (filterText && !c.name.toLowerCase().includes(filterText.toLowerCase())) return false
    if (maxPrice && priceNum(c.price) > Number(maxPrice)) return false
    return true
  })

  return (
    <div>
      <CarsTopBar go={go} />

      <div className="hero-card">
        <h2>Buy your next car, fully online</h2>
        <p>Browse our cars below — every listing shows real photos, mileage, and price.</p>
        <div className="filters">
          <input placeholder="Search cars (e.g. Camry)" value={filterText} onChange={e => setFilterText(e.target.value)} />
          <input placeholder="Max price ($)" type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} />
        </div>
      </div>

      {loading && (
        <div className="hero-card"><p>Loading cars…</p></div>
      )}

      {!loading && loadError && (
        <div className="hero-card"><p>Could not load the cars: {loadError}</p></div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <div className="hero-card"><p>{country ? `No cars match in ${countryName || 'this country'}. Try a different search, price, or country — or tap "All" above to see every car.` : 'No cars match. Try a different search or price, or pick a different country above.'}</p></div>
      )}

      <div className="grid">
        {filtered.map(car => (
          <CarCard
            key={car.id || car.name}
            car={car}
            seller={sellersById[car.seller_id]}
            onDetails={setDetailsCar}
            onInterested={setInterestCar}
          />
        ))}
      </div>

      {detailsCar && (
        <DetailsModal
          car={detailsCar}
          seller={sellersById[detailsCar.seller_id]}
          otherCars={cars.filter(c => c.seller_id === detailsCar.seller_id && c.id !== detailsCar.id)}
          onClose={() => setDetailsCar(null)}
          onInterested={(car) => { setDetailsCar(null); setInterestCar(car) }}
          onOpenCar={(car) => setDetailsCar(car)}
        />
      )}
      {interestCar && <InterestModal car={interestCar} sellerName={sellersById[interestCar.seller_id]?.name} onClose={() => setInterestCar(null)} />}
    </div>
  )
}
