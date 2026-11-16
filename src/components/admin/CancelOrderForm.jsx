import { useEffect, useState } from 'react'

// Shared cancel / approve-cancellation form, used by AdminCancellations,
// AdminSystemsOrders and AdminShopOrders.
//
// The admin always types the system and the shop slug by hand — no
// lookup is attempted, so the form works even when a shop table cannot
// be read. The system is the gate key the cancellation SQL uses to
// take a service page offline (see the order_table → system map
// below); the slug is that shop's slug (for Kids orders, the school
// slug). A blank system means "no service page to take offline" —
// the order is still cancelled, only the gating step is skipped.
//
// Props:
//   title — heading shown above the form
//   initialSystem — prefilled system (editable)
//   initialSlug — prefilled shop slug (editable)
//   showSlug — whether to show the shop-slug field at all
//   submitLabel — label of the submit button
//   noteLabel — label of the optional note / reason field
//   onSubmit({ system, slug, note }) — called with trimmed values
//   onClose — called by the Cancel button
//   submitting — disables the buttons while the RPC runs

// order_table -> system (the gate key). Copied from the spec — the
// same map the orders pages use to prefill the form. Tables with no
// gateable shop page (Simple Website, TV Gallery, Live Chat, Clean
// Link, Direct Upload) are deliberately absent: they map to '' and
// the slug field is hidden for them.
const SYSTEM_BY_ORDER_TABLE = {
  restaurant_order: 'diner',
  pos_order: 'pos',
  barbershop_order: 'barbers',
  dealer_order: 'dealer',
  employee_order: 'employee',
  bodyshop_order: 'bodyshop',
  houses_order: 'houses',
  doctor_order: 'doctor',
  holiday_order: 'holiday',
  rentals_order: 'rentals',
  laundry_order: 'laundry',
  gym_order: 'gym',
}

export function systemForOrderTable(orderTable) {
  if (!orderTable) return ''
  if (SYSTEM_BY_ORDER_TABLE[orderTable]) return SYSTEM_BY_ORDER_TABLE[orderTable]
  const kids = /^kids_([a-z]+)_order$/.exec(orderTable)
  if (kids) return 'kids-' + kids[1]
  return ''
}

export function isGateableOrderTable(orderTable) {
  return systemForOrderTable(orderTable) !== ''
}

export default function CancelOrderForm({
  title,
  initialSystem,
  initialSlug,
  showSlug,
  submitLabel,
  noteLabel,
  onSubmit,
  onClose,
  submitting,
}) {
  const [system, setSystem] = useState(initialSystem || '')
  const [slug, setSlug] = useState(initialSlug || '')
  const [note, setNote] = useState('')

  // The parent remounts the form per row (key), but keep the fields
  // in sync if the prefill ever changes under a live form.
  useEffect(() => { setSystem(initialSystem || '') }, [initialSystem])
  useEffect(() => { setSlug(initialSlug || '') }, [initialSlug])

  const submit = (e) => {
    e.preventDefault()
    onSubmit({ system: system.trim(), slug: slug.trim(), note: note.trim() })
  }

  return (
    <form className="form-card" onSubmit={submit}>
      {title && <h3>{title}</h3>}
      <label>
        System
        <input
          value={system}
          onChange={e => setSystem(e.target.value)}
          placeholder="e.g. diner, pos, gym, kids-arabic — blank if no service page"
        />
      </label>
      <p className="hint">The system whose service page goes offline. Leave blank when this order has no service page to take offline.</p>
      {showSlug && (
        <label>
          Shop slug
          <input
            value={slug}
            onChange={e => setSlug(e.target.value)}
            placeholder="Shop slug, as in the shop link"
          />
        </label>
      )}
      <label>
        {noteLabel || 'Note'}
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
          rows={3}
        />
      </label>
      <div className="store-actions">
        <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Working…' : (submitLabel || 'Submit')}</button>
        <button type="button" className="btn-soft" onClick={onClose} disabled={submitting}>Cancel</button>
      </div>
    </form>
  )
}
