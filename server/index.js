import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try loading .env from several places so the token is picked up regardless of where the process is started
const candidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'server/index.js.env'),
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), 'index.js.env'),
];
const loadedFiles = [];
// Default load first (dotenv no-ops if missing)
dotenv.config();
for (const p of candidates) {
  try {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      loadedFiles.push(p);
    }
  } catch (e) {
    // ignore fs errors
  }
}
if (loadedFiles.length) console.log('[proxy] dotenv loaded from:', loadedFiles);

const app = express();
const PORT = process.env.PORT || 3000;

// Expose Retry-After so the browser lets frontend JS read it
app.use(cors({ exposedHeaders: ['Retry-After', 'Content-Type'] }));

// API base should point to the v4 root so forwarded paths (e.g. /teams/ID) resolve correctly
const API_BASE = 'https://api.football-data.org/v4/';
// accept either env var name and strip surrounding quotes if present
const rawToken = (process.env.FOOTBALL_API_TOKEN || process.env.FOOTBALL_API_KEY || '').toString();
const API_TOKEN = rawToken.replace(/^['"]|['"]$/g, '');

console.log(`[proxy] FOOTBALL_API token present: ${API_TOKEN ? 'yes' : 'no'} (length: ${API_TOKEN ? API_TOKEN.length : 0})`);

// Very small in-memory cache to reduce upstream calls
const CACHE_TTL_MS = 60_000;
const responseCache = new Map(); // key: upstream URL, val: { body, status, contentType, expiresAt }

// Use a prefix-mounted middleware to handle all /api requests
app.use('/api', async (req, res) => {
  try {
    // only support GET from the frontend for now
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed. Proxy supports GET only for this app.' });
    }

    // log incoming request and token presence (do not print token value)
    console.log(`[proxy] incoming ${req.method} ${req.originalUrl}`);

    // fail early if token not provided server-side
    if (!API_TOKEN) {
      const msg = 'Server misconfiguration: FOOTBALL_API_TOKEN or FOOTBALL_API_KEY is not set on the server. Check .env or server/index.js.env (paths tried) and restart the process.';
      console.error(msg);
      if (loadedFiles.length) {
        console.error('[proxy] dotenv loaded these files:', loadedFiles);
      } else {
        console.error('[proxy] dotenv did not find any candidate files; checked:', candidates);
      }
      return res.status(500).json({ error: msg });
    }

    // forward the original path and query string to the real API
    // Ensure we preserve the API_BASE path (e.g. /v4/matches). If forwardPath begins with a leading slash,
    // new URL(forwardPath, API_BASE) will replace the base path. Normalize by removing leading slash
    // and guaranteeing API_BASE ends with a slash.
    const forwardPath = (req.url && req.url.length) ? req.url : '/';
    const baseForUrl = API_BASE.endsWith('/') ? API_BASE : API_BASE + '/';
    const pathPart = forwardPath.startsWith('/') ? forwardPath.slice(1) : forwardPath;
    let url;
    try {
      url = new URL(pathPart, baseForUrl).toString();
    } catch (err) {
      console.error('[proxy] failed to build forward URL', err);
      return res.status(500).json({ error: 'Failed to build upstream URL', detail: String(err) });
    }
    // debug: show constructed upstream URL:
    console.log('[proxy] constructed upstream URL:', url);

    // build headers, only include token when present
    const headers = { Accept: 'application/json' };
    if (API_TOKEN) headers['X-Auth-Token'] = API_TOKEN;

    // serve from cache if fresh
    const now = Date.now();
    const cached = responseCache.get(url);
    if (cached && cached.expiresAt > now) {
      res.set('Content-Type', cached.contentType || 'application/json');
      res.set('Cache-Control', 'public, max-age=60');
      return res.status(cached.status).send(cached.body);
    }

    const response = await fetch(url, {
      method: req.method,
      headers
    });

    const body = await response.text();
    if (!response.ok) {
      // forward Retry-After so frontend can respect it
      const ra = response.headers.get('retry-after');
      if (ra) res.set('Retry-After', ra);
      res.set('Cache-Control', 'no-store');
      return res.status(response.status).send(body);
    }

    // relay JSON (already string in body)
    const ct = response.headers.get('content-type') || 'application/json';
    res.set('Content-Type', ct);
    res.set('Cache-Control', 'public, max-age=60');
    // write-through cache
    responseCache.set(url, { body, status: response.status, contentType: ct, expiresAt: now + CACHE_TTL_MS });
    res.status(response.status).send(body);

  } catch (error) {
    console.error('[proxy] error:', error && error.stack ? error.stack : error);
    res.status(500).json({ error: 'Internal server error', detail: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy listening at http://localhost:${PORT}`);
});
