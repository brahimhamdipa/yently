import { useEffect, useRef, useState } from 'react'
import { useBusinessCart } from '../lib/BusinessCartContext'
import CountryFilterBar from './CountryFilterBar'

// Shared submenu for the whole Cars area — shown at the top-left of the
// Cars listings page and of the Contact page.
export default function CarsMenu({ go }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (page) => { setOpen(false); if (go) go(page) }

  return (
    <div className="car-submenu-wrap" ref={ref}>
      <button className="car-submenu-btn" onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open} aria-label="Cars menu">
        <span className="burger" aria-hidden="true"><span /><span /><span /></span>
      </button>
      {open && (
        <div className="car-submenu">
          <button onClick={() => pick('cars')}>Buy a Car</button>
          <button onClick={() => pick('contact')}>Contact Us</button>
          <button onClick={() => pick('car-seller')}>Seller login</button>
        </div>
      )}
    </div>
  )
}

// Top bar for every Cars-area page: submenu button on the left,
// country filter in the middle (same one-line layout as the Shopping
// top bar), cart icon with the live business-cart count on the right
// (same cart-fab as the Shopping top bar — it opens My Cart, where
// the one-time $5 listing and the $20/month seller plan are paid
// for). Must render inside BusinessCartProvider (App.jsx wraps all
// Cars tabs in one).
export function CarsTopBar({ go }) {
  const { count } = useBusinessCart()
  return (
    <div className="g-topbar">
      <CarsMenu go={go} />
      <div style={{ flex: 1, minWidth: 0, margin: '0 8px', display: 'flex' }}>
        <CountryFilterBar />
      </div>
      <button className="cart-fab" onClick={() => go && go('business-cart')} aria-label="My Cart">
        🛒{count > 0 && <span className="cart-fab-count">{count}</span>}
      </button>
    </div>
  )
}
