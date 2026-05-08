// api/cj-refresh.js — Auth-protected CJ inventory refresh.
// Pulls all joined-partner travel products + writes to Firestore letto_cj_inventory.
// Called by n8n WF_CJ_REFRESH on 6h cron (4× daily).
//
// Auth: Bearer NOTIFY_SECRET (reuses existing engine→site auth pattern).
// Vercel function timeout: needs to fit within 60s (Pro plan). Currently ~30-45s for Air Serbia 1550 docs.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = getFirestore();

const PARTNERS = [
  { id: '5289333', name: 'Air Serbia', category: 'air' }
  // Future: add Booking.com UK, Turkish Airlines etc. once joined
];

function checkAuth(req) {
  const got = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return got && process.env.NOTIFY_SECRET && got === process.env.NOTIFY_SECRET;
}

async function gqlQuery(body) {
  const r = await fetch('https://ads.api.cj.com/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.CJ_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`CJ ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function pullPartner(partner) {
  const all = [];
  const cid = process.env.CJ_CID;
  const pid = process.env.CJ_PID;
  const linkClause = pid ? `linkCode(pid: "${pid}") { clickUrl }` : '';
  for (let offset = 0; offset < 2000; offset += 100) {
    const query = `{
      travelExperienceProducts(companyId: ${cid}, partnerIds: ["${partner.id}"], limit: 100, offset: ${offset}) {
        resultList {
          id title brand
          price { amount currency }
          salePrice { amount currency }
          discountPercentage
          originCode destinationCode destinationCity destinationCountry
          stops travelStartDate travelEndDate
          link imageLink promotion
          ${linkClause}
        }
      }
    }`.replace(/\s+/g, ' ').trim();

    const data = await gqlQuery({ query });
    const items = data.data?.travelExperienceProducts?.resultList || [];
    if (items.length === 0) break;
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

async function writeBatch(partner, items) {
  let written = 0, failed = 0;
  // Use Firestore batch writes — up to 500 ops per batch
  const chunks = [];
  for (let i = 0; i < items.length; i += 400) chunks.push(items.slice(i, i + 400));
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const p of chunk) {
      if (!p.id) continue;
      const docId = `cj_${partner.id}_${p.id}`.replace(/[^a-zA-Z0-9_-]/g, '');
      const ref = db.collection('letto_cj_inventory').doc(docId);
      batch.set(ref, {
        cjProductId: p.id,
        partnerId: partner.id,
        partnerName: partner.name,
        partnerCategory: partner.category,
        title: p.title || null,
        brand: p.brand || null,
        originCode: p.originCode || null,
        destinationCode: p.destinationCode || null,
        destinationCity: p.destinationCity || null,
        destinationCountry: p.destinationCountry || null,
        priceAmount: p.price ? parseFloat(p.price.amount) : null,
        priceCurrency: p.price?.currency || null,
        salePriceAmount: p.salePrice ? parseFloat(p.salePrice.amount) : null,
        salePriceCurrency: p.salePrice?.currency || null,
        discountPercentage: p.discountPercentage ?? null,
        stops: p.stops ? parseInt(p.stops) : null,
        travelStartDate: p.travelStartDate || null,
        travelEndDate: p.travelEndDate || null,
        directLink: p.link || null,
        affiliateLink: p.linkCode?.clickUrl || null,
        imageLink: p.imageLink || null,
        promotion: p.promotion || null,
        lastSyncedAt: new Date().toISOString()
      }, { merge: true });
    }
    try {
      await batch.commit();
      written += chunk.length;
    } catch (e) {
      failed += chunk.length;
      console.error('[cj-refresh] batch commit failed:', e.message);
    }
  }
  return { written, failed };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.CJ_API_TOKEN || !process.env.CJ_CID) {
    return res.status(500).json({ error: 'cj_env_missing' });
  }

  const startTime = Date.now();
  const summary = { partners: [], totalWritten: 0, totalFailed: 0 };
  try {
    for (const partner of PARTNERS) {
      const items = await pullPartner(partner);
      const r = await writeBatch(partner, items);
      summary.partners.push({ partnerId: partner.id, name: partner.name, fetched: items.length, ...r });
      summary.totalWritten += r.written;
      summary.totalFailed += r.failed;
    }
    summary.durationMs = Date.now() - startTime;
    return res.status(200).json({ ok: true, ...summary });
  } catch (e) {
    console.error('[cj-refresh]', e.message);
    return res.status(500).json({ error: 'internal', detail: e.message, partial: summary });
  }
}
