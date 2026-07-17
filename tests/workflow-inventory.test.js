import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = JSON.parse(readFileSync(new URL('../workflows/01-LETTO-MIXING-ENGINE.json', import.meta.url)));
const scrapers = JSON.parse(readFileSync(new URL('../workflows/06-LETTO-SCRAPE-REFRESH.json', import.meta.url)));
const node = (workflow, name) => workflow.nodes.find(item => item.name === name);

test('hotel search uses the same validated dates as the selected round trip', () => {
  const params = node(engine, 'Stage B · Booking.com hotels').parameters.queryParameters.parameters;
  const arrival = params.find(item => item.name === 'arrival_date').value;
  const departure = params.find(item => item.name === 'departure_date').value;
  assert.match(arrival, /Travelpayouts flights/);
  assert.match(arrival, /departure_at/);
  assert.match(departure, /Travelpayouts flights/);
  assert.match(departure, /return_at/);
});

test('mixer rejects invalid stays instead of clamping nights', () => {
  const code = node(engine, 'Stage C · Mix + filter').parameters.jsCode;
  assert.match(code, /actualNights >= 3 && actualNights <= 10/);
  assert.match(code, /no_valid_roundtrip/);
  assert.doesNotMatch(code, /Math\.max\(3,\s*Math\.min\(10/);
});

test('flight discovery is wide enough and route windows rotate every run', () => {
  const params = node(engine, 'Stage B · Travelpayouts flights').parameters.queryParameters.parameters;
  assert.equal(params.find(item => item.name === 'limit').value, '20');
  assert.match(node(engine, 'Stage A · Routes').parameters.jsCode, /runNumber \* ROUTES_PER_RUN/);
});

test('scraper refresh actually runs every four hours', () => {
  const trigger = node(scrapers, 'Trigger · every 4h');
  assert.equal(trigger.parameters.rule.interval[0].expression, '0 */4 * * *');
  const systemCron = readFileSync(new URL('../scrapers/letto-scrapers.cron', import.meta.url), 'utf8');
  assert.match(systemCron, /^0 \*\/4 \* \* \* root \/opt\/letto-scrapers\/run-production\.sh/m);
});
