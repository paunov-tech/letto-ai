// lib/auth.js — Shared paywall validation.
//
// Same Stripe → Firestore round-trip /api/me has always done, extracted so
// any gated endpoint (currently /api/me and /api/packages?tier=premium) can
// call it without duplicating the logic.
//
// Trust model unchanged: the only signal we trust is "given this Stripe
// session_id, does the matching letto_subscribers/{email} doc say the
// customer is unlocked?" — localStorage flags on the client are advisory.

import Stripe from 'stripe';
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
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia'
});

const EMPTY = { premium: false, mixUnlocked: false, email: null };

export async function verifyPremiumSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return EMPTY;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Source guard — same Stripe account is shared with jadran.ai.
    if (session.metadata?.source && session.metadata.source !== 'letto') {
      return EMPTY;
    }

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return EMPTY;
    }

    const email = (session.customer_email || session.customer_details?.email || '').toLowerCase();
    if (!email) return EMPTY;

    const snap = await db.collection('letto_subscribers').doc(email).get();
    if (!snap.exists) return EMPTY;
    const data = snap.data();

    return {
      premium: data.tier === 'premium' && data.subscribed === true,
      mixUnlocked: data.aimixUnlocked === true,
      email
    };
  } catch (err) {
    console.error('[lib/auth] verifyPremiumSession error:', err.message);
    return EMPTY;
  }
}

// Extract a Stripe session id from a GET request. Header preferred (keeps it
// out of CDN cache keys and access logs); falls back to ?sessionId= for
// callers that can't set headers.
export function getSessionIdFromRequest(req) {
  const fromHeader = (req.headers?.['x-letto-session'] || '').toString();
  if (fromHeader.startsWith('cs_')) return fromHeader;
  const fromQuery = (req.query?.sessionId || '').toString();
  if (fromQuery.startsWith('cs_')) return fromQuery;
  return null;
}
