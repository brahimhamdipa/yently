import { submitAndNotify } from './notify'
import { addonSystemLabel } from './addonSystems'

// Data layer for Direct Upload orders. Mirrors insertCleanLinkOrder /
// insertTvGalleryOrder / insertLiveChatOrder: the order row is
// insert-only for visitors (customer PII), and placing it emails
// the owner. No payment is taken here.
//
// The shop the switch is for (system, shop_slug) travels with the
// order. The ad page's Add to cart button saves it to localStorage
// (meta) — the button is disabled until the system and page name
// are filled in above it — and this insert reads it back from
// there; a Setup add-on line carries it on the cart line itself
// (see businessData.js, isDirectAddon). A line whose system is
// STILL unknown after merging all three sources is refused
// outright: Yently must know which page the switch is for before
// the order is placed, so the customer is told to pick their
// system on the Direct Upload page first.
//
// The system + slug go in the NOTE and in emailExtras, not on the
// order row: direct_upload_order has no system / shop_slug columns
// (its DDL was never in the repo — see AdminAllOrders.jsx), so
// writing them would fail the insert. The admin reads them from
// the order and flips the switch by hand in Admin → Direct Upload
// → Switches; nothing here flips a switch by itself.
const META_KEY = 'direct-upload-meta'

export function saveDirectUploadMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})) } catch (e) {}
}

export function readDirectUploadMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {} } catch (e) { return {} }
}

export function clearDirectUploadMeta() {
  try { localStorage.removeItem(META_KEY) } catch (e) {}
}

export async function insertDirectUploadOrder(data, emailExtras) {
  const meta = readDirectUploadMeta()
  const fromAddon = emailExtras && emailExtras.isDirectAddon
  const system = (fromAddon && emailExtras.system) || data.system || meta.system || null
  const shopSlug = (fromAddon && emailExtras.shop_slug) || data.shop_slug || meta.shop_slug || null
  if (!system) {
    throw new Error('Yently needs to know which page Direct Upload is for — pick your system on the Direct Upload page first, then add it to your cart again.')
  }
  const label = (fromAddon && emailExtras.systemLabel) || addonSystemLabel(system)
  // The Setup add-on path already wrote this line into the note in
  // businessData.js — only the ad-page (meta) path needs it here.
  const noteLine = fromAddon
    ? null
    : `Direct Upload for ${label} "${shopSlug}" — free for the rest of this month; new monthly amount $5/month starts with the next payment.`
  const row = {
    ...data,
    note: noteLine ? (data.note ? `${data.note}\n${noteLine}` : noteLine) : data.note,
  }
  const extras = {
    ...(emailExtras || {}),
    // The ad-page path carries no system in emailExtras yet — add
    // it so the owner email names the page, like the add-on path.
    ...(!fromAddon ? {
      system,
      systemLabel: label,
      shop_slug: shopSlug,
      new_monthly_total: 'New monthly amount: $5/month — starts with the next payment; free for the rest of this month.',
    } : {}),
  }
  // A Direct Upload add-on (from a shop's Setup page) gets its own
  // owner-email subject naming the system, so the owner sees at a
  // glance which page the switch is for. The ad-page flow is
  // unchanged: no isDirectAddon flag, same subject as before.
  const subject = fromAddon
    ? `Direct Upload — ${emailExtras.systemLabel || label} — ${data.customer_name}`
    : `New Direct Upload order — ${data.customer_name}`
  const placed = await submitAndNotify({
    table: 'direct_upload_order',
    data: row,
    subject,
    emailExtras: extras,
  })
  clearDirectUploadMeta()
  return placed
}
