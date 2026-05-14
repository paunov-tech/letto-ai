// api/me.js — Server-side paywall validation.
//
// Frontend stores Stripe session_id in localStorage after successful checkout
// (results.html / dobrodosao.html handoff). Anyone can spoof a localStorage
// flag manually, so the only trustworthy unlock signal is: "given a session_id,
// does the server-side Firestore record show this email/customer as unlocked?"
//
// Flow:
//   1. Frontend POSTs { sessionId } here on page load.
//   2. Delegate to lib/auth.verifyPremiumSession (shared with /api/packages).
//   3. Return { premium, mixUnlocked }. Both default false on any failure.
//
// Cache: 60s edge cache per sessionId so a refresh doesn't hammer Stripe API.

import { withSentry } from '../lib/sentry-backend.js';
import { verifyPremiumSession } from '../lib/auth.js';

const EMPTY = { premium: false, mixUnlocked: false };

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json(EMPTY);
  }

  res.setHeader('Cache-Control', 'private, max-age=60');

  const { sessionId } = req.body || {};
  const result = await verifyPremiumSession(sessionId);
  return res.status(200).json({
    premium: result.premium,
    mixUnlocked: result.mixUnlocked
  });
}

export default withSentry('me', handler);
