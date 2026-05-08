import React from 'react';

export default function Nav() {
  return (
    <nav style={{ padding: '20px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 48 }}>
        <a href="#" className="logo-mark" style={{ textDecoration: 'none', color: 'var(--ink)', fontSize: 32, fontFamily: 'Fraunces, serif', fontStyle: 'italic', fontWeight: 500, letterSpacing: '-0.04em', display: 'inline-flex', alignItems: 'baseline', gap: 2 }}>
          letto
          <span style={{ fontSize: '0.4em', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontStyle: 'normal', color: 'var(--gold)', marginLeft: 3, transform: 'translateY(-12px)', display: 'inline-block' }}>.live</span>
        </a>
        <div className="hidden md:flex" style={{ gap: 36, fontSize: 14, fontWeight: 500 }}>
          <a href="#dealovi" style={navLinkStyle}>Dealovi</a>
          <a href="#kako" style={navLinkStyle}>Kako radi</a>
          <a href="#cena" style={navLinkStyle}>Cena</a>
          <a href="#manifest" style={navLinkStyle}>Manifest</a>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <a href="#" className="hidden md:block" style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink)', textDecoration: 'none' }}>Prijavi se</a>
        <a href="#cena" className="btn-dark">Postani Premium →</a>
      </div>
    </nav>
  );
}

const navLinkStyle = {
  color: 'var(--ink-mid)',
  textDecoration: 'none',
  transition: 'color 0.2s'
};
