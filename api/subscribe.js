// api/subscribe.js — Free tier email signup
// Stores email in Firestore + adds to Mailchimp list

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Init Firebase Admin (singleton)
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, source = 'landing' } = req.body || {};

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    // 1. Upsert to Firestore
    const userRef = db.collection('letto_subscribers').doc(email.toLowerCase());
    await userRef.set({
      email: email.toLowerCase(),
      tier: 'free',
      source,
      createdAt: new Date().toISOString(),
      telegramJoined: false,
      subscribed: true
    }, { merge: true });

    // 2. Add to Mailchimp (non-blocking, log on fail)
    if (process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_LIST_ID) {
      const prefix = process.env.MAILCHIMP_SERVER_PREFIX;
      const url = `https://${prefix}.api.mailchimp.com/3.0/lists/${process.env.MAILCHIMP_LIST_ID}/members`;
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`any:${process.env.MAILCHIMP_API_KEY}`).toString('base64')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            email_address: email.toLowerCase(),
            status: 'subscribed',
            tags: ['free', source]
          })
        });
      } catch (mcErr) {
        console.warn('Mailchimp sync failed:', mcErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      telegramLink: 'https://t.me/letto_live_deals',
      message: 'Dobrodošao! Pogledaj email i Telegram kanal.'
    });
  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ error: 'Greška pri upisu', details: err.message });
  }
}
