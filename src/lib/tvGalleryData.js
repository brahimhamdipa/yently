import { submitAndNotify } from './notify'
import { addonSystemLabel, TV_SYSTEM_OPTIONS } from './addonSystems'
import { supabase } from './supabaseClient'

// Data layer for TV Gallery orders. Mirrors insertReportsOrder /
// insertDirectUploadOrder: the order row is insert-only for
// visitors (customer PII), and placing it emails the owner, who
// flips the switch on in Admin → TV Gallery → Switches once they
// have paid. No payment is taken here. The customer then uploads
// their own pictures from their Setup page — no upload form is
// created by hand: the gallery lives in the tv_gallery table,
// one row per shop (see getTvGallery / tv_gallery_save).
//
// TV Gallery is no longer sold on its own: it is exactly like
// Reports — the customer picks the system and page name in the
// form on the ad page, or adds it from the Add-ons section in
// their Setup page. The shop the gallery is for (system,
// shop_slug) travels with the order. The ad page's Add to cart
// button saves it to localStorage (meta) — the button is
// disabled until the system and page name are filled in above
// it — and this insert reads it back from there; a Setup add-on
// line carries it on the cart line itself (see businessData.js,
// isTvAddon). A line whose system is STILL unknown after merging
// all three sources is refused outright: Yently must know which
// page the gallery is for before the order is placed, so the
// customer is told to pick their system on the TV Gallery page
// first.
//
// TV Gallery is for the 12 Business Systems ONLY — never Yently
// Kids schools, Store sellers or Car sellers. A line naming one
// of those is refused outright too, even when its system is
// known: the gallery, the switch and the dropdown all exclude
// them, so a line for one can only arrive from a hand-built link
// or a stale cart, and it must never reach checkout.
//
// The system + slug go in the NOTE and in emailExtras, not on
// the order row: tv_gallery_order has only the 8 standard
// columns (id, customer_name, customer_email, customer_phone,
// plan, price, note, created_at), so writing them would fail the
// insert. The admin reads them from the order and flips the
// switch by hand in Admin → TV Gallery → Switches; nothing here
// flips a switch by itself.
const META_KEY = 'tv-gallery-meta'

export function saveTvGalleryMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})) } catch (e) {}
}

export function readTvGalleryMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {} } catch (e) { return {} }
}

export function clearTvGalleryMeta() {
  try { localStorage.removeItem(META_KEY) } catch (e) {}
}

// The 12 Business Systems TV Gallery covers, as keys — for the
// gallery link ('tv-<system>-<slug>') and the display page.
export const TV_GALLERY_SYSTEMS = TV_SYSTEM_OPTIONS.map((o) => o.value)

// The gallery link for a shop — built from the system and the
// shop slug, no form name to remember: yently.com/tv-<system>-<slug>.
// Shown in the shop's Setup page once the switch is on.
export function tvGalleryLink(system, shopSlug) {
  return `/tv-${system}-${shopSlug}`
}

// Read one shop's gallery (pictures + message + whether the
// switch is on). Public — the gallery page is public, the link is
// the privacy, same as the old upload-form link. The shop's own
// Setup page reads it too, to manage the pictures.
export async function getTvGallery(ownerType, ownerKey) {
  const { data, error } = await supabase.rpc('tv_gallery_get', { p_owner_type: ownerType, p_owner_key: ownerKey })
  if (error) throw error
  return data || { pics: [], message: '', enabled: false, exists: false }
}

// Systems TV Gallery never covers: the 9 Yently Kids subjects
// plus the Store and Cars seller pages (they have no folder-app
// Setup page and no upload form for the gallery to show).
const TV_EXCLUDED_SYSTEMS = new Set([
  'store',
  'car-seller',
  'kids-math',
  'kids-english',
  'kids-arabic',
  'kids-french',
  'kids-spanish',
  'kids-science',
  'kids-geography',
  'kids-coding',
  'kids-reading',
])

export async function insertTvGalleryOrder(data, emailExtras) {
  const meta = readTvGalleryMeta()
  const fromAddon = emailExtras && emailExtras.isTvAddon
  const system = (fromAddon && emailExtras.system) || data.system || meta.system || null
  const shopSlug = (fromAddon && emailExtras.shop_slug) || data.shop_slug || meta.shop_slug || null
  if (!system) {
    throw new Error('Yently needs to know which page the TV gallery is for — pick your system on the TV Gallery page first, then add it to your cart again.')
  }
  if (TV_EXCLUDED_SYSTEMS.has(system)) {
    throw new Error('TV Gallery is for Business Systems only — Yently Kids schools, Store sellers and Car sellers cannot order it. Pick one of the 12 Business Systems on the TV Gallery page first, then add it to your cart again.')
  }
  const label = (fromAddon && emailExtras.systemLabel) || addonSystemLabel(system)
  // The Setup add-on path already wrote this line into the note in
  // businessData.js — only the ad-page (meta) path needs it here.
  const noteLine = fromAddon
    ? null
    : `TV Gallery for ${label} "${shopSlug}" — free for the rest of this month; new monthly amount $2/month starts with the next payment. First month free.`
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
      new_monthly_total: 'New monthly amount: $2/month — starts with the next payment; free for the rest of this month. First month free.',
    } : {}),
  }
  // A TV Gallery add-on (from a shop's Setup page) gets its own
  // owner-email subject naming the system, so the owner sees at a
  // glance which page the gallery is for. The ad-page flow is
  // unchanged: no isTvAddon flag, same subject as before.
  const subject = fromAddon
    ? `TV Gallery — ${emailExtras.systemLabel || label} — ${data.customer_name}`
    : `New TV Gallery order — ${data.customer_name}`
  const placed = await submitAndNotify({
    table: 'tv_gallery_order',
    data: row,
    subject,
    emailExtras: extras,
  })
  clearTvGalleryMeta()
  return placed
}
