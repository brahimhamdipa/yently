import { createContext, useContext, useEffect, useState } from 'react'

// The ONE cart for all Business Systems website plans — this REPLACES
// the seven separate website carts:
//   'autofly-restaurant-cart' (RestaurantCartContext, 'r:website')
//   'autofly-pos-cart' (PosCartContext, 'p:website')
//   'autofly-dealer-cart' (DealerCartContext, 'd:website')
//   'autofly-employee-cart' (EmployeeCartContext, 'e:website')
//   'autofly-bodyshop-cart' (BodyshopCartContext, 'bs:website')
//   'autofly-barber-cart' (BarberCartContext, 'b:website')
//   (the barbershop booking page, 'bb:website', never had a cart)
// One shared "My Cart" now serves every Business Systems page, because
// they are all the same kind of product: a website page AutoFly builds
// for a business. Checkout still inserts one row per plan into that
// plan's own order table and emails the owner once per plan — the
// tables and the follow-ups are unchanged, only the cart is shared.
//
// The shopping cart (CartContext, 'autofly-grocery-cart') stays
// separate on purpose: its checkout can only process store items,
// never a website plan, so mixing them would strand a website order
// with nowhere to go. No payment is taken here — placing the order
// inserts the order rows and emails the owner, who then sets each
// page up. Connecting carts to the bank comes later.
//
// The cart is an array of {key, name, price, extraKids, schoolSlug} —
// one of each plan max. A website plan is one line, quantity 1:
// buying it twice is two separate orders, not quantity 2 of one site.
// extraKids is only ever non-zero on Kids lines (students beyond the
// first 3, at +$1/month each, folded into that line's price — see
// kidsLinePrice) and on Extra Students lines (the number of extra
// places themselves, at $1 each — see kidsExtraLinePrice). Extra
// kids are part of the plan's price, never separate plans, so they
// never change how many plans the bundle tiers count. schoolSlug is
// only ever set on Extra Students lines: the school the places are
// for (from the ?slug= deep link or the /extra-students page).
const BusinessCartCtx = createContext(null)

const STORAGE_KEY = 'autofly-business-cart'

export const RESTAURANT_PLAN_KEY = 'r:website'
export const RESTAURANT_PLAN_NAME = 'Restaurant ordering page'
export const RESTAURANT_PLAN_PRICE = 40

export const POS_PLAN_KEY = 'p:website'
export const POS_PLAN_NAME = 'Point of sale page'
export const POS_PLAN_PRICE = 50

export const BARBERSHOP_PLAN_KEY = 'bb:website'
export const BARBERSHOP_PLAN_NAME = 'Barbershop booking page'
export const BARBERSHOP_PLAN_PRICE = 15

export const DEALER_PLAN_KEY = 'd:website'
export const DEALER_PLAN_NAME = 'Dealer website'
export const DEALER_PLAN_PRICE = 20

export const EMPLOYEE_PLAN_KEY = 'e:website'
export const EMPLOYEE_PLAN_NAME = 'Employee time page'
export const EMPLOYEE_PLAN_PRICE = 20

export const BODYSHOP_PLAN_KEY = 'bs:website'
export const BODYSHOP_PLAN_NAME = 'Bodyshop management'
export const BODYSHOP_PLAN_PRICE = 20

export const HOUSES_PLAN_KEY = 'h:website'
export const HOUSES_PLAN_NAME = 'Houses page'
export const HOUSES_PLAN_PRICE = 20

export const DOCTOR_PLAN_KEY = 'dr:website'
export const DOCTOR_PLAN_NAME = 'Doctor booking page'
export const DOCTOR_PLAN_PRICE = 20

export const HOLIDAY_PLAN_KEY = 'hol:website'
export const HOLIDAY_PLAN_NAME = 'Holiday rentals page'
export const HOLIDAY_PLAN_PRICE = 20

export const RENTALS_PLAN_KEY = 'cr:website'
export const RENTALS_PLAN_NAME = 'Car rental page'
export const RENTALS_PLAN_PRICE = 20

export const LAUNDRY_PLAN_KEY = 'la:website'
export const LAUNDRY_PLAN_NAME = 'Laundry page'
export const LAUNDRY_PLAN_PRICE = 20

export const GYM_PLAN_KEY = 'gy:website'
export const GYM_PLAN_NAME = 'Gym page'
export const GYM_PLAN_PRICE = 20

export const SAMPLE_PLAN_KEY = 'b:website'
export const SAMPLE_PLAN_NAME = 'Simple website'
export const SAMPLE_PLAN_PRICE = 10

export const TV_PLAN_KEY = 'tv:website'
export const TV_PLAN_NAME = 'TV Gallery page'
export const TV_PLAN_PRICE = 2

export const CHAT_PLAN_KEY = 'chat:website'
export const CHAT_PLAN_NAME = 'Live chat page'
export const CHAT_PLAN_PRICE = 3

export const CLEAN_PLAN_KEY = 'clean:website'
export const CLEAN_PLAN_NAME = 'Clean Link'
export const CLEAN_PLAN_PRICE = 2

export const DIRECT_PLAN_KEY = 'direct:website'
export const DIRECT_PLAN_NAME = 'Direct Upload'
export const DIRECT_PLAN_PRICE = 5

export const KIDS_BASE_PRICE = 5
export const KIDS_INCLUDED_STUDENTS = 3
export const KIDS_EXTRA_KID_PRICE = 1

export const KIDS_MATH_PLAN_KEY = 'kids-math'
export const KIDS_MATH_PLAN_NAME = 'Kids Math page'
export const KIDS_MATH_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_ENGLISH_PLAN_KEY = 'kids-english'
export const KIDS_ENGLISH_PLAN_NAME = 'Kids English page'
export const KIDS_ENGLISH_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_ARABIC_PLAN_KEY = 'kids-arabic'
export const KIDS_ARABIC_PLAN_NAME = 'Kids Arabic page'
export const KIDS_ARABIC_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_FRENCH_PLAN_KEY = 'kids-french'
export const KIDS_FRENCH_PLAN_NAME = 'Kids French page'
export const KIDS_FRENCH_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_SPANISH_PLAN_KEY = 'kids-spanish'
export const KIDS_SPANISH_PLAN_NAME = 'Kids Spanish page'
export const KIDS_SPANISH_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_SCIENCE_PLAN_KEY = 'kids-science'
export const KIDS_SCIENCE_PLAN_NAME = 'Kids Science page'
export const KIDS_SCIENCE_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_GEOGRAPHY_PLAN_KEY = 'kids-geography'
export const KIDS_GEOGRAPHY_PLAN_NAME = 'Kids Geography page'
export const KIDS_GEOGRAPHY_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_CODING_PLAN_KEY = 'kids-coding'
export const KIDS_CODING_PLAN_NAME = 'Kids Coding page'
export const KIDS_CODING_PLAN_PRICE = KIDS_BASE_PRICE

export const KIDS_READING_PLAN_KEY = 'kids-reading'
export const KIDS_READING_PLAN_NAME = 'Kids Reading page'
export const KIDS_READING_PLAN_PRICE = KIDS_BASE_PRICE

// Extra Students: one cart plan per subject, for a school that
// ALREADY has that subject's Kids page. Base price $0 — the line
// only adds student places, at $1/month each, so the line price is
// $1 x the number of places (see kidsExtraLinePrice). It is a
// separate plan from the Kids page itself: the school's $5/month
// (first 3 students) is a different line, already in the cart or
// already paid for. No first month free on Kids. The places are
// free for the rest of this month — the new monthly amount
// ($5 + $1 x places) starts with the NEXT payment (see
// businessData.js); nothing is charged here, carts record orders +
// email only.
export const KIDS_EXTRA_MATH_PLAN_KEY = 'kids-extra-math'
export const KIDS_EXTRA_MATH_PLAN_NAME = 'Extra students — Kids Math page'
export const KIDS_EXTRA_MATH_PLAN_PRICE = 0

export const KIDS_EXTRA_ENGLISH_PLAN_KEY = 'kids-extra-english'
export const KIDS_EXTRA_ENGLISH_PLAN_NAME = 'Extra students — Kids English page'
export const KIDS_EXTRA_ENGLISH_PLAN_PRICE = 0

export const KIDS_EXTRA_ARABIC_PLAN_KEY = 'kids-extra-arabic'
export const KIDS_EXTRA_ARABIC_PLAN_NAME = 'Extra students — Kids Arabic page'
export const KIDS_EXTRA_ARABIC_PLAN_PRICE = 0

export const KIDS_EXTRA_FRENCH_PLAN_KEY = 'kids-extra-french'
export const KIDS_EXTRA_FRENCH_PLAN_NAME = 'Extra students — Kids French page'
export const KIDS_EXTRA_FRENCH_PLAN_PRICE = 0

export const KIDS_EXTRA_SPANISH_PLAN_KEY = 'kids-extra-spanish'
export const KIDS_EXTRA_SPANISH_PLAN_NAME = 'Extra students — Kids Spanish page'
export const KIDS_EXTRA_SPANISH_PLAN_PRICE = 0

export const KIDS_EXTRA_SCIENCE_PLAN_KEY = 'kids-extra-science'
export const KIDS_EXTRA_SCIENCE_PLAN_NAME = 'Extra students — Kids Science page'
export const KIDS_EXTRA_SCIENCE_PLAN_PRICE = 0

export const KIDS_EXTRA_GEOGRAPHY_PLAN_KEY = 'kids-extra-geography'
export const KIDS_EXTRA_GEOGRAPHY_PLAN_NAME = 'Extra students — Kids Geography page'
export const KIDS_EXTRA_GEOGRAPHY_PLAN_PRICE = 0

export const KIDS_EXTRA_CODING_PLAN_KEY = 'kids-extra-coding'
export const KIDS_EXTRA_CODING_PLAN_NAME = 'Extra students — Kids Coding page'
export const KIDS_EXTRA_CODING_PLAN_PRICE = 0

export const KIDS_EXTRA_READING_PLAN_KEY = 'kids-extra-reading'
export const KIDS_EXTRA_READING_PLAN_NAME = 'Extra students — Kids Reading page'
export const KIDS_EXTRA_READING_PLAN_PRICE = 0

// Kids pricing: $5/month covers the first 3 students; each extra
// student is +$1/month. No free month on Kids — the other systems
// keep theirs.
export const KIDS_PLAN_KEYS = new Set([
  KIDS_MATH_PLAN_KEY,
  KIDS_ENGLISH_PLAN_KEY,
  KIDS_ARABIC_PLAN_KEY,
  KIDS_FRENCH_PLAN_KEY,
  KIDS_SPANISH_PLAN_KEY,
  KIDS_SCIENCE_PLAN_KEY,
  KIDS_GEOGRAPHY_PLAN_KEY,
  KIDS_CODING_PLAN_KEY,
  KIDS_READING_PLAN_KEY,
])

export function isKidsPlanKey(key) {
  return KIDS_PLAN_KEYS.has(key)
}

export const KIDS_EXTRA_PLAN_KEYS = new Set([
  KIDS_EXTRA_MATH_PLAN_KEY,
  KIDS_EXTRA_ENGLISH_PLAN_KEY,
  KIDS_EXTRA_ARABIC_PLAN_KEY,
  KIDS_EXTRA_FRENCH_PLAN_KEY,
  KIDS_EXTRA_SPANISH_PLAN_KEY,
  KIDS_EXTRA_SCIENCE_PLAN_KEY,
  KIDS_EXTRA_GEOGRAPHY_PLAN_KEY,
  KIDS_EXTRA_CODING_PLAN_KEY,
  KIDS_EXTRA_READING_PLAN_KEY,
])

export function isKidsExtraPlanKey(key) {
  return KIDS_EXTRA_PLAN_KEYS.has(key)
}

// Monthly price of one Extra Students line: $1 per extra place.
// Base price is $0 — the school's $5/month base is a separate line.
export function kidsExtraLinePrice(extraKids) {
  const n = Math.max(0, Number(extraKids) || 0)
  return n * KIDS_EXTRA_KID_PRICE
}

// Monthly price of one Kids line: base $5 + $1 per extra student
// beyond the first 3. Non-Kids plans never carry extras.
export function kidsLinePrice(extraKids) {
  const n = Math.max(0, Number(extraKids) || 0)
  return KIDS_BASE_PRICE + n * KIDS_EXTRA_KID_PRICE
}

// Single source of truth for the thirty-five plans, keyed by plan key.
export const BUSINESS_PLANS = {
  [RESTAURANT_PLAN_KEY]: { key: RESTAURANT_PLAN_KEY, name: RESTAURANT_PLAN_NAME, price: RESTAURANT_PLAN_PRICE },
  [POS_PLAN_KEY]: { key: POS_PLAN_KEY, name: POS_PLAN_NAME, price: POS_PLAN_PRICE },
  [BARBERSHOP_PLAN_KEY]: { key: BARBERSHOP_PLAN_KEY, name: BARBERSHOP_PLAN_NAME, price: BARBERSHOP_PLAN_PRICE },
  [DEALER_PLAN_KEY]: { key: DEALER_PLAN_KEY, name: DEALER_PLAN_NAME, price: DEALER_PLAN_PRICE },
  [EMPLOYEE_PLAN_KEY]: { key: EMPLOYEE_PLAN_KEY, name: EMPLOYEE_PLAN_NAME, price: EMPLOYEE_PLAN_PRICE },
  [BODYSHOP_PLAN_KEY]: { key: BODYSHOP_PLAN_KEY, name: BODYSHOP_PLAN_NAME, price: BODYSHOP_PLAN_PRICE },
  [HOUSES_PLAN_KEY]: { key: HOUSES_PLAN_KEY, name: HOUSES_PLAN_NAME, price: HOUSES_PLAN_PRICE },
  [DOCTOR_PLAN_KEY]: { key: DOCTOR_PLAN_KEY, name: DOCTOR_PLAN_NAME, price: DOCTOR_PLAN_PRICE },
  [HOLIDAY_PLAN_KEY]: { key: HOLIDAY_PLAN_KEY, name: HOLIDAY_PLAN_NAME, price: HOLIDAY_PLAN_PRICE },
  [RENTALS_PLAN_KEY]: { key: RENTALS_PLAN_KEY, name: RENTALS_PLAN_NAME, price: RENTALS_PLAN_PRICE },
  [LAUNDRY_PLAN_KEY]: { key: LAUNDRY_PLAN_KEY, name: LAUNDRY_PLAN_NAME, price: LAUNDRY_PLAN_PRICE },
  [GYM_PLAN_KEY]: { key: GYM_PLAN_KEY, name: GYM_PLAN_NAME, price: GYM_PLAN_PRICE },
  [SAMPLE_PLAN_KEY]: { key: SAMPLE_PLAN_KEY, name: SAMPLE_PLAN_NAME, price: SAMPLE_PLAN_PRICE },
  [TV_PLAN_KEY]: { key: TV_PLAN_KEY, name: TV_PLAN_NAME, price: TV_PLAN_PRICE },
  [CHAT_PLAN_KEY]: { key: CHAT_PLAN_KEY, name: CHAT_PLAN_NAME, price: CHAT_PLAN_PRICE },
  [CLEAN_PLAN_KEY]: { key: CLEAN_PLAN_KEY, name: CLEAN_PLAN_NAME, price: CLEAN_PLAN_PRICE },
  [DIRECT_PLAN_KEY]: { key: DIRECT_PLAN_KEY, name: DIRECT_PLAN_NAME, price: DIRECT_PLAN_PRICE },
  [KIDS_MATH_PLAN_KEY]: { key: KIDS_MATH_PLAN_KEY, name: KIDS_MATH_PLAN_NAME, price: KIDS_MATH_PLAN_PRICE },
  [KIDS_ENGLISH_PLAN_KEY]: { key: KIDS_ENGLISH_PLAN_KEY, name: KIDS_ENGLISH_PLAN_NAME, price: KIDS_ENGLISH_PLAN_PRICE },
  [KIDS_ARABIC_PLAN_KEY]: { key: KIDS_ARABIC_PLAN_KEY, name: KIDS_ARABIC_PLAN_NAME, price: KIDS_ARABIC_PLAN_PRICE },
  [KIDS_FRENCH_PLAN_KEY]: { key: KIDS_FRENCH_PLAN_KEY, name: KIDS_FRENCH_PLAN_NAME, price: KIDS_FRENCH_PLAN_PRICE },
  [KIDS_SPANISH_PLAN_KEY]: { key: KIDS_SPANISH_PLAN_KEY, name: KIDS_SPANISH_PLAN_NAME, price: KIDS_SPANISH_PLAN_PRICE },
  [KIDS_SCIENCE_PLAN_KEY]: { key: KIDS_SCIENCE_PLAN_KEY, name: KIDS_SCIENCE_PLAN_NAME, price: KIDS_SCIENCE_PLAN_PRICE },
  [KIDS_GEOGRAPHY_PLAN_KEY]: { key: KIDS_GEOGRAPHY_PLAN_KEY, name: KIDS_GEOGRAPHY_PLAN_NAME, price: KIDS_GEOGRAPHY_PLAN_PRICE },
  [KIDS_CODING_PLAN_KEY]: { key: KIDS_CODING_PLAN_KEY, name: KIDS_CODING_PLAN_NAME, price: KIDS_CODING_PLAN_PRICE },
  [KIDS_READING_PLAN_KEY]: { key: KIDS_READING_PLAN_KEY, name: KIDS_READING_PLAN_NAME, price: KIDS_READING_PLAN_PRICE },
  [KIDS_EXTRA_MATH_PLAN_KEY]: { key: KIDS_EXTRA_MATH_PLAN_KEY, name: KIDS_EXTRA_MATH_PLAN_NAME, price: KIDS_EXTRA_MATH_PLAN_PRICE },
  [KIDS_EXTRA_ENGLISH_PLAN_KEY]: { key: KIDS_EXTRA_ENGLISH_PLAN_KEY, name: KIDS_EXTRA_ENGLISH_PLAN_NAME, price: KIDS_EXTRA_ENGLISH_PLAN_PRICE },
  [KIDS_EXTRA_ARABIC_PLAN_KEY]: { key: KIDS_EXTRA_ARABIC_PLAN_KEY, name: KIDS_EXTRA_ARABIC_PLAN_NAME, price: KIDS_EXTRA_ARABIC_PLAN_PRICE },
  [KIDS_EXTRA_FRENCH_PLAN_KEY]: { key: KIDS_EXTRA_FRENCH_PLAN_KEY, name: KIDS_EXTRA_FRENCH_PLAN_NAME, price: KIDS_EXTRA_FRENCH_PLAN_PRICE },
  [KIDS_EXTRA_SPANISH_PLAN_KEY]: { key: KIDS_EXTRA_SPANISH_PLAN_KEY, name: KIDS_EXTRA_SPANISH_PLAN_NAME, price: KIDS_EXTRA_SPANISH_PLAN_PRICE },
  [KIDS_EXTRA_SCIENCE_PLAN_KEY]: { key: KIDS_EXTRA_SCIENCE_PLAN_KEY, name: KIDS_EXTRA_SCIENCE_PLAN_NAME, price: KIDS_EXTRA_SCIENCE_PLAN_PRICE },
  [KIDS_EXTRA_GEOGRAPHY_PLAN_KEY]: { key: KIDS_EXTRA_GEOGRAPHY_PLAN_KEY, name: KIDS_EXTRA_GEOGRAPHY_PLAN_NAME, price: KIDS_EXTRA_GEOGRAPHY_PLAN_PRICE },
  [KIDS_EXTRA_CODING_PLAN_KEY]: { key: KIDS_EXTRA_CODING_PLAN_KEY, name: KIDS_EXTRA_CODING_PLAN_NAME, price: KIDS_EXTRA_CODING_PLAN_PRICE },
  [KIDS_EXTRA_READING_PLAN_KEY]: { key: KIDS_EXTRA_READING_PLAN_KEY, name: KIDS_EXTRA_READING_PLAN_NAME, price: KIDS_EXTRA_READING_PLAN_PRICE },
}

// Bundle discount — pure math, no new state. The twenty-six
// billable plans count: 2 plans in the cart = 10% off the monthly
// total, 3 plans = 15%, 4 or more = 20%. Extra Students lines do
// NOT count toward the tiers and are NOT discounted — they only add
// places to a school that already pays its $5/month, so discounting
// them would discount the same school twice. Their $1-per-place
// amount IS still in the totals the customer sees: listTotal is the
// billable list plus the extra lines, savings is the discount on the
// billable list only, and total is billable-after-discount plus the
// extra lines in full. count is the number of billable (non-extra)
// lines. The discount is cart-level display only: each order row
// still keeps its plan's list price (see businessData.js), because
// no money is collected yet — carts record orders + email only
// until the bank is connected. Money is rounded to 2 decimals.
// The tier counts CART LINES (plans), not students: a Kids line
// with extra kids still counts as one plan, and its extras are
// already inside its line price, so they get the same tier rate.
export function bundleFor(cart) {
  const items = Array.isArray(cart) ? cart : []
  const billable = items.filter(i => !isKidsExtraPlanKey(i.key))
  const extras = items.filter(i => isKidsExtraPlanKey(i.key))
  const count = billable.length
  const rate = count >= 4 ? 0.20 : count === 3 ? 0.15 : count === 2 ? 0.10 : 0
  const billableList = Math.round(billable.reduce((s, i) => s + (Number(i.price) || 0), 0) * 100) / 100
  const extraSum = Math.round(extras.reduce((s, i) => s + (Number(i.price) || 0), 0) * 100) / 100
  const listTotal = Math.round((billableList + extraSum) * 100) / 100
  const savings = Math.round(billableList * rate * 100) / 100
  const total = Math.round((billableList - savings + extraSum) * 100) / 100
  return { count, rate, listTotal, savings, total }
}

export function BusinessCartProvider({ children }) {
  // lastOrder survives the cart being cleared, so the order
  // confirmation stays on screen after checkout (same pattern as the
  // shopping cart's lastOrder).
  const [lastOrder, setLastOrder] = useState(null)
  const [cart, setCartState] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (!Array.isArray(raw)) return []
      // Keep only known plans, one of each max; rebuild each line from
      // BUSINESS_PLANS so a stale stored name or price never survives.
      // A stored extraKids survives only on Kids lines and Extra
      // Students lines, and the line price is recomputed from it
      // (Kids: base + $1 per extra kid; Extra Students: $1 per place).
      // A stored schoolSlug survives only on Extra Students lines.
      const seen = new Set()
      const items = []
      for (const i of raw) {
        if (!i || !BUSINESS_PLANS[i.key] || seen.has(i.key)) continue
        seen.add(i.key)
        const plan = BUSINESS_PLANS[i.key]
        const isExtra = isKidsExtraPlanKey(plan.key)
        const extraKids = (isKidsPlanKey(plan.key) || isExtra) ? Math.max(0, Number(i.extraKids) || 0) : 0
        items.push({
          key: plan.key,
          name: plan.name,
          price: isExtra ? kidsExtraLinePrice(extraKids) : extraKids > 0 ? kidsLinePrice(extraKids) : plan.price,
          extraKids,
          ...(isExtra ? { schoolSlug: String(i.schoolSlug || '') } : {}),
        })
      }
      return items
    } catch {
      return []
    }
  })

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)) } catch { /* ignore */ }
  }, [cart])

  const count = cart.length

  // Adding a plan already in the cart is a no-op — one of each max —
  // EXCEPT Extra Students lines (see below). extraKids only applies
  // to Kids plans: the number of students beyond the first 3, folded
  // into the line price (+$1 each). schoolSlug only applies to Extra
  // Students lines: the school the places are for.
  const addPlan = (key, extraKids = 0, schoolSlug = '') => {
    const plan = BUSINESS_PLANS[key]
    if (!plan) return
    const slug = String(schoolSlug || '').trim()
    if (isKidsExtraPlanKey(key)) {
      // For an extra line the count IS the number of extra places.
      // A new line with no count given starts at 1 place (the deep
      // link from a school's Setup page and the /extra-students page
      // both start at 1); the cart stepper can take it down to 0
      // afterwards. A line already in the cart is NOT a no-op: the
      // deep link refreshes its school slug (when one was given) and
      // keeps the LARGER of the existing and new counts, so
      // re-tapping the Setup link never shrinks a count the customer
      // already picked.
      let n = Math.max(0, Number(extraKids) || 0)
      setLastOrder(null)
      setCartState(c => {
        const existing = c.find(i => i.key === key)
        if (!existing) {
          if (n === 0) n = 1
          return [...c, { key: plan.key, name: plan.name, price: kidsExtraLinePrice(n), extraKids: n, schoolSlug: slug }]
        }
        const merged = Math.max(Number(existing.extraKids) || 0, n)
        return c.map(i => (i.key === key ? { ...i, extraKids: merged, price: kidsExtraLinePrice(merged), schoolSlug: slug || i.schoolSlug || '' } : i))
      })
      return
    }
    const kids = isKidsPlanKey(key) ? Math.max(0, Number(extraKids) || 0) : 0
    setLastOrder(null)
    setCartState(c => (c.some(i => i.key === key) ? c : [...c, { key: plan.key, name: plan.name, price: kids > 0 ? kidsLinePrice(kids) : plan.price, extraKids: kids }]))
  }

  // Change the extra-student count on a Kids line already in the
  // cart (from the ad-page stepper or the cart line itself), or the
  // number of places on an Extra Students line (from the cart line
  // itself). The line price is recomputed; the plan still counts
  // once for the bundle tiers — and an Extra Students line never
  // counts toward them at all. An Extra Students count may go down
  // to 0 (a 0-place line is skipped at checkout, see
  // businessData.js). A no-op for other plans and unknown keys.
  const updateExtraKids = (key, extraKids) => {
    const plan = BUSINESS_PLANS[key]
    if (!plan || (!isKidsPlanKey(key) && !isKidsExtraPlanKey(key))) return
    const n = Math.max(0, Number(extraKids) || 0)
    if (isKidsExtraPlanKey(key)) {
      setCartState(c => c.map(i => (i.key === key ? { ...i, extraKids: n, price: kidsExtraLinePrice(n) } : i)))
      return
    }
    setCartState(c => c.map(i => (i.key === key ? { ...i, extraKids: n, price: kidsLinePrice(n) } : i)))
  }

  const removePlan = (key) => setCartState(c => c.filter(i => i.key !== key))

  const hasPlan = (key) => cart.some(i => i.key === key)

  const clearCart = () => setCartState([])

  return (
    <BusinessCartCtx.Provider value={{ cart, count, addPlan, updateExtraKids, removePlan, hasPlan, clearCart, lastOrder, setLastOrder }}>
      {children}
    </BusinessCartCtx.Provider>
  )
}

export function useBusinessCart() {
  const ctx = useContext(BusinessCartCtx)
  if (!ctx) throw new Error('useBusinessCart must be used inside BusinessCartProvider')
  return ctx
}
