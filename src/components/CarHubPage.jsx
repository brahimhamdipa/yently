import { CarsTopBar } from './CarsMenu'
import { useBusinessCart, CAR_ONETIME_PLAN_KEY, CAR_ONETIME_PLAN_PRICE, CAR_MONTHLY_PLAN_KEY, CAR_MONTHLY_PLAN_PRICE } from '../lib/BusinessCartContext'
import FloatingAddToCart from './FloatingAddToCart'

// Cars hub page — the landing page for the Cars nav button, in the
// same role as the Flights hub. It explains what the Cars platform
// is, how buying (and selling) works, and links to Buy a Car,
// Seller login and Contact Us. The country picker in the top bar
// only sets the country (shared hook / localStorage) — the listings
// are already filtered by it when the customer goes there.
//
// Selling has TWO paths (2026-11-26): a one-time seller lists ONE car
// for $5, no monthly commitment; a YENTLY seller (dealer) pays
// $20/month, first month free, and lists as many cars as they like.
// Both are business-cart plans (car:onetime, car:monthly) — Add to
// cart records the order + emails the owner, no payment is taken
// here, same as every other plan. The admin creates the seller (with
// the path + country) in Admin → menu 2 → Cars → Sellers.
export default function CarHubPage({ go }) {
  const { hasPlan, addPlan } = useBusinessCart()
  const onetimeInCart = hasPlan(CAR_ONETIME_PLAN_KEY)
  const monthlyInCart = hasPlan(CAR_MONTHLY_PLAN_KEY)
  return (
    <div>
      <CarsTopBar go={go} />
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🚗 Cars</h2>
        <p style={{ fontSize: 18, color: '#f5c542' }}>Cars from dealers around the world — your country&apos;s listings, in one place.</p>
        <p>Browse cars from dealers in your country — real photos, mileage and price — and contact the seller when you find the one.</p>
      </div>

      <div className="hero-card">
        <h3>About Cars</h3>
        <p>Cars is a worldwide dealers platform. It shows you the cars listed by dealers in the country you&apos;re browsing from — to see another country&apos;s cars, just choose the country above, beside the menu.</p>
        <p>Cars is open to sellers two ways: sell one car for $5, no monthly commitment — or become a YENTLY Car Seller for $20/month, first month free, and list as many cars as you like. Either way, Yently checks every listing before it shows. We&apos;re growing slowly, region by region — for now the US, France, Italy, Spain and Germany.</p>
      </div>

      <div className="form-card wide">
        <h3>How it works</h3>
        <ol className="steps">
          <li>
            <b>Browse cars by country.</b> The listings show the cars available in the country you&apos;re browsing from — switch country above to look elsewhere.
          </li>
          <li>
            <b>Open a car to see it all.</b> Every listing shows real photos, year, mileage, price and the full description.
          </li>
          <li>
            <b>Contact the seller.</b> Found the one? Tap “I&apos;m interested” and send the seller a message — we&apos;ll put you in touch.
          </li>
          <li>
            <b>Selling a car?</b> List it yourself — one car for $5, or become a Yently Car Seller for $20/month with unlimited listings.
          </li>
        </ol>
      </div>

      <div aria-hidden="true" style={{ height: 1, background: '#e5e7eb', margin: '36px 0 28px' }} />

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Sell your car on Yently</h3>
        <p>Two ways to sell — pick the one that fits you. No payment is taken here: adding to cart records your order and Yently sets you up.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
          <div className="form-card" style={{ flex: '1 1 260px', maxWidth: 340, textAlign: 'left' }}>
            <h3 style={{ marginTop: 0 }}>Sell one car — $5, one time</h3>
            <p>Got one car to sell? List it for $5 — no monthly commitment, no subscription. Your listing stays live for 60 days. If it hasn&apos;t sold by then, you can renew it with another $5 order.</p>
            <p className="hint">One $5 order pays for one car listing. Another car needs another $5 order.</p>
            {onetimeInCart ? (
              <button type="button" onClick={() => go && go('business-cart')}>✓ In your cart — Go to My Cart</button>
            ) : (
              <button type="button" onClick={() => addPlan(CAR_ONETIME_PLAN_KEY)}>Add to cart — ${CAR_ONETIME_PLAN_PRICE} one time</button>
            )}
          </div>
          <div className="form-card" style={{ flex: '1 1 260px', maxWidth: 340, textAlign: 'left' }}>
            <h3 style={{ marginTop: 0 }}>Become a YENTLY Car Seller — $20/month</h3>
            <p>Selling cars often, or running a dealership? Your own seller login, unlimited listings, and your cars shown to buyers in every country you sell in. First month free. Your listings stay live for 1 year — renew them while you&apos;re subscribed.</p>
            <p className="hint">Cancel anytime — your subscription ends and no further month is charged.</p>
            {monthlyInCart ? (
              <button type="button" onClick={() => go && go('business-cart')}>✓ In your cart — Go to My Cart</button>
            ) : (
              <button type="button" onClick={() => addPlan(CAR_MONTHLY_PLAN_KEY)}>Add to cart — ${CAR_MONTHLY_PLAN_PRICE}/month</button>
            )}
          </div>
        </div>
      </div>

      <div aria-hidden="true" style={{ height: 1, background: '#e5e7eb', margin: '36px 0 28px' }} />

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Find your car</h3>
        <p>Browse the listings, or list a car of your own.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={() => go && go('cars')}>Buy a Car →</button>
          <button type="button" onClick={() => go && go('car-seller')}>Seller login →</button>
          <button type="button" onClick={() => go && go('contact')}>Contact Us →</button>
        </div>
      </div>

      <FloatingAddToCart planKey={CAR_MONTHLY_PLAN_KEY} name="YENTLY Car Seller — monthly" price={CAR_MONTHLY_PLAN_PRICE} go={go} />
    </div>
  )
}
