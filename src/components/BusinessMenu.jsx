import { useEffect, useRef, useState } from 'react'
import { useBusinessCart } from '../lib/BusinessCartContext'

// Shared submenu for ALL Business Systems pages — same look and
// behavior as the Shopping / Cars / Flights menus (white circular
// button, plain list). Nine top rows: My Cart (with the live
// business-cart count), Business Systems (the hub page), Restaurant,
// POS, Barber, then branches that open in place (like the Admin
// menu branches): "More Systems" (Dealer, Employee, Bodyshop, Houses, Doctor, Holiday,
// Car Rental, Laundry, Gym, Simple Website), Custom Coding (moved here
// from the main menu's More list, where it was labelled "Services"),
// "Add-ons" (TV Gallery, Live Chat, Clean Link, Direct
// Upload), and "Learning Systems" (the Kids submenu minus My Cart:
// Yently Kids, Math, English, Arabic, More Subjects, Books for Kids).
// Each branch button shows a right arrow when closed and a
// down arrow when open, and its links are indented like sub-items,
// same size, same plain weight — none of them bold. One cart and one
// submenu for the whole area, because every page here sells the same
// kind of product: a website page Yently builds for a business.
export default function BusinessMenu({ go }) {
  const [open, setOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [addonsOpen, setAddonsOpen] = useState(false)
  const [learningOpen, setLearningOpen] = useState(false)
  const [subjectsOpen, setSubjectsOpen] = useState(false)
  const ref = useRef(null)
  const { count } = useBusinessCart()

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const pick = (page, param) => { setOpen(false); if (go) go(page, param) }

  return (
    <div className="car-submenu-wrap" ref={ref}>
      <button className="car-submenu-btn" onClick={() => setOpen(o => !o)} aria-haspopup="true" aria-expanded={open} aria-label="Business Systems menu">
        <span className="burger" aria-hidden="true"><span /><span /><span /></span>
      </button>
      {open && (
        <div className="car-submenu">
          <button onClick={() => pick('business-cart')}>My Cart {count > 0 && <span className="menu-count">{count}</span>}</button>
          <button onClick={() => pick('business-hub')}>Business Systems</button>
          <button onClick={() => pick('restaurants')}>Restaurant</button>
          <button onClick={() => pick('pos')}>POS</button>
          <button onClick={() => pick('barbers')}>Barber</button>
          <button onClick={() => setMoreOpen(o => !o)}>More Systems {moreOpen ? '▾' : '▸'}</button>
          {moreOpen && (
            <button onClick={() => pick('dealer')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Dealer</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('employee')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Employee</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('bodyshop')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Bodyshop</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('houses')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Houses</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('doctor')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Doctor</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('holiday')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Holiday</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('rentals')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Car Rental</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('laundry')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Laundry</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('gym')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Gym</button>
          )}
          {moreOpen && (
            <button onClick={() => pick('simple-barbershop')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Simple Website</button>
          )}
          <button onClick={() => pick('services')}>Custom Coding</button>
          <button onClick={() => setAddonsOpen(o => !o)}>Add-ons {addonsOpen ? '▾' : '▸'}</button>
          {addonsOpen && (
            <a href="/demo-tv-gallery" style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', textDecoration: 'none', borderTop: '1px solid #f1f2f5' }}>TV Gallery</a>
          )}
          {addonsOpen && (
            <a href="/demo-live-chat" style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', textDecoration: 'none', borderTop: '1px solid #f1f2f5' }}>Live Chat</a>
          )}
          {addonsOpen && (
            <button onClick={() => pick('clean-link')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Clean Link</button>
          )}
          {addonsOpen && (
            <button onClick={() => pick('direct-upload')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Direct Upload</button>
          )}
          <button onClick={() => setLearningOpen(o => !o)}>Learning Systems {learningOpen ? '▾' : '▸'}</button>
          {learningOpen && (
            <button onClick={() => pick('kids-hub')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Yently Kids</button>
          )}
          {learningOpen && (
            <button onClick={() => pick('kids-math')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Math</button>
          )}
          {learningOpen && (
            <button onClick={() => pick('kids-english')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>English</button>
          )}
          {learningOpen && (
            <button onClick={() => pick('kids-arabic')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Arabic</button>
          )}
          {learningOpen && (
            <button onClick={() => setSubjectsOpen(o => !o)} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>More Subjects {subjectsOpen ? '▾' : '▸'}</button>
          )}
          {learningOpen && subjectsOpen && (
            <button onClick={() => pick('kids-french')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>French</button>
          )}
          {learningOpen && subjectsOpen && (
            <button onClick={() => pick('kids-spanish')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Spanish</button>
          )}
          {learningOpen && subjectsOpen && (
            <button onClick={() => pick('kids-science')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Science</button>
          )}
          {learningOpen && subjectsOpen && (
            <button onClick={() => pick('kids-geography')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Geography</button>
          )}
          {learningOpen && subjectsOpen && (
            <button onClick={() => pick('kids-coding')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Coding</button>
          )}
          {learningOpen && subjectsOpen && (
            <button onClick={() => pick('kids-reading')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Reading</button>
          )}
          {learningOpen && (
            <button onClick={() => pick('kids-books')} style={{ display: 'block', width: '100%', background: 'white', color: '#111827', textAlign: 'left', padding: '12px 16px 12px 32px', fontSize: '14.5px', fontWeight: '400', borderTop: '1px solid #f1f2f5' }}>Books for Kids</button>
          )}
        </div>
      )}
    </div>
  )
}

// Top bar for every Business Systems page: submenu button on the
// left, cart icon with the live item count on the right (badge hidden
// at 0, same rule as the Shopping top bar).
export function BusinessTopBar({ go }) {
  const { count } = useBusinessCart()
  return (
    <div className="g-topbar">
      <BusinessMenu go={go} />
      <button className="cart-fab" onClick={() => go && go('business-cart')} aria-label="My Cart">
        🛒{count > 0 && <span className="cart-fab-count">{count}</span>}
      </button>
    </div>
  )
}
