import { submitAndNotify } from './notify'

// Data layer for Kids Geography page orders. Mirrors
// insertTvGalleryOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then creates
// the customer's school page and link by hand. No payment is taken here.
export async function insertKidsGeographyOrder(data, emailExtras) {
  return submitAndNotify({
    table: 'kids_geography_order',
    data,
    // Cart checkout for an Extra Students line passes
    // emailExtras.isExtraStudents (see businessData.js): the row
    // is still a Kids Geography order, but the owner email must read
    // as an Extra Students request, not a new school order — the
    // same subject the direct /extra-students page already uses.
    subject: (emailExtras && emailExtras.isExtraStudents)
      ? `Extra Students — Geography — ${data.customer_name}`
      : `New Kids Geography order — ${data.customer_name}`,
    emailExtras,
  })
}
