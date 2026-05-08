#!/usr/bin/env node
// scripts/backfill-pexels-images.mjs — Backfill letto_packages.imageUrl from letto_destination_images library.
// Deterministic pick: hash(pkg.id) % images.length → 4 Istanbul packages get 4 different images.
// Idempotent: re-running with same data produces same picks.

import { GoogleAuth } from 'google-auth-library';
import { readFileSync } from 'node:fs';
import { hashSeed, pickImage, slugify } from './lib/image-pick.mjs';

const sa = JSON.parse(readFileSync('/home/zlfzr/letto-ai/.secrets/firebase-admin-sa.json', 'utf8'));
const auth = new GoogleAuth({ credentials: sa, scopes: ['https://www.googleapis.com/auth/datastore'] });
const t = (await (await auth.getClient()).getAccessToken()).token;

// 1. Read all packages
const r = await fetch('https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages?pageSize=200', {
  headers: { Authorization: 'Bearer ' + t }
});
const docs = (await r.json()).documents || [];
console.log(`Found ${docs.length} packages`);

// 2. Cache letto_destination_images per city slug (so we don't re-read for same city)
const libCache = new Map();
async function getLibForCity(city) {
  const slug = slugify(city);
  if (libCache.has(slug)) return libCache.get(slug);
  const url = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_destination_images/${slug}`;
  const lr = await fetch(url, { headers: { Authorization: 'Bearer ' + t }});
  if (!lr.ok) {
    libCache.set(slug, null);
    return null;
  }
  const data = await lr.json();
  const arr = data.fields?.images?.arrayValue?.values || [];
  const images = arr.map(v => {
    const f = v.mapValue?.fields || {};
    return {
      url: f.url?.stringValue,
      photographer: f.photographer?.stringValue || '',
      photographerUrl: f.photographerUrl?.stringValue || '',
      sourceUrl: f.sourceUrl?.stringValue || '',
      alt: f.alt?.stringValue || '',
      query: f.query?.stringValue || '',
      pexelsId: parseInt(f.pexelsId?.integerValue) || 0,
      w: parseInt(f.w?.integerValue) || 0,
      h: parseInt(f.h?.integerValue) || 0
    };
  }).filter(i => i.url);
  libCache.set(slug, images);
  return images;
}

// 3. For each package, deterministic pick + PATCH
let success = 0, missingLib = 0, missingCity = 0, failed = 0;
for (const d of docs) {
  const id = d.name.split('/').pop();
  const city = d.fields?.destination?.mapValue?.fields?.city?.stringValue;
  if (!city) { missingCity++; continue; }
  const images = await getLibForCity(city);
  if (!images || images.length === 0) {
    missingLib++;
    console.log(`  [${id}] (${city}) → no library entry, skip`);
    continue;
  }
  const chosen = pickImage(images, id);
  const idx = hashSeed(id) % images.length;
  const patchUrl = `https://firestore.googleapis.com/v1/projects/letto-ai/databases/(default)/documents/letto_packages/${id}?updateMask.fieldPaths=imageUrl&updateMask.fieldPaths=imageCredit`;
  const body = {
    fields: {
      imageUrl: { stringValue: chosen.url },
      imageCredit: { mapValue: { fields: {
        photographer: { stringValue: chosen.photographer },
        photographerUrl: { stringValue: chosen.photographerUrl },
        source: { stringValue: 'pexels' },
        sourceUrl: { stringValue: chosen.sourceUrl },
        alt: { stringValue: chosen.alt },
        query: { stringValue: chosen.query },
        pickIndex: { integerValue: String(idx) }
      } } }
    }
  };
  const pr = await fetch(patchUrl, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (pr.ok) {
    success++;
    console.log(`  [${id}] (${city}) → idx=${idx}/${images.length-1}, query="${chosen.query}", ${chosen.photographer}`);
  } else {
    failed++;
    console.error(`  [${id}] PATCH ${pr.status}: ${(await pr.text()).slice(0, 200)}`);
  }
}
console.log(`\nDone. success=${success}, missingLib=${missingLib}, missingCity=${missingCity}, failed=${failed}`);
