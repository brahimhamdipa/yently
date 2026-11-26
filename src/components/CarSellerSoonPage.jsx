import { CarsTopBar } from './CarsMenu'
import NotifyMe from './NotifyMe'

// "Become a Yently Car Seller" page — the real entry into the two-path
// seller flow (2026-11-26), not a coming-soon page. Two ways to sell:
// one car for $5, no monthly commitment, or a YENTLY seller (dealer)
// for $20/month, first month free, with unlimited listings. Either
// way the admin creates the seller (path + country) in Admin → menu 2
// → Cars → Sellers and hands over the login — the "See the two ways
// to sell" button opens the Cars hub, where both plans can be added
// to the cart. The NotifyMe box stays for anyone who wants to be told
// when something changes.
export default function CarSellerSoonPage({ go }) {
  const items = [
    'Your own seller login — username and password from Yently',
    'Add your cars one at a time, or many at once',
    'Your cars shown to buyers on the Cars page',
    'Edit or remove a listing any time',
    'Yently checks every listing before it shows',
  ]
  return (
    <div>
      <CarsTopBar go={go} />
      <div className="hero-card">
        <h2>🚗 Become a Yently Car Seller</h2>
        <p>Sell your cars on Yently — two ways, you pick the one that fits. A Yently admin creates your seller login (with the country where your cars are sold) and hands you the username and password.</p>
        <div className="sample-note">
          <b>Two ways to sell:</b>
          <ul>
            <li><b>One car — $5, one time.</b> No monthly commitment, no subscription. Your listing stays live until it sells. One $5 order pays for one car.</li>
            <li><b>YENTLY Car Seller — $20/month, first month free.</b> For dealers and frequent sellers: unlimited listings while subscribed.</li>
          </ul>
        </div>
        <div className="sample-note">
          <b>What you get:</b>
          <ul>
            {items.map(i => <li key={i}>{i}</li>)}
          </ul>
        </div>
        <p className="hint">No payment is taken here — adding a plan to the cart records your order and Yently sets you up.</p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
          <button type="button" onClick={() => go && go('cars-hub')}>See the two ways to sell →</button>
          <button type="button" onClick={() => go && go('contact')}>Contact Us →</button>
        </div>
      </div>
      <NotifyMe topic="Car Seller" />
    </div>
  )
}
