/**
 * Tiny HTTP server that receives browser errors POSTed from the frontend
 * and appends them to /tmp/brave-errors.jsonl so Claude can tail and fix.
 *
 * Run:  node scripts/error-collector.js
 */
const http = require('http');
const fs   = require('fs');

const PORT    = 3099;
const LOGFILE = '/tmp/brave-errors.jsonl';

fs.writeFileSync(LOGFILE, ''); // fresh log each run

const server = http.createServer((req, res) => {
  // CORS — browser posts from localhost:3000
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST')    { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const entry = JSON.parse(body);
      const line  = JSON.stringify({ ts: new Date().toISOString(), ...entry });
      fs.appendFileSync(LOGFILE, line + '\n');
      const icon = entry.type === 'network' ? '🌐' : '❌';
      console.log(`${icon} [${entry.type}] ${String(entry.message).slice(0, 160)}`);
    } catch { /* malformed — ignore */ }
    res.writeHead(204); res.end();
  });
});

server.listen(PORT, () => {
  console.log(`🔍 Error collector listening on http://localhost:${PORT}`);
  console.log(`   Writing to: ${LOGFILE}`);
});
