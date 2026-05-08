import React from 'react';

export default function CompassSeal() {
  return (
    <section className="grain" style={{ padding: '80px 0', background: 'var(--paper)', position: 'relative' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <img
              src="/compass-sun.svg"
              alt="LETTO compass-sun rose brand mark"
              width="180"
              height="180"
              style={{ animation: 'compass-rotate 180s linear infinite' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, color: 'var(--gold)', width: 240, marginTop: 16 }}>
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, currentColor, transparent)', opacity: 0.4 }} />
              <span className="serif-lead" style={{ fontSize: 14, fontStyle: 'italic', letterSpacing: '0.1em' }}>Sequere solem · follow the sun</span>
              <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, currentColor, transparent)', opacity: 0.4 }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
