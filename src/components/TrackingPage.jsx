import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { submitAndNotify } from '../lib/notify'
import { fmtDate } from '../lib/admin'
import { BUSINESS_PLANS } from '../lib/BusinessCartContext'

// Public order tracking — /track.
// Looks an order up by its YEN- code (track_order RPC) or by email
// (track_orders_by_email RPC), shows the four-step timeline, and lets
// the customer ask for a cancellation (request_cancellation RPC +
// owner email via car_inquiries). The RPCs may not exist yet (the SQL
// lands separately), so every RPC call is wrapped: a missing function
// shows a plain error and never crashes the page.
//
// Colours come from index.css: green #059669 (the .confirm green)
// for completed steps and the header, gold #f5a623 (announce-bar /
// tagline gold) for the current step, grey #9ca3af for upcoming
// steps, red #dc2626 only for the cancelled notice.

const GREEN = '#059669'
const GOLD = '#f5a623'
const GREY = '#9ca3af'
const DARK_GREY = '#6b7280'
const RED = '#dc2626'

// Plan name -> list price, from the cart's single source of truth.
// Order rows store the plan NAME (see placeBusinessOrder). The tracker
// prefers the order row's recorded price (the RPC carries it) — a Kids
// order with extra students costs more than the plan's base price —
// and falls back to this map when the RPC has no price. A plan name
// that is not in the map has no known price — the price line is omitted
// rather than guessed. Shop orders have no price in the RPC at all,
// so they never show one.
const PLAN_BY_NAME = Object.fromEntries(
  Object.values(BUSINESS_PLANS).map((p) => [p.name, p]),
)

const STEPS = [
  { key: 'received', icon: '🧾', title: 'Received' },
  { key: 'being_prepared', icon: '👨‍🍳', title: 'Being prepared' },
  { key: 'ready', icon: '🎁', title: 'Ready' },
  { key: 'delivered', icon: '✅', title: 'Delivered' },
]

// Status strings the tracker accepts for each step — the SQL side
// may spell them slightly differently, so match loosely.
const STEP_ALIASES = {
  received: ['received'],
  being_prepared: ['being_prepared', 'being prepared', 'preparing', 'prepared', 'in_progress', 'in progress'],
  ready: ['ready'],
  delivered: ['delivered'],
}

function stepIndexFor(status) {
  const s = String(status || '').trim().toLowerCase()
  if (!s) return -1
  if (s === 'cancelled' || s === 'canceled') return -2
  for (let i = 0; i < STEPS.length; i += 1) {
    if (STEP_ALIASES[STEPS[i].key].includes(s)) return i
  }
  return -1
}

function historyAtFor(history, stepKey) {
  const list = Array.isArray(history) ? history : []
  const hit = list.find((h) =>
    STEP_ALIASES[stepKey].includes(String(h?.status || '').trim().toLowerCase()),
  )
  return hit?.at || null
}

// Date the order was cancelled: the LAST status_history entry whose
// status is cancelled (a re-cancel after a reopen would supersede
// an earlier one). Null when the history carries no such entry.
function cancelledAtFor(history) {
  const list = Array.isArray(history) ? history : []
  const hits = list.filter((h) =>
    ['cancelled', 'canceled'].includes(String(h?.status || '').trim().toLowerCase()),
  )
  if (hits.length === 0) return null
  return hits[hits.length - 1]?.at || null
}

function descriptionFor(row, stepKey) {
  const isShop = row?.kind === 'shop'
  if (stepKey === 'received') return 'We have received your order.'
  if (stepKey === 'being_prepared') {
    return isShop ? 'We are preparing your order.' : 'We are preparing your system.'
  }
  if (stepKey === 'ready') {
    if (!isShop) return 'Your system is ready.'
    return row?.fulfillment === 'pickup'
      ? 'Your order is ready for pickup.'
      : 'Your order is ready to go out.'
  }
  // delivered
  return isShop ? 'Your order has been delivered.' : 'Your system is live and handed over.'
}

// Accept with or without the "YEN-" prefix, case-insensitive:
// trim, uppercase, prepend "YEN-" when it is only digits.
function normaliseCode(raw) {
  const t = String(raw || '').trim().toUpperCase()
  if (!t) return ''
  if (/^YEN-\d+$/.test(t)) return t
  if (/^\d+$/.test(t)) return 'YEN-' + t
  return t
}

export default function TrackingPage({ go }) {
  const [codeInput, setCodeInput] = useState('')
  const [emailInput, setEmailInput] = useState('')
  const [showEmail, setShowEmail] = useState(false)
  const [order, setOrder] = useState(null)
  const [emailOrders, setEmailOrders] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelName, setCancelName] = useState('')
  const [cancelEmail, setCancelEmail] = useState('')
  const [cancelReason, setCancelReason] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [cancelSending, setCancelSending] = useState(false)
  const [cancelDone, setCancelDone] = useState(false)
  const [cancelReqStatus, setCancelReqStatus] = useState(null)
  const autoLookedUp = useRef(false)

  // Latest cancellation-request status for the open order, so a
  // pending/rejected request still shows after a reload (the submit
  // banner only lives until then). Missing RPC = no banner, the
  // tracker still works.
  const loadCancelReqStatus = async (code) => {
    try {
      const { data, error } = await supabase.rpc('cancellation_status_for_order', { p_code: code })
      if (!error) setCancelReqStatus(typeof data === 'string' ? data : null)
    } catch (e) {
      setCancelReqStatus(null)
    }
  }

  const loadByCode = async (code) => {
    const norm = normaliseCode(code)
    if (!norm) return
    setLoading(true)
    setError('')
    setEmailOrders(null)
    setCancelOpen(false)
    setCancelDone(false)
    setCancelReqStatus(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('track_order', { p_code: norm })
      if (rpcError) throw rpcError
      const rows = Array.isArray(data) ? data : []
      if (rows.length === 0) {
        setOrder(null)
        setError('not-found')
      } else {
        setOrder(rows[0])
        setError('')
        loadCancelReqStatus(rows[0].code)
      }
    } catch (e) {
      // The RPC does not exist yet (SQL not run) or the lookup
      // failed — say so plainly, keep the page usable.
      setOrder(null)
      setError('lookup-failed:' + (e?.message || 'lookup failed'))
    } finally {
      setLoading(false)
    }
  }

  const lookupByEmail = async () => {
    const email = emailInput.trim()
    if (!email) return
    setLoading(true)
    setError('')
    setOrder(null)
    setCancelOpen(false)
    try {
      const { data, error: rpcError } = await supabase.rpc('track_orders_by_email', { p_email: email })
      if (rpcError) throw rpcError
      setEmailOrders(Array.isArray(data) ? data : [])
    } catch (e) {
      setEmailOrders(null)
      setError('lookup-failed:' + (e?.message || 'lookup failed'))
    } finally {
      setLoading(false)
    }
  }

  // Checkout success screens write the fresh tracking code(s) here;
  // open the page straight onto the order, then clear the key so a
  // later visit starts empty.
  useEffect(() => {
    if (autoLookedUp.current) return
    autoLookedUp.current = true
    let codes = null
    try {
      codes = JSON.parse(sessionStorage.getItem('yently-last-tracking-codes') || 'null')
    } catch (e) {
      codes = null
    }
    sessionStorage.removeItem('yently-last-tracking-codes')
    const first = Array.isArray(codes) && codes.length > 0 ? String(codes[0]) : null
    if (first) {
      setCodeInput(first)
      loadByCode(first)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openCancel = () => {
    // A cancelled order can never open the cancel form — the CANCEL
    // button is hidden for it too, this is the backstop.
    if (stepIndexFor(order?.status) === -2) return
    setCancelName(order?.first_name || '')
    setCancelEmail('')
    setCancelReason('')
    setCancelError('')
    setCancelDone(false)
    setCancelOpen(true)
  }

  const submitCancel = async () => {
    if (!order || stepIndexFor(order?.status) === -2) return
    const name = cancelName.trim()
    const email = cancelEmail.trim()
    if (!email) {
      setCancelError('Please enter your email so Yently can find your request.')
      return
    }
    setCancelSending(true)
    setCancelError('')
    try {
      const { error: rpcError } = await supabase.rpc('request_cancellation', {
        p_tracking_code: order.code,
        p_customer_name: name,
        p_customer_email: email,
        p_reason: cancelReason.trim(),
      })
      if (rpcError) throw rpcError
      // Owner email — the request itself is saved even if the email
      // fails, so a notify failure never reports the request as lost.
      try {
        await submitAndNotify({
          table: 'car_inquiries',
          data: {
            car_id: null,
            car_name: 'Cancellation Request',
            name,
            email,
            phone: '',
            message: `Cancellation requested for order ${order.code} (${planLabel(order)}). Reason: ${cancelReason.trim() || '—'}`,
          },
          subject: `Cancellation Request — ${order.code}`,
        })
      } catch (notifyErr) {
        console.warn('Cancellation email failed (request itself was saved):', notifyErr?.message)
      }
      setCancelDone(true)
      setCancelReqStatus('pending')
    } catch (e) {
      setCancelError(
        'We couldn’t send your cancellation request right now — please contact Yently and we’ll take care of it.' +
        (e?.message ? ` (${e.message})` : ''),
      )
    } finally {
      setCancelSending(false)
    }
  }

  const isShop = order?.kind === 'shop'
  const cancelled = stepIndexFor(order?.status) === -2
  const cancelledAt = cancelled ? cancelledAtFor(order?.status_history) : null
  const currentStep = cancelled ? -1 : stepIndexFor(order?.status)
  // A status the tracker does not recognise still shows the order,
  // with every step grey until the history says otherwise.
  const effectiveCurrent = currentStep < 0 ? -1 : currentStep
  const canCancel = order && !cancelled && order.status !== 'delivered' && stepIndexFor(order?.status) !== 3

  const planLabel = (row) => {
    if (!row) return ''
    if (row.kind === 'shop') return row.store_name || 'Shop order'
    return row.plan || 'System order'
  }

  // System orders are monthly plans — show "$X/month" from the order
  // row's recorded price when the RPC carries one (a Kids order with
  // extra students is more than the plan's base price), else the known
  // list price. Shop orders are one-off totals and the RPC carries no
  // price, so they show no price line at all.
  const priceText = () => {
    if (!order || isShop) return null
    if (order.price != null) return `$${Number(order.price)}/month`
    const known = PLAN_BY_NAME[order.plan]
    if (!known) return null
    return `$${known.price}/month`
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {/* Green header bar: menu (home) — title — CANCEL (only while
          an order is loaded and can still be cancelled). */}
      <div
        style={{
          background: GREEN,
          color: '#fff',
          borderRadius: 14,
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={() => go('business-hub')}
          aria-label="Back to home"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: 22,
            padding: '4px 8px',
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          ☰
        </button>
        <h2 style={{ margin: 0, flex: 1, fontSize: 19, textAlign: 'center' }}>Track Order</h2>
        {canCancel ? (
          <button
            type="button"
            onClick={openCancel}
            style={{
              background: 'rgba(255,255,255,.18)',
              border: '1px solid rgba(255,255,255,.6)',
              color: '#fff',
              fontSize: 13,
              padding: '8px 12px',
              borderRadius: 999,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            CANCEL
          </button>
        ) : (
          <span style={{ width: 76 }} aria-hidden="true" />
        )}
      </div>

      {/* Lookup — shown when no order is loaded. */}
      {!order && (
        <div className="form-card" style={{ marginTop: 16 }}>
          <label>
            Order number
            <input
              placeholder="e.g. YEN-000123"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') loadByCode(codeInput) }}
              inputMode="text"
              autoCapitalize="characters"
            />
          </label>
          <button type="button" onClick={() => loadByCode(codeInput)} disabled={loading || !codeInput.trim()}>
            {loading ? 'Looking up…' : 'Find my order'}
          </button>
          {loading && <p className="hint">Looking up your order…</p>}
          {error === 'not-found' && (
            <p className="hint">We couldn’t find that order number — check it and try again.</p>
          )}
          {error && error.startsWith('lookup-failed:') && (
            <p className="hint">
              We couldn’t look that up right now — please try again in a moment, or contact Yently.
            </p>
          )}
          <p className="hint" style={{ marginTop: 8 }}>
            Don’t have your order number?{' '}
            <button type="button" className="link-btn" onClick={() => setShowEmail((s) => !s)}>
              Enter your email instead
            </button>
          </p>
          {showEmail && (
            <>
              <label>
                Email
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') lookupByEmail() }}
                />
              </label>
              <button type="button" onClick={lookupByEmail} disabled={loading || !emailInput.trim()}>
                {loading ? 'Looking up…' : 'Find my orders'}
              </button>
              {emailOrders && emailOrders.length === 0 && (
                <p className="hint">No orders found for that email.</p>
              )}
              {emailOrders && emailOrders.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {emailOrders.map((o) => (
                    <button
                      key={o.code}
                      type="button"
                      className="btn-soft"
                      style={{ textAlign: 'left', padding: '10px 12px' }}
                      onClick={() => { setCodeInput(o.code); loadByCode(o.code) }}
                    >
                      <b>{o.code}</b> · {o.kind === 'shop' ? 'Shop order' : (o.plan || 'System order')}
                      <br />
                      <span className="hint">
                        {o.status || ''}{o.created_at ? ` · ${fmtDate(o.created_at)}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Loaded order. */}
      {order && (
        <>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            {isShop && (
              <div className="hero-card" style={{ flex: 1, marginBottom: 0, padding: '14px 16px' }}>
                <div className="hint" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px' }}>ESTIMATED TIME</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>30 minutes</div>
              </div>
            )}
            <div className="hero-card" style={{ flex: 1, marginBottom: 0, padding: '14px 16px' }}>
              <div className="hint" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px' }}>ORDER NUMBER</div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{order.code}</div>
            </div>
          </div>

          {order.first_name && (
            <p style={{ margin: '16px 4px 0', fontSize: 16 }}>
              Hi, {order.first_name} — here’s your order.
            </p>
          )}

          {cancelled && (
            <p className="status" style={{ background: '#fef2f2', borderColor: '#fecaca', color: RED, fontWeight: 600 }}>
              This order was cancelled{cancelledAt ? ` on ${fmtDate(cancelledAt)}` : ''}.
            </p>
          )}

          {!cancelled && cancelReqStatus === 'pending' && (
            <p className="status" style={{ background: '#fffbeb', borderColor: '#fde68a', color: '#92400e', fontWeight: 600 }}>
              Cancellation requested — Yently is reviewing it. You can check its status here on this page.
            </p>
          )}

          {!cancelled && cancelReqStatus === 'rejected' && (
            <p className="status" style={{ background: '#fef2f2', borderColor: '#fecaca', color: RED, fontWeight: 600 }}>
              Your cancellation request was not approved — your order is still active.
            </p>
          )}

          {/* Vertical timeline — exactly four steps, same for shop
              and systems. Completed: green dot + green line +
              timestamp from status_history. Current: gold dot, bold
              title. Upcoming: grey dot, greyed out. Cancelled: all
              grey, timeline stopped. */}
          <div className="hero-card" style={{ marginTop: 14, padding: '20px 18px' }}>
            {STEPS.map((step, i) => {
              const at = historyAtFor(order.status_history, step.key)
              // Done = strictly before the current step. The current
              // step itself is gold, NOT green: status_history holds
              // an entry for the current step too (the RPC appends it
              // when the status is set), so testing `at` here would
              // turn the current step green. Exception: when the
              // order is delivered (the last step), everything is
              // done and nothing is "current".
              const isLastStep = i === STEPS.length - 1
              const isDone = !cancelled && (effectiveCurrent > i || (effectiveCurrent === i && isLastStep))
              const isCurrent = !cancelled && effectiveCurrent === i && !isLastStep
              const isUpcoming = cancelled || (!isDone && !isCurrent)
              const dotColor = cancelled ? GREY : isDone ? GREEN : isCurrent ? GOLD : GREY
              const lineColor = cancelled ? GREY : isDone ? GREEN : GREY
              const dimmed = isUpcoming
              return (
                <div key={step.key} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: dotColor,
                        border: `2px solid ${dotColor}`,
                        flexShrink: 0,
                        marginTop: 2,
                      }}
                    />
                    {i < STEPS.length - 1 && (
                      <div style={{ width: 2, flex: 1, minHeight: 34, background: lineColor, margin: '2px 0' }} />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < STEPS.length - 1 ? 18 : 0, opacity: dimmed ? 0.55 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20, lineHeight: 1 }}>{step.icon}</span>
                      <b style={{ fontSize: 15, color: isCurrent ? '#111827' : undefined }}>{step.title}</b>
                    </div>
                    <div style={{ color: DARK_GREY, fontSize: 13.5, marginTop: 3 }}>
                      {descriptionFor(order, step.key)}
                    </div>
                    {isDone && at && (
                      <div className="hint" style={{ marginTop: 2 }}>{fmtDate(at)}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Order details, in plain words. */}
          <div className="form-card" style={{ marginTop: 0 }}>
            <p style={{ margin: 0 }}><b>{isShop ? 'Store' : 'Plan'}:</b> {planLabel(order)}</p>
            <p style={{ margin: 0 }}><b>Order number:</b> {order.code}</p>
            <p style={{ margin: 0 }}><b>Date:</b> {order.created_at ? fmtDate(order.created_at) : '—'}</p>
            {priceText() && <p style={{ margin: 0 }}><b>Price:</b> {priceText()}</p>}
            {isShop && order.fulfillment && (
              <p style={{ margin: 0 }}><b>Getting it by:</b> {order.fulfillment === 'pickup' ? 'Pickup' : 'Delivery'}</p>
            )}
            <button type="button" className="btn-soft" onClick={() => { setOrder(null); setError(''); setCancelOpen(false); setCancelDone(false) }}>
              Track a different order
            </button>
          </div>

          {/* Cancel form — never shown for a cancelled order. */}
          {cancelOpen && !cancelDone && !cancelled && (
            <div className="form-card" style={{ marginTop: 16 }}>
              <h3 style={{ margin: 0 }}>Cancel this order?</h3>
              <p className="hint" style={{ margin: 0 }}>
                Order {order.code} — {planLabel(order)}. You can check the status of your request here on this page.
              </p>
              <label>
                Name
                <input value={cancelName} onChange={(e) => setCancelName(e.target.value)} />
              </label>
              <label>
                Email
                <input type="email" value={cancelEmail} onChange={(e) => setCancelEmail(e.target.value)} placeholder="you@example.com" />
              </label>
              <label>
                Reason (optional)
                <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Tell us why, if you like" />
              </label>
              {cancelError && <p className="hint" style={{ color: RED }}>{cancelError}</p>}
              <div className="store-actions">
                <button type="button" onClick={submitCancel} disabled={cancelSending}>
                  {cancelSending ? 'Sending…' : 'Request cancellation'}
                </button>
                <button type="button" className="btn-soft" onClick={() => setCancelOpen(false)}>
                  Keep my order
                </button>
              </div>
            </div>
          )}
          {cancelDone && (
            <p className="status" style={{ marginTop: 16 }}>
              Cancellation requested — you can check its status here on this page.
            </p>
          )}
        </>
      )}
    </div>
  )
}
