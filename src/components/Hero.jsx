import React from 'react';

export default function Hero() {
  return (
    <section className="grain" style={{ position: 'relative', padding: '80px 0 140px', overflow: 'hidden', minHeight: '90vh', background: 'linear-gradient(180deg, var(--paper) 0%, var(--paper-warm) 100%)' }}>

      {/* Flying birds */}
      <FlyingBird top="15%" duration="18s" delay="0s" size={60} opacity={0.7} />
      <FlyingBird top="25%" duration="22s" delay="-5s" size={45} opacity={0.5} />
      <FlyingBird top="45%" duration="20s" delay="-10s" size={50} opacity={0.6} />
      <FlyingBird top="60%" duration="25s" delay="-15s" size={40} opacity={0.4} />

      {/* Drift badges */}
      <div className="hidden lg:block" style={{ ...driftBadgeStyle, top: '12%', right: '8%', animationDelay: '-3s' }}>
        <span className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>−42%</span> Santorini, jul
      </div>
      <div className="hidden lg:block" style={{ ...driftBadgeStyle, top: '32%', right: '16%', animationDelay: '-5s' }}>
        <span className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>−52%</span> Dubai, februar
      </div>

      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px', position: 'relative', zIndex: 5 }}>

        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 48 }}>
          <svg width="40" height="40" viewBox="0 0 40 40">
            <g fill="none" stroke="var(--gold)" strokeWidth="1.2">
              <circle cx="20" cy="20" r="18" opacity="0.5" />
              <circle cx="20" cy="20" r="12" opacity="0.3" />
              <path d="M20 6 L23 18 L20 14 L17 18 Z" fill="var(--gold)" stroke="none" />
            </g>
          </svg>
          <div>
            <div className="eyebrow" style={{ color: 'var(--gold-deep)' }}>Putnički deal kurator · osnovan 2026</div>
            <div className="serif-lead" style={{ fontSize: 18, color: 'var(--muted)', marginTop: 4, fontStyle: 'italic' }}>iz Brežica, za Balkan</div>
          </div>
        </div>

        {/* Mega headline */}
        <h1 className="display" style={{ fontSize: 'clamp(64px, 11vw, 200px)', lineHeight: 0.88, fontWeight: 300, maxWidth: 1200, marginBottom: 48 }}>
          Putovanja <span className="display-italic gold-foil">drugi</span><br />
          ne vide.<br />
          <span className="display-italic" style={{ color: 'var(--accent)' }}>Mi vidimo.</span>
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 48, alignItems: 'start', maxWidth: 1200 }}>
          {/* Left: Value prop */}
          <div style={{ gridColumn: 'span 5' }}>
            <p className="serif-lead" style={{ fontSize: 22, lineHeight: 1.4, color: 'var(--ink-mid)', marginBottom: 36, maxWidth: 480 }}>
              AI skenira 12 000 ponuda dnevno. Mi biramo samo one koje su <strong style={{ color: 'var(--accent)', fontStyle: 'italic' }}>stvarno</strong> ispod proseka. Bez provizije. Bez spama. Rezervišeš direktno.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 48 }}>
              <a href="#dealovi" className="btn-dark">Pogledaj današnje dealove →</a>
              <a href="#kako" className="btn-outline">Kako radi</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, color: 'var(--muted)' }}>
              <span style={{ width: 8, height: 8, background: '#16803D', borderRadius: '50%', boxShadow: '0 0 0 4px rgba(22,128,61,0.2)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
              <span className="mono" style={{ letterSpacing: '0.05em' }}>UŽIVO · <strong style={{ color: 'var(--ink)' }}>12 847</strong> ponuda skenirano · posl. sat</span>
            </div>
          </div>

          {/* Right: Price comparison */}
          <div style={{ gridColumn: 'span 7' }}>
            <PriceComparison />
          </div>
        </div>
      </div>
    </section>
  );
}

function FlyingBird({ top, duration, delay, size, opacity }) {
  return (
    <svg style={{ position: 'absolute', top, left: '-50px', width: size, height: size * 0.6, animation: `fly-across ${duration} linear infinite`, animationDelay: delay, zIndex: 3 }} viewBox="0 0 100 60">
      <path d="M20 30 Q30 22 40 30 Q50 22 60 30 Q50 27 40 27 Q30 27 20 30" fill="var(--ink)" opacity={opacity} />
    </svg>
  );
}

function PriceComparison() {
  return (
    <div style={{ background: 'var(--ivory)', border: '1px solid var(--line)', borderRadius: 4, padding: 40, position: 'relative', boxShadow: '0 20px 60px rgba(12,14,16,0.06)' }}>
      <svg style={{ position: 'absolute', top: 20, right: 20 }} width="32" height="32" viewBox="0 0 32 32">
        <g stroke="var(--gold)" strokeWidth="1" fill="none" opacity="0.6">
          <path d="M4 4 L12 4 M4 4 L4 12" />
          <path d="M28 4 L20 4 M28 4 L28 12" />
          <path d="M4 28 L12 28 M4 28 L4 20" />
          <path d="M28 28 L20 28 M28 28 L28 20" />
        </g>
      </svg>

      <div style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ color: 'var(--gold-deep)', marginBottom: 8 }}>Primer · Istanbul, maj 2026</div>
        <div className="display" style={{ fontSize: 28, fontWeight: 400 }}>Realna ušteda. <span className="display-italic">Merena.</span></div>
      </div>

      {/* Bar 1 - average */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--muted)', letterSpacing: '0.03em' }}>Prosečna cena za ovu rutu (90 dana)</div>
          <div className="display mono count-up" style={{ fontSize: 42, fontWeight: 500, color: 'var(--muted)', opacity: 0, animation: 'fade-in 0.8s ease 1.8s forwards' }}>205€</div>
        </div>
        <div style={{ height: 12, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--ink-mid), var(--muted))', transformOrigin: 'left', transform: 'scaleX(0)', animation: 'fill-bar 2s cubic-bezier(0.25,1,0.5,1) 0.3s forwards' }} />
        </div>
      </div>

      {/* Bar 2 - deal */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', letterSpacing: '0.03em' }}>Naš deal danas</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span className="count-up" style={{ background: 'var(--accent)', color: 'white', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, letterSpacing: '-0.02em', padding: '6px 12px', borderRadius: 999, fontSize: 12, opacity: 0, animation: 'fade-in 0.8s ease 1.8s forwards' }}>−42%</span>
            <span className="display mono count-up" style={{ fontSize: 56, fontWeight: 600, color: 'var(--accent)', opacity: 0, animation: 'fade-in 0.8s ease 1.8s forwards' }}>119€</span>
          </div>
        </div>
        <div style={{ height: 12, background: 'var(--line-soft)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
          <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, var(--accent-warm), var(--accent))', transformOrigin: 'left', transform: 'scaleX(0)', animation: 'fill-bar-discount 2s cubic-bezier(0.25,1,0.5,1) 0.3s forwards' }} />
        </div>
      </div>

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: 'var(--muted)', letterSpacing: '0.03em' }}>Ušteda po osobi</div>
        <div className="display" style={{ fontSize: 28, fontWeight: 500 }}>
          <span className="count-up" style={{ opacity: 0, animation: 'fade-in 0.8s ease 1.8s forwards' }}>86€</span>
          <span className="serif-lead" style={{ fontSize: 16, color: 'var(--muted)', fontStyle: 'italic', marginLeft: 8 }}>po osobi</span>
        </div>
      </div>
    </div>
  );
}

const driftBadgeStyle = {
  position: 'absolute',
  background: 'var(--ivory)',
  padding: '10px 18px',
  borderRadius: 999,
  fontSize: 13,
  fontWeight: 500,
  border: '1px solid var(--line)',
  boxShadow: '0 4px 20px rgba(12,14,16,0.08)',
  animation: 'drift 7s ease-in-out infinite',
  zIndex: 5
};
