import { useEffect, useRef, useState } from 'react'
import CarSection from './components/CarSection'
import FlightSection from './components/FlightSection'
import AboutPage from './components/AboutPage'
import GuidesPage from './components/GuidesPage'
import SellPage from './components/SellPage'
import CarSellerFormPage from './components/CarSellerFormPage'
import ContactPage from './components/ContactPage'
import FlightReservationPage from './components/FlightReservationPage'
import FlightContactPage from './components/FlightContactPage'
import FlightsHubPage from './components/FlightsHubPage'
import ShopHubPage from './components/ShopHubPage'
import CarHubPage from './components/CarHubPage'
import FlightPayPage from './components/FlightPayPage'
import ClothesPage from './components/ClothesPage'
import ServicesPage from './components/ServicesPage'
import GroceryCartPage from './components/GroceryCartPage'
import GrocerySoonPage from './components/GrocerySoonPage'
import GroceryContactPage from './components/GroceryContactPage'
import ProvidersPage from './components/ProvidersPage'
import ProviderPage from './components/ProviderPage'
import StoreOrderPage from './components/StoreOrderPage'
import ProductsPage from './components/ProductsPage'
import BagsPage from './components/BagsPage'
import CategoryPage from './components/CategoryPage'
import ItemDetailPage from './components/ItemDetailPage'
import ProviderFormPage from './components/ProviderFormPage'
import ChatWidget from './components/ChatWidget'
import AdminPage from './components/AdminPage'
import { CartProvider } from './lib/CartContext'
import { BusinessCartProvider, BUSINESS_PLANS, useBusinessCart, isKidsExtraPlanKey, CLEAN_PLAN_KEY, CLEAN_GOLDEN_PLAN_KEY, CLEAN_DOMAIN_PLAN_KEY, DIRECT_PLAN_KEY, REPORTS_PLAN_KEY, BRANDING_PLAN_KEY, TV_PLAN_KEY, CHAT_PLAN_KEY, ADDON_SYSTEMS, REPORTS_SYSTEMS, BRANDING_SYSTEMS } from './lib/BusinessCartContext'
import BarbersPage from './components/BarbersPage'
import SimpleBarbershopPage from './components/SimpleBarbershopPage'
import RestaurantsPage from './components/RestaurantsPage'
import PosPage from './components/PosPage'
import DealerPage from './components/DealerPage'
import EmployeePage from './components/EmployeePage'
import BodyshopPage from './components/BodyshopPage'
import HousesPage from './components/HousesPage'
import DoctorPage from './components/DoctorPage'
import HolidayPage from './components/HolidayPage'
import RentalsPage from './components/RentalsPage'
import LaundryPage from './components/LaundryPage'
import GymPage from './components/GymPage'
import TvGalleryPage from './components/TvGalleryPage'
import LiveChatPage from './components/LiveChatPage'
import CleanLinkPage from './components/CleanLinkPage'
import DirectUploadPage from './components/DirectUploadPage'
import ReportsPage from './components/ReportsPage'
import BrandingPage from './components/BrandingPage'
import ExtraStudentsPage from './components/ExtraStudentsPage'
import CarSellerSoonPage from './components/CarSellerSoonPage'
import ShopSellerFormPage from './components/ShopSellerFormPage'
import ShopSellerSoonPage from './components/ShopSellerSoonPage'
import LiveChatDemo from './components/LiveChatDemo'
import TrackingPage from './components/TrackingPage'
import PassRecoveryPage from './components/PassRecoveryPage'
import AgreementPage from './components/AgreementPage'
import BusinessCartPage from './components/BusinessCartPage'
import BusinessSystemsPage from './components/BusinessSystemsPage'
import KidsHubPage from './components/KidsHubPage'
import KidsMathPage from './components/KidsMathPage'
import KidsEnglishPage from './components/KidsEnglishPage'
import KidsArabicPage from './components/KidsArabicPage'
import KidsFrenchPage from './components/KidsFrenchPage'
import KidsSpanishPage from './components/KidsSpanishPage'
import KidsSciencePage from './components/KidsSciencePage'
import KidsGeographyPage from './components/KidsGeographyPage'
import KidsCodingPage from './components/KidsCodingPage'
import KidsReadingPage from './components/KidsReadingPage'
import BooksForKidsPage from './components/BooksForKidsPage'
import logoUrl from './assets/logo-com.webp'
import './index.css'

// Deep links (used by the reply templates in Admin → All Requests):
//   https://yently.com/?system=<tab>&add=<plan key>
// opens that ad page, adds the plan to the customer's cart and opens
// My Cart. ?system=flight-pay opens the Pay Flight page (no money is
// taken there — the customer enters the agreed amount and we send the
// secure payment link). Extra Students links from a school's Setup
// page carry ?slug= too (/?add=kids-extra-<subject>&slug=<school>),
// so the cart line knows which school the places are for. Unknown
// values fall back to the Systems hub.
// The root path carries the query, so the middleware clean-link
// matcher (/:slug) never touches it.
const DEEP_LINK_SYSTEMS = new Set([
  'business-hub', 'restaurants', 'pos', 'barbers', 'dealer', 'employee',
  'bodyshop', 'houses', 'doctor', 'holiday', 'rentals', 'laundry', 'gym',
  'simple-barbershop', 'tv-gallery', 'live-chat', 'clean-link',
  'direct-upload', 'reports', 'branding', 'demo-live-chat', 'business-cart',
  'kids-hub', 'kids-math', 'kids-english', 'kids-arabic', 'kids-french',
  'kids-spanish', 'kids-science', 'kids-geography', 'kids-coding',
  'kids-reading', 'kids-books',
  'flights', 'flights-hub', 'shop-hub', 'cars-hub', 'reserve', 'flight-pay', 'flight-contact', 'services',
])

// Reads ?add=<plan key> once, adds that plan to the shared Business
// cart and opens My Cart. Rendered inside each BusinessCartProvider
// block (business tabs and Kids tabs have separate providers).
// Adding a plan already in the cart is a no-op, and the query is
// cleared after it is read so a later visit to the same tab never
// re-runs it. Extra Students deep links carry ?slug= as well
// (/?add=kids-extra-<subject>&slug=<school>, built by a school's
// Setup page): the slug rides into the cart line so checkout knows
// which school the places are for. A new extra line starts at 1
// place; one already in the cart keeps the larger count and takes
// the new slug (see addPlan in BusinessCartContext).
// A Clean Link add-on from a shop's Setup page (?add=clean:website
// &shop=<system-key>&slug=<SLUG>&addon=1) carries the system + slug
// on the cart line itself (isAddon): it is an add-on to the payment
// the customer already has — free for the rest of this month, $5/month
// from the next payment for Clean Link ($10/month Golden Link,
// $20/month Your Own Domain), excluded from the bundle tiers, no
// tracking code (see businessData.js). A Direct Upload add-on
// (?add=direct:website&shop=<system-key>&slug=<SLUG>&addon=1)
// works the same way at $5/month. A Reports add-on
// (?add=reports:website&shop=<system-key>&slug=<SLUG>&addon=1)
// works the same way at $5/month, first month free — and only for
// the 12 Business Systems (REPORTS_SYSTEMS): a link naming a Kids
// school, Store or Cars falls back to a plain line, and the
// checkout insert refuses that line outright (see reportsData.js).
// A TV Gallery add-on (?add=tv:website&shop=<system-key>
// &slug=<SLUG>&addon=1) works the same way at $2/month, first
// month free — 12 Business Systems only, like Reports. A Live
// Chat add-on (?add=chat:website&shop=<system-key>&slug=<SLUG>
// &addon=1) works the same way at $3/month, first month free —
// any of the 23 add-on systems, like Direct Upload. A Remove
// Branding add-on (?add=branding:website&shop=<system-key>
// &slug=<SLUG>&addon=1) works the same way at $5/month, first
// month free — any of the 21 folder-app systems, like the banner
// itself: a link naming Store or Cars falls back to a plain line,
// and the checkout insert refuses that line outright (see
// brandingData.js).
// ?shop= is a fresh param on
// purpose: ?system= already opens a tab. A malformed add-on link
// falls back to a plain line, like the ad page's Add to cart.
function DeepLinkCartAdder({ go }) {
  const { addPlan } = useBusinessCart()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    const params = new URLSearchParams(window.location.search)
    const key = params.get('add')
    if (!key || !BUSINESS_PLANS[key]) return
    done.current = true
    if (isKidsExtraPlanKey(key)) addPlan(key, 1, params.get('slug') || '')
    else if (key === CLEAN_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (ADDON_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, cleanSystem: shop, cleanShopSlug: slug, cleanSlug: slug })
      else addPlan(key)
    }
    else if (key === CLEAN_GOLDEN_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (ADDON_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, cleanSystem: shop, cleanShopSlug: slug, cleanSlug: slug })
      else addPlan(key)
    }
    else if (key === CLEAN_DOMAIN_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (ADDON_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, cleanSystem: shop, cleanShopSlug: slug, cleanSlug: slug })
      else addPlan(key)
    }
    else if (key === DIRECT_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (ADDON_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, directSystem: shop, directShopSlug: slug })
      else addPlan(key)
    }
    else if (key === REPORTS_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (REPORTS_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, reportsSystem: shop, reportsShopSlug: slug })
      else addPlan(key)
    }
    else if (key === TV_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (REPORTS_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, tvSystem: shop, tvShopSlug: slug })
      else addPlan(key)
    }
    else if (key === CHAT_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (ADDON_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, chatSystem: shop, chatShopSlug: slug })
      else addPlan(key)
    }
    else if (key === BRANDING_PLAN_KEY && params.get('addon') === '1') {
      const shop = params.get('shop') || ''
      const slug = params.get('slug') || ''
      if (BRANDING_SYSTEMS.has(shop) && slug) addPlan(key, 0, '', { isAddon: true, brandingSystem: shop, brandingShopSlug: slug })
      else addPlan(key)
    }
    else addPlan(key)
    window.history.replaceState(null, '', window.location.pathname)
    go('business-cart')
  }, [])
  return null
}

export default function App() {
  // The admin page has no visible link anywhere: it opens only by
  // typing yently.com/admin (see vercel.json rewrite). A provider
  // form opens the same way, at yently.com/<form name>.
  const [tab, setTab] = useState(() => {
    const path = window.location.pathname.replace(/\/$/, '')
    if (path === '/admin') return 'admin'
    if (path === '/track') return 'track'
    if (path === '/demo-live-chat' || path === '/demo-chat') return 'demo-live-chat'
    if (path === '/direct-upload') return 'direct-upload'
    if (path === '/extra-students') return 'extra-students'
    if (path === '/pass-recovery') return 'pass-recovery'
    if (path === '/agreement') return 'agreement'
    if (path !== '' && path !== '/') return 'provider-form'
    const system = new URLSearchParams(window.location.search).get('system')
    if (system && DEEP_LINK_SYSTEMS.has(system)) return system
    return 'business-hub'
  })
  const [formSlug, setFormSlug] = useState(() => {
    const path = window.location.pathname.replace(/\/$/, '')
    if (path !== '' && path !== '/' && path !== '/admin' && path !== '/track' && path !== '/demo-live-chat' && path !== '/demo-chat' && path !== '/direct-upload' && path !== '/extra-students' && path !== '/pass-recovery' && path !== '/agreement') return decodeURIComponent(path.slice(1))
    return null
  })
  const [providerId, setProviderId] = useState(null)
  const [orderProviderId, setOrderProviderId] = useState(null)
  const [categorySlug, setCategorySlug] = useState(null)
  const [itemId, setItemId] = useState(null)
  // Previous page snapshot, so detail pages can offer a real "← Back"
  // to wherever the customer came from (not always the store).
  const [prev, setPrev] = useState(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [formAuthed, setFormAuthed] = useState(false)
  const moreRef = useRef(null)

  useEffect(() => {
    const close = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // go(tab, param): param carries the store/category for detail, order
  // and category pages (e.g. go('store-detail', 3), go('category', 'meats')).
  const go = (t, param) => {
    setPrev({ tab, providerId, orderProviderId, categorySlug, itemId, formSlug })
    if (t === 'store-detail') setProviderId(param)
    if (t === 'store-order') setOrderProviderId(param)
    if (t === 'category') setCategorySlug(param)
    if (t === 'item-detail') setItemId(param)
    if (t === 'provider-form') setFormSlug(param)
    setTab(t); setMoreOpen(false); setHelpOpen(false)
    if (t === 'store-detail' && param) window.location.hash = 'store/' + param
    // Keep the address bar honest for the hidden routes: entering
    // admin shows /admin, entering a provider form shows /<name>,
    // entering the live-chat demo shows /demo-live-chat, entering
    // order tracking shows /track, entering pass recovery shows
    // /pass-recovery, and leaving any of them returns to /.
    const path = window.location.pathname.replace(/\/$/, '')
    const onAdmin = path === '/admin'
    const onTrack = path === '/track'
    const onDemo = path === '/demo-live-chat' || path === '/demo-chat'
    const onDirect = path === '/direct-upload'
    const onExtra = path === '/extra-students'
    const onPass = path === '/pass-recovery'
    const onAgreement = path === '/agreement'
    const onForm = path !== '' && path !== '/' && !onAdmin && !onTrack && !onDemo && !onDirect && !onExtra && !onPass && !onAgreement
    if (t === 'admin' && !onAdmin) window.history.replaceState(null, '', '/admin')
    else if (t === 'track' && !onTrack) window.history.replaceState(null, '', '/track')
    else if (t === 'demo-live-chat' && !onDemo) window.history.replaceState(null, '', '/demo-live-chat')
    else if (t === 'direct-upload' && !onDirect) window.history.replaceState(null, '', '/direct-upload')
    else if (t === 'extra-students' && !onExtra) window.history.replaceState(null, '', '/extra-students')
    else if (t === 'pass-recovery' && !onPass) window.history.replaceState(null, '', '/pass-recovery')
    else if (t === 'agreement' && !onAgreement) window.history.replaceState(null, '', '/agreement')
    else if (t === 'provider-form' && param && !onForm) window.history.replaceState(null, '', '/' + param)
    else if (t !== 'admin' && t !== 'track' && t !== 'provider-form' && t !== 'demo-live-chat' && t !== 'direct-upload' && t !== 'extra-students' && t !== 'pass-recovery' && t !== 'agreement' && (onAdmin || onTrack || onForm || onDemo || onDirect || onExtra || onPass || onAgreement)) window.history.replaceState(null, '', '/')
  }
  // Back to the page the customer actually came from (or nowhere on a
  // fresh load, in which case pages hide their back link).
  const goBack = prev ? () => {
    setTab(prev.tab); setProviderId(prev.providerId); setOrderProviderId(prev.orderProviderId)
    setCategorySlug(prev.categorySlug); setItemId(prev.itemId); setFormSlug(prev.formSlug); setMoreOpen(false)
    if (prev.tab === 'store-detail' && prev.providerId) window.location.hash = 'store/' + prev.providerId
    else if (window.location.hash) window.location.hash = ''
  } : null

  useEffect(() => {
    const m = window.location.hash.match(/^#store\/(.+)$/)
    if (m) { setProviderId(decodeURIComponent(m[1])); setTab('store-detail') }
  }, [])

  const GROCERY_TABS = ['grocery-cart', 'lunches', 'meats', 'grocery-contact', 'stores', 'store-detail', 'store-order', 'category', 'products', 'bags', 'item-detail', 'shop-seller', 'shop-seller-soon', 'shop-hub']
  const BUSINESS_TABS = ['business-hub', 'restaurants', 'pos', 'barbers', 'dealer', 'employee', 'bodyshop', 'houses', 'doctor', 'holiday', 'rentals', 'laundry', 'gym', 'simple-barbershop', 'tv-gallery', 'live-chat', 'clean-link', 'direct-upload', 'reports', 'branding', 'demo-live-chat', 'business-cart', 'services']
  const KIDS_TABS = ['kids-hub', 'kids-math', 'kids-english', 'kids-arabic', 'kids-french', 'kids-spanish', 'kids-science', 'kids-geography', 'kids-coding', 'kids-reading', 'kids-books']
  const inBusiness = BUSINESS_TABS.includes(tab)
  const inCars = ['cars', 'sell', 'contact', 'car-seller', 'car-seller-soon', 'cars-hub'].includes(tab)
  const inFlights = ['flights', 'flights-hub', 'reserve', 'flight-pay', 'flight-contact'].includes(tab)
  // "More" holds Help Center (Guides, Pass Recovery) + Track Order +
  // About Us. Custom Coding moved to the Systems submenu (BusinessMenu),
  // between More Systems and Add-ons — the Systems button stays
  // highlighted while on the Custom Coding page. Cars is a top-level
  // button now, and Yently Kids moved to Systems.
  const inMore = ['about', 'guides', 'pass-recovery', 'agreement', 'track', 'clothes'].includes(tab)

  return (
    <div className="app">
      <header className="header">
        <div className="header-row">
        <div className="brand">
          <img className="brand-logo" src={logoUrl} alt="Yently" />
          <span className="tagline">Everything you need, <span className="slogan-word"><span className="slogan-g">g</span><span className="slogan-y">y</span><span className="slogan-ently">ently</span></span> in one place</span>
        </div>
        <div className="header-right">
          <nav>
            <button className={inBusiness ? 'active' : ''} onClick={() => go('business-hub')}>Systems</button>
            <button className={inFlights ? 'active' : ''} onClick={() => go('flights-hub')}>Flights</button>
            <button className={GROCERY_TABS.includes(tab) ? 'active' : ''} onClick={() => go('shop-hub')}>Shop</button>
            <button className={inCars ? 'active' : ''} onClick={() => go('cars-hub')}>Cars</button>
            <span className="dropdown" ref={moreRef}>
              <button className={inMore ? 'active' : ''} onClick={() => setMoreOpen(o => !o)}>More ▾</button>
              {moreOpen && (
                <span className="dropdown-menu">
                  <a onClick={() => setHelpOpen(o => !o)}>Help Center {helpOpen ? '▾' : '▸'}</a>
                  {helpOpen && (
                    <>
                      <a style={{ paddingLeft: 28 }} onClick={() => go('guides')}>Guides</a>
                      <a style={{ paddingLeft: 28 }} onClick={() => go('pass-recovery')}>Pass Recovery</a>
                      <a style={{ paddingLeft: 28 }} onClick={() => go('agreement')}>Customer Agreement</a>
                    </>
                  )}
                  <a onClick={() => go('track')}>Track Order</a>
                  <a onClick={() => go('about')}>About Us</a>
                </span>
              )}
            </span>
          </nav>
          <div className="lang-row" aria-label="Language">
            <a className="lang active" href="https://yently.com">En</a>
            <span className="lang soon" title="Coming soon">Fr</span>
            <span className="lang soon" title="Coming soon">Ar</span>
            <span className="lang soon" title="Coming soon">Es</span>
            <span className="lang soon" title="Coming soon">De</span>
            <span className="lang soon" title="Coming soon">It</span>
            <span className="lang soon" title="Coming soon">Pt</span>
            <span className="lang soon" title="Coming soon">Nl</span>
          </div>
        </div>
        </div>
        <div className="announce-bar">Business systems, flight tickets, and shopping — all in one place.</div>
      </header>
      <main className="main">
        {tab === 'cars' && <CarSection go={go} />}
        {tab === 'cars-hub' && <CarHubPage go={go} />}
        {tab === 'sell' && <SellPage go={go} />}
        {tab === 'car-seller' && <CarSellerFormPage go={go} />}
        {tab === 'car-seller-soon' && <CarSellerSoonPage go={go} />}
        {tab === 'contact' && <ContactPage go={go} />}
        {tab === 'flights' && <FlightSection go={go} />}
        {tab === 'flights-hub' && <FlightsHubPage go={go} />}
        {tab === 'reserve' && <FlightReservationPage go={go} />}
        {tab === 'flight-pay' && <FlightPayPage go={go} />}
        {tab === 'flight-contact' && <FlightContactPage go={go} />}
        {GROCERY_TABS.includes(tab) && (
          <CartProvider>
            {tab === 'shop-hub' && <ShopHubPage go={go} />}
            {tab === 'grocery-cart' && <GroceryCartPage go={go} />}
            {tab === 'lunches' && (
              <GrocerySoonPage go={go} title="Lunches & Snacks" emoji="🥪" topic="Lunches/Snacks"
                intro="Quick bites, packed lunches and snacks are on the way — fresh, ready to grab, and delivered or ready for pickup like everything else in the Groceries shop."
                items={['Sandwiches & wraps made fresh', 'Salads & lunch bowls', 'Chips, nuts & trail mixes', 'Cookies & sweet treats', 'Juices & drinks']} />
            )}
            {tab === 'meats' && (
              <GrocerySoonPage go={go} title="Meats" emoji="🥩" topic="Meats"
                intro="Quality fresh meats are coming to the shop — beef, chicken, lamb and more, cut and packed to order with the same delivery and pickup options."
                items={['Fresh beef cuts', 'Chicken — whole & parts', 'Lamb & goat', 'Ground meats', 'Marinated & ready-to-cook', 'Halal options']} />
            )}
            {tab === 'grocery-contact' && <GroceryContactPage go={go} />}
            {tab === 'stores' && <ProvidersPage go={go} onShop={(id) => go('store-order', id)} onView={(id) => go('store-detail', id)} />}
            {tab === 'store-detail' && <ProviderPage providerId={providerId} go={go} goBack={goBack} />}
            {tab === 'store-order' && <StoreOrderPage providerId={orderProviderId} go={go} goBack={goBack} />}
            {tab === 'products' && <ProductsPage go={go} />}
            {tab === 'bags' && <BagsPage go={go} />}
            {tab === 'category' && <CategoryPage slug={categorySlug} go={go} />}
            {tab === 'item-detail' && <ItemDetailPage itemId={itemId} go={go} goBack={goBack} />}
            {tab === 'shop-seller' && <ShopSellerFormPage go={go} />}
            {tab === 'shop-seller-soon' && <ShopSellerSoonPage go={go} />}
          </CartProvider>
        )}
        {BUSINESS_TABS.includes(tab) && (
          <BusinessCartProvider>
            <DeepLinkCartAdder go={go} />
            {tab === 'business-hub' && <BusinessSystemsPage go={go} />}
            {tab === 'restaurants' && <RestaurantsPage go={go} />}
            {tab === 'pos' && <PosPage go={go} />}
            {tab === 'barbers' && <BarbersPage go={go} />}
            {tab === 'dealer' && <DealerPage go={go} />}
            {tab === 'employee' && <EmployeePage go={go} />}
            {tab === 'bodyshop' && <BodyshopPage go={go} />}
            {tab === 'houses' && <HousesPage go={go} />}
            {tab === 'doctor' && <DoctorPage go={go} />}
            {tab === 'holiday' && <HolidayPage go={go} />}
            {tab === 'rentals' && <RentalsPage go={go} />}
            {tab === 'laundry' && <LaundryPage go={go} />}
            {tab === 'gym' && <GymPage go={go} />}
            {tab === 'simple-barbershop' && <SimpleBarbershopPage go={go} />}
            {tab === 'tv-gallery' && <TvGalleryPage go={go} />}
            {tab === 'live-chat' && <LiveChatPage go={go} />}
            {tab === 'clean-link' && <CleanLinkPage go={go} />}
            {tab === 'direct-upload' && <DirectUploadPage go={go} />}
            {tab === 'reports' && <ReportsPage go={go} />}
      {tab === 'branding' && <BrandingPage go={go} />}
            {tab === 'demo-live-chat' && <LiveChatDemo go={go} />}
            {tab === 'business-cart' && <BusinessCartPage go={go} />}
            {tab === 'services' && <ServicesPage go={go} />}
          </BusinessCartProvider>
        )}
        {KIDS_TABS.includes(tab) && (
          <BusinessCartProvider>
            <DeepLinkCartAdder go={go} />
            {tab === 'kids-hub' && <KidsHubPage go={go} />}
            {tab === 'kids-math' && <KidsMathPage go={go} />}
            {tab === 'kids-english' && <KidsEnglishPage go={go} />}
            {tab === 'kids-arabic' && <KidsArabicPage go={go} />}
            {tab === 'kids-french' && <KidsFrenchPage go={go} />}
            {tab === 'kids-spanish' && <KidsSpanishPage go={go} />}
            {tab === 'kids-science' && <KidsSciencePage go={go} />}
            {tab === 'kids-geography' && <KidsGeographyPage go={go} />}
            {tab === 'kids-coding' && <KidsCodingPage go={go} />}
            {tab === 'kids-reading' && <KidsReadingPage go={go} />}
            {tab === 'kids-books' && <BooksForKidsPage go={go} />}
          </BusinessCartProvider>
        )}
        {tab === 'extra-students' && (
          <BusinessCartProvider>
            <ExtraStudentsPage go={go} />
          </BusinessCartProvider>
        )}
        {tab === 'clothes' && <ClothesPage />}
        {tab === 'about' && <AboutPage />}
        {tab === 'guides' && <GuidesPage go={go} />}
        {tab === 'admin' && <AdminPage />}
        {tab === 'track' && <TrackingPage go={go} />}
        {tab === 'pass-recovery' && <PassRecoveryPage go={go} />}
        {tab === 'agreement' && <AgreementPage go={go} />}
        {tab === 'provider-form' && <ProviderFormPage slug={formSlug} goBack={goBack} onAuthedChange={setFormAuthed} go={go} />}
      </main>
      <footer className="footer">
        <p>Yently — Everything you need, gently in one place.</p>
        <p><button type="button" className="link-btn" style={{ fontSize: 14 }} onClick={() => go('track')}>Track your order</button></p>
      </footer>
      {!(tab === 'provider-form' && formAuthed) && tab !== 'demo-live-chat' && <ChatWidget />}
    </div>
  )
}
