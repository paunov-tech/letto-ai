// Big Blue uses the same public structured search platform as Kontiki, on its
// own domain and inventory. Reuse the API chain, never Kontiki's result data.
import { scrapeStructuredPackages } from './kontiki.mjs';

const BASE = 'https://bigblue.rs';
export async function scrapeBigBlue() {
  return scrapeStructuredPackages(BASE);
}
