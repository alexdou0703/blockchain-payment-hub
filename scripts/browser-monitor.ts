/**
 * Autonomous browser monitor — opens checkout in headless Chrome,
 * captures all JS console errors, and writes them to /tmp/browser-errors.json
 * so Claude can read and fix them.
 */
import { chromium } from 'playwright';
import * as fs from 'fs';

const CHECKOUT_URL = process.argv[2] || 'http://localhost:3000';
const OUT_FILE = '/tmp/browser-errors.json';

interface CapturedError {
  type: 'console-error' | 'page-error' | 'network-error';
  message: string;
  url?: string;
  line?: number;
  timestamp: string;
}

async function monitor() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: CapturedError[] = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({
        type: 'console-error',
        message: msg.text(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Capture unhandled JS exceptions
  page.on('pageerror', err => {
    errors.push({
      type: 'page-error',
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  });

  // Capture failed network requests (API calls)
  page.on('response', async res => {
    if (res.status() >= 400) {
      const body = await res.text().catch(() => '');
      errors.push({
        type: 'network-error',
        message: `${res.status()} ${res.url()}: ${body.slice(0, 200)}`,
        url: res.url(),
        timestamp: new Date().toISOString(),
      });
    }
  });

  console.log(`Opening: ${CHECKOUT_URL}`);
  await page.goto(CHECKOUT_URL, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

  // Wait a bit for any async errors to surface
  await page.waitForTimeout(3000);

  await browser.close();

  fs.writeFileSync(OUT_FILE, JSON.stringify({ url: CHECKOUT_URL, errors }, null, 2));

  if (errors.length === 0) {
    console.log('✅ No browser errors detected');
  } else {
    console.log(`❌ ${errors.length} error(s) detected:`);
    errors.forEach(e => console.log(`  [${e.type}] ${e.message.slice(0, 150)}`));
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

monitor().catch(err => {
  console.error('Monitor crashed:', err.message);
  fs.writeFileSync(OUT_FILE, JSON.stringify({ url: CHECKOUT_URL, errors: [{ type: 'page-error', message: err.message, timestamp: new Date().toISOString() }] }, null, 2));
  process.exit(1);
});
