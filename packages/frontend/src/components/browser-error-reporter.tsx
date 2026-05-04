'use client';
/**
 * Injected into the root layout (dev only).
 * Intercepts console.error, window.onerror, unhandledrejection, and fetch 4xx/5xx
 * and POSTs each to the local error-collector server so Claude can monitor and fix.
 */
import { useEffect } from 'react';

const COLLECTOR = 'http://localhost:3099';

function post(type: string, message: string, extra?: object) {
  fetch(COLLECTOR, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message, url: window.location.href, ...extra }),
  }).catch(() => { /* collector not running — silent */ });
}

export function BrowserErrorReporter() {
  useEffect(() => {
    // Intercept console.error
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      origError(...args);
      const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      // Skip noisy React hydration warnings that aren't actionable
      if (!msg.includes('Warning:') || msg.includes('Cannot update') || msg.includes('Unhandled')) {
        post('console-error', msg);
      }
    };

    // Intercept uncaught JS errors
    const onError = (event: ErrorEvent) => {
      post('page-error', event.message, { file: event.filename, line: event.lineno });
    };
    window.addEventListener('error', onError);

    // Intercept unhandled promise rejections
    const onUnhandled = (event: PromiseRejectionEvent) => {
      post('unhandled-rejection', String(event.reason));
    };
    window.addEventListener('unhandledrejection', onUnhandled);

    // Intercept fetch — wrap global fetch to catch 4xx/5xx API responses
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await origFetch(...args);
      if (res.status >= 400) {
        const reqUrl = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
        const body = await res.clone().text().catch(() => '');
        post('network-error', `${res.status} ${reqUrl} — ${body.slice(0, 300)}`, { reqUrl });
      }
      return res;
    };

    return () => {
      console.error = origError;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
      window.fetch = origFetch;
    };
  }, []);

  return null; // renders nothing
}
