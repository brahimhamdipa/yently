import { useEffect, useRef, useState } from 'react'
import CountryFilterBar from './CountryFilterBar'

// Shared submenu for the whole Cars area — shown at the top-left of the
// Cars listings page and of the Sell / Contact pages.
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
          <button onClick={() => pick('sell')}>Sell a Car</button>
          <button onClick={() => pick('contact')}>Contact Us</button>
          <button onClick={() => pick('car-seller')}>Seller login</button>
        </div>
      )}
    </div>
  )
}

// Top bar for every Cars-area page: submenu button on the left,
// country filter in the middle, cart icon on the right (same one-line
// layout as the Shopping top bar). The cart button opens the shared
// My Cart — cars have no cart of their own (an interested buyer
// contacts the seller), and Cars pages render outside any cart
// provider, so the button carries no count badge.
export function CarsTopBar({ go }) {
  return (
    <div className="g-topbar">
      <CarsMenu go={go} />
      <div style={{ flex: 1, minWidth: 0, margin: '0 8px', display: 'flex' }}>
        <CountryFilterBar />
      </div>
      <button className="cart-fab" onClick={() => go && go('business-cart')} aria-label="My Cart">
        🛒
      </button>
    </div>
  )
}
