/**
 * Live headed browser monitor — opens Chrome visibly so the user can watch,
 * streams every console error / page error / failed network request to
 * /tmp/live-errors.jsonl (one JSON object per line) so Claude can tail and fix.
 *
 * Usage:  npx ts-node scripts/live-monitor.ts [url]
 * Press Ctrl+C to stop.
 */
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import * as fs from 'fs';

const URL   = process.argv[2] || 'http://localhost:3000';
const LOG   = '/tmp/live-errors.jsonl';
const STAMP = '/tmp/live-monitor-alive.txt';

// Truncate log on startup so each session is fresh
fs.writeFileSync(LOG, '');

interface Entry {
  ts: string;
  type: 'console-error' | 'page-error' | 'network-error' | 'status';
  message: string;
  url?: string;
}

function emit(entry: Entry) {
  const line = JSON.stringify(entry);
  fs.appendFileSync(LOG, line + '\n');
  const icon = entry.type === 'status' ? '📡' : '❌';
  console.log(`${icon} [${entry.type}] ${entry.message.slice(0, 160)}`);
}

function ts() { return new Date().toISOString(); }

async function attachListeners(page: Page) {
  page.on('console', msg => {
    if (msg.type() === 'error') {
      emit({ ts: ts(), type: 'console-error', message: msg.text() });
    }
  });

  page.on('pageerror', err => {
    emit({ ts: ts(), type: 'page-error', message: err.message });
  });

  page.on('response', async res => {
    if (res.status() >= 400) {
      const body = await res.text().catch(() => '');
      emit({
        ts: ts(), type: 'network-error',
        message: `${res.status()} ${res.url()} — ${body.slice(0, 200)}`,
        url: res.url(),
      });
    }
  });
}

async function run() {
  const browser: Browser = await chromium.launch({
    headless: false,                  // ← visible window
    args: ['--start-maximized'],
  });

  const ctx  = await browser.newContext({ viewport: null });
  const page = await ctx.newPage();

  attachListeners(page);

  emit({ ts: ts(), type: 'status', message: `Navigating to ${URL}` });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => {});
  emit({ ts: ts(), type: 'status', message: 'Page loaded — watching for errors…' });

  // Keep-alive heartbeat + write stamp file so external scripts can detect we're running
  const hb = setInterval(() => {
    fs.writeFileSync(STAMP, ts());
  }, 5000);

  // Listen for navigation (SPA route changes) and re-attach
  page.on('load', () => {
    emit({ ts: ts(), type: 'status', message: `Page navigated to: ${page.url()}` });
  });

  // Handle browser closed by user
  browser.on('disconnected', () => {
    clearInterval(hb);
    emit({ ts: ts(), type: 'status', message: 'Browser closed — monitor stopped' });
    process.exit(0);
  });

  console.log('\n✅ Live monitor running. Browser is open.');
  console.log(`   Errors are streamed to: ${LOG}`);
  console.log('   Close the browser window or press Ctrl+C to stop.\n');

  // Keep the process alive
  await new Promise(() => {});
}

run().catch(err => {
  emit({ ts: ts(), type: 'page-error', message: `Monitor crashed: ${err.message}` });
  process.exit(1);
});
