import { supabase } from './supabaseClient'

// System kill switches (Admin → menu 4 → Systems On/Off, 2026-11-26):
// one On/Off switch per folder-app system — the 12 Business Systems
// + the 9 Yently Kids subjects. ON by default. When a system is Off
// the whole system is down: the Systems hub hides it, its ad page
// shows an "unavailable" notice, and its folder app shows the same
// notice instead of the shop/school (Setup stays reachable, with its
// own notice). Table system_switches (system text PK, visible boolean
// NOT NULL DEFAULT true) + SECURITY DEFINER RPC list_system_switches()
// (paste 8). All reads fail open: a missing row or an RPC error means
// On — a broken switch never takes a working system down.
export const SYSTEM_LABELS = {
  diner: 'Restaurant',
  pos: 'POS',
  barbers: 'Barber',
  dealer: 'Dealer',
  employee: 'Employee',
  bodyshop: 'Bodyshop',
  houses: 'Houses',
  doctor: 'Doctor',
  holiday: 'Holiday',
  rentals: 'Car Rental',
  laundry: 'Laundry',
  gym: 'Gym',
  'kids-math': 'Kids Math',
  'kids-english': 'Kids English',
  'kids-arabic': 'Kids Arabic',
  'kids-french': 'Kids French',
  'kids-spanish': 'Kids Spanish',
  'kids-science': 'Kids Science',
  'kids-geography': 'Kids Geography',
  'kids-coding': 'Kids Coding',
  'kids-reading': 'Kids Reading',
}

// SPA tab -> system key: the one canonical map from a tab name to its
// system switch key, so the hubs, the ad pages and the TV gallery
// routes never disagree about which switch a tab belongs to.
export const TAB_TO_SYSTEM = {
  restaurants: 'diner',
  pos: 'pos',
  barbers: 'barbers',
  dealer: 'dealer',
  employee: 'employee',
  bodyshop: 'bodyshop',
  houses: 'houses',
  doctor: 'doctor',
  holiday: 'holiday',
  rentals: 'rentals',
  laundry: 'laundry',
  gym: 'gym',
  'kids-math': 'kids-math',
  'kids-english': 'kids-english',
  'kids-arabic': 'kids-arabic',
  'kids-french': 'kids-french',
  'kids-spanish': 'kids-spanish',
  'kids-science': 'kids-science',
  'kids-geography': 'kids-geography',
  'kids-coding': 'kids-coding',
  'kids-reading': 'kids-reading',
}

// The 21 keys, in hub order: 12 Business Systems, then 9 Kids subjects.
export const SYSTEM_KEYS = [
  'diner', 'pos', 'barbers', 'dealer', 'employee', 'bodyshop', 'houses',
  'doctor', 'holiday', 'rentals', 'laundry', 'gym',
  'kids-math', 'kids-english', 'kids-arabic', 'kids-french',
  'kids-spanish', 'kids-science', 'kids-geography', 'kids-coding',
  'kids-reading',
]

// One RPC for the whole site; the result is cached for the session
// (the Admin view uses fetchSystemSwitches for a fresh read after a
// toggle). Returns { key: visible } — a missing key means On.
let switchesPromise = null
export function fetchSystemSwitches() {
  return supabase.rpc('list_system_switches')
    .then(({ data, error }) => {
      if (error) throw error
      const map = {}
      ;(data || []).forEach((r) => { if (r && r.system) map[r.system] = r.visible !== false })
      return map
    })
    .catch(() => ({}))
}
export function loadSystemSwitches() {
  if (!switchesPromise) switchesPromise = fetchSystemSwitches()
  return switchesPromise
}

export function isSystemOff(switches, key) {
  return !!(switches && switches[key] === false)
}
