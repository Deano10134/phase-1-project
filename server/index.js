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

const API_BASE = 'https://api.football-data.org/v4';
// accept either env var name and strip surrounding quotes if present
const rawToken = (process.env.FOOTBALL_API_TOKEN || process.env.FOOTBALL_API_KEY || '').toString();
const API_TOKEN = rawToken.replace(/^['"]|['"]$/g, '');

console.log(`[proxy] FOOTBALL_API token present: ${API_TOKEN ? 'yes' : 'no'} (length: ${API_TOKEN ? API_TOKEN.length : 0})`);

// For development proxy allow requests from any origin (keeps browser CORS happy).
// In production restrict this to known origins.
app.use(cors());

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
    // Ensure we preserve the API_BASE path (e.g. /v4). If forwardPath begins with a leading slash,
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
    // debug: show constructed upstream URL
    console.log('[proxy] constructed upstream URL:', url);

    // build headers, only include token when present
    const headers = { 'Accept': 'application/json' };
    if (API_TOKEN) headers['X-Auth-Token'] = API_TOKEN;

    const response = await fetch(url, {
      method: req.method,
      headers
      // Note: this proxy handles GET requests used by the frontend; forwarding bodies would require additional parsing.
    });

    const body = await response.text();
    if (!response.ok) {
      console.error(`[proxy] upstream ${response.status} for ${url}: ${body}`);
      // Provide a helpful hint when status suggests auth / bad request issues
      if (response.status === 400 || response.status === 401) {
        return res.status(response.status).json({
          error: 'Upstream API returned an authentication/bad request error',
          status: response.status,
          message: body,
          hint: 'Verify the server environment variable FOOTBALL_API_TOKEN is set and valid.'
        });
      }
      // relay other errors as-is (preserve content-type if available)
      const ct = response.headers.get('content-type') || 'text/plain';
      res.set('Content-Type', ct);
      return res.status(response.status).send(body);
    }

    // relay JSON (already string in body)
    const ct = response.headers.get('content-type') || 'application/json';
    res.set('Content-Type', ct);
    res.status(response.status).send(body);

  } catch (error) {
    console.error('Proxy error:', error && error.stack ? error.stack : error);
    res.status(500).json({ error: 'Internal server error', detail: String(error) });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy listening at http://localhost:${PORT}`);
});
