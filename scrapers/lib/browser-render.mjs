import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CANDIDATES = [
  process.env.CHROMIUM_PATH,
  '/snap/bin/chromium',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome'
].filter(Boolean);

async function browserPath() {
  for (const candidate of CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {}
  }
  throw new Error('Chromium executable not found; set CHROMIUM_PATH');
}

/** Render a public page without injecting shell input or storing browser state. */
export async function renderHtml(url, { timeoutMs = 90000, virtualTimeMs = 15000 } = {}) {
  const executable = await browserPath();
  const { stdout } = await execFileAsync(executable, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    `--virtual-time-budget=${virtualTimeMs}`,
    '--dump-dom',
    url
  ], {
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024,
    encoding: 'utf8'
  });
  return stdout;
}
