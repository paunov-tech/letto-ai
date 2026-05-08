// scripts/lib/image-pick.mjs — Deterministic image selection from letto_destination_images.
// Same pkg.id always picks same image. Different pkg.ids spread evenly across the 10 images.

export function hashSeed(s) {
  // Simple deterministic 32-bit hash (FNV-ish)
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

export function pickImage(images, seedString) {
  if (!Array.isArray(images) || images.length === 0) return null;
  const idx = hashSeed(seedString) % images.length;
  return images[idx];
}

export function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
