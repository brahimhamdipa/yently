import { submitAndNotify } from './notify'
import { addonSystemLabel } from './addonSystems'

// Data layer for Live Chat page orders. Mirrors
// insertTvGalleryOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then adds
// the chat bubble to the customer's website and sets up the owner
// login by hand. No payment is taken here.
//
// The page the chat is for (system, shop_slug) travels with the
// order. The ad page's Add to cart button saves it to localStorage
// (meta) — the button is disabled until the system and page name
// are filled in above it — and this insert reads it back from
// there; a Setup add-on line carries it on the cart line itself
// (see businessData.js, isChatAddon). A line whose system is
// STILL unknown after merging all three sources is refused
// outright: Yently must know which page the chat is for before
// the order is placed, so the customer is told to pick their
// system on the Live Chat page first.
//
// The system + slug go in the NOTE and in emailExtras, not on the
// order row: live_chat_order has no system / shop_slug columns, so
// writing them would fail the insert. The admin reads them from
// the order and switches chat on for that page in Admin.
const META_KEY = 'live-chat-meta'

export function saveLiveChatMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta || {})) } catch (e) {}
}

export function readLiveChatMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY)) || {} } catch (e) { return {} }
}

export function clearLiveChatMeta() {
  try { localStorage.removeItem(META_KEY) } catch (e) {}
}

export async function insertLiveChatOrder(data, emailExtras) {
  const meta = readLiveChatMeta()
  const fromAddon = emailExtras && emailExtras.isChatAddon
  const system = (fromAddon && emailExtras.system) || data.system || meta.system || null
  const shopSlug = (fromAddon && emailExtras.shop_slug) || data.shop_slug || meta.shop_slug || null
  if (!system) {
    throw new Error('Yently needs to know which page live chat is for — pick your system on the Live Chat page first, then add it to your cart again.')
  }
  const label = (fromAddon && emailExtras.systemLabel) || addonSystemLabel(system)
  // The Setup add-on path already wrote this line into the note in
  // businessData.js — only the ad-page (meta) path needs it here.
  const noteLine = fromAddon
    ? null
    : `Live Chat for ${label} "${shopSlug}" — free for the rest of this month; new monthly amount $3/month starts with the next payment.`
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
      new_monthly_total: 'New monthly amount: $3/month — starts with the next payment; free for the rest of this month.',
    } : {}),
  }
  // A Live Chat add-on (from a shop's Setup page) gets its own
  // owner-email subject naming the system, so the owner sees at a
  // glance which page the chat is for. The ad-page flow is
  // unchanged: no isChatAddon flag, same subject as before.
  const subject = fromAddon
    ? `Live Chat — ${emailExtras.systemLabel || label} — ${data.customer_name}`
    : `New Live Chat order — ${data.customer_name}`
  const placed = await submitAndNotify({
    table: 'live_chat_order',
    data: row,
    subject,
    emailExtras: extras,
  })
  clearLiveChatMeta()
  return placed
}
