import { supabase } from './supabaseClient'

// Yently Customer Agreement — one source of truth for the text, the
// version and the signature call. The full text lives here so the
// checkout box, the standalone /agreement page and the admin welcome
// email all show exactly the same agreement. Bump the version (and
// the date) whenever the text changes — old signatures stay on the
// version they signed.
export const AGREEMENT_VERSION = 'v1'
export const AGREEMENT_DATE = '2026-11-23'

export const AGREEMENT_SECTIONS = [
  {
    title: '1. What Yently provides',
    body: [
      'Yently builds, hosts and runs a web page (a "system") for your business — for example a restaurant ordering page, a point-of-sale page, a barbershop booking page, a dealer page, or a Yently Kids school page — plus any add-ons you order, such as a Clean Link, a Golden Link, Your Own Domain, Direct Upload, Live Chat or a TV Gallery.',
      'Your page is yours to use for your own business. Yently keeps it online, backs it up as part of running the service, and helps you set it up. What you put on the page — your menu, your prices, your photos, your staff, your students — is your content and your responsibility.',
    ],
  },
  {
    title: '2. Prices and payment',
    body: [
      'Prices are listed on yently.com and are in US dollars, per month, per system or add-on. Yently may change any price, plan or feature at any time. A price change applies from your next payment — never to a month you have already paid for — and Yently will tell you before the new price applies.',
      'No payment is taken before Yently officially opens for payments. While Yently is not yet taking payments, your order is an expression of interest: Yently sets your page up, and payment starts when Yently begins collecting payments and tells you how to pay. If a payment method is ever needed, Yently will ask for it — Yently never takes money without telling you first.',
      'When payments have started, your monthly amount is charged at the start of each month for that month. Bundle discounts, free months and extra-student charges are as listed on the page where you ordered.',
    ],
  },
  {
    title: '3. Free first month',
    body: [
      'Where a system or add-on says "first month free", the first month costs nothing. The free month starts when your page is set up. Yently Kids has no free month: the first month is charged at the listed price.',
      'Add-ons bought later (for example a Clean Link added to a page you already have) are free for the rest of the current month and join your existing monthly amount from the next payment.',
    ],
  },
  {
    title: '4. Cancellation — free, any time',
    body: [
      'You can cancel any system or add-on at any time, free of charge — there is no cancellation fee and no minimum term. Tell Yently, or use the cancellation form on the order tracking page.',
      'When you cancel, your page stays live until the end of the month you have already paid for, and no further charges are made. The current month is not refunded unless Yently agrees otherwise. If you cancel during a free month, nothing is charged at all.',
    ],
  },
  {
    title: '5. Suspension and termination by Yently',
    body: [
      'Yently may suspend or terminate a system or add-on immediately, without a refund of the current month, if Yently reasonably believes there is suspicious activity, misuse, abuse, illegal content, content that harms others, spam, impersonation, non-payment, or use of the service in a way it was not built for. Yently may also suspend a page while an investigation is running.',
      'Yently may also end a service if the service itself is discontinued (see section 8). If Yently ends a service for a reason that is not your fault, Yently will tell you in advance where possible and will not charge you for any month after the service ends.',
    ],
  },
  {
    title: '6. Acceptable use',
    body: [
      'You agree to use your page only for lawful purposes. You must not put illegal, harmful, misleading, defamatory or hateful content on your page; send spam or unsolicited messages through it; impersonate any person or business; pretend to be Yently; resell, rent out or give away your Yently page or your access to it; or try to break, overload or misuse Yently\'s systems.',
      'You are responsible for everything that happens on your page under your logins — including what your staff, your team or anyone you share a password with does. Keep your passwords private and tell Yently at once if you think someone else has them.',
    ],
  },
  {
    title: '7. Your content and your responsibility',
    body: [
      'You own your content: your business name, menu, prices, photos, descriptions, staff lists and student lists. You are responsible for it being true, lawful and yours to use — including that you have the right to use every photo and every word you upload, that your prices and offers are correct, and that your business follows the laws where it operates (for example food, tax and consumer rules).',
      'Yently is not responsible for your content, your prices, your products, your bookings or your sales. If a customer of yours has a problem with what you sold or promised, that is between you and them.',
    ],
  },
  {
    title: '8. Changes to the service',
    body: [
      'Yently may change, improve, suspend or discontinue any feature, page or system at any time — for example to fix a problem, meet a legal requirement, or replace an old feature with a better one. Yently will try to tell you in advance about a change that affects your page. If a feature you paid for is removed, Yently will offer a replacement or stop charging you for it.',
    ],
  },
  {
    title: '9. No warranties',
    body: [
      'Yently provides your page "as is" and "as available". Yently does not promise that the service will never go down, never have a bug, or fit every purpose. Yently will fix problems as quickly as it reasonably can, but does not guarantee uninterrupted or error-free service.',
    ],
  },
  {
    title: '10. Limits on liability',
    body: [
      'To the fullest extent allowed by law, Yently\'s total liability to you for any claim about the service is limited to the amounts you actually paid to Yently in the 12 months before the claim. Yently is not liable for lost profits, lost sales, lost data or any indirect or consequential loss.',
      'Nothing in this agreement limits liability that cannot be limited by law.',
    ],
  },
  {
    title: '11. Data and privacy',
    body: [
      'Yently stores the information needed to run your page: your name, email, phone, your page\'s content, orders, bookings and messages. Yently uses it only to provide the service, to support you, and to contact you about your pages and payments. Yently does not sell your information.',
      'Yently\'s administrators can access your shop data when providing support — for example to fix a problem, approve a change, or help you recover access. Your setup passwords are stored so Yently can help you; keep your own copies safe, and change them whenever someone who should not have them might.',
      'You are responsible for the personal information you collect from your own customers and students on your page, and for handling it lawfully.',
    ],
  },
  {
    title: '12. Support',
    body: [
      'Support is by email. Yently will answer as quickly as it reasonably can during its working hours. Yently does not promise a response time, and does not provide phone support unless it says so.',
    ],
  },
  {
    title: '13. Governing law',
    body: [
      'This agreement is governed by the laws of the Commonwealth of Pennsylvania, United States of America. Any dispute about it will be handled in the courts of Pennsylvania.',
    ],
  },
  {
    title: '14. Changes to these terms',
    body: [
      'Yently may change these terms from time to time. The current version is always shown at yently.com/agreement, with its version and date. If you keep using your page after a change, that means you accept the new terms. If you do not accept a change, you may cancel under section 4.',
    ],
  },
  {
    title: '15. Entire agreement',
    body: [
      'This agreement, together with the order you placed, is the whole agreement between you and Yently about your pages. It replaces any earlier promises or understandings about them. If any part of this agreement cannot be enforced, the rest of it still applies.',
    ],
  },
]

// Save a customer's signature. The checkbox (agreed) is enforced
// server-side by the RPC: agreed must be true, the email must look
// like an email, and the name and signature must not be empty.
// Returns { ok: true, id } on success, or { ok: false, error }.
export async function signCustomerAgreement({ email, customerName, signatureName, agreed, plan, orderCode, source }) {
  const { data, error } = await supabase.rpc('sign_customer_agreement', {
    p_email: (email || '').trim(),
    p_customer_name: (customerName || '').trim(),
    p_signature_name: (signatureName || '').trim(),
    p_agreed: agreed === true,
    p_plan: plan || null,
    p_order_code: orderCode || null,
    p_source: source || 'agreement-page',
  })
  if (error) throw error
  return data || { ok: false, error: 'Could not save the signature.' }
}
