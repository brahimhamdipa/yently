import { useEffect, useState } from 'react'
import { KidsTopBar } from './KidsMenu'
import { loadSystemSwitches, isSystemOff } from '../lib/systemSwitches'

// Yently Kids hub page — reached from Systems → Yently Kids Systems. Same
// shape as the Business Systems hub: every subject in one place,
// each row linking to its own ad page. Prices match the ad pages
// exactly (every subject $5/month for the first 3 students,
// +$1/month for each extra student, no free month). No Add to
// cart here on purpose: each ad page has its own. Bundle tiers
// (2 plans 10% off, 3 plans 15% off, 4+ plans 20% off) apply
// automatically in My Cart — and because the cart is shared, Kids
// subjects count together with Business Systems plans. All 9
// subjects together: $45/month list, $36/month with 20% off.
const SUBJECTS = [
  { name: 'Math', price: 5, blurb: 'Four games — adding, taking away, multiplying, and dividing — by level.', tab: 'kids-math' , video: true },
  { name: 'English', price: 5, blurb: 'Spell it, pick the word, and what does it mean? — from your own word list.', tab: 'kids-english' , video: true },
  { name: 'Arabic', price: 5, blurb: 'Letters, words, and numbers in Arabic — right-to-left, big and clear.', tab: 'kids-arabic' , video: true },
  { name: 'French', price: 5, blurb: 'French words and meanings — spell them, pick them, know them.', tab: 'kids-french' , video: true },
  { name: 'Spanish', price: 5, blurb: 'Spanish words and meanings — spell them, pick them, know them.', tab: 'kids-spanish' , video: true },
  { name: 'Science', price: 5, blurb: 'Quizzes by topic — animals, space, the human body, and more.', tab: 'kids-science' , video: true },
  { name: 'Geography', price: 5, blurb: 'Countries, capitals, and flags — a quiz that travels the world.', tab: 'kids-geography' , video: true },
  { name: 'Coding', price: 5, blurb: 'Build a program from blocks and watch the robot run it.', tab: 'kids-coding' , video: true },
  { name: 'Reading', price: 5, blurb: 'A bookshelf of your own — pick a book, read it, finish it.', tab: 'kids-reading' , video: true },
]

function SubjectRow({ item, first, go }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: first ? 'none' : '1px solid #f1f2f5' }}>
      <div>
        <b>{item.name} — ${item.price}/month (first 3 kids) + $1/extra kid</b>
        <p style={{ margin: '4px 0 0' }}>{item.blurb}</p>
        {item.video && (
          <a href="#" onClick={(e) => { e.preventDefault(); if (go) go(item.tab) }} style={{ color: '#2563eb', fontWeight: 700, textDecoration: 'none' }}>▶ Watch the video — about a minute</a>
        )}
      </div>
      <button type="button" onClick={() => go && go(item.tab)} style={{ flexShrink: 0 }}>See it →</button>
    </div>
  )
}

export default function KidsHubPage({ go }) {
  // A subject switched Off in Admin disappears from this hub (its ad
  // page shows "currently unavailable" instead).
  const [switches, setSwitches] = useState(null)
  useEffect(() => { loadSystemSwitches().then(setSwitches) }, [])
  const visibleSubjects = SUBJECTS.filter(s => !isSystemOff(switches, s.tab))
  return (
    <div>
      <KidsTopBar go={go} />
      <div style={{ margin: '0 0 12px' }}>
        <button type="button" className="link-btn" onClick={() => go && go('business-hub')}>← Back to Systems</button>
      </div>
      <div className="hero-card" style={{ background: '#161d44', color: '#fff', textAlign: 'center' }}>
        <h2 style={{ color: '#fff' }}>🧒 Yently Kids</h2>
        <p style={{ fontSize: 18, color: '#fff' }}>Learning that feels like play.</p>
        <p>Nine subjects, one link per school — we build it, host it, and keep it running. $5/month per subject for your first 3 students, +$1/month for each extra student. No free month. Cancel free, any time.</p>
      </div>

      <div className="hero-card">
        <h3>Subjects</h3>
        {visibleSubjects.map((s, i) => (
          <SubjectRow key={s.tab} item={s} first={i === 0} go={go} />
        ))}
      </div>

      <div className="hero-card" style={{ textAlign: 'center' }}>
        <h3>Bundle &amp; save</h3>
        <p>2 subjects 10% off, 3 subjects 15% off, 4+ subjects 20% off — your saving is applied automatically, no code needed. Kids subjects count together with Business Systems plans. All 9 subjects together: $45/month list, $36/month with 20% off.</p>
        <button onClick={() => go && go('business-cart')}>Go to My Cart</button>
      </div>
    </div>
  )
}
