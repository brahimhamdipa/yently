import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAll, fmtDate } from '../../lib/admin'
import { COUNTRIES } from '../../lib/countryFilter'
import { fmtNum, isExpired } from '../CarSection'

// Admin → menu 2 (Cars): the two halves of the database-driven Cars system.
//
// LISTINGS — every car row, newest first. Pending rows (sent by a seller
// through the seller form) get an Approve button, which makes the car show
// on the public Cars page; Delete removes a row forever. Approved rows can
// also be deleted here. Edit (new 2026-11-26) lets the admin fix ANY
// field on ANY seller's car — wording, price, contact email — the ethics
// tool for listings that break Yently's rules.
//
// EXPIRY (2026-11-26): a one-time listing lives 60 days from approval,
// a dealer's listing 1 year from approval (`expires_at`, set by Approve;
// NULL = no expiry yet, e.g. still pending). There is no server cron, so
// the public page hides expired rows itself (lazy expiry in loadCars) —
// an expired car simply stops showing on Buy a Car. Expired rows stay
// here under the Expired filter until the admin renews them (one-time:
// another $5 order; dealer: while subscribed) or deletes them.
// SELLERS — the people allowed to list cars. Each seller has a username
// and password handed out by the admin, stored READABLE here BY DESIGN
// (throwaway only, like the store provider passes). The admin creates the
// seller FIRST — before they list anything — and picks the selling path
// up front: one-time ($5 per car, no monthly commitment) or YENTLY
// seller ($20/month, first month free, unlimited listings). The record
// also carries the COUNTRY where the car is sold, so the country filter
// can place the seller's cars (required — a blank or misspelled country
// would hide the listing). A seller's cars stay linked to them;
// deleting a seller leaves their cars listed (seller becomes blank) —
// delete the cars first if they should go too. A wrong path or country
// can be fixed with Edit (the slug never changes, so their cars and
// photos keep working).
//
// The public Cars page reads approved rows only, and sellers write only
// through the password-checked RPCs, so nothing here is reachable by a
// visitor.

function SellerName({ sellerId, sellers }) {
  const s = sellers.find(x => x.id === sellerId)
  if (!s) return <>Yently</>
  return <>{s.name}{s.seller_type ? ` (${s.seller_type === 'monthly' ? 'Dealer' : 'Individual'})` : ''}</>
}

export default function AdminCars() {
  const [view, setView] = useState('listings')
  const [listings, setListings] = useState(null)
  const [sellers, setSellers] = useState(null)
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [sellerForm, setSellerForm] = useState({ name: '', slug: '', username: '', password: '', email: '', phone: '', country: '', seller_type: 'onetime' })
  const [editingSeller, setEditingSeller] = useState(null)
  // Listing edit (ethics tool): every field on any seller's car.
  const emptyListingForm = { name: '', year: '', make: '', model: '', mileage: '', price: '', description: '', phone: '', email: '', country: '', status: 'pending', expires_at: '' }
  const [listingForm, setListingForm] = useState(emptyListingForm)
  const [editingListing, setEditingListing] = useState(null)
  const [savingListing, setSavingListing] = useState(false)
  // Delete asks in-page first (never window.confirm — the test browser
  // auto-dismisses window.confirm, so the buttons did nothing there).
  // confirmDelete is { kind: 'listing' | 'seller', row }.
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = async () => {
    try {
      const [l, s] = await Promise.all([fetchAll('car_listings'), fetchAll('car_sellers')])
      setListings(l)
      setSellers(s)
    } catch (e) { setError(e.message); setListings([]); setSellers([]) }
  }
  useEffect(() => { load() }, [])

  // 60 days from today, as an ISO timestamp (the one-time listing life).
  const sixtyDaysOut = () => new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString()
  // 1 year from today, as an ISO timestamp (the dealer listing life).
  const oneYearOut = () => new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString()
  const sellerIsMonthly = (sellerId) => (sellers || []).find(x => x.id === sellerId)?.seller_type === 'monthly'

  const approve = async (row) => {
    setStatus('Approving...')
    const { error: err } = await supabase.rpc('approve_car_listing', { p_id: row.id })
    if (err) { setStatus(''); setError(err.message); return }
    // One-time listings live 60 days from approval; dealers 1 year.
    const expires = sellerIsMonthly(row.seller_id) ? oneYearOut() : sixtyDaysOut()
    const { error: expErr } = await supabase.from('car_listings').update({ expires_at: expires }).eq('id', row.id)
    if (expErr) { setStatus(''); setError('Approved, but the expiry could not be set: ' + expErr.message); load(); return }
    setStatus(`✓ Approved — ${row.name} now shows on the Cars page${expires ? ` until ${fmtDate(expires)}` : ''}.`)
    load()
  }

  // Renew an expired listing: one-time for another 60 days (only with a
  // matching $5 order — the admin checks that before tapping Renew),
  // a dealer for another year (while subscribed).
  const renewListing = async (row) => {
    setStatus('Renewing...')
    const expires = sellerIsMonthly(row.seller_id) ? oneYearOut() : sixtyDaysOut()
    const { error: err } = await supabase.from('car_listings').update({ expires_at: expires }).eq('id', row.id)
    if (err) { setStatus(''); setError(err.message); return }
    setStatus(`✓ Renewed — ${row.name} shows again until ${fmtDate(expires)}.`)
    load()
  }

  const editListing = (r) => {
    setListingForm({
      name: r.name || '',
      year: r.year || '',
      make: r.make || '',
      model: r.model || '',
      mileage: r.mileage || '',
      price: r.price || '',
      description: r.description || '',
      phone: r.phone || '',
      email: r.email || '',
      country: r.country || '',
      status: r.status || 'pending',
      expires_at: r.expires_at ? String(r.expires_at).slice(0, 10) : '',
    })
    setEditingListing(r.id)
    setStatus('')
    setError('')
  }

  const saveListing = async (e) => {
    e.preventDefault()
    setSavingListing(true)
    setStatus('Saving listing...')
    // An approved listing with no expiry gets its path's rule on save.
    const editedRow = (listings || []).find(x => x.id === editingListing)
    let expires = listingForm.expires_at ? new Date(listingForm.expires_at + 'T23:59:59').toISOString() : null
    if (listingForm.status === 'approved' && !expires && editedRow) expires = sellerIsMonthly(editedRow.seller_id) ? oneYearOut() : sixtyDaysOut()
    const row = {
      name: listingForm.name.trim(),
      year: listingForm.year ? String(listingForm.year).trim() : null,
      make: listingForm.make.trim() || null,
      model: listingForm.model.trim() || null,
      mileage: listingForm.mileage ? String(listingForm.mileage).replace(/[^0-9.]/g, '') : null,
      price: listingForm.price ? String(listingForm.price).replace(/[^0-9.]/g, '') : null,
      description: listingForm.description.trim() || null,
      phone: listingForm.phone.trim() || null,
      email: listingForm.email.trim() || null,
      country: listingForm.country,
      status: listingForm.status,
      expires_at: expires,
    }
    const { error: err } = await supabase.from('car_listings').update(row).eq('id', editingListing)
    setSavingListing(false)
    if (err) { setStatus(''); setError(err.message); return }
    setStatus(`✓ Listing ${listingForm.name} updated.`)
    setListingForm(emptyListingForm)
    setEditingListing(null)
    load()
  }

  const doDelete = async () => {
    const target = confirmDelete
    if (!target) return
    setDeleting(true)
    const table = target.kind === 'seller' ? 'car_sellers' : 'car_listings'
    const { error: err } = await supabase.from(table).delete().eq('id', target.row.id)
    setDeleting(false)
    if (err) { setError(err.message); return }
    setStatus(target.kind === 'seller' ? `Deleted seller ${target.row.name}.` : `Deleted ${target.row.name}.`)
    setConfirmDelete(null)
    load()
  }

  const emptySellerForm = { name: '', slug: '', username: '', password: '', email: '', phone: '', country: '', seller_type: 'onetime' }

  const saveSeller = async (e) => {
    e.preventDefault()
    // The email is required: it is where the seller gets buyer
    // inquiries about their cars (see the hint under the field).
    const email = sellerForm.email.trim()
    if (!email) { setStatus(''); setError('Email is required — buyer inquiries about this seller\'s cars are emailed here.'); return }
    if (!email.includes('@') || !email.includes('.')) { setStatus(''); setError('That email doesn\'t look right — buyer inquiries about this seller\'s cars are emailed here.'); return }
    setStatus('Saving seller...')
    const row = {
      name: sellerForm.name.trim(),
      username: sellerForm.username.trim(),
      password: sellerForm.password,
      email,
      phone: sellerForm.phone.trim() || null,
      country: sellerForm.country,
      seller_type: sellerForm.seller_type,
    }
    // Edit: the slug never changes (cars and photos are keyed on it).
    // New: the slug is set once, with the country and the path.
    const { error: err } = editingSeller
      ? await supabase.from('car_sellers').update(row).eq('id', editingSeller)
      : await supabase.from('car_sellers').insert({ ...row, slug: sellerForm.slug.trim().toLowerCase() })
    if (err) { setStatus(''); setError(err.message); return }
    setStatus(editingSeller
      ? `✓ Seller ${sellerForm.name} updated.`
      : `✓ Seller ${sellerForm.name} saved — give them the username and password.`)
    setSellerForm(emptySellerForm)
    setEditingSeller(null)
    load()
  }

  const editSeller = (s) => {
    setSellerForm({
      name: s.name || '',
      slug: s.slug || '',
      username: s.username || '',
      password: s.password || '',
      email: s.email || '',
      phone: s.phone || '',
      country: s.country || '',
      seller_type: s.seller_type || 'onetime',
    })
    setEditingSeller(s.id)
    setStatus('')
    setError('')
  }

  const shown = (listings || []).filter(r => filter === 'all' ? true : filter === 'expired' ? isExpired(r) : r.status === filter)
  const pendingCount = (listings || []).filter(r => r.status === 'pending').length
  const expiredCount = (listings || []).filter(r => isExpired(r)).length

  // Search filters the status-filtered listings, or the sellers list.
  const needle = search.trim().toLowerCase()
  const matches = (hay) => !needle || String(hay || '').toLowerCase().includes(needle)
  const shownListings = shown.filter(r => matches([r.name, r.year, r.make, r.model, r.seller_name, r.status, r.country].join(' ')))
  const shownSellers = (sellers || []).filter(s => matches([s.name, s.slug, s.username, s.email, s.phone, s.country, s.seller_type].join(' ')))
  const carCountBySeller = (listings || []).reduce((acc, r) => {
    if (r.seller_id != null) acc[r.seller_id] = (acc[r.seller_id] || 0) + 1
    return acc
  }, {})

  return (
    <div>
      <div className="hero-card">
        <h2>🚗 Cars</h2>
        <p>Cars are listed from the database. Sellers send their cars through the seller form (username + password you give them) — they arrive here as Pending, and nothing shows on the public page until you approve it.</p>
      </div>

      <div className="trip-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={view === 'listings' ? 'active' : ''} onClick={() => setView('listings')}>Listings {pendingCount > 0 && `(${pendingCount} pending)`}</button>
        <button type="button" className={view === 'sellers' ? 'active' : ''} onClick={() => setView('sellers')}>Sellers</button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="status">Error: {error}</p>}

      {confirmDelete && (
        <div className="form-card">
          <h3>Delete {confirmDelete.kind === 'seller' ? 'this seller' : 'this car'}?</h3>
          <p>{confirmDelete.kind === 'seller'
            ? `Delete seller "${confirmDelete.row.name}"? Their cars stay listed (seller becomes blank).`
            : `Delete "${confirmDelete.row.name}"?`}</p>
          <p className="hint">This removes the row forever. It cannot be undone.</p>
          <div className="store-actions">
            <button type="button" className="btn-primary" onClick={doDelete} disabled={deleting}>Delete</button>
            <button type="button" className="btn-soft" onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </div>
      )}

      <input placeholder={view === 'listings' ? 'Search listings — car, seller, status…' : 'Search sellers — name, username, email…'} style={{ fontSize: 16 }} value={search} onChange={e => setSearch(e.target.value)} />
      <p className="hint">{view === 'listings' ? (search.trim() ? `${shownListings.length} of ${shown.length} listings match` : `${shown.length} listings`) : (search.trim() ? `${shownSellers.length} of ${(sellers || []).length} sellers match` : `${(sellers || []).length} sellers`)}</p>
      {view === 'listings' && (listings || []).length === 500 && <p className="hint">Showing 500 listings — older ones may exist beyond this list.</p>}

      {view === 'listings' && (
        <div>
          <div className="trip-tabs" style={{ marginBottom: 12 }}>
            <button type="button" className={filter === 'pending' ? 'active' : ''} onClick={() => setFilter('pending')}>Pending</button>
            <button type="button" className={filter === 'approved' ? 'active' : ''} onClick={() => setFilter('approved')}>Approved</button>
            <button type="button" className={filter === 'expired' ? 'active' : ''} onClick={() => setFilter('expired')}>Expired {expiredCount > 0 && `(${expiredCount})`}</button>
            <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
          </div>
          {filter === 'expired' && <p className="hint">Expired listings are hidden from Buy a Car. Renew a one-time listing only with a matching $5 order — one $5 order pays for one listing, live 60 days. A dealer&apos;s listings live 1 year and renew while subscribed.</p>}
          {editingListing && (
            <form className="form-card wide" onSubmit={saveListing}>
              <h3>Edit listing — {listingForm.name || ''}</h3>
              <p className="hint">Fix wording, price or contact details on any seller&apos;s car — this is how you correct a listing that breaks Yently&apos;s rules. The expiry date controls when the car drops off the Cars page; leave it blank and an approved listing gets its path&apos;s rule on save — 60 days for a one-time seller, 1 year for a dealer.</p>
              <div className="row">
                <input required placeholder="Car name (e.g. 2018 Honda Accord)" value={listingForm.name} onChange={e => setListingForm({ ...listingForm, name: e.target.value })} />
                <input placeholder="Year" value={listingForm.year} onChange={e => setListingForm({ ...listingForm, year: e.target.value })} />
              </div>
              <div className="row">
                <input placeholder="Make" value={listingForm.make} onChange={e => setListingForm({ ...listingForm, make: e.target.value })} />
                <input placeholder="Model" value={listingForm.model} onChange={e => setListingForm({ ...listingForm, model: e.target.value })} />
              </div>
              <div className="row">
                <input placeholder="Mileage" value={listingForm.mileage} onChange={e => setListingForm({ ...listingForm, mileage: e.target.value })} />
                <input placeholder="Price ($)" value={listingForm.price} onChange={e => setListingForm({ ...listingForm, price: e.target.value })} />
              </div>
              <div className="row">
                <input placeholder="Phone (shown to buyers)" type="tel" value={listingForm.phone} onChange={e => setListingForm({ ...listingForm, phone: e.target.value })} />
                <input placeholder="Email (shown to buyers)" type="email" value={listingForm.email} onChange={e => setListingForm({ ...listingForm, email: e.target.value })} />
              </div>
              <div className="row">
                <label style={{ flex: 1 }}>
                  <span className="field-label">Country</span>
                  <select required value={listingForm.country} onChange={e => setListingForm({ ...listingForm, country: e.target.value })} style={{ width: '100%' }}>
                    <option value="">Select country</option>
                    {COUNTRIES.map(c => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ flex: 1 }}>
                  <span className="field-label">Status</span>
                  <select value={listingForm.status} onChange={e => setListingForm({ ...listingForm, status: e.target.value })} style={{ width: '100%' }}>
                    <option value="pending">Pending</option>
                    <option value="approved">Approved</option>
                  </select>
                </label>
                <label style={{ flex: 1 }}>
                  <span className="field-label">Expires on (blank = path rule on approval)</span>
                  <input type="date" value={listingForm.expires_at} onChange={e => setListingForm({ ...listingForm, expires_at: e.target.value })} style={{ width: '100%' }} />
                </label>
              </div>
              <textarea placeholder="Description" value={listingForm.description} onChange={e => setListingForm({ ...listingForm, description: e.target.value })} rows={3} />
              <p className="hint">Renewal: a one-time listing needs a matching $5 order; a dealer&apos;s listings renew while subscribed.</p>
              <div className="row">
                <button type="submit" disabled={savingListing}>{savingListing ? 'Saving...' : 'Save changes'}</button>
                <button type="button" onClick={() => { setEditingListing(null); setListingForm(emptyListingForm) }}>Cancel</button>
              </div>
            </form>
          )}
          {listings === null && <div className="hero-card"><p>Loading listings...</p></div>}
          {listings !== null && shown.length === 0 && <p className="hint">Nothing here yet.</p>}
          {shownListings.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Car</th><th>Price</th><th>Mileage</th><th>Seller</th><th>Photos</th><th>Status</th><th>Expires</th><th>Added</th><th className="no-print"></th></tr>
                </thead>
                <tbody>
                  {shownListings.map(r => (
                    <tr key={r.id}>
                      <td title={r.description || ''}>{r.name}{r.year || r.make ? ` — ${[r.year, r.make, r.model].filter(Boolean).join(' ')}` : ''}</td>
                      <td>{r.price ? `$${fmtNum(r.price)}` : ''}</td>
                      <td>{r.mileage ? fmtNum(r.mileage) : ''}</td>
                      <td><SellerName sellerId={r.seller_id} sellers={sellers || []} /></td>
                      <td>{Array.isArray(r.photos) ? r.photos.length : 0}</td>
                      <td>{isExpired(r) ? 'Expired' : r.status}</td>
                      <td>{isExpired(r) ? 'Expired' : (r.expires_at ? fmtDate(r.expires_at) : '—')}</td>
                      <td>{fmtDate(r.created_at)}</td>
                      <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                        {r.status === 'pending' && (
                          <button type="button" className="btn-mini" onClick={() => approve(r)}>Approve</button>
                        )}{' '}
                        {isExpired(r) && (
                          <button type="button" className="btn-mini" onClick={() => renewListing(r)}>{sellerIsMonthly(r.seller_id) ? 'Renew 1 year' : 'Renew 60 days'}</button>
                        )}{' '}
                        <button type="button" className="btn-mini" onClick={() => editListing(r)}>Edit</button>{' '}
                        <button type="button" className="btn-mini btn-danger" onClick={() => setConfirmDelete({ kind: 'listing', row: r })}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'sellers' && (
        <div>
          <form className="form-card wide" onSubmit={saveSeller}>
            <h3>{editingSeller ? `Edit seller — ${sellerForm.name || ''}` : 'Add a seller'}</h3>
            <p className="hint">Give the seller this username and password — they use them on the seller form to add cars. Keep them throwaway-style, one per seller. Pick the selling path and the country where their cars are sold BEFORE creating the seller: one-time sellers pay $5 per car, YENTLY sellers pay $20/month (first month free) and list as many cars as they like. A wrong path or country can be fixed later with Edit — the slug never changes.</p>
            <div className="row">
              <input required placeholder="Seller name (e.g. Demo Cars)" value={sellerForm.name} onChange={e => setSellerForm({ ...sellerForm, name: e.target.value })} />
              <input required placeholder="Slug (e.g. demo-cars)" value={sellerForm.slug} disabled={!!editingSeller} onChange={e => setSellerForm({ ...sellerForm, slug: e.target.value })} />
            </div>
            <div className="row">
              <input required placeholder="Username" value={sellerForm.username} onChange={e => setSellerForm({ ...sellerForm, username: e.target.value })} />
              <input required placeholder="Password" value={sellerForm.password} onChange={e => setSellerForm({ ...sellerForm, password: e.target.value })} />
            </div>
            <div className="row">
              <label style={{ flex: 1 }}>
                <span className="field-label">Country — where their cars are sold</span>
                <select required value={sellerForm.country} onChange={e => setSellerForm({ ...sellerForm, country: e.target.value })} style={{ width: '100%' }}>
                  <option value="">Select country</option>
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label style={{ flex: 1 }}>
                <span className="field-label">Selling path</span>
                <select required value={sellerForm.seller_type} onChange={e => setSellerForm({ ...sellerForm, seller_type: e.target.value })} style={{ width: '100%' }}>
                  <option value="onetime">One-time — $5 per car, no monthly commitment</option>
                  <option value="monthly">YENTLY seller — $20/month, first month free, unlimited listings</option>
                </select>
              </label>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <input required placeholder="Email *" type="email" value={sellerForm.email} onChange={e => setSellerForm({ ...sellerForm, email: e.target.value })} style={{ width: '100%' }} />
                <p className="hint" style={{ margin: '4px 0 0' }}>This is the email where the seller gets buyer inquiries about their cars.</p>
              </div>
              <input placeholder="Phone (optional)" type="tel" value={sellerForm.phone} onChange={e => setSellerForm({ ...sellerForm, phone: e.target.value })} />
            </div>
            <div className="row">
              <button type="submit">{editingSeller ? 'Save changes' : 'Save seller'}</button>
              {editingSeller && <button type="button" onClick={() => { setEditingSeller(null); setSellerForm(emptySellerForm) }}>Cancel</button>}
            </div>
          </form>

          {sellers === null && <div className="hero-card"><p>Loading sellers...</p></div>}
          {sellers !== null && sellers.length === 0 && <p className="hint">No sellers yet.</p>}
          {sellers !== null && sellers.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Seller</th><th>Slug</th><th>Username</th><th>Password</th><th>Country</th><th>Path</th><th>Cars</th><th>Email</th><th>Phone</th><th className="no-print"></th></tr>
                </thead>
                <tbody>
                  {shownSellers.map(s => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.slug}</td>
                      <td>{s.username}</td>
                      <td>{s.password}</td>
                      <td>{s.country || ''}</td>
                      <td>{s.seller_type === 'monthly' ? 'Dealer ($20/mo)' : s.seller_type === 'onetime' ? 'Individual ($5/car)' : ''}</td>
                      <td>{carCountBySeller[s.id] || 0}</td>
                      <td>{s.email || ''}</td>
                      <td>{s.phone || ''}</td>
                      <td className="no-print" style={{ whiteSpace: 'nowrap' }}>
                        <button type="button" className="btn-mini" onClick={() => editSeller(s)}>Edit</button>{' '}
                        <button type="button" className="btn-mini btn-danger" onClick={() => setConfirmDelete({ kind: 'seller', row: s })}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
