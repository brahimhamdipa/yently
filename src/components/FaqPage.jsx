import { useState } from 'react'

// FaqPage — frequently asked questions, grouped by topic.
//
// DATA-DRIVEN: to add a question, add one { q, a } row to the right
// section below. `a` is one paragraph, or an array of paragraphs.
// Answers are written as if it is January (launch — everything working).
// No new CSS: hero-card + form-card wide, like GuidesPage.

const FAQ_SECTIONS = [
  {
    title: 'About Yently',
    items: [
      {
        q: 'What is Yently?',
        a: 'Yently is one place for everything a small business — and a family — needs: business systems, flight tickets, shopping, and cars. A restaurant, a shop, a school or a family should not need ten different websites to get things done. Our promise is: "Everything you need, gently in one place".',
      },
      {
        q: 'When does Yently open?',
        a: 'We officially open in early 2027. Everything on this site is ready for launch — you can browse the systems, the shop, cars and flights now, and order when we open.',
      },
      {
        q: 'Do I need an account to browse?',
        a: 'No. You can look at everything — systems, prices, guides, cars, flights and the shop — without an account. When you order something, we ask for your name and email so we can send you your order details and your logins.',
      },
      {
        q: 'Are there setup fees or commissions?',
        a: 'No setup fee, and no commission on what you sell — ever. You pay the monthly price of the plan you pick, and what your customers pay you is yours.',
      },
    ],
  },
  {
    title: 'Business Systems',
    items: [
      {
        q: 'What are the business systems?',
        a: 'The tools a small business runs on, each one its own page that we build, host and keep running for you: Restaurant (your own ordering page with a live kitchen screen), POS (a point-of-sale register with stock and receipts), Barber (booking page with a Serving Now board), Dealer (vehicles, test drives and trade-ins), Employee (time tracking and employee records), Bodyshop (estimates, jobs, customers and loan cars), Houses (listings, photos and a mortgage calculator), Doctor (clinic page with doctors, prices and appointments), Holiday (holiday rentals with properties, dates and bookings), Car Rental (cars, drivers and bookings), Laundry (services, prices and orders with pickup or delivery), Gym (memberships, classes, trainers and check-ins), and Simple Website (any website, built for you).',
      },
      {
        q: 'How much does a system cost?',
        a: [
          'Restaurant is $40/month and POS is $50/month. Barber, Dealer, Employee, Bodyshop, Houses, Doctor, Holiday, Car Rental, Laundry and Gym are $20/month each. Simple Website is $10/month. The first month is free on every system.',
          'Buy more than one and you save automatically — no code needed: 2 plans get 10% off, 3 plans get 15% off, and 4 or more plans get 20% off. Add-ons and Yently Kids subjects count toward the discount too.',
        ],
      },
      {
        q: 'How does setup work?',
        a: 'Order the system you want and we build your page for you. You get a Setup login (a username and password). Sign in, fill in your details — your menu, your services, your prices, your pictures — and save it as a draft. We check it and approve it, and then your page goes live. After that, you can change anything in Setup whenever you like.',
      },
      {
        q: 'What is the owner login (Setup login)?',
        a: 'The username and password Yently gives you when you order a system. It is yours alone: it opens your Setup page, where you change your own page — your menu, prices, pictures, staff and settings. Keep it private, and never share it with customers.',
      },
      {
        q: 'What is the employee password?',
        a: 'One shared password for each shop, separate from your owner login. Your staff use it to open the staff-only parts of your page — ordering, the kitchen screen, bookings, receipts and so on, depending on the system. Share it with your team only, and change it in Setup if someone leaves.',
      },
      {
        q: 'Can I see a live example before I buy?',
        a: 'Yes. Every system has a short video and a step-by-step guide (PDF) on the Guides page — open More, then Help Center, then Guides. The Simple Website example is a live barbershop booking page, with a live queue and a stopwatch for every cut.',
      },
      {
        q: 'How do I cancel a system?',
        a: 'Cancelling is free, any time. You can cancel from the Track Order page, or just tell us on the Contact Us page. Your system stays live until the end of the month you have already paid for — you never lose days you paid for.',
      },
    ],
  },
  {
    title: 'Yently Kids',
    items: [
      {
        q: 'What is Yently Kids?',
        a: 'Learning systems for children: Math, English, Arabic, French, Spanish, Science, Geography, Coding and Reading. Each subject is its own school page with lessons, exercises and scores — built for schools, and for families learning at home.',
      },
      {
        q: 'How much does Yently Kids cost?',
        a: 'Each subject is $5/month for your first 3 students, plus $1/month for each extra student. There is no first month free on Yently Kids, and cancelling is always free — your school stays live until the end of the month you have paid for.',
      },
      {
        q: 'How do student PINs work?',
        a: 'Every student gets their own 4-digit PIN. The PIN opens that student\u2019s own place — their lessons and their scores stay private to them, and the teacher sees each student separately.',
      },
      {
        q: 'How are scores recorded?',
        a: 'Only the student\u2019s best score is recorded. A student can try an exercise again as many times as they like — a lower score never replaces a better one.',
      },
      {
        q: 'What are the speaker buttons?',
        a: 'On every word, a speaker button reads the word out loud — so a child can hear how it sounds, in the language they are learning, and practice saying it.',
      },
      {
        q: 'How does a school get set up?',
        a: 'Order the subjects your school wants and we set your school page up for you. Then, in Setup, you add your students and their PINs, and the students can start learning straight away. If you need more student places later, order Extra Students from the same page.',
      },
    ],
  },
  {
    title: 'Shop & Cars',
    items: [
      {
        q: 'Can I buy from the Yently Shop?',
        a: 'Yes. Browse products from local stores — groceries and more — and order with delivery or pickup in covered areas. You can also order Yently Bags, packed lunches and snacks delivered to your company.',
      },
      {
        q: 'Can I sell my products in the Shop?',
        a: 'Not yet. Seller logins are not open to everyone yet — Yently is focused on Business Systems first, and we will open the Shop to sellers later. Check back, or ask us on the Contact Us page and we will let you know when seller places open.',
      },
      {
        q: 'Can I buy a car on Yently?',
        a: 'Yes. Browse the cars for sale — every listing shows real photos, mileage and price. Found one you like? Tap "I\u2019m interested" and we will get right back to you.',
      },
      {
        q: 'Can I sell my car on Yently?',
        a: 'Yes. You can sell one car for $5, one time, or become a YENTLY seller for $20 a month with unlimited listings and the first month free. A one-time listing stays live for 60 days — if your car hasn\u2019t sold by then, you can renew it with another $5 order. Listings from a YENTLY seller stay live for 1 year and renew while the subscription is active. Tap Become a Yently Car Seller on the Cars seller login page to get started.',
      },
    ],
  },
  {
    title: 'Flights',
    items: [
      {
        q: 'How do I book a flight?',
        a: 'Tell us where you are going, when, and who is travelling — adults, children, and everyone\u2019s ages. We\u2019ll check prices and get back to you with options as soon as we can. No endless searching, no confusing fare pages.',
      },
      {
        q: 'How does Pay Flight work?',
        a: 'Once you have picked your flights and agreed the price with us, you pay Yently the agreed amount. Yently then pays the airline partner, and your tickets are issued. You always pay Yently — never the airline partner directly.',
      },
      {
        q: 'What do I pay, exactly?',
        a: 'The amount we agreed with you for your flights. You enter that agreed amount when you pay — nothing extra is added at payment.',
      },
    ],
  },
  {
    title: 'Orders, tracking & cancellations',
    items: [
      {
        q: 'How do I track my order?',
        a: 'Every order gets its own tracking code, starting with YEN-. You will find it in your order email. Enter it on the Track Order page (More, then Track Order, or yently.com/track) to see where your order stands.',
      },
      {
        q: 'How long until I hear back?',
        a: 'We usually reply by email within 24 hours. Every message goes straight to a real person on our team.',
      },
      {
        q: 'How do I cancel an order?',
        a: 'Cancelling is free, any time. You can cancel from the Track Order page, or tell us on the Contact Us page. For a business system or a Kids subject, the service stays live until the end of the month you have paid for.',
      },
    ],
  },
  {
    title: 'Passes & Pass Recovery',
    items: [
      {
        q: 'What is a pass?',
        a: 'Your pass is the login that lets you change your own page: your Setup username and password for a business system, or a student PIN for Yently Kids. Your employee password is a separate shared pass for your staff.',
      },
      {
        q: 'I forgot my password — what do I do?',
        a: [
          'Open Pass Recovery (More, then Help Center, then Pass Recovery) and enter the email you ordered with. We send you a 6-digit code by email, or you can ask for a magic link instead — either one opens your My Access page.',
          'On My Access you will see your shops, your Setup username and password, and your team or teacher password, and you can change them there.',
        ],
      },
    ],
  },
  {
    title: 'Add-ons',
    items: [
      {
        q: 'What add-ons can I add to my system?',
        a: 'TV Gallery ($2/month) puts your pictures on a TV screen. Live Chat ($3/month) adds live chat to your website. Clean Link ($5/month) gives your system a short, clean link — Golden Link is $10/month and Your Own Domain is $20/month. Direct Upload ($5/month) sends your uploads live straight away, with no waiting for approval. Reports ($5/month) gives you totals, filters, printing and PDF downloads for your orders. Remove Branding ($5/month) takes the small "Powered by Yently" banners off your pages. The first month is free on add-ons.',
      },
      {
        q: 'Do add-ons count toward the bundle discount?',
        a: 'Yes. Add-ons and Yently Kids subjects count toward the bundle tiers — 10% off two plans, 15% off three, 20% off four or more — and the saving is applied automatically.',
      },
    ],
  },
  {
    title: 'Overseas stores & currencies',
    items: [
      {
        q: 'What currency are Yently prices in?',
        a: 'Prices on the US site are in US dollars, and Yently\u2019s books stay in US dollars.',
      },
      {
        q: 'What about Yently stores in other countries?',
        a: 'Yently also has family-run stores abroad — YENTLY (FR) in France, YENTLY (ES) in Spain, and more coming in Italy, Germany and Morocco. Customers there see prices in their own local currency — euros, dirhams — set as clean local prices, not live conversions from dollars.',
      },
      {
        q: 'What currency do overseas customers pay in?',
        a: 'Their own local currency — euros in France, Spain, Italy and Germany, dirhams in Morocco. The price they see is the price they pay.',
      },
      {
        q: 'Who gets the money from an overseas sale?',
        a: 'Yently takes a small commission, and the local seller keeps the rest. The local seller buys the products with their own money, sells them through Yently, and is paid what they sold minus Yently\u2019s small share.',
      },
    ],
  },
  {
    title: 'Getting help',
    items: [
      {
        q: 'How do I reach Yently?',
        a: 'Use the Contact Us page — open More, then Contact Us — and tell us anything: feedback, a question, or a problem. We read every message and usually reply by email within 24 hours.',
      },
      {
        q: 'I found a problem on the website — what do I do?',
        a: 'Please tell us. On the Contact Us page, choose "Website issue" and describe what you saw — which page, and what went wrong. The more detail, the faster we can fix it.',
      },
      {
        q: 'Something went wrong with my order — who do I tell?',
        a: 'Tell us on the Contact Us page — choose "Problem with Yently" — or check your order first on the Track Order page with your YEN- code. Either way, a real person will look into it and get back to you.',
      },
    ],
  },
]

const qStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
  textAlign: 'left',
  background: 'none',
  border: 'none',
  borderBottom: '1px solid #e5e7eb',
  padding: '13px 2px',
  fontSize: 16,
  fontWeight: 700,
  color: '#111827',
  cursor: 'pointer',
}
const signStyle = { color: '#b8860b', fontSize: 20, lineHeight: 1, flexShrink: 0 }

export default function FaqPage({ go }) {
  const [open, setOpen] = useState(null)
  const toggle = (key) => setOpen(open === key ? null : key)

  return (
    <div>
      <div className="hero-card">
        <h2>Frequently Asked Questions</h2>
        <p>Everything people ask us about Yently — the systems, Kids, the shop, cars, flights, orders and more. Tap a question to see the answer.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {FAQ_SECTIONS.map((section, si) => (
          <div className="form-card wide" key={section.title}>
            <h3>{section.title}</h3>
            {section.items.map((item, qi) => {
              const key = `${si}-${qi}`
              const isOpen = open === key
              return (
                <div key={item.q}>
                  <button type="button" style={qStyle} onClick={() => toggle(key)} aria-expanded={isOpen}>
                    <span>{item.q}</span>
                    <span style={signStyle}>{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '4px 2px 14px' }}>
                      {(Array.isArray(item.a) ? item.a : [item.a]).map((para, pi) => (
                        <p key={pi} style={{ margin: '10px 0 0' }}>{para}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="form-card wide">
          <h3>Still have a question?</h3>
          <p>Ask us anything — feedback, a problem, or just a question. We read every message and usually reply by email within 24 hours.</p>
          <button type="button" onClick={() => go && go('contact-us')}>Contact Us</button>
        </div>
      </div>
    </div>
  )
}
