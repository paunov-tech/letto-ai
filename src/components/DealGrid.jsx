import React from 'react';

const deals = [
  { name: 'Istanbul', country: 'Turska', category: 'City break', month: 'Maj 2026', price: 119, old: 205, discount: 42, locked: false, photo: 'https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?w=900&q=85&auto=format&fit=crop' },
  { name: 'Rim', country: 'Italija', category: 'Kulturno', month: 'Oktobar 2026', price: 89, old: 144, discount: 38, locked: false, photo: 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=900&q=85&auto=format&fit=crop' },
  { name: 'Halkidiki', country: 'Grčka', category: 'More', month: 'Jun 2026', price: 186, old: 270, discount: 31, locked: false, photo: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&q=85&auto=format&fit=crop' },
  { name: 'Pariz', country: 'Francuska', category: 'City break', month: 'Novembar 2026', price: 98, old: 186, discount: 47, locked: true, photo: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=900&q=85&auto=format&fit=crop' },
  { name: 'Barcelona', country: 'Španija', category: 'Kulturno', month: 'Septembar 2026', price: 142, old: 223, discount: 36, locked: true, photo: 'https://images.unsplash.com/photo-1583422409516-2895a77efded?w=900&q=85&auto=format&fit=crop' },
  { name: 'Dubai', country: 'UAE', category: 'Luksuz', month: 'Februar 2027', price: 399, old: 832, discount: 52, locked: true, photo: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=900&q=85&auto=format&fit=crop' }
];

export default function DealGrid() {
  return (
    <section id="dealovi" className="grain" style={{ padding: '160px 0', background: 'var(--paper)', position: 'relative' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px' }}>
        <div style={{ maxWidth: 900, marginBottom: 80 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <g fill="var(--gold)">
                <path d="M24 8 L28 20 L24 16 L20 20 Z" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.4" />
              </g>
            </svg>
            <div className="eyebrow" style={{ color: 'var(--gold-deep)' }}>24. april 2026 · Dnevna lista</div>
          </div>
          <h2 className="display" style={{ fontSize: 'clamp(36px, 5vw, 76px)', lineHeight: 0.96, fontWeight: 400, marginBottom: 32 }}>
            Dokaz je<br />
            <span className="display-italic" style={{ color: 'var(--accent)' }}>u cenama.</span>
          </h2>
          <p className="serif-lead" style={{ fontSize: 22, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 700 }}>
            Prvi red vide svi. Ostatak — tačne datume, aviokompanije, hotele i linkove za rezervaciju — vide samo Premium pretplatnici.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 48 }}>
          {deals.map(deal => <DealCard key={deal.name} deal={deal} />)}
        </div>

        <div style={{ marginTop: 80, textAlign: 'center' }}>
          <a href="#" className="btn-outline">Pogledaj svih 47 dealova danas →</a>
        </div>
      </div>
    </section>
  );
}

function DealCard({ deal }) {
  const { name, country, category, month, price, old, discount, locked, photo } = deal;
  return (
    <article style={{ transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)', position: 'relative' }}
             onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-6px)'}
             onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 4, aspectRatio: '3/4', marginBottom: 24 }}>
        <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 1.2s cubic-bezier(0.25,1,0.5,1)' }} />
        <div style={{ position: 'absolute', top: 20, left: 20 }}>
          <span style={{ background: 'var(--accent)', color: 'white', fontFamily: 'JetBrains Mono, monospace', fontWeight: 500, letterSpacing: '-0.02em', padding: '6px 12px', borderRadius: 999, fontSize: 12 }}>
            −{discount}%
          </span>
        </div>
        <div style={{ position: 'absolute', top: 20, right: 20 }}>
          {locked ? <PremiumBadge /> : <FreeBadge />}
        </div>
        {locked && <LockOverlay />}
      </div>
      <div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between' }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--muted)', marginBottom: 6 }}>{country} · {category}</div>
          <h3 className="display" style={{ fontSize: 40, fontWeight: 400, filter: locked ? 'blur(5px)' : 'none', opacity: locked ? 0.65 : 1 }}>{name}</h3>
          <div className="serif-lead" style={{ fontSize: 16, color: 'var(--muted)', fontStyle: 'italic', filter: locked ? 'blur(5px)' : 'none', opacity: locked ? 0.65 : 1 }}>{month}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'line-through', filter: locked ? 'blur(5px)' : 'none', opacity: locked ? 0.65 : 1 }}>{old}€</div>
          <div className="display" style={{ fontSize: 48, fontWeight: 600, filter: locked ? 'blur(5px)' : 'none', opacity: locked ? 0.65 : 1 }}>{price}€</div>
        </div>
      </div>
    </article>
  );
}

function FreeBadge() {
  return <span style={{ background: 'rgba(250,242,222,0.94)', backdropFilter: 'blur(8px)', color: 'var(--ink)', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', padding: '6px 12px', borderRadius: 999 }}>FREE</span>;
}

function PremiumBadge() {
  return (
    <span style={{ background: 'var(--ink)', color: 'var(--gold-light)', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', padding: '6px 12px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
      PREMIUM
    </span>
  );
}

function LockOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(12,14,16,0.2) 0%, rgba(12,14,16,0.55) 50%, rgba(12,14,16,0.85) 100%)', backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: 28 }}>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #8A5F1F 0%, #B8863B 25%, #E4C37A 50%, #B8863B 75%, #8A5F1F 100%)', backgroundSize: '200% 200%', animation: 'gold-shimmer 3s ease-in-out infinite', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: '0 8px 24px rgba(184,134,59,0.4)' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
      </div>
      <div className="serif-lead" style={{ fontSize: 18, fontStyle: 'italic', color: 'var(--ivory)', textAlign: 'center', lineHeight: 1.3 }}>
        Otključaj sve detalje<br />
        <span className="mono" style={{ fontSize: 13, fontStyle: 'normal', color: 'var(--gold-light)', letterSpacing: '0.08em' }}>€29/GODIŠNJE</span>
      </div>
    </div>
  );
}
