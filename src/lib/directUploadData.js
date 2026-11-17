import { submitAndNotify } from './notify'

// Data layer for Direct Upload orders. Mirrors insertCleanLinkOrder /
// insertTvGalleryOrder / insertLiveChatOrder: the order row is
// insert-only for visitors (customer PII), and placing it emails the
// owner. No payment is taken here.
//
// Unlike Clean Link, there is no per-order meta to carry: the
// request (direct_upload_requests) already told Yently which shop
// the add-on is for, so the order is just the plan itself. The
// admin switches Direct Upload on for that shop in Admin (Direct
// Upload Orders), and from then on the shop's uploads go live
// straight away.
//
// A Direct Upload add-on ordered from a shop's Setup page carries
// its system + slug in the order NOTE and in emailExtras (see
// businessData.js) — direct_upload_order has no system / shop_slug
// columns, so they are not on the row. The admin reads them from
// the order and flips the switch by hand in Admin → Direct Upload
// → Switches; nothing here flips a switch by itself.
export async function insertDirectUploadOrder(data, emailExtras) {
  // A Direct Upload add-on (from a shop's Setup page) gets its own
  // owner-email subject naming the system, so the owner sees at a
  // glance which page the switch is for. The ad-page flow is
  // unchanged: no isDirectAddon flag, same subject as before.
  const subject = emailExtras && emailExtras.isDirectAddon
    ? `Direct Upload — ${emailExtras.systemLabel || 'Direct Upload'} — ${data.customer_name}`
    : `New Direct Upload order — ${data.customer_name}`
  return submitAndNotify({
    table: 'direct_upload_order',
    data,
    subject,
    emailExtras,
  })
}
