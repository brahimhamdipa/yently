import { useEffect, useRef, useState } from 'react'

// Shared submenu for the Flights area — same style/role as the Cars submenu.
// Shown at the top-left of the Flights main page (Flight Estimation) and of
// the Flight Reservation page. Reuses the shared submenu styles.
export default function FlightsMenu({ go }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (page) => { setOpen(false); if (go) go(page) }

  // The gold Pay Flight button, like the one in the Flights "How it
  // works" section (step 4) — same gold, bold, no arrow. It appears
  // twice: as the Pay Flight row in the submenu, and top right on the
  // same line as the submenu button. The flow behind it is unchanged:
  // Yently sends a payment link (the payment wiring comes with the
  // bank in January).
  const payStyle = { background: '#f5c542', color: '#111827', fontWeight: 700 }

  return (
    <div className="car-submenu-wrap" ref={ref} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <button className="car-submenu-btn" onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open} aria-label="Flights menu">
        <span className="burger" aria-hidden="true"><span /><span /><span /></span>
      </button>
      <button type="button" onClick={() => pick('flight-pay')} style={payStyle}>Pay Flight</button>
      {open && (
        <div className="car-submenu">
          <button onClick={() => pick('flights-hub')}>Flights</button>
          <button onClick={() => pick('flights')}>Flight Estimation</button>
          <button onClick={() => pick('reserve')}>Flight Reservation</button>
          <button onClick={() => pick('flight-pay')} style={payStyle}>Pay Flight</button>
          <button onClick={() => pick('flight-contact')}>Contact Us</button>
        </div>
      )}
    </div>
  )
}
