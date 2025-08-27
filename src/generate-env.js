// If loaded in a browser, avoid any Node-specific imports to prevent "import ... outside a module" errors.
if (typeof window !== 'undefined') {
  window._env_ = window._env_ || {};
  // leave token empty by default; running the generate script in Node will create src/env.local.js
  window._env_.API_TOKEN = window._env_.API_TOKEN || '';
} else {
  // Node environment — use CommonJS requires so this file can be executed with `node src/generate-env.js`
  const fs = require('fs');
  const path = require('path');
  const dotenv = require('dotenv');

  // Candidate paths for .env file
  const envCandidates = [
    path.resolve(__dirname, '../src/.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(process.cwd(), '.env'),
  ];

  // Pick the first existing env file, or fall back to the first candidate
  const envPath = envCandidates.find(p => fs.existsSync(p)) || envCandidates[0];

  // Load environment variables
  try {
    if (envPath && fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
    }
  } catch (err) {
    console.warn('Failed to load .env file:', err);
  }

  // Extract API key
  const apiKey = process.env.FOOTBALL_API_KEY || process.env.API_TOKEN || '';
  const outPath = path.resolve(__dirname, '../src/env.local.js');

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  // Write browser-safe env file
  const content = `// Auto-generated from ${envPath} — DO NOT COMMIT
// Browser-safe local env for development only.
window._env_ = window._env_ || {};
window._env_.API_TOKEN = ${JSON.stringify(apiKey)};
`;

  try {
    fs.writeFileSync(outPath, content, { mode: 0o600 });
    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Failed to write env file:', err);
    process.exitCode = 1;
  }
}