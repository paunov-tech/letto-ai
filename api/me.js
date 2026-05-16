// api/me.js — Account dashboard payload + server-side paywall validation.
//
// The frontend stores a Stripe session_id in localStorage after checkout.
// Anyone can spoof a localStorage flag, so the trustworthy unlock signal is:
// "given a session_id, does the server-side letto_subscribers/{email} record
// show this email as unlocked?" — verifyPremiumSession (shared with
// /api/packages) resolves session_id → email.
//
// Returns either:
//   401 { authenticated:false, premium:false, mixUnlocked:false }     (no/invalid session)
//   200 { authenticated:true, email, subscription{}, mixes[],
//         billingPortalUrl, premium, mixUnlocked }                    (resolved)
//
// `premium` + `mixUnlocked` stay at the top level for back-compat: the
// index.html / results.html paywall gates read `data.premium` straight off
// the body (they don't branch on HTTP status).
//
// Cache: 60s private per session so a refresh doesn't hammer Stripe.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { withSentry } from '../lib/sentry-backend.js';
import { verifyPremiumSession, getSessionIdFromRequest } from '../lib/auth.js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: 'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

const SITE = process.env.VITE_SITE_URL || 'https://letto.live';

function toIso(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  if (typeof v._seconds === 'number') return new Date(v._seconds * 1000).toISOString();
  return null;
}

async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ authenticated: false, premium: false, mixUnlocked: false });
  }

  res.setHeader('Cache-Control', 'private, max-age=60');

  // Session from the X-Letto-Session header (preferred — stays out of CDN
  // cache keys / logs) or the legacy { sessionId } POST body.
  let sessionId = getSessionIdFromRequest(req);
  if (!sessionId && req.body && typeof req.body.sessionId === 'string') {
    sessionId = req.body.sessionId;
  }

  const auth = await verifyPremiumSession(sessionId);
  if (!auth.email) {
    return res.status(401).json({ authenticated: false, premium: false, mixUnlocked: false });
  }
  const email = auth.email;

  // letto_subscribers doc — subscription detail beyond the boolean gate.
  let sub = {};
  try {
    const snap = await db.collection('letto_subscribers').doc(email).get();
    if (snap.exists) sub = snap.data() || {};
  } catch (e) {
    console.warn('[api/me] letto_subscribers read failed:', e.message);
  }

  // Past Mixes — newest first. Needs the (userEmail, paidAt) composite index.
  // On a missing index Firestore throws; we degrade to an empty list rather
  // than failing the whole dashboard.
  let mixes = [];
  try {
    const mixSnap = await db.collection('purchasedMixes')
      .where('userEmail', '==', email)
      .orderBy('paidAt', 'desc')
      .limit(20)
      .get();
    mixes = mixSnap.docs.map((d) => {
      const m = d.data() || {};
      const route = m.route || {};
      const flight = m.flight || {};
      const summary = (route.origin && route.dest)
        ? `${route.origin} → ${route.dest}`
        : (m.hotel && m.hotel.name) || 'Mix';
      return {
        tripId: m.tripId || d.id,
        summary,
        dates: { depart: flight.depart || null, return: flight.return || null },
        paidAt: toIso(m.paidAt),
        status: m.status || 'paid',
      };
    });
  } catch (e) {
    console.warn('[api/me] purchasedMixes query failed (likely missing composite index):', e.message);
  }

  // Stripe Billing Portal — manage / cancel subscription.
  let billingPortalUrl = null;
  if (sub.stripeCustomerId) {
    try {
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${SITE}/me`,
      });
      billingPortalUrl = portal.url;
    } catch (e) {
      console.warn('[api/me] billing portal create failed:', e.message);
    }
  }

  return res.status(200).json({
    authenticated: true,
    email,
    subscription: {
      tier: sub.tier || (auth.premium ? 'premium' : 'free'),
      status: sub.subscriptionStatus || null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd || false,
      currentPeriodEnd: toIso(sub.currentPeriodEnd),
      premiumSince: toIso(sub.premiumSince),
    },
    mixes,
    billingPortalUrl,
    // Legacy compat — paywall gates read these straight off the body.
    premium: auth.premium,
    mixUnlocked: auth.mixUnlocked,
  });
}

export default withSentry('me', handler);
