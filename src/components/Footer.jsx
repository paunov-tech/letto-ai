import React from 'react';

export default function Footer() {
  return (
    <footer className="grain" style={{ padding: '100px 0 60px', background: 'var(--ink)', color: 'var(--ivory)' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px', position: 'relative', zIndex: 2 }}>

        {/* Large seal */}
        <div style={{ textAlign: 'center', marginBottom: 80 }}>
          <img src="/eagle-seal.svg" alt="LETTO seal" width="120" height="132" style={{ margin: '0 auto', display: 'block' }} />
          <div className="serif-lead" style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--gold-light)', opacity: 0.7, letterSpacing: '0.1em', marginTop: 12 }}>
            Ad meliora · volare
          </div>
        </div>

        {/* Columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 48, marginBottom: 60 }}>
          <div style={{ gridColumn: 'span 2', maxWidth: 500 }}>
            <div className="logo-mark" style={{ fontSize: 42, marginBottom: 20, color: 'var(--ivory)', fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 500, letterSpacing: '-0.04em', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
              letto
              <span style={{ fontSize: '0.4em', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'normal', color: 'var(--gold)', marginLeft: 3, transform: 'translateY(-12px)', display: 'inline-block' }}>.live</span>
            </div>
            <p className="serif-lead" style={{ fontSize: 17, lineHeight: 1.6, opacity: 0.7, fontStyle: 'italic' }}>
              AI kurator putničkih dealova za Balkan. Pronalazimo ponude koje vredi videti. Ti rezervišeš gde hoćeš.
            </p>
          </div>

          <div>
            <div className="eyebrow" style={{ color: 'var(--gold)', marginBottom: 20, opacity: 0.6 }}>Proizvod</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 15 }}>
              <FooterLink href="#dealovi">Današnji dealovi</FooterLink>
              <FooterLink href="#">Newsletter</FooterLink>
              <FooterLink href="https://t.me/letto_ai_deals">Telegram kanal</FooterLink>
              <FooterLink href="#kako">Kako radi</FooterLink>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ color: 'var(--gold)', marginBottom: 20, opacity: 0.6 }}>Pravno</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 15 }}>
              <FooterLink href="/privacy">Privacy policy</FooterLink>
              <FooterLink href="/terms">Uslovi korišćenja</FooterLink>
              <FooterLink href="/impressum">Impressum</FooterLink>
              <FooterLink href="mailto:info@letto.live">Kontakt</FooterLink>
            </div>
          </div>
        </div>

        <div style={{ paddingTop: 40, borderTop: '1px solid rgba(228,195,122,0.15)', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between', fontSize: 13, opacity: 0.5 }}>
          <div>© 2026 SIAL Consulting d.o.o. · Brežice, Slovenija</div>
          <div className="serif-lead" style={{ fontStyle: 'italic' }}>Designed in Brežice · Built in Beograd</div>
        </div>
      </div>
    </footer>
  );
}

function FooterLink({ href, children }) {
  return (
    <a
      href={href}
      style={{ color: 'var(--ivory)', opacity: 0.8, textDecoration: 'none', transition: 'color 0.2s' }}
      onMouseEnter={e => e.currentTarget.style.color = 'var(--gold-light)'}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--ivory)'; e.currentTarget.style.opacity = '0.8'; }}
    >
      {children}
    </a>
  );
}
