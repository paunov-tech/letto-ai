// api/health.js — lightweight health probe for monitoring + audit.
// GET /api/health → 200 OK with { ok:true, ts, gitSha?, region?, deps:{...} }
//
// Checks performed:
//  - Firebase Admin init (env vars present)
//  - Stripe key present
//  - Resend key present (set + non-empty)
//  - Firestore reachable (lightweight read on letto_packages count)
//
// Runs in <1s. No mutations. Cache-Control: no-store.

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
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }
  res.setHeader('Cache-Control', 'no-store');

  const t0 = Date.now();
  const checks = {
    firebaseAdmin: !!(process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY),
    stripe: !!process.env.STRIPE_SECRET_KEY,
    stripeWebhook: !!process.env.STRIPE_WEBHOOK_SECRET,
    resend: !!(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.length > 5),
    rapidapi: !!process.env.RAPIDAPI_KEY,
    notifySecret: !!process.env.NOTIFY_SECRET,
    adminToken: !!process.env.ADMIN_TOKEN
  };

  let firestore = false;
  let firestoreLatencyMs = null;
  try {
    const tF = Date.now();
    await db.collection('letto_packages').limit(1).get();
    firestoreLatencyMs = Date.now() - tF;
    firestore = true;
  } catch (e) {
    firestore = false;
  }

  const allOk = Object.values(checks).every(v => v) && firestore;
  return res.status(allOk ? 200 : 503).json({
    ok: allOk,
    ts: new Date().toISOString(),
    region: process.env.VERCEL_REGION || null,
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    checks: { ...checks, firestore, firestoreLatencyMs },
    elapsedMs: Date.now() - t0
  });
}
