import React from 'react';

export default function Manifest() {
  return (
    <section id="manifest" className="grain" style={{ padding: '160px 0', background: 'var(--ink)', color: 'var(--ivory)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px', position: 'relative', zIndex: 2 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--gold)', marginBottom: 32, letterSpacing: '0.3em' }}>Manifest</div>

          <h2 className="display" style={{ fontSize: 'clamp(40px, 5.5vw, 84px)', lineHeight: 1, fontWeight: 300, marginBottom: 60 }}>
            Ne prodajemo<br />
            <span className="display-italic gold-foil">putovanja.</span><br />
            Prodajemo <span className="display-italic gold-foil">znanje.</span>
          </h2>

          <div className="serif-lead" style={{ fontSize: 22, lineHeight: 1.6, color: 'var(--ivory)', opacity: 0.85, maxWidth: 720, margin: '0 auto 48px' }}>
            Booking, Kayak, Skyscanner — svaki od njih pokušava da ti proda. Svaki uzima proviziju iz tvoje cene.
            <br /><br />
            Mi ne. Mi smo tvoj <em style={{ color: 'var(--gold-light)' }}>privatni izviđač</em>. AI koji radi dok ti spavaš. Oko koje vidi kad je neka ruta pala 40% ispod proseka.
            <br /><br />
            Kada pronađemo nešto stvarno vredno — šaljemo ti. Ti rezervišeš <strong style={{ color: 'var(--gold-light)' }}>gde hoćeš</strong>. Mi ne diramo tvoj novac.
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, maxWidth: 400, margin: '0 auto', color: 'var(--gold)' }}>
            <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, currentColor, transparent)', opacity: 0.4 }} />
            <span className="serif-lead" style={{ fontSize: 14, fontStyle: 'italic', letterSpacing: '0.15em' }}>Info, non agentia</span>
            <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, currentColor, transparent)', opacity: 0.4 }} />
          </div>
        </div>
      </div>
    </section>
  );
}
