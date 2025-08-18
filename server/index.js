import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const API_BASE = 'https://api.football-data.org/v4';
const API_TOKEN = process.env.FOOTBALL_API_TOKEN;

// For development proxy allow requests from any origin (keeps browser CORS happy).
// In production restrict this to known origins.
app.use(cors());

// Use a prefix-mounted middleware to handle all /api requests
app.use('/api', async (req, res) => {
  try {
    // fail early if token not provided server-side
    if (!API_TOKEN) {
      console.error('Missing FOOTBALL_API_TOKEN env var');
      return res.status(500).json({ error: 'Server misconfiguration: FOOTBALL_API_TOKEN is not set' });
    }

    // forward the original path and query string to the real API
    const forwardPath = req.originalUrl.replace(/^\/api/, '');
    const url = `${API_BASE}${forwardPath}`;

    // log forwarded request for debugging
    console.log(`[proxy] ${req.method} -> ${url}`);

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
      return res.status(response.status).send(body);
    }

    // relay JSON (already string in body)
    res.type('application/json').status(response.status).send(body);

  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend proxy listening at http://localhost:${PORT}`);
});
