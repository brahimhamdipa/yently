// Shown instead of a system — its ad page, its TV gallery route, or
// its folder-app route — when Yently has switched that system Off in
// Admin → menu 4 → Systems On/Off. The whole system is down; nothing
// works for customers while it is off.
export default function SystemUnavailable({ name, go }) {
  return (
    <div>
      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h2>This system is currently unavailable</h2>
        <p>Yently has switched{name ? ` the ${name} system` : ' this system'} off for now — please check back later, or contact Yently if you need help.</p>
        <button type="button" onClick={() => go && go('business-hub')}>Back to Systems</button>
      </div>
    </div>
  )
}
