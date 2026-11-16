import { submitAndNotify } from './notify'

// Data layer for Kids Spanish page orders. Mirrors
// insertTvGalleryOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then creates
// the customer's school page and link by hand. No payment is taken here.
export async function insertKidsSpanishOrder(data, emailExtras) {
  return submitAndNotify({
    table: 'kids_spanish_order',
    data,
    // Cart checkout for an Extra Students line passes
    // emailExtras.isExtraStudents (see businessData.js): the row
    // is still a Kids Spanish order, but the owner email must read
    // as an Extra Students request, not a new school order — the
    // same subject the direct /extra-students page already uses.
    subject: (emailExtras && emailExtras.isExtraStudents)
      ? `Extra Students — Spanish — ${data.customer_name}`
      : `New Kids Spanish order — ${data.customer_name}`,
    emailExtras,
  })
}
