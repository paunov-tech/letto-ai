import React from 'react';

export default function Disclaimer() {
  return (
    <section style={{ padding: '100px 0', textAlign: 'center', background: 'var(--paper)' }}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 48px' }}>
        <svg style={{ margin: '0 auto 28px', display: 'block' }} width="48" height="48" viewBox="0 0 48 48">
          <g fill="var(--gold)" opacity="0.8">
            <path d="M24 8 L26 14 L24 12 L22 14 Z" />
            <circle cx="24" cy="24" r="18" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.5" />
            <circle cx="24" cy="24" r="12" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.4" />
          </g>
        </svg>
        <p className="serif-lead display-italic" style={{ fontSize: 'clamp(20px, 3vw, 28px)', color: 'var(--ink-mid)', lineHeight: 1.5 }}>
          "LETTO.LIVE ne prodaje putovanja. Nije turistička agencija. Mi smo informacioni servis. Sve rezervacije se vrše direktno kod partnera — Kiwi, Booking, avio-kompanija. Ne držimo tvoj novac, ne uzimamo proviziju od rezervacija."
        </p>
      </div>
    </section>
  );
}
