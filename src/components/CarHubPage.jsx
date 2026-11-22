import { CarsTopBar } from './CarsMenu'

// Cars hub page — the landing page for the Cars nav button, in the
// same role as the Flights hub. It explains what the Cars platform
// is, how buying (and selling) works, and links to Buy a Car, Sell a
// Car, Seller login and Contact Us. The country picker in the top bar
// only sets the country (shared hook / localStorage) — the listings
// are already filtered by it when the customer goes there.
export default function CarHubPage({ go }) {
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
        <p>We&apos;re very limited right now, and we&apos;re not adding dealers — we&apos;re growing slowly. For now we&apos;re limited to small regions, in many different countries — the US, France, Italy, Spain and Germany.</p>
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
            <b>Selling a car?</b> Tap Sell a Car to list yours, or become a Yently Car Seller — the sign-up is on the Seller login page.
          </li>
        </ol>
      </div>

      <div aria-hidden="true" style={{ height: 1, background: '#e5e7eb', margin: '36px 0 28px' }} />

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Find your car</h3>
        <p>Browse the listings, or list a car of your own.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={() => go && go('cars')}>Buy a Car →</button>
          <button type="button" onClick={() => go && go('sell')}>Sell a Car →</button>
          <button type="button" onClick={() => go && go('car-seller')}>Seller login →</button>
          <button type="button" onClick={() => go && go('contact')}>Contact Us →</button>
        </div>
      </div>
    </div>
  )
}
