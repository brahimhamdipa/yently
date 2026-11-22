import { submitAndNotify } from './notify'
import { addonSystemLabel } from './addonSystems'

// Data layer for Clean Link orders — all three types (Clean Link,
// Golden Link, Your Own Domain). Mirrors insertTvGalleryOrder /
// insertLiveChatOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then
// activates the clean link (activate_clean_link RPC) by hand — or,
// for a Golden Link or Your Own Domain, sets it up by hand, because
// those two are not switched on by the RPC. No payment is taken
// here.
//
// The shop the link is for (system, shop_slug, clean_slug) travels
// with the order. The ad page's request form passes it in directly;
// the cart line carries it for Setup add-on lines (see
// businessData.js). The ad page's Add to cart button saves it to
// localStorage (meta), and this insert reads it back from there.
// A line whose system is STILL unknown after merging all three
// sources is refused outright: Yently must know which page the
// link is for before the order is placed, so the customer is told
// to pick their system on the Clean Link page first.
const META_KEY = 'clean-link-meta'

export function saveCleanLinkMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})) } catch (e) {}
}

export function readCleanLinkMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {} } catch (e) { return {} }
}

export function clearCleanLinkMeta() {
  try { localStorage.removeItem(META_KEY) } catch (e) {}
}

export async function insertCleanLinkOrder(data, emailExtras) {
  const meta = readCleanLinkMeta()
  const system = data.system || meta.system || null
  const shopSlug = data.shop_slug || meta.shop_slug || null
  const cleanSlug = data.clean_slug || meta.clean_slug || null
  if (!system) {
    throw new Error('Yently needs to know which page this link is for — pick your system on the Clean Link page first, then add it to your cart again.')
  }
  // The plan name rides on the cart line (data.plan) for cart
  // orders; the request form passes it directly too. The meta's
  // linkType (the plan key) is only the fallback for a line that
  // somehow arrives with neither.
  const LINK_TYPE_NAMES = { 'clean:website': 'Clean Link', 'clean:golden': 'Golden Link', 'clean:domain': 'Your Own Domain' }
  const planName = data.plan || LINK_TYPE_NAMES[meta.linkType] || 'Clean Link'
  const row = {
    ...data,
    plan: planName,
    system,
    shop_slug: shopSlug,
    clean_slug: cleanSlug,
  }
  // A Clean Link add-on (from a shop's Setup page) gets its own
  // owner-email subject naming the type and the system, so the owner
  // sees at a glance which page the link is for. The ad-page flow
  // is unchanged: no isCleanAddon flag, same subject shape as before.
  const subject = emailExtras && emailExtras.isCleanAddon
    ? `${planName} — ${emailExtras.systemLabel || addonSystemLabel(system)} — ${data.customer_name}`
    : `New ${planName} order — ${data.customer_name}`
  const placed = await submitAndNotify({
    table: 'clean_link_order',
    data: row,
    subject,
    emailExtras,
  })
  clearCleanLinkMeta()
  return placed
}
