import { GroceryTopBar } from './GroceryMenu'

// Shop hub page — the landing page for the Shop nav button, in the
// same role as the Flights hub. It explains what Shop is, how
// ordering works, and links to Products, Stores, My Cart, Seller
// login, Contact Us and Track Order. The country picker in the top
// bar only sets the country (shared hook / localStorage) — Products
// and Stores are already filtered by it when the customer goes there.
export default function ShopHubPage({ go }) {
  return (
    <div>
      <GroceryTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🏬 Shop</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>A worldwide shop — your country&apos;s products and stores, in one place.</p>
        <p>Snacks and lunches, delivered to your workplace — order today, and everything arrives early tomorrow morning.</p>
      </div>

      <div className="hero-card">
        <h3>About Shop</h3>
        <p>Shop is a worldwide shopping platform. It shows you all available products and the participant stores of the country you&apos;re browsing from — to see another country&apos;s products, just choose the country above, beside the menu.</p>
        <p>We&apos;re not adding stores right now — we&apos;re growing slowly. Our focus is serving snacks and lunches to participant organizations and companies (and some houses too), and for now we&apos;re limited to small regions — the Harrisburg area today.</p>
        <p className="scope-banner">📍 We serve the Harrisburg area only — Carlisle, Mechanicsburg, Dillsburg, Camp Hill, Enola and Harrisburg — and we&apos;re growing slowly. Closed June and July. Full service from August 2027.</p>
      </div>

      <div className="form-card wide">
        <h3>How it works</h3>
        <ol className="steps">
          <li>
            <b>Order online, before midnight.</b> Employees of participant companies place their orders online within 24 hours before midnight.
          </li>
          <li>
            <b>We prepare overnight.</b> After midnight we start preparing the orders.
          </li>
          <li>
            <b>Delivered on your schedule.</b> We deliver on the schedule each organization agreed with Yently — some companies get 2 or more deliveries a day.
          </li>
          <li>
            <b>Track your order.</b> Track your orders at yently.com — from the “Track your order” link in the footer at the bottom of every page, or from More → Track Order.
          </li>
        </ol>
        <p className="hint">This year only, as an exception, Shop is closed in June and July.</p>
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Start shopping</h3>
        <p>Browse what&apos;s available in your country, or go straight to your cart.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={() => go && go('products')}>Products →</button>
          <button type="button" onClick={() => go && go('stores')}>Stores →</button>
          <button type="button" onClick={() => go && go('grocery-cart')}>My Cart →</button>
          <button type="button" onClick={() => go && go('shop-seller')}>Seller login →</button>
          <button type="button" onClick={() => go && go('grocery-contact')}>Contact Us →</button>
          <button type="button" onClick={() => go && go('track')}>Track Order →</button>
        </div>
      </div>
    </div>
  )
}
