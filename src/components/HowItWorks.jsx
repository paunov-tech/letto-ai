import React from 'react';

const steps = [
  { num: '01', title: 'AI skenira.', body: <>Naš sistem svaka 2 sata prolazi kroz Kiwi, Skyscanner, Booking i 50+ drugih izvora. Računa istorijski median za svaku rutu i flaguje samo ono što je <strong style={{ color: 'var(--accent)' }}>30%+ ispod proseka</strong>.</> },
  { num: '02', title: 'Mi kuriramo.', body: <>Ne šaljemo sve što AI pronađe. <strong style={{ color: 'var(--accent)' }}>Ručno biramo</strong> samo realno korisne dealove — sa letovima iz Beograda, Niša, Tivta ili obližnjih aerodroma.</> },
  { num: '03', title: 'Ti rezervišeš.', body: <>Dajemo ti sve — tačan datum, aviokompaniju, hotel, sajt. <strong style={{ color: 'var(--accent)' }}>Rezervišeš direktno kod partnera.</strong> Mi ne uzimamo ni tvoj novac, ni proviziju.</> }
];

export default function HowItWorks() {
  return (
    <section id="kako" className="grain" style={{ padding: '160px 0', background: 'var(--paper)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px' }}>
        <div style={{ maxWidth: 800, marginBottom: 100 }}>
          <div className="eyebrow" style={{ color: 'var(--gold-deep)', marginBottom: 24 }}>Kako radi</div>
          <h2 className="display" style={{ fontSize: 'clamp(36px, 5vw, 76px)', lineHeight: 0.96, fontWeight: 400 }}>
            Tri koraka.<br />
            <span className="display-italic">Bez izmišljanja.</span>
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 60 }}>
          {steps.map(step => (
            <div key={step.num}>
              <span style={{ fontFamily: 'Fraunces, serif', fontSize: 'clamp(100px, 14vw, 200px)', lineHeight: 0.85, fontWeight: 300, fontStyle: 'italic', color: 'var(--gold)', opacity: 0.25, display: 'block', marginBottom: 16 }}>
                {step.num}
              </span>
              <h3 className="display" style={{ fontSize: 40, fontWeight: 400, marginBottom: 20 }}>{step.title}</h3>
              <p className="serif-lead" style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6 }}>{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
