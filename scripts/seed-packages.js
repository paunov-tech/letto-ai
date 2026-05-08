#!/usr/bin/env node
// Seed initial 6 packages to letto_packages (v7 schema: flight+hotel+return triples).
// Extracted from public/index.html deal cards (discount, prices, dates) and
// packagesData (transport mode, copy).
//
// Pricing is MVP seed data — real listings arrive from n8n Mixing Engine
// once Kiwi + Booking APIs are online. Flight numbers / airlines are illustrative.
//
// Run:
//   FIREBASE_ADMIN_CLIENT_EMAIL=... FIREBASE_ADMIN_PRIVATE_KEY=... node scripts/seed-packages.js
// Or (autonomous helper):
//   node scripts/seed-packages.js --sa /home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

// Allow --sa /path/to/sa.json for local runs
const saFlagIdx = process.argv.indexOf('--sa');
if (saFlagIdx !== -1 && process.argv[saFlagIdx + 1]) {
  const sa = JSON.parse(readFileSync(process.argv[saFlagIdx + 1], 'utf8'));
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL = sa.client_email;
  process.env.FIREBASE_ADMIN_PRIVATE_KEY = sa.private_key;
}

initializeApp({
  credential: cert({
    projectId: 'letto-ai',
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

const db = getFirestore();

const packages = [
  {
    id: 'pkg_beg_ist_20260519_5n',
    destination: { code: 'IST', city: 'Istanbul', country: 'Turkey' },
    origin: { code: 'BEG', city: 'Belgrade' },
    dates: { departure: '2026-05-19', return: '2026-05-24', nights: 5 },
    transport: 'flight',
    category: 'city',
    outbound: { airline: 'Air Serbia', flightNumber: 'JU600', departureTime: '07:15', arrivalTime: '09:50', duration: '1h35m', stops: 0, price: 79, bookingUrl: 'https://airserbia.com/en/booking', bookingPartner: 'airserbia.com' },
    hotel: { name: 'Grand Hyatt Istanbul', rating: 5, location: 'Taksim, Istanbul', pricePerNight: 32.80, totalPrice: 164, bookingUrl: 'https://booking.com/hotel/tr/grand-hyatt-istanbul.html', bookingPartner: 'booking.com', includes: ['breakfast', 'wifi', 'pool', 'spa'] },
    return: { airline: 'Turkish Airlines', flightNumber: 'TK1081', departureTime: '11:25', arrivalTime: '11:50', duration: '1h25m', stops: 0, price: 41, bookingUrl: 'https://turkishairlines.com', bookingPartner: 'turkishairlines.com' },
    pricing: { total: 284, agencyReference: 489, savings: 205, savingsPercent: 42 },
    status: 'published_public',
    copy: {
      en: { meta: 'Turkey · City break', month: '19 – 24 May 2026', outbound: 'Belgrade → Istanbul · direct · morning', stay: '5-night hotel · 4★+ · breakfast included', return: 'Istanbul → Belgrade · direct · midday' },
      sr: { meta: 'Turska · City break', month: '19. – 24. maj 2026', outbound: 'Beograd → Istanbul · direktno · ujutro', stay: '5 noći u hotelu · 4★+ · doručak uključen', return: 'Istanbul → Beograd · direktno · popodne' }
    }
  },
  {
    id: 'pkg_beg_fco_20261012_7n',
    destination: { code: 'FCO', city: 'Rome', country: 'Italy' },
    origin: { code: 'BEG', city: 'Belgrade' },
    dates: { departure: '2026-10-12', return: '2026-10-19', nights: 7 },
    transport: 'flight',
    category: 'cultural',
    outbound: { airline: 'Ryanair', flightNumber: 'FR4452', departureTime: '19:45', arrivalTime: '21:20', duration: '1h35m', stops: 0, price: 64, bookingUrl: 'https://ryanair.com', bookingPartner: 'ryanair.com' },
    hotel: { name: 'Hotel Campo de Fiori', rating: 4, location: 'Centro Storico, Rome', pricePerNight: 27.00, totalPrice: 189, bookingUrl: 'https://booking.com/hotel/it/campo-de-fiori.html', bookingPartner: 'booking.com', includes: ['breakfast', 'wifi'] },
    return: { airline: 'Air Serbia', flightNumber: 'JU601', departureTime: '06:30', arrivalTime: '08:10', duration: '1h40m', stops: 0, price: 56, bookingUrl: 'https://airserbia.com', bookingPartner: 'airserbia.com' },
    pricing: { total: 309, agencyReference: 632, savings: 323, savingsPercent: 51 },
    status: 'published_public',
    copy: {
      en: { meta: 'Italy · Cultural', month: 'October 2026', outbound: 'Belgrade → Rome · direct · evening', stay: '7-night hotel · 4★+ · centro storico', return: 'Rome → Belgrade · direct · morning' },
      sr: { meta: 'Italija · Kulturno', month: 'oktobar 2026', outbound: 'Beograd → Rim · direktno · uveče', stay: '7 noći u hotelu · 4★+ · centar grada', return: 'Rim → Beograd · direktno · ujutro' }
    }
  },
  {
    id: 'pkg_beg_hal_20260615_10n',
    destination: { code: 'HAL', city: 'Halkidiki', country: 'Greece' },
    origin: { code: 'BEG', city: 'Belgrade' },
    dates: { departure: '2026-06-15', return: '2026-06-25', nights: 10 },
    transport: 'bus',
    category: 'beach',
    outbound: { airline: 'Lasta Bus', flightNumber: 'LAS-ATH-NG', departureTime: '21:00', arrivalTime: '11:30', duration: '14h30m', stops: 2, price: 45, bookingUrl: 'https://lasta.rs', bookingPartner: 'lasta.rs' },
    hotel: { name: 'Athena Pallas Village Resort', rating: 4, location: 'Sithonia, Halkidiki', pricePerNight: 23.20, totalPrice: 232, bookingUrl: 'https://booking.com/hotel/gr/athena-pallas-village.html', bookingPartner: 'booking.com', includes: ['half-board', 'wifi', 'pool', 'seafront'] },
    return: { airline: 'Lasta Bus', flightNumber: 'LAS-NG-ATH', departureTime: '20:30', arrivalTime: '11:00', duration: '14h30m', stops: 2, price: 45, bookingUrl: 'https://lasta.rs', bookingPartner: 'lasta.rs' },
    pricing: { total: 322, agencyReference: 520, savings: 198, savingsPercent: 38 },
    status: 'published_public',
    copy: {
      en: { meta: 'Greece · Beach + bus', month: 'June 2026', outbound: 'Belgrade → Halkidiki · overnight bus · A/C', stay: '10-night seafront hotel · half-board · pool', return: 'Halkidiki → Belgrade · overnight bus · A/C' },
      sr: { meta: 'Grčka · Plaža + bus', month: 'jun 2026', outbound: 'Beograd → Halkidiki · noćni bus · klima', stay: '10 noći hotel uz more · polupansion · bazen', return: 'Halkidiki → Beograd · noćni bus · klima' }
    }
  },
  {
    id: 'pkg_beg_cdg_20261108_4n',
    destination: { code: 'CDG', city: 'Paris', country: 'France' },
    origin: { code: 'BEG', city: 'Belgrade' },
    dates: { departure: '2026-11-08', return: '2026-11-12', nights: 4 },
    transport: 'flight',
    category: 'romantic',
    outbound: { airline: 'Air France', flightNumber: 'AF1489', departureTime: '18:25', arrivalTime: '20:55', duration: '2h30m', stops: 0, price: 89, bookingUrl: 'https://airfrance.com', bookingPartner: 'airfrance.com' },
    hotel: { name: 'Hôtel Jeanne d\'Arc Marais', rating: 4, location: 'Marais, Paris', pricePerNight: 50.50, totalPrice: 202, bookingUrl: 'https://booking.com/hotel/fr/jeanne-d-arc.html', bookingPartner: 'booking.com', includes: ['breakfast', 'wifi'] },
    return: { airline: 'Air France', flightNumber: 'AF1488', departureTime: '10:30', arrivalTime: '13:00', duration: '2h30m', stops: 0, price: 85, bookingUrl: 'https://airfrance.com', bookingPartner: 'airfrance.com' },
    pricing: { total: 376, agencyReference: 710, savings: 334, savingsPercent: 47 },
    status: 'published_public',
    copy: {
      en: { meta: 'France · Romantic', month: 'November 2026', outbound: 'Belgrade → Paris · direct · evening', stay: '4-night boutique hotel · 4★ · Marais', return: 'Paris → Belgrade · direct · midday' },
      sr: { meta: 'Francuska · Romantika', month: 'novembar 2026', outbound: 'Beograd → Pariz · direktno · uveče', stay: '4 noći butik hotel · 4★ · Marais', return: 'Pariz → Beograd · direktno · popodne' }
    }
  },
  {
    id: 'pkg_beg_bcn_20260914_5n',
    destination: { code: 'BCN', city: 'Barcelona', country: 'Spain' },
    origin: { code: 'BEG', city: 'Belgrade' },
    dates: { departure: '2026-09-14', return: '2026-09-19', nights: 5 },
    transport: 'flight',
    category: 'architecture',
    outbound: { airline: 'Vueling', flightNumber: 'VY1463', departureTime: '07:30', arrivalTime: '09:45', duration: '2h15m', stops: 0, price: 69, bookingUrl: 'https://vueling.com', bookingPartner: 'vueling.com' },
    hotel: { name: 'Hotel Barcelona Colonial', rating: 4, location: 'Eixample, Barcelona', pricePerNight: 39.00, totalPrice: 195, bookingUrl: 'https://booking.com/hotel/es/bcn-colonial.html', bookingPartner: 'booking.com', includes: ['breakfast', 'wifi', 'fitness'] },
    return: { airline: 'Vueling', flightNumber: 'VY1464', departureTime: '18:15', arrivalTime: '20:45', duration: '2h30m', stops: 0, price: 69, bookingUrl: 'https://vueling.com', bookingPartner: 'vueling.com' },
    pricing: { total: 333, agencyReference: 594, savings: 261, savingsPercent: 44 },
    status: 'published_public',
    copy: {
      en: { meta: 'Spain · Architecture', month: 'September 2026', outbound: 'Belgrade → Barcelona · direct · morning', stay: '5-night hotel · 4★ · near Sagrada', return: 'Barcelona → Belgrade · direct · evening' },
      sr: { meta: 'Španija · Arhitektura', month: 'septembar 2026', outbound: 'Beograd → Barselona · direktno · ujutro', stay: '5 noći hotel · 4★ · blizu Sagrade', return: 'Barselona → Beograd · direktno · uveče' }
    }
  },
  {
    id: 'pkg_beg_dxb_20270208_6n',
    destination: { code: 'DXB', city: 'Dubai', country: 'UAE' },
    origin: { code: 'BEG', city: 'Belgrade' },
    dates: { departure: '2027-02-08', return: '2027-02-14', nights: 6 },
    transport: 'flight',
    category: 'luxury',
    outbound: { airline: 'Flydubai', flightNumber: 'FZ1738', departureTime: '17:35', arrivalTime: '02:45', duration: '5h10m', stops: 1, price: 158, bookingUrl: 'https://flydubai.com', bookingPartner: 'flydubai.com' },
    hotel: { name: 'Address Dubai Marina', rating: 5, location: 'Dubai Marina', pricePerNight: 38.00, totalPrice: 228, bookingUrl: 'https://booking.com/hotel/ae/address-dubai-marina.html', bookingPartner: 'booking.com', includes: ['wifi', 'pool', 'spa', 'marina-view'] },
    return: { airline: 'Flydubai', flightNumber: 'FZ1739', departureTime: '22:50', arrivalTime: '02:10', duration: '4h20m', stops: 1, price: 160, bookingUrl: 'https://flydubai.com', bookingPartner: 'flydubai.com' },
    pricing: { total: 546, agencyReference: 1140, savings: 594, savingsPercent: 52 },
    status: 'published_premium',
    copy: {
      en: { meta: 'UAE · Luxury', month: 'February 2027', outbound: 'Belgrade → Dubai · 1 stop · evening', stay: '6-night hotel · 5★ · Marina view', return: 'Dubai → Belgrade · 1 stop · night' },
      sr: { meta: 'UAE · Luksuz', month: 'februar 2027', outbound: 'Beograd → Dubai · 1 presedanje · uveče', stay: '6 noći hotel · 5★ · Marina pogled', return: 'Dubai → Beograd · 1 presedanje · noću' }
    }
  }
];

async function main() {
  console.log(`Seeding ${packages.length} packages to letto_packages...`);
  const batch = db.batch();
  for (const pkg of packages) {
    const ref = db.collection('letto_packages').doc(pkg.id);
    batch.set(ref, {
      ...pkg,
      metadata: {
        source: 'seed_v7',
        createdAt: FieldValue.serverTimestamp(),
        claudeRating: pkg.pricing.savingsPercent / 10,
        mvpSeed: true
      }
    });
    console.log('  +', pkg.id, '→', pkg.destination.city, pkg.pricing.savingsPercent + '% off');
  }
  await batch.commit();
  console.log(`\n✓ Seeded ${packages.length} packages.`);
  process.exit(0);
}

main().catch(err => { console.error('Seed failed:', err); process.exit(1); });
