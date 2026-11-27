import { supabase } from './supabaseClient'

// Per-shop (per-customer) switches (Admin → menu 4 → Systems →
// Shops On/Off, 2026-11-26): the second level under the master system
// switches — one On/Off switch for EVERY shop (customer) of every
// folder-app system (12 Business Systems + 9 Yently Kids subjects).
// ON by default. A shop shows iff its system is visible AND its own
// shop switch is visible, computed at read time; turning a shop back
// On restores it exactly as it was. Table shop_switches (system text,
// slug text, visible boolean NOT NULL DEFAULT true, PK (system, slug))
// + SECURITY DEFINER RPCs list_shop_switches() (Admin list — unions
// the 21 live shop tables, so every shop appears, including ones
// created after the paste; a missing row means On) and
// shop_is_visible(p_system, p_slug) (folder-app boot gate) (paste 9).
// All reads fail open: a missing row or an RPC error means On — a
// broken switch never takes a working shop down.
//
// Keys are 'system:slug' (e.g. 'diner:demo-restaurant',
// 'kids-arabic:hamdi') — the (system, slug) pair is required because
// one slug can exist in several systems (hamdi is both a kids-arabic
// and a kids-math school).
export function shopKey(system, slug) {
  return system + ':' + slug
}

// Admin list: every shop, grouped by the caller. Returns
// [{ system, slug, visible }] — [] on any error (fail open: the Admin
// view shows "no shops" rather than crashing; shops stay up).
export function fetchShopSwitches() {
  return supabase.rpc('list_shop_switches')
    .then(({ data, error }) => {
      if (error) throw error
      const rows = []
      ;(data || []).forEach((r) => {
        if (r && r.system && r.slug) rows.push({ system: r.system, slug: r.slug, visible: r.visible !== false })
      })
      return rows
    })
    .catch(() => [])
}

// Site gates (TV gallery routes): one cached map for the session, the
// same shape as loadSystemSwitches — { 'system:slug': visible }.
// A missing key means On.
let shopSwitchesPromise = null
export function loadShopSwitches() {
  if (!shopSwitchesPromise) {
    shopSwitchesPromise = fetchShopSwitches()
      .then((rows) => {
        const map = {}
        rows.forEach((r) => { map[shopKey(r.system, r.slug)] = r.visible !== false })
        return map
      })
      .catch(() => ({}))
  }
  return shopSwitchesPromise
}

export function isShopOff(switches, system, slug) {
  return !!(switches && switches[shopKey(system, slug)] === false)
}
