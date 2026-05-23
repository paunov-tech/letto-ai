# letto.live · logo kit

Brand assets for **letto.live** (SIAL Consulting d.o.o.).

Every file is a self-contained SVG. All text is converted to **vector
outlines** — the logos render identically everywhere with **no web-font
dependency**. Nothing to install, nothing to load.

## Files

| File | viewBox | Use |
|------|---------|-----|
| `letto-logo-horizontal.svg` | 507 × 190 | **Primary logo.** Mark + wordmark, side by side. Site header, email signature, documents, invoices. Light backgrounds. |
| `letto-logo-horizontal-dark.svg` | 507 × 190 | Horizontal logo for dark backgrounds. |
| `letto-logo-stacked.svg` | 319 × 338 | Mark above wordmark. Square-ish spaces — social avatars, posters, merch. Light backgrounds. |
| `letto-logo-stacked-dark.svg` | 319 × 338 | Stacked logo for dark backgrounds. |
| `letto-mark.svg` | 200 × 200 | The compass-star mark alone, detailed. Display sizes (≥48px) — hero graphics, watermarks, large icons. |
| `letto-mark-compact.svg` | 200 × 200 | Bold, simplified mark. Small sizes (≤48px) — favicons, app icons, UI chrome. |

## Which mark at which size

- **≤48px** (favicon, app icon, small UI) → `letto-mark-compact.svg`
- **≥48px** (display) → `letto-mark.svg`

The detailed mark's hairline rings and ticks fade out below ~48px by design.
The compact mark is built from solid shapes that survive down to 16px.

## Colour

| Token | Hex | Where |
|-------|-----|-------|
| Ink | `#1F2226` | "letto" wordmark on light backgrounds |
| Ivory | `#F4ECD9` | "letto" wordmark on dark backgrounds |
| Gold · deep | `#946828` | ".LIVE" on light backgrounds |
| Gold · bright | `#D9A94A` | ".LIVE" on dark backgrounds |
| Gold foil | gradient `#7C5B22 → #F0D795 → #7C5B22` | the compass mark — works on light *and* dark |

## Typography

The wordmark is **Fraunces** (Italic, display optical size) for *letto* and
**IBM Plex Sans** (SemiBold) for *.LIVE* — both [SIL Open Font License].
The glyphs are outlined in the SVGs; you do not need the fonts to use the
logos. Use these two families for any text set alongside the logo.

## Clear space & minimum size

- Keep clear space around the logo equal to the width of the compass mark.
- Minimum width — horizontal logo **180px**, stacked logo **110px**.
- Below that, drop the wordmark and use `letto-mark-compact.svg` alone.

## Don't

- Don't recolour the wordmark or the gold.
- Don't stretch, rotate, or skew.
- Don't add shadows, glows, or outlines.
- Don't place the light logo on a busy or low-contrast background — switch to
  the `-dark` variant, or add a solid panel behind it.

## Raster exports — `png/`

Facebook, Instagram and most social platforms **do not accept SVG** anywhere
(profile picture, cover, link previews, ads). Use the ready-made transparent
PNGs in `png/`:

| File | @2x | @3x |
|------|-----|-----|
| `letto-logo-horizontal[-dark]@Nx.png` | 1000 px wide | 1500 px wide |
| `letto-logo-stacked[-dark]@Nx.png` | 640 px wide | 960 px wide |
| `letto-mark@Nx.png` | 600 px | 900 px |
| `letto-mark-compact@Nx.png` | 300 px | 450 px |

All are transparent (RGBA) — place them on any background. The `-dark` logos
carry ivory text and must go on a dark background; the others on light.

Need a different size, or a JPG with a baked-in background? Re-export from the
SVG (vectors scale losslessly):

```sh
magick -background none letto-logo-horizontal.svg -resize 2400 out.png
magick -background '#1F2226' letto-mark.svg -resize 1080x1080 fb-profile.jpg
```

---

The wordmark glyphs were outlined from Fraunces Italic + IBM Plex Sans; the
compass mark is pure geometry. These are final static assets — edit the SVG
source directly if a change is needed. The existing `public/compass-sun.svg`
and `public/favicon.svg` are untouched.
