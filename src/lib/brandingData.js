import { submitAndNotify } from './notify'
import { addonSystemLabel } from './addonSystems'

// Data layer for Remove Branding orders. Mirrors insertReportsOrder:
// the order row is insert-only for visitors (customer PII), and
// placing it emails the owner. No payment is taken here.
//
// The shop the removal is for (system, shop_slug) travels with
// the order. The ad page's Add to cart button saves it to
// localStorage (meta) — the button is disabled until the system
// and page name are filled in above it — and this insert reads it
// back from there; a Setup add-on line carries it on the cart line
// itself (see businessData.js, isBrandingAddon). A line whose system
// is STILL unknown after merging all three sources is refused
// outright: Yently must know which page the banner comes off
// before the order is placed, so the customer is told to pick their
// system on the Remove Branding page first.
//
// Remove Branding is for the 21 folder-app systems ONLY — the 12
// Business Systems plus the 9 Yently Kids subjects. Store sellers
// and Car sellers are NOT here: they have no folder-app page and
// no "Powered by Yently" banner to remove. A line naming one of
// those is refused outright too, even when its system is known:
// the banner, the switch and the dropdown all exclude them, so a
// line for one can only arrive from a hand-built link or a stale
// cart, and it must never reach checkout.
//
// The system + slug go in the NOTE and in emailExtras, not on the
// order row: branding_order has only the 8 standard columns (id,
// customer_name, customer_email, customer_phone, plan, price,
// note, created_at), so writing them would fail the insert. The
// admin reads them from the order and flips the switch by hand in
// Admin → Remove Branding → Switches; nothing here flips a switch
// by itself.
const META_KEY = 'branding-meta'

export function saveBrandingMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})) } catch (e) {}
}

export function readBrandingMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {} } catch (e) { return {} }
}

export function clearBrandingMeta() {
  try { localStorage.removeItem(META_KEY) } catch (e) {}
}

// Systems Remove Branding never covers: the Store and Cars seller
// pages (they have no folder-app page and no banner to remove).
const BRANDING_EXCLUDED_SYSTEMS = new Set([
  'store',
  'car-seller',
])

export async function insertBrandingOrder(data, emailExtras) {
  const meta = readBrandingMeta()
  const fromAddon = emailExtras && emailExtras.isBrandingAddon
  const system = (fromAddon && emailExtras.system) || data.system || meta.system || null
  const shopSlug = (fromAddon && emailExtras.shop_slug) || data.shop_slug || meta.shop_slug || null
  if (!system) {
    throw new Error('Yently needs to know which page Remove Branding is for — pick your system on the Remove Branding page first, then add it to your cart again.')
  }
  if (BRANDING_EXCLUDED_SYSTEMS.has(system)) {
    throw new Error('Remove Branding is for system pages only — Store sellers and Car sellers have no banner to remove. Pick one of the 21 systems on the Remove Branding page first, then add it to your cart again.')
  }
  const label = (fromAddon && emailExtras.systemLabel) || addonSystemLabel(system)
  // The Setup add-on path already wrote this line into the note in
  // businessData.js — only the ad-page (meta) path needs it here.
  const noteLine = fromAddon
    ? null
    : `Remove Branding for ${label} "${shopSlug}" — free for the rest of this month; new monthly amount $5/month starts with the next payment. First month free.`
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
      new_monthly_total: 'New monthly amount: $5/month — starts with the next payment; free for the rest of this month. First month free.',
    } : {}),
  }
  // A Remove Branding add-on (from a shop's Setup page) gets its
  // own owner-email subject naming the system, so the owner sees
  // at a glance which page the switch is for. The ad-page flow is
  // unchanged: no isBrandingAddon flag, same subject as before.
  const subject = fromAddon
    ? `Remove Branding — ${emailExtras.systemLabel || label} — ${data.customer_name}`
    : `New Remove Branding order — ${data.customer_name}`
  const placed = await submitAndNotify({
    table: 'branding_order',
    data: row,
    subject,
    emailExtras: extras,
  })
  clearBrandingMeta()
  return placed
}
