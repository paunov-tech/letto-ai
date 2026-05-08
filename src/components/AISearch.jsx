import React, { useState } from 'react';

export default function AISearch() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSearch() {
    if (!query.trim() || loading) return;
    setLoading(true);
    try {
      const resp = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await resp.json();
      setResult(data);
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="grain" style={{ padding: '140px 0', background: 'var(--paper-warm)', position: 'relative' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 48px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
          <div className="eyebrow" style={{ color: 'var(--gold-deep)', marginBottom: 24 }}>AI asistent</div>
          <h2 className="display" style={{ fontSize: 'clamp(48px, 7.5vw, 104px)', lineHeight: 0.92, fontWeight: 300, marginBottom: 24 }}>
            Reci šta želiš.<br />
            <span className="display-italic">Na srpskom.</span>
          </h2>
          <p className="serif-lead" style={{ fontSize: 20, color: 'var(--muted)', marginBottom: 48, lineHeight: 1.5 }}>
            Bez filtera. Bez opcija. Bez klikanja kroz 15 ekrana. Pišeš kao prijatelju — AI razume.
          </p>

          <div style={{ background: 'white', borderRadius: 999, padding: 8, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 20px 60px rgba(12,14,16,0.1)', border: '1px solid var(--line)' }}>
            <div style={{ paddingLeft: 20, color: 'var(--muted)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Letovanje za dvoje, nešto mirno, do 1500€..."
              style={{ flex: 1, background: 'transparent', outline: 'none', border: 'none', fontFamily: 'Instrument Serif, serif', padding: '16px 8px', fontSize: 20, color: 'var(--ink)', fontStyle: 'italic' }}
            />
            <button className="btn-dark" onClick={handleSearch} disabled={loading} style={{ marginRight: 0, opacity: loading ? 0.6 : 1 }}>
              {loading ? 'Tražim...' : 'Pronađi →'}
            </button>
          </div>

          {result && (
            <div style={{ marginTop: 24, padding: 24, background: 'white', border: '1px solid var(--line)', borderRadius: 8, textAlign: 'left' }}>
              {result.error ? (
                <p style={{ color: 'var(--accent)' }}>Greška: {result.error}</p>
              ) : (
                <>
                  <div className="eyebrow" style={{ color: 'var(--gold-deep)', marginBottom: 12 }}>Razumeli smo:</div>
                  <pre style={{ fontSize: 13, fontFamily: 'JetBrains Mono, monospace', overflow: 'auto', color: 'var(--ink-mid)' }}>
                    {JSON.stringify(result.parsed, null, 2)}
                  </pre>
                  {result.matches?.length === 0 && (
                    <p className="serif-lead" style={{ fontSize: 16, color: 'var(--muted)', marginTop: 12, fontStyle: 'italic' }}>
                      Još nemamo deal za taj kriterijum. Upiši se besplatno i šaljemo ti čim ga pronađemo.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 28 }}>
            <span className="eyebrow" style={{ color: 'var(--muted)', marginRight: 8, padding: '8px 0' }}>Probaj:</span>
            {['Vikend u Budimpešti pod 300€', 'All-inclusive Turska u junu', 'Nešto egzotično do 800€'].map(s => (
              <button key={s} onClick={() => setQuery(s)} style={{ background: 'white', border: '1px solid var(--line)', padding: '8px 16px', borderRadius: 999, fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
