import { submitAndNotify } from './notify'

// Data layer for Clean Link orders. Mirrors insertTvGalleryOrder /
// insertLiveChatOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then
// activates the clean link (activate_clean_link RPC) by hand.
// No payment is taken here.
//
// The shop the link is for (system, shop_slug, clean_slug) travels
// with the order. The ad page's request form passes it in directly.
// The shared Business cart has no per-item slot for it, so the ad
// page saves it to localStorage when the customer adds the plan to
// the cart, and this insert reads it back from there.
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
  const row = {
    ...data,
    system: data.system || meta.system || null,
    shop_slug: data.shop_slug || meta.shop_slug || null,
    clean_slug: data.clean_slug || meta.clean_slug || null,
  }
  // A Clean Link add-on (from a shop's Setup page) gets its own
  // owner-email subject naming the system, so the owner sees at a
  // glance which page the link is for. The ad-page flow is
  // unchanged: no isCleanAddon flag, same subject as before.
  const subject = emailExtras && emailExtras.isCleanAddon
    ? `Clean Link — ${emailExtras.systemLabel || 'Clean Link'} — ${data.customer_name}`
    : `New Clean Link order — ${data.customer_name}`
  const placed = await submitAndNotify({
    table: 'clean_link_order',
    data: row,
    subject,
    emailExtras,
  })
  clearCleanLinkMeta()
  return placed
}
