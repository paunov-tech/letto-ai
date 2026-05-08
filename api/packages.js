// api/packages.js — Public read endpoint for letto.live homepage.
// Returns published packages from Firestore, ordered by createdAt DESC.
// Cache: CDN 5 min, SWR 10 min — accepts that engine output is stale up to 5 min.

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  const tier = req.query.tier === 'premium' ? 'premium' : 'public';
  const status = tier === 'premium' ? 'published_premium' : 'published_public';
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  try {
    const snap = await db.collection('letto_packages')
      .where('status', '==', status)
      .orderBy('metadata.createdAt', 'desc')
      .limit(limit)
      .get();

    const packages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ packages, count: packages.length, tier });
  } catch (e) {
    console.error('[LETTO API] /packages error:', e.message);
    return res.status(500).json({ error: 'internal' });
  }
}
