import { insertRestaurantOrder } from './restaurantData'
import { insertPosOrder } from './posData'
import { insertBarbershopOrder } from './barbershopData'
import { insertDealerOrder } from './dealerData'
import { insertEmployeeOrder } from './employeeData'
import { insertBodyshopOrder } from './bodyshopData'
import { insertHousesOrder } from './housesData'
import { insertDoctorOrder } from './doctorData'
import { insertHolidayOrder } from './holidayData'
import { insertRentalsOrder } from './rentalsData'
import { insertLaundryOrder } from './laundryData'
import { insertGymOrder } from './gymData'
import { insertBarberOrder } from './barberData'
import { insertTvGalleryOrder } from './tvGalleryData'
import { insertLiveChatOrder } from './liveChatData'
import { insertCleanLinkOrder } from './cleanLinkData'
import { insertDirectUploadOrder } from './directUploadData'
import { insertReportsOrder } from './reportsData'
import { insertKidsMathOrder } from './kidsMathData'
import { insertKidsEnglishOrder } from './kidsEnglishData'
import { insertKidsArabicOrder } from './kidsArabicData'
import { insertKidsFrenchOrder } from './kidsFrenchData'
import { insertKidsSpanishOrder } from './kidsSpanishData'
import { insertKidsScienceOrder } from './kidsScienceData'
import { insertKidsGeographyOrder } from './kidsGeographyData'
import { insertKidsCodingOrder } from './kidsCodingData'
import { insertKidsReadingOrder } from './kidsReadingData'
import { createOrderTracking, TABLE_BY_KEY } from './orderTracking'
import { ADDON_SYSTEM_LABELS } from './addonSystems'
import {
  bundleFor,
  RESTAURANT_PLAN_KEY,
  POS_PLAN_KEY,
  BARBERSHOP_PLAN_KEY,
  DEALER_PLAN_KEY,
  EMPLOYEE_PLAN_KEY,
  BODYSHOP_PLAN_KEY,
  HOUSES_PLAN_KEY,
  DOCTOR_PLAN_KEY,
  HOLIDAY_PLAN_KEY,
  RENTALS_PLAN_KEY,
  LAUNDRY_PLAN_KEY,
  GYM_PLAN_KEY,
  SAMPLE_PLAN_KEY,
  TV_PLAN_KEY,
  CHAT_PLAN_KEY,
  CLEAN_PLAN_KEY,
  CLEAN_GOLDEN_PLAN_KEY,
  CLEAN_DOMAIN_PLAN_KEY,
  DIRECT_PLAN_KEY,
  REPORTS_PLAN_KEY,
  isKidsPlanKey,
  isKidsExtraPlanKey,
  KIDS_BASE_PRICE,
  KIDS_EXTRA_KID_PRICE,
  KIDS_MATH_PLAN_KEY,
  KIDS_ENGLISH_PLAN_KEY,
  KIDS_ARABIC_PLAN_KEY,
  KIDS_FRENCH_PLAN_KEY,
  KIDS_SPANISH_PLAN_KEY,
  KIDS_SCIENCE_PLAN_KEY,
  KIDS_GEOGRAPHY_PLAN_KEY,
  KIDS_CODING_PLAN_KEY,
  KIDS_READING_PLAN_KEY,
  KIDS_EXTRA_MATH_PLAN_KEY,
  KIDS_EXTRA_ENGLISH_PLAN_KEY,
  KIDS_EXTRA_ARABIC_PLAN_KEY,
  KIDS_EXTRA_FRENCH_PLAN_KEY,
  KIDS_EXTRA_SPANISH_PLAN_KEY,
  KIDS_EXTRA_SCIENCE_PLAN_KEY,
  KIDS_EXTRA_GEOGRAPHY_PLAN_KEY,
  KIDS_EXTRA_CODING_PLAN_KEY,
  KIDS_EXTRA_READING_PLAN_KEY,
} from './BusinessCartContext'

// Data layer for the unified Business Systems cart. Checkout inserts
// one row per cart item into that item's own order table and emails
// the owner once per item — exactly what the old per-system carts
// did, only now the items share one cart. The per-plan tables stay
// separate (restaurant_order, pos_order, barbershop_order,
// dealer_order, employee_order, bodyshop_order, houses_order,
// doctor_order, holiday_order, rentals_order, laundry_order, gym_order, barber_order,
// tv_gallery_order, live_chat_order, clean_link_order, direct_upload_order,
// reports_order,
// kids_math_order,
// kids_english_order, kids_arabic_order, kids_french_order,
// kids_spanish_order, kids_science_order, kids_geography_order,
// kids_coding_order, kids_reading_order),
// because each plan is a different product with a different
// follow-up. No payment is taken here.
//
// System keys -> the name the owner sees in an add-on order's
// subject and note. One list for all add-ons (see
// src/lib/addonSystems.js): adding a system there adds it here
// too, including Store and Cars sellers.
const SYSTEM_LABELS = ADDON_SYSTEM_LABELS

// The address a Clean Link type points at, for order notes and the
// cart page: yently.com/<name> for a Clean Link, <name>.yently.com
// for a Golden Link, and the domain name itself for Your Own Domain.
export function cleanLinkAddress(planKey, cleanSlug) {
  const slug = String(cleanSlug || '')
  if (planKey === CLEAN_GOLDEN_PLAN_KEY) return slug + '.yently.com'
  if (planKey === CLEAN_DOMAIN_PLAN_KEY) return slug
  return 'yently.com/' + slug
}
const INSERT_BY_KEY = {
  [RESTAURANT_PLAN_KEY]: insertRestaurantOrder,
  [POS_PLAN_KEY]: insertPosOrder,
  [BARBERSHOP_PLAN_KEY]: insertBarbershopOrder,
  [DEALER_PLAN_KEY]: insertDealerOrder,
  [EMPLOYEE_PLAN_KEY]: insertEmployeeOrder,
  [BODYSHOP_PLAN_KEY]: insertBodyshopOrder,
  [HOUSES_PLAN_KEY]: insertHousesOrder,
  [DOCTOR_PLAN_KEY]: insertDoctorOrder,
  [HOLIDAY_PLAN_KEY]: insertHolidayOrder,
  [RENTALS_PLAN_KEY]: insertRentalsOrder,
  [LAUNDRY_PLAN_KEY]: insertLaundryOrder,
  [GYM_PLAN_KEY]: insertGymOrder,
  [SAMPLE_PLAN_KEY]: insertBarberOrder,
  [TV_PLAN_KEY]: insertTvGalleryOrder,
  [CHAT_PLAN_KEY]: insertLiveChatOrder,
  [CLEAN_PLAN_KEY]: insertCleanLinkOrder,
  [CLEAN_GOLDEN_PLAN_KEY]: insertCleanLinkOrder,
  [CLEAN_DOMAIN_PLAN_KEY]: insertCleanLinkOrder,
  [DIRECT_PLAN_KEY]: insertDirectUploadOrder,
  [REPORTS_PLAN_KEY]: insertReportsOrder,
  [KIDS_MATH_PLAN_KEY]: insertKidsMathOrder,
  [KIDS_ENGLISH_PLAN_KEY]: insertKidsEnglishOrder,
  [KIDS_ARABIC_PLAN_KEY]: insertKidsArabicOrder,
  [KIDS_FRENCH_PLAN_KEY]: insertKidsFrenchOrder,
  [KIDS_SPANISH_PLAN_KEY]: insertKidsSpanishOrder,
  [KIDS_SCIENCE_PLAN_KEY]: insertKidsScienceOrder,
  [KIDS_GEOGRAPHY_PLAN_KEY]: insertKidsGeographyOrder,
  [KIDS_CODING_PLAN_KEY]: insertKidsCodingOrder,
  [KIDS_READING_PLAN_KEY]: insertKidsReadingOrder,
  // Extra Students lines land in the SAME table as their subject's
  // Kids page (kids_<subject>_order) — they are extra places for an
  // existing school, not a new school. No new tables, no new insert
  // fns; the subject's insert fn tells them apart by the
  // isExtraStudents email marker (see below).
  [KIDS_EXTRA_MATH_PLAN_KEY]: insertKidsMathOrder,
  [KIDS_EXTRA_ENGLISH_PLAN_KEY]: insertKidsEnglishOrder,
  [KIDS_EXTRA_ARABIC_PLAN_KEY]: insertKidsArabicOrder,
  [KIDS_EXTRA_FRENCH_PLAN_KEY]: insertKidsFrenchOrder,
  [KIDS_EXTRA_SPANISH_PLAN_KEY]: insertKidsSpanishOrder,
  [KIDS_EXTRA_SCIENCE_PLAN_KEY]: insertKidsScienceOrder,
  [KIDS_EXTRA_GEOGRAPHY_PLAN_KEY]: insertKidsGeographyOrder,
  [KIDS_EXTRA_CODING_PLAN_KEY]: insertKidsCodingOrder,
  [KIDS_EXTRA_READING_PLAN_KEY]: insertKidsReadingOrder,
}

// items = [{key, name, price, extraKids, schoolSlug}]. Places each
// item in cart order and returns the placed items. If any insert
// throws, the error propagates — items placed before the failure stay
// placed, and the caller reports the error.
//
// Kids lines carry extraKids (students beyond the first 3, +$1/month
// each, already folded into item.price): the order row is inserted
// with price = 5 + extras and extra_kids = N, and the owner email
// carries an "Extra kids: N" line. extra_kids exists ONLY on the 9
// kids_<subject>_order tables, so it is added to the insert data
// ONLY for Kids plans — never for other plans, where the unknown
// column would fail the insert. Old Kids order rows are
// grandfathered: their stored price is never touched, only new
// orders use the new price.
//
// Extra Students lines (kids-extra-<subject>) are extra places for
// a school that already exists. They insert into the SAME table as
// their subject's Kids page, with plan = the line name, price =
// $1 x N and extra_kids = N — and NO tracking code (exactly like the
// direct /extra-students requests, which never had one). The note
// gains a line naming the school slug and the policy: the places are
// free for the rest of this month, and the new monthly amount
// ($5 + $1 x N) starts with the NEXT payment. Nothing is charged
// here and paid_extra_kids is NOT touched — the admin still switches
// the places on in All Passes, exactly as for a direct request. The
// owner email is marked isExtraStudents so the subject reads
// "Extra Students — <Subject> — <name>" instead of a new-school
// order. A line stepped down to 0 places is SKIPPED: no $0 row, no
// email, no tracking code, and it does not appear in the placed
// items (so the confirmation never shows it).
//
// Bundle note (owner's call 2026-11-09): when 2+ plans are ordered
// together, every per-plan owner email also carries the discounted
// monthly total, so the owner sees what the customer actually pays
// (e.g. Restaurant $40 + POS $50 = $90 list, 10% off = $81/month) —
// not just that plan's list price. Order rows still keep list
// prices; only the email gains the line. Extra Students lines are
// excluded from the bundle tiers and discount (see bundleFor), but
// their $1-per-place amount is inside bundle.total, so the bundle
// line still states the full monthly amount from the next payment.
export async function placeBusinessOrder({ name, email, phone, note, items }) {
  const placed = []
  const bundle = bundleFor(items || [])
  const bundleNote = bundle.rate > 0
    ? `Bundle discount applied — customer pays $${bundle.total.toFixed(2)}/month (list $${bundle.listTotal.toFixed(2)}, ${Math.round(bundle.rate * 100)}% off, saving $${bundle.savings.toFixed(2)}/month)`
    : null
  for (const item of items || []) {
    const insert = INSERT_BY_KEY[item.key]
    if (!insert) throw new Error('Unknown business plan: ' + item.key)
    const isKids = isKidsPlanKey(item.key)
    const isExtra = isKidsExtraPlanKey(item.key)
    const extraKids = (isKids || isExtra) ? Math.max(0, Number(item.extraKids) || 0) : 0
    if (isExtra && extraKids === 0) continue
    const schoolSlug = isExtra ? String(item.schoolSlug || '') : ''
    const newMonthlyTotal = isExtra ? KIDS_BASE_PRICE + extraKids * KIDS_EXTRA_KID_PRICE : null
    const extraNoteLine = isExtra
      ? (schoolSlug
        ? `Extra students for school "${schoolSlug}" — free for the rest of this month; new monthly amount $${newMonthlyTotal}/month starts with the next payment.`
        : `Extra students — free for the rest of this month; new monthly amount $${newMonthlyTotal}/month starts with the next payment.`)
      : null
    // A Clean Link, Golden Link or Your Own Domain add-on line
    // (isAddon, from a shop's Setup page): the line is an add-on to
    // the payment the customer already has — free for the rest of
    // this month, $5/$10/$20 a month by type from the next payment
    // — so its order row carries the system + slug, its note says
    // so, and its owner email gets its own subject (see
    // cleanLinkData.js). The ad-page flow is untouched: a plain
    // (non-add-on) line still takes system/slug/clean_slug from the
    // localStorage meta, or leaves them null — and insertCleanLinkOrder
    // refuses to place a line whose system is still unknown.
    const isCleanAddon = (item.key === CLEAN_PLAN_KEY || item.key === CLEAN_GOLDEN_PLAN_KEY || item.key === CLEAN_DOMAIN_PLAN_KEY) && item.isAddon === true
    const cleanSystem = isCleanAddon ? String(item.cleanSystem || '') : ''
    const cleanShopSlug = isCleanAddon ? String(item.cleanShopSlug || '') : ''
    const cleanSlug = isCleanAddon ? String(item.cleanSlug || item.cleanShopSlug || '') : ''
    const cleanLabel = isCleanAddon ? (SYSTEM_LABELS[cleanSystem] || cleanSystem || item.name) : ''
    const cleanNoteLine = isCleanAddon
      ? `${item.name} for ${cleanLabel} "${cleanShopSlug}" — free for the rest of this month; new monthly amount $${Number(item.price)}/month starts with the next payment. The link will be ${cleanLinkAddress(item.key, cleanSlug)}.`
      : null
    // A Direct Upload add-on line (isAddon, from a shop's Setup
    // page): the line is an add-on to the payment the customer
    // already has — free for the rest of this month, $5/month from
    // the next payment — so its note names the system + slug and its
    // owner email gets its own subject (see directUploadData.js).
    // The system + slug go in the NOTE, not on the order row:
    // direct_upload_order has no system / shop_slug columns (its
    // DDL was never in the repo — see AdminAllOrders.jsx), so
    // writing them would fail the insert. They also travel in
    // emailExtras, so the owner email shows them. The ad-page
    // Direct Upload flow is untouched: a plain (non-add-on) line
    // inserts exactly as before.
    const isDirectAddon = item.key === DIRECT_PLAN_KEY && item.isAddon === true
    const directSystem = isDirectAddon ? String(item.directSystem || '') : ''
    const directShopSlug = isDirectAddon ? String(item.directShopSlug || '') : ''
    const directLabel = isDirectAddon ? (SYSTEM_LABELS[directSystem] || directSystem || 'Direct Upload') : ''
    const directNoteLine = isDirectAddon
      ? `Direct Upload for ${directLabel} "${directShopSlug}" — free for the rest of this month; new monthly amount $5/month starts with the next payment.`
      : null
    // A Reports add-on line (isAddon, from a shop's Setup page):
    // the line is an add-on to the payment the customer already
    // has — free for the rest of this month, $5/month from the
    // next payment, first month free — so its note names the system
    // + slug and its owner email gets its own subject (see
    // reportsData.js). The system + slug go in the NOTE, not on
    // the order row: reports_order has only the 8 standard
    // columns, so writing them would fail the insert. They also
    // travel in emailExtras, so the owner email shows them. The
    // ad-page Reports flow is untouched: a plain (non-add-on) line
    // inserts exactly as before.
    const isReportsAddon = item.key === REPORTS_PLAN_KEY && item.isAddon === true
    const reportsSystem = isReportsAddon ? String(item.reportsSystem || '') : ''
    const reportsShopSlug = isReportsAddon ? String(item.reportsShopSlug || '') : ''
    const reportsLabel = isReportsAddon ? (SYSTEM_LABELS[reportsSystem] || reportsSystem || 'Reports') : ''
    const reportsNoteLine = isReportsAddon
      ? `Reports for ${reportsLabel} "${reportsShopSlug}" — free for the rest of this month; new monthly amount $5/month starts with the next payment. First month free.`
      : null
    // A TV Gallery add-on line (isAddon, from a shop's Setup page):
    // exactly like Reports — free for the rest of this month,
    // $2/month from the next payment, first month free — so its
    // note names the system + slug and its owner email gets its
    // own subject (see tvGalleryData.js). The system + slug go in
    // the NOTE, not on the order row: tv_gallery_order has only
    // the 8 standard columns, so writing them would fail the
    // insert. They also travel in emailExtras, so the owner email
    // shows them. The ad-page TV Gallery flow is untouched: a
    // plain (non-add-on) line inserts exactly as before.
    const isTvAddon = item.key === TV_PLAN_KEY && item.isAddon === true
    const tvSystem = isTvAddon ? String(item.tvSystem || '') : ''
    const tvShopSlug = isTvAddon ? String(item.tvShopSlug || '') : ''
    const tvLabel = isTvAddon ? (SYSTEM_LABELS[tvSystem] || tvSystem || 'TV Gallery') : ''
    const tvNoteLine = isTvAddon
      ? `TV Gallery for ${tvLabel} "${tvShopSlug}" — free for the rest of this month; new monthly amount $2/month starts with the next payment. First month free.`
      : null
    // A Live Chat add-on line (isAddon, from a shop's Setup page):
    // exactly like Direct Upload — free for the rest of this
    // month, $3/month from the next payment — so its note names
    // the system + slug and its owner email gets its own subject
    // (see liveChatData.js). The system + slug go in the NOTE,
    // not on the order row: live_chat_order has no system /
    // shop_slug columns, so writing them would fail the insert.
    // They also travel in emailExtras, so the owner email shows
    // them. The ad-page Live Chat flow is untouched: a plain
    // (non-add-on) line inserts exactly as before.
    const isChatAddon = item.key === CHAT_PLAN_KEY && item.isAddon === true
    const chatSystem = isChatAddon ? String(item.chatSystem || '') : ''
    const chatShopSlug = isChatAddon ? String(item.chatShopSlug || '') : ''
    const chatLabel = isChatAddon ? (SYSTEM_LABELS[chatSystem] || chatSystem || 'Live Chat') : ''
    const chatNoteLine = isChatAddon
      ? `Live Chat for ${chatLabel} "${chatShopSlug}" — free for the rest of this month; new monthly amount $3/month starts with the next payment.`
      : null
    const noteLine = extraNoteLine || cleanNoteLine || directNoteLine || reportsNoteLine || tvNoteLine || chatNoteLine
    const itemNote = noteLine ? (note ? `${note}\n${noteLine}` : noteLine) : note
    await insert({
      customer_name: name,
      customer_email: email,
      customer_phone: phone,
      plan: item.name,
      price: item.price,
      note: itemNote,
      ...((isKids || isExtra) ? { extra_kids: extraKids } : {}),
      ...(isCleanAddon ? { system: cleanSystem, shop_slug: cleanShopSlug, clean_slug: cleanSlug } : {}),
    }, {
      // sold: marks this as a System / Add-on JUST PURCHASED. The
      // Edge Function renders the big red header + organised layout
      // for these emails only (see send-notification/index.ts);
      // every other submission email keeps the plain layout.
      sold: item.name,
      plan: item.name,
      price: item.price,
      ...(bundleNote ? { bundle_discount: bundleNote } : {}),
      ...(extraKids > 0 ? { extra_kids: `Extra kids: ${extraKids}` } : {}),
      ...(isExtra ? {
        isExtraStudents: true,
        school_slug: schoolSlug,
        new_monthly_total: `New monthly amount: $${newMonthlyTotal}/month — starts with the next payment; free for the rest of this month.`,
      } : {}),
      ...(isCleanAddon ? {
        isCleanAddon: true,
        system: cleanSystem,
        systemLabel: cleanLabel,
        shop_slug: cleanShopSlug,
        clean_slug: cleanSlug,
        new_monthly_total: `New monthly amount: $${Number(item.price)}/month — starts with the next payment; free for the rest of this month.`,
      } : {}),
      ...(isDirectAddon ? {
        isDirectAddon: true,
        system: directSystem,
        systemLabel: directLabel,
        shop_slug: directShopSlug,
        new_monthly_total: 'New monthly amount: $5/month — starts with the next payment; free for the rest of this month.',
      } : {}),
      ...(isReportsAddon ? {
        isReportsAddon: true,
        system: reportsSystem,
        systemLabel: reportsLabel,
        shop_slug: reportsShopSlug,
        new_monthly_total: 'New monthly amount: $5/month — starts with the next payment; free for the rest of this month. First month free.',
      } : {}),
      ...(isTvAddon ? {
        isTvAddon: true,
        system: tvSystem,
        systemLabel: tvLabel,
        shop_slug: tvShopSlug,
        new_monthly_total: 'New monthly amount: $2/month — starts with the next payment; free for the rest of this month. First month free.',
      } : {}),
      ...(isChatAddon ? {
        isChatAddon: true,
        system: chatSystem,
        systemLabel: chatLabel,
        shop_slug: chatShopSlug,
        new_monthly_total: 'New monthly amount: $3/month — starts with the next payment; free for the rest of this month.',
      } : {}),
    })
    // Tracking row for this plan — EXCEPT Extra Students lines and
    // Clean Link / Direct Upload / Reports / TV Gallery / Live Chat
    // add-on lines, which get no tracking
    // code at all (no warning either). The
    // insert above returns no id (submitAndNotify inserts with no
    // .select()), so the RPC finds the just-placed row server-side
    // (orderId null). createOrderTracking never throws and returns
    // null on failure — the order is already placed at this point
    // and stays placed either way.
    let tracking_code = null
    if (!isExtra && !isCleanAddon && !isDirectAddon && !isReportsAddon && !isTvAddon && !isChatAddon) {
      const orderTable = TABLE_BY_KEY[item.key]
      if (!orderTable) {
        console.warn('No tracking order table for plan key ' + item.key + ' — order placed without tracking')
      } else {
        tracking_code = await createOrderTracking({
          kind: 'system', plan: item.name, orderTable, orderId: null,
          name, email, phone, price: item.price, shopSlug: null,
        })
      }
    }
    placed.push({ ...item, tracking_code })
  }
  return placed
}
