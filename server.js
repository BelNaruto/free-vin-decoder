#!/usr/bin/env node
/**
 * Zero-dependency server for the Car Specs API web apps.
 *
 * Serves ./public and proxies a fixed list of Car Specs API routes, so your
 * RapidAPI key never reaches the browser. Without a key it runs in demo mode
 * with fictional sample data from demo-data.json.
 *
 * API:     https://rapidapi.com/belchiorarkad-FqvHs2EDOtP/api/car-specs-api
 * Support: Telegram @pintoflow
 *
 *   RAPIDAPI_KEY=your_key node server.js   -> live data
 *   node server.js                         -> demo mode
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const KEY = process.env.RAPIDAPI_KEY || '';
const HOST = 'car-specs-api.p.rapidapi.com';
const DEMO = !KEY || process.env.DEMO === '1';
const PUBLIC = path.join(__dirname, 'public');
const APP = require('./package.json').name;

// Routes the browser may call (GET unless noted). Anything else is rejected.
const ROUTES = [
  /^\/years$/, /^\/makes$/, /^\/models$/, /^\/trims$/, /^\/search$/,
  /^\/specs\/\d+$/, /^\/specs$/, /^\/mpg$/, /^\/dimensions$/, /^\/compare$/, /^\/vehicle$/,
  /^\/images$/, /^\/logo$/, /^\/safety-ratings$/,
  /^\/vin\/(decode|specs|validate|decode-basic)$/,
];
const POST_ROUTES = [/^\/vin\/batch$/];

const cache = new Map(); // past model years never change, so caching is safe
const TTL = 6 * 3600e3;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
const readBody = (req) => new Promise((ok, fail) => {
  let b = ''; req.on('data', (c) => { b += c; if (b.length > 1e5) req.destroy(); }); req.on('end', () => ok(b)); req.on('error', fail);
});

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    try {
      if (u.pathname === '/api/config') return send(res, 200, { demo: DEMO, app: APP });
      if (u.pathname.startsWith('/api/')) {
        const route = u.pathname.slice(4);
        const isPost = req.method === 'POST' && POST_ROUTES.some((r) => r.test(route));
        if (!isPost && !(req.method === 'GET' && ROUTES.some((r) => r.test(route)))) {
          return send(res, 404, { success: false, error: { code: 'ROUTE_NOT_FOUND', message: 'Unknown route' } });
        }
        const body = isPost ? await readBody(req) : null;
        if (DEMO) return send(res, 200, require('./demo')(route, u.searchParams, body));
        const url = `https://${HOST}${route}${u.search}`;
        const hit = !isPost && cache.get(url);
        if (hit && Date.now() - hit.t < TTL) return send(res, 200, hit.body);
        const r = await fetch(url, {
          method: isPost ? 'POST' : 'GET',
          headers: { 'x-rapidapi-host': HOST, 'x-rapidapi-key': KEY, ...(isPost ? { 'content-type': 'application/json' } : {}) },
          body,
        });
        const text = await r.text();
        if (r.ok && !isPost) cache.set(url, { t: Date.now(), body: text });
        return send(res, r.status, text);
      }
      const file = path.join(PUBLIC, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname));
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
      send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
    } catch (e) {
      send(res, 502, { success: false, error: { code: 'PROXY_ERROR', message: e.message } });
    }
  })
  .listen(PORT, () => console.log(`${APP} on http://localhost:${PORT}${DEMO ? '  (DEMO mode – fictional sample data, set RAPIDAPI_KEY for live data)' : ''}`));
