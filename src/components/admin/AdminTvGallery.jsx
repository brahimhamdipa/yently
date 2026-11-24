import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { fetchAll, fmtDate } from '../../lib/admin'
import { shrinkImage } from '../../lib/storeUpload'
import { TV_SYSTEM_OPTIONS } from '../../lib/addonSystems'

// Admin → menu 4 (Systems) → Add-ons → TV Gallery.
//
// TV Gallery is a $2/month add-on, first month free: once it is on
// for a customer, their Setup page shows their gallery link — the
// fullscreen page for their TV, with their pictures and their
// rolling message. It is OFF by default for everyone — a customer
// can only get it by ordering it (ad page or the "Add TV Gallery"
// line in their Setup page), and the admin flips the switch ON here
// once they have paid. The customer uploads their own pictures from
// their Setup page — the gallery lives in the tv_gallery table,
// one row per shop; the Galleries tab below shows each shop's
// pictures and message, and lets the admin manage them.
//
// ORDERS — every TV Gallery order, newest first. Read-only here:
// the system + page the order is for travel in the order note (see
// tvGalleryData.js), so the admin reads them off the row and flips
// the switch below. There is no request/approve step for TV Gallery
// and no activity log: the gallery itself is the customer's upload
// form, so there is nothing extra to log.
// SWITCHES — one row per shop with the switch on or off. The admin
// can flip a switch by hand or add one. OFF means the shop's Setup
// page shows the "Add TV Gallery" line instead of the gallery link.
// Only the 12 Business Systems are listed here — Yently Kids
// schools, Store sellers and Car sellers never get TV Gallery.

const PAY_LINK = 'https://yently.com/?system=tv-gallery'

function Switch({ on, disabled, onToggle }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input
        type="checkbox"
        checked={!!on}
        disabled={disabled}
        onChange={e => onToggle(e.target.checked)}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
      <span style={{
        display: 'inline-block', width: 44, height: 24, borderRadius: 999,
        background: on ? '#16a34a' : '#d1d5db', position: 'relative',
        transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 23 : 3, width: 18, height: 18,
          borderRadius: '50%', background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </span>
      <b style={{ color: on ? '#16a34a' : '#6b7280' }}>{on ? 'ON' : 'OFF'}</b>
    </label>
  )
}

export default function AdminTvGallery() {
  const [view, setView] = useState('orders')
  const [orders, setOrders] = useState(null)
  const [switches, setSwitches] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [switchForm, setSwitchForm] = useState({ owner_type: 'diner', owner_key: '', enabled: false })
  const [galleries, setGalleries] = useState(null)
  const [selectedGallery, setSelectedGallery] = useState(null)
  const [gPics, setGPics] = useState([])
  const [gMsg, setGMsg] = useState('')
  const [gBusy, setGBusy] = useState(false)
  const [confirmDeletePic, setConfirmDeletePic] = useState(null)
  const [galleryForm, setGalleryForm] = useState({ owner_type: 'diner', owner_key: '' })
  const [search, setSearch] = useState('')

  const loadOrders = async () => {
    try { setOrders(await fetchAll('tv_gallery_order')) }
    catch (e) { setError(e.message); setOrders([]) }
  }
  const loadSwitches = async () => {
    try {
      const { data, error: err } = await supabase
        .from('tv_gallery_switches')
        .select('*')
        .order('updated_at', { ascending: false })
      if (err) throw err
      setSwitches(data || [])
    } catch (e) { setError(e.message); setSwitches([]) }
  }
  const loadGalleries = async () => {
    try { setGalleries(await fetchAll('tv_gallery')) }
    catch (e) { setError(e.message); setGalleries([]) }
  }
  useEffect(() => { loadOrders(); loadSwitches(); loadGalleries() }, [])

  const toggleSwitch = async (row, enabled) => {
    setError('')
    const { error: err } = await supabase
      .from('tv_gallery_switches')
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq('owner_type', row.owner_type)
      .eq('owner_key', row.owner_key)
    if (err) { setError(err.message); return }
    setStatus(`✓ Switch for ${row.owner_key} (${row.owner_type}) is now ${enabled ? 'ON — the shop\'s Setup page shows the gallery link.' : 'OFF — the shop\'s Setup page shows the "Add TV Gallery" line instead.'}`)
    loadSwitches()
  }

  const addSwitch = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('Saving switch...')
    const { error: err } = await supabase.from('tv_gallery_switches').insert({
      owner_type: switchForm.owner_type,
      owner_key: switchForm.owner_key.trim(),
      enabled: switchForm.enabled,
    })
    if (err) { setStatus(''); setError(err.message); return }
    setStatus(`✓ Switch saved for ${switchForm.owner_key} (${switchForm.owner_type}) — ${switchForm.enabled ? 'ON' : 'OFF'}.`)
    setSwitchForm({ owner_type: 'diner', owner_key: '', enabled: false })
    loadSwitches()
  }

  // Galleries — one tv_gallery row per shop. The admin sees each
  // shop's pictures + message here and can manage them: delete a
  // picture, upload pictures for the customer, change the message.
  // Writes go through tv_gallery_admin_save, which only the
  // signed-in owner can call (it checks the JWT email).
  const openGalleryManage = (row) => {
    setSelectedGallery(row)
    setGPics(Array.isArray(row.pics) ? row.pics : [])
    setGMsg(row.message || '')
    setConfirmDeletePic(null)
  }

  const saveGalleryAdmin = async (pics, message) => {
    if (!selectedGallery) return false
    setGBusy(true); setError('')
    const { error: err } = await supabase.rpc('tv_gallery_admin_save', {
      p_owner_type: selectedGallery.owner_type,
      p_owner_key: selectedGallery.owner_key,
      p_message: message,
      p_pics: pics,
    })
    setGBusy(false)
    if (err) { setError(err.message); return false }
    return true
  }

  const uploadGalleryPicture = async (file, ownerKey) => {
    const up = await shrinkImage(file)
    const safe = up.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `store/tv-gallery/${ownerKey}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`
    const { error } = await supabase.storage.from('product-images').upload(path, up)
    if (error) throw error
    const { data } = supabase.storage.from('product-images').getPublicUrl(path)
    return { name: path.split('/').pop(), url: data.publicUrl }
  }

  const onGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length || !selectedGallery) return
    if (gPics.length + files.length > 7) { setError(`A gallery holds up to 7 pictures — this one has ${gPics.length}, and you picked ${files.length}.`); return }
    setGBusy(true); setError(''); setStatus(`Uploading 0 of ${files.length}...`)
    const uploaded = []
    try {
      for (const file of files) {
        uploaded.push(await uploadGalleryPicture(file, selectedGallery.owner_key))
        setStatus(`Uploading ${uploaded.length} of ${files.length}...`)
      }
    } catch (err) {
      setGBusy(false); setStatus(''); setError('Upload failed: ' + err.message); return
    }
    const next = [...gPics, ...uploaded]
    if (await saveGalleryAdmin(next, gMsg)) {
      setGPics(next)
      setStatus(`✓ Uploaded ${uploaded.length} picture${uploaded.length === 1 ? '' : 's'}.`)
      loadGalleries()
    } else setStatus('')
    setGBusy(false)
  }

  const deleteGalleryPic = async (name) => {
    if (confirmDeletePic !== name) { setConfirmDeletePic(name); return }
    setConfirmDeletePic(null)
    const next = gPics.filter(p => p.name !== name)
    if (await saveGalleryAdmin(next, gMsg)) {
      setGPics(next)
      setStatus('✓ Picture deleted.')
      loadGalleries()
    }
  }

  const saveGalleryMessage = async () => {
    if (await saveGalleryAdmin(gPics, gMsg)) {
      setStatus(gMsg ? '✓ Message saved.' : '✓ Message cleared.')
      loadGalleries()
    }
  }

  const addGallery = async (e) => {
    e.preventDefault()
    setError('')
    setStatus('Creating gallery...')
    const { error: err } = await supabase.rpc('tv_gallery_admin_save', {
      p_owner_type: galleryForm.owner_type,
      p_owner_key: galleryForm.owner_key.trim(),
      p_message: '',
      p_pics: [],
    })
    if (err) { setStatus(''); setError(err.message); return }
    setStatus(`✓ Gallery created for ${galleryForm.owner_key} (${galleryForm.owner_type}) — the customer can now upload pictures from their Setup page.`)
    setGalleryForm({ owner_type: 'diner', owner_key: '' })
    loadGalleries()
  }

  // One search box filters whichever tab is open (name, email,
  // system, shop, note — whatever the row shows).
  const needle = search.trim().toLowerCase()
  const matches = (hay) => !needle || String(hay || '').toLowerCase().includes(needle)
  const shownOrders = (orders || []).filter(o => matches([o.customer_name, o.customer_email, o.customer_phone, o.plan, o.note].join(' ')))
  const shownSwitches = (switches || []).filter(s => matches([s.owner_type, s.owner_key].join(' ')))
  const shownGalleries = (galleries || []).filter(g => matches([g.owner_type, g.owner_key, g.message].join(' ')))
  const countLine = (shown, total, word) => search.trim() ? `${shown} of ${total} ${word} match` : `${total} ${word}`

  return (
    <div>
      <div className="hero-card">
        <h2>📺 TV Gallery</h2>
        <p>TV Gallery is a $2/month add-on, first month free. A customer orders it, you flip the switch on here once they have paid, and the customer uploads their own pictures from their Setup page — from then on their Setup page shows their gallery link and lets them manage the pictures. It is OFF by default for everyone. Only the 12 Business Systems can have it — never Yently Kids schools, Store sellers or Car sellers.</p>
      </div>

      <div className="trip-tabs" style={{ marginBottom: 16 }}>
        <button type="button" className={view === 'orders' ? 'active' : ''} onClick={() => setView('orders')}>Orders</button>
        <button type="button" className={view === 'switches' ? 'active' : ''} onClick={() => setView('switches')}>Switches</button>
        <button type="button" className={view === 'galleries' ? 'active' : ''} onClick={() => setView('galleries')}>Galleries</button>
      </div>

      {status && <p className="status">{status}</p>}
      {error && <p className="status">Error: {error}</p>}

      <input placeholder={view === 'orders' ? 'Search orders — name, email, system, shop…' : view === 'galleries' ? 'Search galleries — system, shop or message…' : 'Search switches — system or shop…'} style={{ fontSize: 16 }} value={search} onChange={e => setSearch(e.target.value)} />
      <p className="hint">{view === 'orders' ? countLine(shownOrders.length, (orders || []).length, 'orders') : view === 'galleries' ? countLine(shownGalleries.length, (galleries || []).length, 'galleries') : countLine(shownSwitches.length, (switches || []).length, 'switches')}</p>
      {view === 'orders' && (orders || []).length === 500 && <p className="hint">Showing 500 orders — older ones may exist beyond this list.</p>}

      {view === 'orders' && (
        <div>
          <p className="hint">The system and page each order is for are in its note — flip its switch on under Switches once they have paid; the customer then uploads their own pictures from their Setup page. Orders are also the checkout record: the customer&apos;s name, email and phone are here, and the price is always $2/month, first month free.</p>
          {orders === null && <div className="hero-card"><p>Loading orders...</p></div>}
          {orders !== null && orders.length === 0 && <p className="hint">No TV Gallery orders yet.</p>}
          {orders !== null && shownOrders.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>Date</th><th>Customer</th><th>Email</th><th>Phone</th><th>Plan</th><th>Price</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {shownOrders.map(o => (
                    <tr key={o.id}>
                      <td>{fmtDate(o.created_at)}</td>
                      <td>{o.customer_name}</td>
                      <td>{o.customer_email}</td>
                      <td>{o.customer_phone || ''}</td>
                      <td>{o.plan}</td>
                      <td>${o.price}</td>
                      <td>{o.note || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'switches' && (
        <div>
          <p className="hint">OFF means the shop&apos;s Setup page shows the &quot;Add TV Gallery&quot; line. ON means it shows the gallery link and the picture manager instead. Only the 12 Business Systems are listed below.</p>

          <form className="form-card wide" onSubmit={addSwitch}>
            <h3>Add a switch</h3>
            <div className="row">
              <select value={switchForm.owner_type} onChange={e => setSwitchForm({ ...switchForm, owner_type: e.target.value })}>
                {TV_SYSTEM_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label} ({s.value})</option>)}
              </select>
              <input required placeholder="Shop name (slug, e.g. demo-restaurant)" value={switchForm.owner_key} onChange={e => setSwitchForm({ ...switchForm, owner_key: e.target.value })} />
            </div>
            <div className="row">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={switchForm.enabled} onChange={e => setSwitchForm({ ...switchForm, enabled: e.target.checked })} />
                Switch on (Setup shows the gallery link)
              </label>
            </div>
            <button type="submit">Save switch</button>
          </form>

          {switches === null && <div className="hero-card"><p>Loading switches...</p></div>}
          {switches !== null && switches.length === 0 && <p className="hint">No switches yet — every shop is OFF by default.</p>}
          {switches !== null && shownSwitches.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>System</th><th>Shop</th><th>Switch</th><th>Updated</th></tr>
                </thead>
                <tbody>
                  {shownSwitches.map(s => (
                    <tr key={`${s.owner_type}:${s.owner_key}`}>
                      <td>{s.owner_type}</td>
                      <td>{s.owner_key}</td>
                      <td><Switch on={s.enabled} onToggle={v => toggleSwitch(s, v)} /></td>
                      <td>{fmtDate(s.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === 'galleries' && (
        <div>
          <p className="hint">Every shop with a gallery row. Pick one to see its pictures and message — delete a picture or change the message here, or upload pictures for the customer. Adding a gallery to a customer is just flipping the switch ON under Switches; the customer then uploads their own pictures from their Setup page.</p>

          <form className="form-card wide" onSubmit={addGallery}>
            <h3>Start a gallery</h3>
            <div className="row">
              <select value={galleryForm.owner_type} onChange={e => setGalleryForm({ ...galleryForm, owner_type: e.target.value })}>
                {TV_SYSTEM_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label} ({s.value})</option>)}
              </select>
              <input required placeholder="Shop name (slug, e.g. demo-restaurant)" value={galleryForm.owner_key} onChange={e => setGalleryForm({ ...galleryForm, owner_key: e.target.value })} />
            </div>
            <button type="submit">Create gallery</button>
          </form>

          {galleries === null && <div className="hero-card"><p>Loading galleries...</p></div>}
          {galleries !== null && galleries.length === 0 && <p className="hint">No galleries yet — a gallery appears here once its first pictures are uploaded.</p>}
          {galleries !== null && shownGalleries.length > 0 && (
            <div className="table-wrap" style={{ maxHeight: 520, overflowY: 'auto' }}>
              <table className="admin-table">
                <thead>
                  <tr><th>System</th><th>Shop</th><th>Pictures</th><th>Message</th><th>Updated</th><th></th></tr>
                </thead>
                <tbody>
                  {shownGalleries.map(g => (
                    <tr key={`${g.owner_type}:${g.owner_key}`}>
                      <td>{g.owner_type}</td>
                      <td>{g.owner_key}</td>
                      <td>{(g.pics || []).length}</td>
                      <td>{g.message || ''}</td>
                      <td>{fmtDate(g.updated_at)}</td>
                      <td><button type="button" className="btn-mini" onClick={() => openGalleryManage(g)}>Manage</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {selectedGallery && (
            <div className="form-card wide" style={{ marginTop: 16 }}>
              <h3>Gallery — {selectedGallery.owner_key} ({selectedGallery.owner_type})</h3>
              <p className="hint">Gallery link: <a href={`/tv-${selectedGallery.owner_type}-${selectedGallery.owner_key}`} target="_blank" rel="noreferrer">yently.com/tv-{selectedGallery.owner_type}-{selectedGallery.owner_key}</a></p>
              {gPics.length === 0 && <p className="hint">No pictures in this gallery yet.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {gPics.map(p => (
                  <div key={p.name} style={{ position: 'relative' }}>
                    <img src={p.url} alt={p.name} style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 10 }} />
                    <button type="button" className="btn-mini btn-danger" style={{ marginTop: 4 }} disabled={gBusy} onClick={() => deleteGalleryPic(p.name)}>{confirmDeletePic === p.name ? 'Tap again to confirm' : 'Delete'}</button>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" disabled={gBusy || gPics.length >= 7} onClick={() => document.getElementById('admin-tv-gallery-file')?.click()}>Upload</button>
                <input id="admin-tv-gallery-file" type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onGalleryUpload} />
              </div>
              <div style={{ marginTop: 16 }}>
                <label>Message on the fullscreen (optional)</label>
                <input placeholder="e.g. SALE — 20% off everything today!" value={gMsg} onChange={e => setGMsg(e.target.value)} maxLength={200} style={{ fontSize: 16 }} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-mini" disabled={gBusy} onClick={saveGalleryMessage}>Save message</button>
                </div>
              </div>
              <p className="hint">Changes here save straight to the gallery — the TVs follow.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
