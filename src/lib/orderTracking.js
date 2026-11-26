import { supabase } from './supabaseClient'

// Order tracking hooks — creates the tracking row at order time and
// hands the code back for the success screens.
//
// The per-plan order inserts go through submitAndNotify, which does a
// plain insert with NO .select() (the order tables are insert-only for
// visitors, so the new row's id never comes back to the client). The
// create_order_tracking RPC resolves the order id server-side instead:
// when p_order_id is null it finds the newest matching order row
// (same table, same customer_email + plan, created in the last
// 10 minutes, not already tracked); when given it verifies the row
// exists; on conflict it returns the existing code.
//
// SAFETY RULE: tracking must NEVER break checkout. createOrderTracking
// never throws — every failure path (RPC missing / not deployed yet,
// network error, server error, bad return) logs a console.warn and
// returns null, and the caller still places/shows the order with no
// code. The order itself always succeeds even if tracking fails.

// Plan key -> order table, for all 30 Business Systems plans.
// (Simple Website 'b:website' orders land in barber_order, same as
// the insert map in businessData.js. Golden Link and Your Own Domain
// land in clean_link_order, same as Clean Link.)
export const TABLE_BY_KEY = {
  'r:website': 'restaurant_order',
  'p:website': 'pos_order',
  'bb:website': 'barbershop_order',
  'd:website': 'dealer_order',
  'e:website': 'employee_order',
  'bs:website': 'bodyshop_order',
  'h:website': 'houses_order',
  'dr:website': 'doctor_order',
  'hol:website': 'holiday_order',
  'cr:website': 'rentals_order',
  'la:website': 'laundry_order',
  'gy:website': 'gym_order',
  'b:website': 'barber_order',
  'tv:website': 'tv_gallery_order',
  'chat:website': 'live_chat_order',
  'clean:website': 'clean_link_order',
  'clean:golden': 'clean_link_order',
  'clean:domain': 'clean_link_order',
  'direct:website': 'direct_upload_order',
  'reports:website': 'reports_order',
  'branding:website': 'branding_order',
  'car:onetime': 'car_order',
  'car:monthly': 'car_order',
  'kids-math': 'kids_math_order',
  'kids-english': 'kids_english_order',
  'kids-arabic': 'kids_arabic_order',
  'kids-french': 'kids_french_order',
  'kids-spanish': 'kids_spanish_order',
  'kids-science': 'kids_science_order',
  'kids-geography': 'kids_geography_order',
  'kids-coding': 'kids_coding_order',
  'kids-reading': 'kids_reading_order',
}

// Create the tracking row for one placed order and return its code
// (e.g. 'YEN-000123'), or null on ANY failure. Never throws.
export async function createOrderTracking({ kind, plan, orderTable, orderId = null, name, email, phone, price, shopSlug = null }) {
  try {
    const { data, error } = await supabase.rpc('create_order_tracking', {
      p_kind: kind,
      p_plan: plan,
      p_order_table: orderTable,
      p_order_id: orderId,
      p_customer_name: name,
      p_customer_email: email,
      p_customer_phone: phone || '',
      p_price: price,
      p_shop_slug: shopSlug,
    })
    if (error) {
      console.warn('Order tracking failed (order itself is unaffected):', error.message)
      return null
    }
    if (typeof data !== 'string' || !data) {
      console.warn('Order tracking returned no code (order itself is unaffected):', data)
      return null
    }
    return data
  } catch (e) {
    // RPC not deployed yet, network down, anything else — checkout
    // must carry on without a tracking code.
    console.warn('Order tracking failed (order itself is unaffected):', e && e.message ? e.message : e)
    return null
  }
}

// Save tracking codes for the Tracking page (/track) to auto-fill.
// Appends to any codes already stored (a shop checkout can place
// several orders, one per store) and dedupes. Best effort only — a
// storage failure is silently ignored.
export function storeTrackingCodes(codes) {
  try {
    const list = (Array.isArray(codes) ? codes : []).filter(Boolean)
    if (list.length === 0) return
    let prev = []
    try { prev = JSON.parse(sessionStorage.getItem('yently-last-tracking-codes') || '[]') } catch { prev = [] }
    const merged = [...new Set([...(Array.isArray(prev) ? prev : []), ...list])]
    sessionStorage.setItem('yently-last-tracking-codes', JSON.stringify(merged))
  } catch {
    /* ignore — tracking codes are a convenience, not the order */
  }
}
