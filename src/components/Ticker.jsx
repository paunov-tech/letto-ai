import React from 'react';

const tickerItems = [
  { city: 'ISTANBUL', current: '119€', old: '205€' },
  { city: 'RIM', current: '89€', old: '144€' },
  { city: 'HALKIDIKI', current: '186€', old: '270€' },
  { city: 'BARCELONA', current: '142€', old: '223€' },
  { city: 'PARIZ', current: '98€', old: '186€' },
  { city: 'DUBAI', current: '399€', old: '832€' }
];

export default function Ticker() {
  const items = [...tickerItems, ...tickerItems]; // duplicate for seamless loop

  return (
    <div style={{ background: 'var(--ink)', color: 'var(--ivory)', overflow: 'hidden' }}>
      <div
        className="flex whitespace-nowrap mono"
        style={{
          gap: '3rem',
          animation: 'ticker-scroll 50s linear infinite',
          padding: '14px 0',
          fontSize: '12px',
          letterSpacing: '0.15em'
        }}
      >
        <span className="inline-flex items-center gap-2.5">
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', animation: 'pulse-dot 2s ease-in-out infinite' }} />
          UŽIVO · AI SKENIRA
        </span>
        {items.map((item, i) => (
          <React.Fragment key={i}>
            <span style={{ opacity: 0.3 }}>◆</span>
            <span>
              {item.city} — <span style={{ color: 'var(--gold-light)', fontWeight: 600 }}>{item.current}</span> · <s style={{ opacity: 0.5 }}>{item.old}</s>
            </span>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
