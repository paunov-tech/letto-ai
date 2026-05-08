// api/scrape-status.js — Read-only scrape stats for /admin/scraping.html
// Returns: per-source counts, last successful run timestamps, error counts last 24h.
// Auth: Bearer ADMIN_TOKEN (same as /api/admin).

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

function checkAuth(req) {
  const got = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  return got && process.env.ADMIN_TOKEN && got === process.env.ADMIN_TOKEN;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!checkAuth(req)) return res.status(401).json({ error: 'unauthorized' });

  try {
    // Inventory size + per-source breakdown
    const invSnap = await db.collection('letto_scrape_inventory').limit(1000).get();
    const bySource = {};
    let totalInventory = 0;
    for (const doc of invSnap.docs) {
      const data = doc.data();
      const src = data.source || 'unknown';
      bySource[src] = (bySource[src] || 0) + 1;
      totalInventory++;
    }

    // Last 5 runs
    const runsSnap = await db.collection('letto_scrape_runs').orderBy('ranAt', 'desc').limit(5).get();
    const recentRuns = runsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Last successful per source (from runs)
    const lastSuccessBySrc = {};
    for (const run of recentRuns) {
      for (const [src, count] of Object.entries(run.counts || {})) {
        if (count > 0 && !lastSuccessBySrc[src]) {
          lastSuccessBySrc[src] = run.ranAt;
        }
      }
    }

    // Last hour error count
    const cutoff = new Date(Date.now() - 3600000).toISOString();
    let errors24h = 0;
    for (const run of recentRuns) {
      if (run.ranAt > cutoff && Array.isArray(run.errors)) {
        errors24h += run.errors.length;
      }
    }

    return res.status(200).json({
      totalInventory,
      bySource,
      lastSuccessBySrc,
      recentRuns,
      errors1h: errors24h
    });
  } catch (e) {
    console.error('[scrape-status]', e.message);
    return res.status(500).json({ error: 'internal', detail: e.message });
  }
}
