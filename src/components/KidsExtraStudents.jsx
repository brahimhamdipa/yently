import { KIDS_BASE_PRICE, KIDS_EXTRA_KID_PRICE, KIDS_INCLUDED_STUDENTS } from '../lib/BusinessCartContext'

// "Extra students" stepper, shared by all 9 Kids ad pages. The first
// 3 students are included in the $5/month base price; each extra
// student is +$1/month. The stepper only picks the count — the ad
// page owns the state and pushes the count into the cart (addPlan /
// updateExtraKids), so a plan already in the cart updates live.
export default function KidsExtraStudents({ extraKids, onChange }) {
  const n = Math.max(0, Number(extraKids) || 0)
  const set = (next) => onChange(Math.max(0, next))
  return (
    <div style={{ margin: '10px 0' }}>
      <p style={{ margin: '0 0 6px' }}><b>Extra students</b> — beyond the first {KIDS_INCLUDED_STUDENTS} included students</p>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={() => set(n - 1)} disabled={n <= 0} aria-label="One fewer extra student" style={{ minWidth: 36, fontSize: 18, lineHeight: 1, padding: '6px 10px' }}>−</button>
        <b style={{ minWidth: 20, textAlign: 'center', fontSize: 17 }}>{n}</b>
        <button type="button" onClick={() => set(n + 1)} aria-label="One more extra student" style={{ minWidth: 36, fontSize: 18, lineHeight: 1, padding: '6px 10px' }}>+</button>
      </div>
      <p className="hint" style={{ margin: '6px 0 0' }}>
        {n === 0
          ? `First ${KIDS_INCLUDED_STUDENTS} students included — $${KIDS_BASE_PRICE}/month.`
          : `+$${n * KIDS_EXTRA_KID_PRICE}/month for ${n} extra student${n === 1 ? '' : 's'} — $${KIDS_BASE_PRICE + n * KIDS_EXTRA_KID_PRICE}/month in total.`}
      </p>
    </div>
  )
}
