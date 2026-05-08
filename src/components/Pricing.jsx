import React, { useState } from 'react';

export default function Pricing() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(null);
  const [msg, setMsg] = useState(null);

  // Premium checkout — NO email required. Stripe Checkout collects email on its page.
  async function handleCheckout(tier) {
    setLoading(tier);
    setMsg(null);
    try {
      const resp = await fetch('/api/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      const data = await resp.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setMsg({ type: 'error', text: data.error || 'Greška pri kreiranju plaćanja.' });
        setLoading(null);
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
      setLoading(null);
    }
  }

  // Free signup — needs email for newsletter, inline form
  async function handleFreeSignup() {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg({ type: 'error', text: 'Unesi validan email za newsletter.' });
      return;
    }
    setLoading('free');
    setMsg(null);
    try {
      const resp = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'pricing_section' })
      });
      const data = await resp.json();
      if (data.success) {
        setMsg({ type: 'ok', text: 'Dobrodošao! Pogledaj inbox za potvrdu.' });
        setEmail('');
      } else {
        setMsg({ type: 'error', text: data.error || 'Greška.' });
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setLoading(null);
    }
  }

  return (
    <section id="pricing" className="grain" style={{ padding: '160px 0', background: 'var(--ink)', color: 'var(--ivory)', position: 'relative', overflow: 'hidden' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px', position: 'relative', zIndex: 2 }}>
        <div style={{ maxWidth: 800, margin: '0 auto 60px', textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--gold)', marginBottom: 24 }}>Pricing</div>
          <h2 className="display" style={{ fontSize: 'clamp(36px, 5vw, 76px)', lineHeight: 0.96, fontWeight: 400, marginBottom: 24 }}>
            Less than one<br />
            <span className="display-italic gold-foil">night out.</span>
          </h2>
          <p className="serif-lead" style={{ fontSize: 20, opacity: 0.8, lineHeight: 1.5 }}>
            The first package you book through Premium pays for the entire 3 months — usually with hundreds of euros to spare.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24, maxWidth: 900, margin: '0 auto' }}>

          {/* FREE tier */}
          <div style={{ padding: '48px 40px', borderRadius: 14, background: 'var(--paper)', border: '1px solid var(--line)', color: 'var(--ink)' }}>
            <div className="eyebrow" style={{ color: 'var(--muted)', marginBottom: 20 }}>Free preview</div>
            <div className="display" style={{ fontSize: 72, fontWeight: 500, lineHeight: 0.9, marginBottom: 8 }}>Free</div>
            <div className="serif-lead" style={{ fontSize: 16, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 36 }}>See savings, not the package.</div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px 0' }}>
              <CheckItem><strong>Which destinations</strong> have packages</CheckItem>
              <CheckItem>Agency price vs LETTO price</CheckItem>
              <CheckItem>Weekly newsletter (Wednesday)</CheckItem>
              <CheckItem strike>No airline names, hotel, or booking links</CheckItem>
            </ul>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleFreeSignup(); }}
                placeholder="your@email.com"
                disabled={loading === 'free'}
                style={{
                  width: '100%',
                  background: 'rgba(10,13,17,0.04)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '12px 18px',
                  fontSize: 15,
                  color: 'var(--ink)',
                  outline: 'none',
                  fontFamily: 'Instrument Serif, serif',
                  fontStyle: 'italic'
                }}
              />
              <button
                onClick={handleFreeSignup}
                disabled={loading === 'free'}
                className="btn-outline"
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading === 'free' ? 'Loading...' : 'Get newsletter →'}
              </button>
              {msg && msg.type === 'ok' && (
                <p style={{ marginTop: 4, color: '#1B7A3E', fontSize: 13, textAlign: 'center' }}>{msg.text}</p>
              )}
              {msg && msg.type === 'error' && loading !== 'beta' && loading !== 'premium' && (
                <p style={{ marginTop: 4, color: '#6B1A25', fontSize: 13, textAlign: 'center' }}>{msg.text}</p>
              )}
            </div>
          </div>

          {/* PREMIUM tier */}
          <div style={{ padding: '48px 40px', borderRadius: 14, background: 'linear-gradient(180deg, #1F252D 0%, var(--ink-soft) 100%)', color: 'var(--ivory)', border: '1px solid rgba(217,169,74,0.35)', position: 'relative', boxShadow: 'inset 0 1px 0 rgba(240,215,149,0.08), 0 12px 32px rgba(10,13,17,0.18), 0 4px 12px rgba(161,116,51,0.08)' }}>
            <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)' }}>
              <span style={{ background: 'linear-gradient(135deg, #7C5B22 0%, #D9A94A 50%, #7C5B22 100%)', backgroundSize: '200% 200%', animation: 'gold-shimmer 8s ease-in-out infinite', color: 'var(--ink)', fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', padding: '7px 14px', borderRadius: 99, boxShadow: 'inset 0 1px 0 rgba(255,250,230,0.4), inset 0 -1px 0 rgba(124,91,34,0.4), 0 4px 14px rgba(161,116,51,0.45)', whiteSpace: 'nowrap' }}>
                First 100 → €19 / 3 months
              </span>
            </div>

            <div className="eyebrow" style={{ color: 'var(--gold-light)', marginBottom: 20, opacity: 0.85 }}>Premium</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span className="display mono" style={{ fontSize: 72, fontWeight: 500, lineHeight: 0.9 }}>€29</span>
              <span className="serif-lead" style={{ fontSize: 16, opacity: 0.7, fontStyle: 'italic' }}>/ 3 months</span>
            </div>
            <div className="serif-lead" style={{ fontSize: 14, opacity: 0.6, fontStyle: 'italic', marginBottom: 36 }}>About €9.70/month · cancel anytime</div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 36px 0' }}>
              <CheckItem gold><strong style={{ color: 'var(--gold-light)' }}>Full package detail</strong> — airline, hotel, times</CheckItem>
              <CheckItem gold>Direct booking links to <strong style={{ color: 'var(--gold-light)' }}>Air Serbia, Booking, Turkish</strong></CheckItem>
              <CheckItem gold>10–15 new packages daily · all Balkan origins</CheckItem>
              <CheckItem gold>Live price re-verification · alerts if expired</CheckItem>
              <CheckItem gold>Premium Telegram channel</CheckItem>
              <CheckItem gold>14-day money-back guarantee</CheckItem>
            </ul>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={() => handleCheckout('beta')}
                disabled={loading === 'beta'}
                className="btn-gold"
                style={{ width: '100%', justifyContent: 'center', padding: '16px 28px' }}
              >
                {loading === 'beta' ? 'Opening Stripe...' : 'Unlock for €19 (beta) →'}
              </button>
              <button
                onClick={() => handleCheckout('premium')}
                disabled={loading === 'premium'}
                style={{ width: '100%', padding: '12px 28px', borderRadius: 8, background: 'transparent', border: '1px solid rgba(217,169,74,0.4)', color: 'var(--gold-light)', fontSize: 13, cursor: 'pointer', transition: 'all 0.2s', fontFamily: 'IBM Plex Sans, sans-serif', fontWeight: 500 }}
              >
                {loading === 'premium' ? 'Opening Stripe...' : 'Or full price · €29 / 3 months'}
              </button>
              {msg && msg.type === 'error' && (loading === 'beta' || loading === 'premium') && (
                <p style={{ marginTop: 4, color: '#F5A8B0', fontSize: 13, textAlign: 'center' }}>{msg.text}</p>
              )}
            </div>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 13, opacity: 0.55, marginTop: 40, letterSpacing: '0.02em' }}>
          Payment via Stripe · Email collected on checkout · Cancel anytime · 14-day money-back guarantee · GDPR
        </p>
      </div>
    </section>
  );
}

function CheckItem({ children, gold, strike }) {
  return (
    <li style={{ padding: '8px 0', fontSize: 14.5, display: 'flex', alignItems: 'flex-start', gap: 12, opacity: strike ? 0.5 : 1 }}>
      {strike ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, marginTop: 2 }}>
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={gold ? 'var(--gold-light)' : 'var(--gold)'} strokeWidth="3" style={{ flexShrink: 0, marginTop: 2 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      <span>{children}</span>
    </li>
  );
}
