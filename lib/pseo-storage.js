// lib/pseo-storage.js — Firestore-backed key/value layer for pSEO pages.
//
// Why Firestore (not @vercel/kv):
//   Letto already initialises firebase-admin in 8 API routes and 4 cron
//   scripts. Adding @vercel/kv would mean a new SDK, a new provisioning
//   step in the Vercel dashboard, a new free-tier limit to watch, and a
//   second auth path to debug if a write fails. Firestore covers KV
//   semantics fine at our volumes (pre-gen 500 docs, +5-15K daily reads,
//   well within the 50K/day free tier). One source of truth.
//
// Schema:
//   pseo_pages/{slug}     · one doc per landing, full PseoPage shape
//   pseo_index/pre_gen    · single doc, { slugs: [...] } array
//   pseo_index/on_demand  · single doc, { slugs: [...] } array
//
// The two index docs use FieldValue.arrayUnion so concurrent on-demand
// writes don't race. At pSEO volumes (≤20K total slugs, max ~200-char
// each) the array fits comfortably in Firestore's 1 MiB doc limit
// (~5K slugs per doc; we'd need to shard only if we cross ~10K slugs
// in one index — defer until that's a real concern).
//
// Used by:
//   api/pseo-route.js          · cache HIT lookup + on-demand cache write
//   api/sitemap-pseo.js        · listIndex('pre_gen') + ('on_demand')
//   scripts/pseo-pregen.mjs    · bulk setPseoPage during pre-generation
//   scripts/test-pseo-storage.mjs · write/read/delete smoke test

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId:   'letto-ai',
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
const PAGES_COLL = 'pseo_pages';
const INDEX_COLL = 'pseo_index';

/**
 * Read one pSEO page document by slug.
 * @param {string} slug
 * @returns {Promise<object|null>} the PseoPage object, or null if absent.
 */
export async function getPseoPage(slug) {
  if (!slug) return null;
  const snap = await db.collection(PAGES_COLL).doc(slug).get();
  return snap.exists ? snap.data() : null;
}

/**
 * Upsert one pSEO page + record its slug in the matching index set.
 * The index update uses arrayUnion so concurrent writers stay safe.
 * @param {string} slug
 * @param {object} data   PseoPage shape · MUST carry isPreGenerated boolean.
 */
export async function setPseoPage(slug, data) {
  if (!slug || !data) throw new Error('setPseoPage · missing slug or data');
  await db.collection(PAGES_COLL).doc(slug).set(data, { merge: true });
  const indexKey = data.isPreGenerated ? 'pre_gen' : 'on_demand';
  await db.collection(INDEX_COLL).doc(indexKey).set(
    { slugs: FieldValue.arrayUnion(slug), updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

/**
 * List every slug in one index set.
 * @param {'pre_gen'|'on_demand'} kind
 * @returns {Promise<string[]>}
 */
export async function listIndex(kind) {
  if (kind !== 'pre_gen' && kind !== 'on_demand') {
    throw new Error('listIndex · kind must be pre_gen or on_demand');
  }
  const snap = await db.collection(INDEX_COLL).doc(kind).get();
  if (!snap.exists) return [];
  return Array.isArray(snap.data().slugs) ? snap.data().slugs : [];
}

/**
 * Cheap existence check · single get(); Firestore charges 1 read either way.
 * @param {string} slug
 * @returns {Promise<boolean>}
 */
export async function pseoPageExists(slug) {
  if (!slug) return false;
  const snap = await db.collection(PAGES_COLL).doc(slug).get();
  return snap.exists;
}

/**
 * Delete one pSEO page + remove its slug from BOTH index sets.
 * Defensive removal — if the page was promoted from on-demand to pre-gen
 * (or back) without us updating the indices, both arrays might list it.
 * @param {string} slug
 */
export async function deletePseoPage(slug) {
  if (!slug) return;
  await db.collection(PAGES_COLL).doc(slug).delete();
  await Promise.all(['pre_gen', 'on_demand'].map((k) =>
    db.collection(INDEX_COLL).doc(k).set(
      { slugs: FieldValue.arrayRemove(slug) },
      { merge: true }
    )
  ));
}
