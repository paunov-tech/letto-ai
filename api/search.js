// api/search.js — AI Search endpoint
// Parses natural-language travel query → structured search parameters
// Called from hero search bar

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PARSER_SYSTEM_PROMPT = `Ti si parser putničkih upita na srpskom/hrvatskom/bosanskom/engleskom.
Korisnik ti daje slobodan tekst, ti vraćaš STROGO JSON sa sledećim poljima (NIŠTA drugo):

{
  "destination": string | null,       // grad, regija, ili "bilo gde"
  "destinationType": "beach" | "city" | "mountain" | "cultural" | "any",
  "originAirport": string | null,      // IATA kod (BEG, INI, TIV, ZAG, SJJ, SKP) ako se pomene
  "dateRange": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" } | null,
  "month": string | null,              // "maj 2026" ako je pomenut samo mesec
  "travelers": { "adults": number, "children": number },
  "budgetMax": number | null,          // EUR po osobi
  "mealPlan": "room-only" | "BB" | "HB" | "FB" | "AI" | null,
  "vibe": "mirno" | "zabava" | "luksuz" | "budžet" | "porodica" | null,
  "duration": { "nights": number } | null,
  "originalQuery": string              // echo-back originalnog texta
}

Ako nešto nije eksplicitno rečeno, stavi null. NE izmišljaj podatke. NE dodaj preamble. Samo JSON.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || query.length > 500) {
    return res.status(400).json({ error: 'Invalid query' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: PARSER_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: query }]
    });

    const text = response.content[0].text.trim();
    // Strip code fences if Claude wraps in them
    const clean = text.replace(/^```json\n?|\n?```$/g, '');

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      return res.status(500).json({ error: 'Parser vratio neočekivan format', raw: clean });
    }

    // TODO: Here you'd call your deal-matching logic
    // For MVP, return parsed query + mock matches from Firestore
    return res.status(200).json({
      parsed,
      matches: [], // fill from Firestore lookup in next iteration
      message: 'Query parsed. Deal matching coming in v0.2.'
    });
  } catch (err) {
    console.error('Search API error:', err);
    return res.status(500).json({ error: 'AI parser failed', details: err.message });
  }
}
