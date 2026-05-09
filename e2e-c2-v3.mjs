import { createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(readFileSync('.secrets/firebase-admin-sa.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STRIPE_SECRET = readFileSync('.env.stripe', 'utf8').match(/^STRIPE_WEBHOOK_SECRET=(.*)$/m)[1].trim();
const TEST_EMAIL = 'paunov@calderyserbia.com';

const pendingMixId = randomBytes(8).toString('hex');
await db.collection('pendingMixes').doc(pendingMixId).set({
  snapshot: {
    flight: { selected: { airline:'W6', flightNumber:'4123', origin:'BEG', dest:'ATH', depart:'2026-06-26', ret:'2026-07-05', duration:'61h15m', stops:2, totalPrice:131, priceNum:131, currency:'EUR', bookingUrl:'https://www.aviasales.com/search/BEG2606ATH050712?marker=722287', bookingPartner:'aviasales.com', pkgId:'pkg_beg_ath_20260626_9n' } },
    hotel:  { selected: { id:'hl_demo_1', name:'Athens Plaza Hotel', stars:4, neighborhood:'Plaka', nights:9, pricePerNight:78, priceTotal:702, currency:'EUR', bookingUrl:'https://www.booking.com/hotel/gr/athens-plaza.html' } },
    searchParams: { origin_iata:'BEG', destination_iata:'ATH', depart_date:'2026-06-26', return_date:'2026-07-05', adults:2, children:0 }
  },
  createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 24*3600*1000).toISOString()
});
console.log('1) pendingMixes/' + pendingMixId + ' written');

const sessionId = 'cs_c2v3_' + Date.now();
const event = {
  id: 'evt_c2v3_' + Date.now(), object: 'event', api_version: '2024-12-18.acacia',
  created: Math.floor(Date.now()/1000), type: 'checkout.session.completed', livemode: false,
  data: { object: {
    id: sessionId, object: 'checkout.session', mode: 'payment', payment_status: 'paid',
    customer: 'cus_c2v3', customer_email: TEST_EMAIL,
    customer_details: { email: TEST_EMAIL, name: 'Miroslav Paunov' },
    metadata: { tier: 'aimix', source: 'letto', origin: 'mix-stage3', pendingMixId }
  }}
};
const payload = JSON.stringify(event);
const ts = Math.floor(Date.now()/1000);
const sig = createHmac('sha256', STRIPE_SECRET).update(`${ts}.${payload}`).digest('hex');

console.log('2) POSTing webhook · awaiting Resend send inside the webhook handler...');
const t0 = Date.now();
const resp = await fetch('https://letto.live/api/stripe-webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Stripe-Signature': `t=${ts},v1=${sig}` },
  body: payload
});
console.log('   webhook ' + resp.status + ' in ' + (Date.now()-t0) + 'ms');

await new Promise(r => setTimeout(r, 1500));

const purchase = await db.collection('purchasedMixes').doc(pendingMixId).get();
console.log('3) purchasedMixes · exists:', purchase.exists);

console.log('\n=== run instructions ===');
console.log('  tripId for log search:', pendingMixId);
console.log('  Subject expected: "Tvoj Letto Mix · BEG → ATH · 26. jun 2026 – 5. jul 2026"');
console.log('  Recipient:', TEST_EMAIL);
console.log('  Now grep Vercel logs for [mix-email] line referencing trip=' + pendingMixId);

console.log('\n=== cleanup ===');
await db.collection('purchasedMixes').doc(pendingMixId).delete();
console.log('  purchasedMixes deleted');
process.exit(0);
