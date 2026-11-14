import { submitAndNotify } from './notify'

// Data layer for gym website orders. Mirrors
// insertLaundryOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then creates
// the gym's link and login by hand. No payment is taken here.
export async function insertGymOrder(data, emailExtras) {
  return submitAndNotify({
    table: 'gym_order',
    data,
    subject: `New gym order — ${data.customer_name}`,
    emailExtras,
  })
}
