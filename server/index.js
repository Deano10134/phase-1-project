const express = require('express');
const cors = require('cors');
require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve frontend files so you can open http://localhost:3000 instead of loading file://
app.use(express.static(path.join(__dirname, '..', 'src')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'src', 'index.html')));

const API_BASE = 'https://api.football-data.org/v4';

app.all('/api/*', async (req, res) => {
  try {
    // Respond to CORS preflight quickly
    if (req.method === 'OPTIONS') return res.sendStatus(200);

    const apiKey = process.env.FOOTBALL_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server missing API key' });

    // req.originalUrl includes the path and query string; strip the /api prefix
    const pathWithQs = req.originalUrl.replace(/^\/api/, '');
    const url = `${API_BASE}${pathWithQs}`;

    const headers = { 'X-Auth-Token': apiKey };
    // forward a couple of safe request headers if present
    ['accept', 'content-type'].forEach(h => { if (req.headers[h]) headers[h] = req.headers[h]; });

    const options = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      options.body = JSON.stringify(req.body);
      if (!options.headers['content-type']) options.headers['content-type'] = 'application/json';
    }

    const upstream = await fetch(url, options);
    const body = await upstream.text();

    // Don't forward hop-by-hop headers
    const hopByHop = new Set(['connection','keep-alive','transfer-encoding','upgrade','proxy-authenticate','proxy-authorization','te','trailer']);
    upstream.headers.forEach((value, name) => {
      if (!hopByHop.has(name.toLowerCase())) res.setHeader(name, value);
    });

    res.status(upstream.status).send(body);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Proxy error' });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Proxy listening on http://localhost:${port}`));

