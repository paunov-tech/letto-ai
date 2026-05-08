import React, { useState } from 'react';

const faqs = [
  {
    q: 'Da li LETTO.LIVE prodaje putovanja?',
    a: <>Ne. Nismo turistička agencija. Nismo OTA. Mi smo informacioni servis. Ne prodajemo karte, ne rezervišemo hotele, ne držimo tvoj novac. Svaka rezervacija ide direktno preko partnera — Kiwi, Booking, avio-kompanije. Mi smo samo tvoj <em style={{ color: 'var(--accent)' }}>kurator</em>.</>
  },
  {
    q: 'Kako znate koja cena je "ispod proseka"?',
    a: 'Naš algoritam čuva istoriju cena za svaku rutu u poslednjih 90 dana. Računa median po mesecu. Ako aktuelna cena padne 30%+ ispod tog median-a, sistem flaguje deal. Ne verujemo marketinškim "popustima" od fiktivnih cena — samo statistici.'
  },
  {
    q: 'Šta se dešava kad otkažem Premium?',
    a: 'Imaš pristup do kraja perioda koji si platio. Bez kazni, bez pitanja. Otkažeš jednim klikom u Stripe portalu. Prvih 14 dana — 100% povraćaj novca, bez obzira na razlog.'
  },
  {
    q: 'Cena više nije ista kad kliknem — zašto?',
    a: 'Avio i hotel cene se menjaju u realnom vremenu. Obično su ponude koje flagujemo dostupne 6–48h. Ako si brz, imaš cenu. Ako ne — sledeći deal je obično u roku od par sati. Za to je Premium — early access od 6h.'
  },
  {
    q: 'Radi li samo za Beograd?',
    a: 'Primarno pratimo letove iz BG, INI, TIV, ZAG, SJJ i SKP. U Premium-u biraš svoje home airport-e, pa filtriramo po tome. Autobuske linije (Grčka, Makedonija, Bugarska) takođe pokrivamo.'
  },
  {
    q: 'Ko stoji iza LETTO.LIVE?',
    a: 'SIAL Consulting d.o.o. iz Brežica, Slovenija. Specijalizovani za AI sisteme u industriji i servisima. LETTO.LIVE je naš consumer projekat.'
  }
];

export default function FAQ() {
  const [open, setOpen] = useState(null);

  return (
    <section className="grain" style={{ padding: '140px 0', background: 'var(--paper)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 48px' }}>
        <div style={{ textAlign: 'center', marginBottom: 80 }}>
          <div className="eyebrow" style={{ color: 'var(--gold-deep)', marginBottom: 24 }}>Česta pitanja</div>
          <h2 className="display" style={{ fontSize: 'clamp(36px, 5vw, 76px)', lineHeight: 0.96, fontWeight: 400 }}>
            Što ljudi <span className="display-italic">obično pitaju.</span>
          </h2>
        </div>

        <div>
          {faqs.map((faq, i) => (
            <div
              key={i}
              style={{
                borderBottom: '1px solid var(--line)',
                padding: '28px 0',
                cursor: 'pointer',
                borderColor: open === i ? 'var(--ink)' : 'var(--line)'
              }}
              onClick={() => setOpen(open === i ? null : i)}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="display" style={{ fontSize: 22, fontWeight: 500, paddingRight: 24 }}>{faq.q}</span>
                <span
                  style={{
                    transition: 'transform 0.3s ease',
                    display: 'inline-block',
                    fontSize: 28,
                    fontWeight: 200,
                    color: 'var(--gold)',
                    transform: open === i ? 'rotate(45deg)' : 'rotate(0)'
                  }}
                >+</span>
              </div>
              {open === i && (
                <div className="serif-lead" style={{ fontSize: 18, color: 'var(--ink-mid)', lineHeight: 1.6, paddingTop: 20 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
