// Bright Data Web Unlocker API client.
// The API key is read only from the environment and is never included in errors.

const API_BASE = process.env.BRIGHT_DATA_API_BASE || 'https://api.brightdata.com';
const DEFAULT_COUNTRY = (process.env.BRIGHT_DATA_COUNTRY || 'rs').toLowerCase();
const UNLOCKER_ZONE_TYPES = new Set(['unblocker', 'web_unlocker', 'unlocker']);

let discoveredZone;
let zoneDiscoveryPromise;
let localCount = 0;

function apiKey() {
  const key = process.env.BRIGHT_DATA_API_KEY?.trim();
  if (!key) throw new Error('Bright Data auth not configured (BRIGHT_DATA_API_KEY)');
  return key;
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json'
  };
}

async function responseError(response, service) {
  const text = await response.text().catch(() => '');
  const clean = text
    .replaceAll(apiKey(), '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 300);
  return new Error(`${service} ${response.status}${clean ? `: ${clean}` : ''}`);
}

export function isBrightDataConfigured() {
  return Boolean(process.env.BRIGHT_DATA_API_KEY?.trim());
}

export async function getActiveZones({ timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}/zone/get_active_zones`, {
      headers: headers(),
      signal: ctrl.signal
    });
    if (!response.ok) throw await responseError(response, 'Bright Data zones');
    const zones = await response.json();
    return Array.isArray(zones) ? zones : [];
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveZone() {
  if (process.env.BRIGHT_DATA_ZONE?.trim()) return process.env.BRIGHT_DATA_ZONE.trim();
  if (discoveredZone) return discoveredZone;
  if (!zoneDiscoveryPromise) {
    zoneDiscoveryPromise = getActiveZones().then(zones => {
      const zone = zones.find(item => UNLOCKER_ZONE_TYPES.has(String(item.type).toLowerCase()))
        || zones.find(item => /unlock/i.test(String(item.type)))
        || (zones.length === 1 ? zones[0] : null);
      if (!zone?.name) {
        throw new Error('No Bright Data Web Unlocker zone found; set BRIGHT_DATA_ZONE');
      }
      discoveredZone = zone.name;
      return discoveredZone;
    }).finally(() => {
      zoneDiscoveryPromise = null;
    });
  }
  return zoneDiscoveryPromise;
}

export async function scrapeWithBrightData(url, opts = {}) {
  const zone = await resolveZone();
  // A caller can opt into Web Unlocker's own location selection. This is
  // useful for non-rate property metadata: it is not country-specific, and
  // forcing a shopper country can make a protected page unnecessarily slow.
  const country = opts.geo === false ? null : String(opts.geo || DEFAULT_COUNTRY).toLowerCase();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 90000);
  localCount++;
  try {
    const response = await fetch(`${API_BASE}/request`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        zone,
        url,
        format: 'raw',
        method: 'GET',
        ...(country ? { country } : {})
      }),
      signal: ctrl.signal
    });
    if (!response.ok) throw await responseError(response, 'Bright Data Web Unlocker');
    const html = await response.text();
    return {
      html,
      status: Number(response.headers.get('x-response-code')) || 200,
      finalUrl: response.headers.get('x-response-url') || url,
      provider: 'brightdata'
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getBrightDataCalls() {
  return localCount;
}
