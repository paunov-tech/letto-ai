// api/me.js — Server-side paywall validation.
//
// Frontend stores Stripe session_id in localStorage after successful checkout
// (results.html / dobrodosao.html handoff). Anyone can spoof a localStorage
// flag manually, so the only trustworthy unlock signal is: "given a session_id,
// does the server-side Firestore record show this email/customer as unlocked?"
//
// Flow:
//   1. Frontend POSTs { sessionId } here on page load.
//   2. We retrieve the Stripe session, pull customer_email + metadata.tier.
//   3. We look up letto_subscribers/{email} in Firestore for `aimixUnlocked` /
//      `tier === 'premium'` flags written by the webhook.
//   4. We return { premium, mixUnlocked }. Both default false on any failure.
//
// Cache: 60s edge cache per sessionId so a refresh doesn't hammer Stripe API.

import Stripe from 'stripe';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { withSentry } from '../lib/sentry-backend.js';
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

const EMPTY = { premium: false, mixUnlocked: false };

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(EMPTY);
  }

  res.setHeader('Cache-Control', 'private, max-age=60');

  const { sessionId } = req.body || {};
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
    return res.status(200).json(EMPTY);
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Source guard — same Stripe account is shared with jadran.ai.
    if (session.metadata?.source && session.metadata.source !== 'letto') {
      return res.status(200).json(EMPTY);
    }

    if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
      return res.status(200).json(EMPTY);
    }

    const email = (session.customer_email || session.customer_details?.email || '').toLowerCase();
    if (!email) return res.status(200).json(EMPTY);

    const snap = await db.collection('letto_subscribers').doc(email).get();
    if (!snap.exists) return res.status(200).json(EMPTY);
    const data = snap.data();

    return res.status(200).json({
      premium: data.tier === 'premium' && data.subscribed === true,
      mixUnlocked: data.aimixUnlocked === true
    });
  } catch (err) {
    console.error('[/api/me] error:', err.message);
    return res.status(200).json(EMPTY);
  }
}

export default withSentry('me', handler);
