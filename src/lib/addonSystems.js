// One source of truth for every system an add-on can belong to.
//
// The Clean Link, Direct Upload and Live Chat pages, the cart
// (BusinessCartContext) and the checkout notes (businessData) all
// read this list — nobody keeps a second copy. Adding a new system
// means adding ONE row here: it then appears in every add-on
// dropdown, in the deep-link check and in the owner-email labels
// automatically, with no other file to touch.
//
// Order matches the add-on dropdowns: the 12 Business Systems,
// then Store and Cars sellers, then the 9 Yently Kids subjects.
// 'store' and 'car-seller' are SPA pages (Shop seller / Car
// seller), not folder apps — they still take add-ons, so they are
// here too.
export const ADDON_SYSTEM_OPTIONS = [
  { label: 'Restaurant', value: 'diner' },
  { label: 'POS', value: 'pos' },
  { label: 'Barbershop', value: 'barbers' },
  { label: 'Dealer', value: 'dealer' },
  { label: 'Employee', value: 'employee' },
  { label: 'Bodyshop', value: 'bodyshop' },
  { label: 'Houses', value: 'houses' },
  { label: 'Doctor', value: 'doctor' },
  { label: 'Holiday', value: 'holiday' },
  { label: 'Car Rental', value: 'rentals' },
  { label: 'Laundry', value: 'laundry' },
  { label: 'Gym', value: 'gym' },
  { label: 'Store', value: 'store' },
  { label: 'Cars', value: 'car-seller' },
  { label: 'Kids Math', value: 'kids-math' },
  { label: 'Kids English', value: 'kids-english' },
  { label: 'Kids Arabic', value: 'kids-arabic' },
  { label: 'Kids French', value: 'kids-french' },
  { label: 'Kids Spanish', value: 'kids-spanish' },
  { label: 'Kids Science', value: 'kids-science' },
  { label: 'Kids Geography', value: 'kids-geography' },
  { label: 'Kids Coding', value: 'kids-coding' },
  { label: 'Kids Reading', value: 'kids-reading' },
]

// Reports covers the 12 Business Systems ONLY — the same first 12
// rows above, in the same order. Yently Kids schools (the 9
// kids-* subjects), Store sellers and Car sellers are NOT here on
// purpose: Reports reads those systems' order/booking tables, and
// Kids/Store/Cars have no folder-app Setup page for the Reports
// view to live on. Filtered FROM the shared list, so a label change
// above flows through here — but never add a Kids/Store/Cars row
// to this list. The Reports ad page, the cart deep-link check and
// the Admin Reports switches all read this list, never the full
// one. The shared ADDON_SYSTEM_OPTIONS above is untouched.
export const REPORTS_SYSTEM_OPTIONS = ADDON_SYSTEM_OPTIONS.filter((o) =>
  ['diner', 'pos', 'barbers', 'dealer', 'employee', 'bodyshop', 'houses', 'doctor', 'holiday', 'rentals', 'laundry', 'gym'].includes(o.value)
)

// The same 12 keys as a Set, for the cart's deep-link check
// (BusinessCartContext REPORTS_SYSTEMS) and the checkout guard
// (reportsData.js refuses any other system outright).
export const REPORTS_SYSTEM_KEYS = new Set(REPORTS_SYSTEM_OPTIONS.map((o) => o.value))

// The same keys as a Set, for the cart's deep-link check
// (BusinessCartContext ADDON_SYSTEMS).
export const ADDON_SYSTEM_KEYS = new Set(ADDON_SYSTEM_OPTIONS.map((o) => o.value))

// The same pairs as a key -> label map, for owner emails and order
// notes (businessData SYSTEM_LABELS).
export const ADDON_SYSTEM_LABELS = Object.fromEntries(
  ADDON_SYSTEM_OPTIONS.map((o) => [o.value, o.label])
)

// The display label for a system key, or the key itself when it is
// not in the list (an old stored value never blanks a note).
export function addonSystemLabel(value) {
  return ADDON_SYSTEM_LABELS[value] || value || ''
}
