import { submitAndNotify } from './notify'

// Data layer for Kids Reading page orders. Mirrors
// insertTvGalleryOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then creates
// the customer's school page and link by hand. No payment is taken here.
export async function insertKidsReadingOrder(data, emailExtras) {
  return submitAndNotify({
    table: 'kids_reading_order',
    data,
    // Cart checkout for an Extra Students line passes
    // emailExtras.isExtraStudents (see businessData.js): the row
    // is still a Kids Reading order, but the owner email must read
    // as an Extra Students request, not a new school order — the
    // same subject the direct /extra-students page already uses.
    subject: (emailExtras && emailExtras.isExtraStudents)
      ? `Extra Students — Reading — ${data.customer_name}`
      : `New Kids Reading order — ${data.customer_name}`,
    emailExtras,
  })
}
