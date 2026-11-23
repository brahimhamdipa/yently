import { AGREEMENT_SECTIONS, AGREEMENT_VERSION, AGREEMENT_DATE } from '../lib/agreement'

// The full Yently Customer Agreement, in small type — the same text
// everywhere it is shown (checkout box, /agreement page). The text
// itself lives in src/lib/agreement.js; this only renders it.
export default function AgreementText() {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.6 }}>
      <p><b>Yently Customer Agreement</b> — version {AGREEMENT_VERSION} ({AGREEMENT_DATE})</p>
      {AGREEMENT_SECTIONS.map(s => (
        <div key={s.title} style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 4px' }}><b>{s.title}</b></p>
          {s.body.map((p, i) => (
            <p key={i} style={{ margin: '0 0 6px' }}>{p}</p>
          ))}
        </div>
      ))}
      <p className="hint" style={{ marginTop: 12 }}>By signing, you agree to all of the above.</p>
    </div>
  )
}
