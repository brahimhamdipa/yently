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
