import React from 'react';

const stats = [
  { num: '12k+', desc: 'Ponuda skenirano dnevno iz 50+ izvora' },
  { num: '38%', desc: 'Prosečna ušteda na kuriranim dealovima' },
  { num: '217', desc: 'Destinacija u stalnom praćenju' },
  { num: '0%', desc: 'Provizije. Cena je tačno ona koju vidiš.' }
];

export default function TrustNumbers() {
  return (
    <section className="grain" style={{ padding: '140px 0', background: 'var(--paper-deep)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', position: 'relative' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px' }}>
        <div style={{ maxWidth: 700, marginBottom: 80 }}>
          <div className="eyebrow" style={{ color: 'var(--gold-deep)', marginBottom: 24 }}>Brojevi, bez blefa</div>
          <h2 className="display" style={{ fontSize: 'clamp(36px, 5vw, 76px)', lineHeight: 0.96, fontWeight: 400 }}>
            Više od <span className="display-italic gold-foil">samo</span><br />
            search bar-a.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 48 }}>
          {stats.map(stat => (
            <div key={stat.num}>
              <div className="display mono gold-foil" style={{ fontSize: 84, fontWeight: 600, lineHeight: 0.9, marginBottom: 12 }}>{stat.num}</div>
              <div className="serif-lead" style={{ fontSize: 17, color: 'var(--ink-mid)', lineHeight: 1.4, fontStyle: 'italic' }}>{stat.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
