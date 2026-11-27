// Shown instead of a system — its ad page, its TV gallery route, or
// its folder-app route — when Yently has switched that system Off in
// Admin → menu 4 → Systems On/Off. The whole system is down; nothing
// works for customers while it is off.
//
// title/detail let a caller show the shop-level version instead
// (Admin → menu 4 → Shops On/Off): one shop down while its system
// stays up. Both are optional — without them the output is exactly
// what it was before, so existing callers are untouched.
export default function SystemUnavailable({ name, go, title, detail }) {
  return (
    <div>
      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h2>{title || 'This system is currently unavailable'}</h2>
        <p>{detail || <>Yently has switched{name ? ` the ${name} system` : ' this system'} off for now — please check back later, or contact Yently if you need help.</>}</p>
        <button type="button" onClick={() => go && go('business-hub')}>Back to Systems</button>
      </div>
    </div>
  )
}
