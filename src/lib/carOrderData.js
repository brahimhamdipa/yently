import { submitAndNotify } from './notify'

// Data layer for Cars selling orders (the two-path model: one-time
// $5 per car, or YENTLY seller $20/month first month free). Mirrors
// insertDealerOrder: the order row is insert-only for visitors
// (customer PII), and placing it emails the owner, who then creates
// the seller (or matches the $5 fee to the seller's next listing) by
// hand. No payment is taken here.
export async function insertCarOrder(data, emailExtras) {
  return submitAndNotify({
    table: 'car_order',
    data,
    subject: `New car order — ${data.customer_name}`,
    emailExtras,
  })
}
