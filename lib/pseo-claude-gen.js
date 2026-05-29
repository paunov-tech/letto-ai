// lib/pseo-claude-gen.js — route-specific copy generation via Claude (v43-C).
//
// Produces the UNIQUE, anti-thin-content body of a pSEO landing page:
//   - 150-200 words of route-specific prose (origin → dest, vibe/month aware)
//   - exactly 5 route-specific FAQ Q/A pairs
//
// Hard rules baked into the prompt:
//   · NEVER mention concrete prices — those render live from /api/packages.
//   · NO generic "Top 10 things to do" filler; reference real attractions /
//     facts passed in from lib/pseo-data.js (grounded, not hallucinated).
//   · SR copy must read as natural Serbian, not an English calque.
//
// Model: Sonnet 4.6 (bulk default, confirmed with Miroslav 2026-05-29).
//
// Auth: reads ANTHROPIC_API_KEY (local/engine) OR lettoprod (Vercel prod var
// name — see memory). One must be present; the SDK client is lazily created
// so importing this module never throws when no key is set (the on-demand
// path is flag-gated and the pre-gen script checks the key up front).

import Anthropic from '@anthropic-ai/sdk';
import { destFacts } from './pseo-data.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2000;

function apiKey() {
  return process.env.ANTHROPIC_API_KEY || process.env.lettoprod || null;
}

let _client = null;
function client() {
  if (_client) return _client;
  const key = apiKey();
  if (!key) throw new Error('pseo-claude-gen · no Anthropic key (ANTHROPIC_API_KEY | lettoprod)');
  _client = new Anthropic({ apiKey: key });
  return _client;
}

export function hasApiKey() { return !!apiKey(); }

// Pull the first balanced JSON object out of an LLM text block. Tolerates
// ```json fences and leading/trailing prose. Throws if none parses.
function extractJson(text) {
  if (!text) throw new Error('empty model response');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in response');
  return JSON.parse(candidate.slice(start, end + 1));
}

function buildPrompt(parsed) {
  const { lang, origin, dest, vibe, monthSlug } = parsed;
  const isSr = lang !== 'en';
  const facts = destFacts(dest.iata, lang);
  const originName = isSr ? origin.name_sr_gen : origin.name_en;   // "Beograda" / "Belgrade"
  const originNom = isSr ? origin.name_sr : origin.name_en;
  const destName = isSr ? dest.srCity : dest.enCity;

  const factLines = [
    facts.durationText && `- typical direct flight time from Belgrade-region: ${facts.durationText}`,
    facts.bestMonthsText && `- best months to visit: ${facts.bestMonthsText}`,
    facts.attractions.length && `- notable attractions: ${facts.attractions.join(', ')}`,
    facts.touristTypes.length && `- travel character: ${facts.touristTypes.join(', ')}`,
    facts.visaNote && `- visa note: ${facts.visaNote}`,
  ].filter(Boolean).join('\n');

  const vibeLine = vibe ? (isSr ? vibe.name_sr : vibe.name_en) : null;
  const monthLine = monthSlug || null;

  const langInstr = isSr
    ? `Pišeš na PRIRODNOM srpskom jeziku (latinica), ne na prevodu sa engleskog. Ton: poverljiv, konkretan, kao da savetuješ prijatelja — bez marketinškog naduvavanja.`
    : `Write in natural English. Tone: trustworthy, concrete, like advising a friend — no marketing fluff.`;

  const angle = [
    vibeLine && (isSr ? `Tema putovanja: ${vibeLine}.` : `Trip theme: ${vibeLine}.`),
    monthLine && (isSr ? `Fokus na period: ${monthLine}.` : `Focus period: ${monthLine}.`),
  ].filter(Boolean).join(' ');

  const route = isSr ? `letovi iz ${originName} za ${destName}` : `flights from ${originNom} to ${destName}`;

  return `You are writing the unique editorial section of a landing page for Letto (letto.live), an AI travel-deal curator for the Balkans. Page topic: ${route}.

${langInstr}

Grounded facts you MAY use (do not invent others, do not contradict these):
${factLines || '- (no extra facts; keep copy general but specific to the route)'}
${angle ? '\nAngle: ' + angle : ''}

STRICT RULES:
1. ${isSr ? 'NE pominji konkretne cene ni iznose' : 'Do NOT mention any concrete prices or amounts'} — live prices render elsewhere on the page.
2. No generic "top 10 things to do" lists. Be specific to THIS origin→destination pair.
3. ${isSr ? '150–200 reči' : '150–200 words'} of body copy, 2–3 short paragraphs.
4. Exactly 5 FAQ pairs, each genuinely specific to this route (flight logistics from ${originNom}, season, the destination, ${vibeLine ? 'the trip theme, ' : ''}practicalities). Keep each answer 1–3 sentences. No prices.
5. Mention Letto's value (scans 50+ sources every 6h, keeps only offers ~30% below median) at most once, naturally.

Return ONLY a JSON object, no prose around it:
{"copy": "<body copy as a single string, paragraphs separated by \\n\\n>", "faqs": [{"q": "...", "a": "..."}, ... exactly 5]}`;
}

/**
 * Generate route-specific copy + FAQs for a parsed slug.
 * @param {object} parsed  output of parseSlug (resolved origin/dest objects)
 * @returns {Promise<{copy:string, faqs:{q:string,a:string}[]}>}
 */
export async function generatePageContent(parsed) {
  const prompt = buildPrompt(parsed);
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = res.content.find(b => b.type === 'text');
  const json = extractJson(textBlock ? textBlock.text : '');

  let copy = typeof json.copy === 'string' ? json.copy.trim() : '';
  let faqs = Array.isArray(json.faqs) ? json.faqs : [];
  faqs = faqs
    .filter(f => f && typeof f.q === 'string' && typeof f.a === 'string')
    .slice(0, 5)
    .map(f => ({ q: f.q.trim(), a: f.a.trim() }));

  if (!copy || faqs.length < 3) {
    throw new Error('pseo-claude-gen · model output failed validation (copy/faqs)');
  }
  return { copy, faqs };
}

export { buildPrompt }; // exported for offline prompt inspection / tests
