document.addEventListener('DOMContentLoaded', () => {
  const competitionsSelect = document.getElementById('competitions');
  const teamsSelect = document.getElementById('teams');
  const searchInput = document.getElementById('searchInput');
  const positionFilter = document.getElementById('positionFilter');
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');

  // Use a local proxy during development to avoid CORS issues.
  // Start your proxy server (server/index.js) and keep it running at http://localhost:3000
  // The proxy will forward requests to the real Football-Data API using the server-side token.
  const API_BASE = 'http://localhost:3000/api';
  const API_TOKEN = ''; // token not used by frontend when using proxy (kept empty)

  // If API_BASE points to the local proxy we consider API requests allowed
  // even when the page is opened via file://. Otherwise require serving from localhost.
  const isFileProtocol = window.location.protocol === 'file:';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const usingLocalProxy = API_BASE.startsWith('http://localhost') || API_BASE.startsWith('http://127.0.0.1');
  const apiRequestsAllowed = usingLocalProxy || (!isFileProtocol && isLocalhost);

  if (!apiRequestsAllowed) {
    // Insert a visible banner with instructions
    const banner = document.createElement('div');
    banner.id = 'cors-warning';
    banner.style.cssText = 'background:#ffefc2;border:1px solid #f0c36d;padding:12px;margin:8px;font-family:system-ui,Arial,sans-serif;';
    banner.innerHTML = `
      <strong>CORS / Origin mismatch</strong> — serve this app from http://localhost or run the local proxy at http://localhost:3000.<br>
      Examples: <code>python -m http.server 8000</code> or <code>npx serve .</code><br>
      If using the proxy, start the proxy server (server/index.js) and reload.
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Build fetch headers; only include X-Auth-Token when present to avoid sending blank headers.
  const headers = (() => {
    const h = { Accept: 'application/json' };
    if (API_TOKEN) h['X-Auth-Token'] = API_TOKEN;
    return h;
  })();

  // Utility to normalize arrays inside different object structures
  const normalizeItems = (maybeArray, propNames = ['teams', 'competitions', 'items']) => {
    if (!maybeArray) return [];
    if (Array.isArray(maybeArray)) return maybeArray;
    for (const p of propNames) {
      if (Array.isArray(maybeArray[p])) return maybeArray[p];
    }
    return [];
  };

  // Populate a select element with options from API data
  const populateSelect = (select, itemsOrObj, valueKey = 'id', textKey = 'name') => {
    if (!select) return;
    const items = normalizeItems(itemsOrObj);
    if (!items.length) {
      select.innerHTML = `<option value="">No items</option>`;
      return;
    }
    select.innerHTML = `<option value="">Select</option>` +
      items.map(i => `<option value="${i[valueKey]}">${i[textKey] ?? ''}</option>`).join('');
  };

  // Display competitions in UI section
  function displayCompetitions(competitions) {
    const container = document.getElementById('competitions-list');
    if (!container) return;
    const items = normalizeItems(competitions);
    container.innerHTML = `<h2>Competitions</h2>` + (items.map(c =>
      `<div class="competition-card"><strong>${c.name}</strong></div>`
    ).join('') || '<p>No competitions</p>');
  }

  // Display teams in UI section
  function displayTeams(teams) {
    const container = document.getElementById('teams-list');
    if (!container) return;
    const items = normalizeItems(teams);
    container.innerHTML = `<h2>Teams</h2>` + (items.map(t =>
      `<div class="team-card"><strong>${t.name}</strong></div>`
    ).join('') || '<p>No teams</p>');
  }

  // Display players in UI section
  function displayPlayers(players) {
    const container = document.getElementById('players-list');
    if (!container) return;
    if (!players.length) {
      container.innerHTML = '<h2>Players</h2><p>No players found.</p>';
      return;
    }
    container.innerHTML = `<h2>Players</h2>` + players.map(p =>
      `<div class="player-card">
         <strong>${p.name}</strong><br>
         Team: ${p.team}<br>
         Position: ${p.position ?? ''}
       </div>`
    ).join('');
  }

  // Fetch helper with proper headers for Football-Data.org
  async function fetchAPI(path, options = {}) {
    if (!apiRequestsAllowed) {
      const msg = 'API requests are disabled: serve the app from http://localhost or start the local proxy at http://localhost:3000.';
      console.error(msg);
      throw new Error(msg);
    }
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const opts = {
      ...options,
      headers: { ...headers, ...options.headers }
    };
    let res;
    try {
      res = await fetch(url, opts);
    } catch (networkErr) {
      const msg = `Network error when requesting ${url}: ${networkErr.message}`;
      console.error(msg);
      throw new Error(msg);
    }

    const text = await res.text();
    if (!res.ok) {
      let parsed = text;
      try { parsed = JSON.parse(text); } catch (_) {}
      const msg = `API request failed (${res.status}): ${res.statusText} - ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`;
      const err = new Error(msg);
      err.status = res.status;
      err.body = parsed;
      console.error('[fetchAPI] ', msg);
      throw err;
    }

    try {
      return JSON.parse(text);
    } catch (_) {
      return text;
    }
  }

  // Load competitions from API and populate select + display list
  async function loadCompetitions() {
    try {
      const competitionsData = await fetchAPI('/competitions');
      const competitions = competitionsData.competitions || [];
      populateSelect(competitionsSelect, competitions, 'id', 'name');
      displayCompetitions(competitions);
    } catch (e) {
      console.error('Error loading competitions:', e);
      populateSelect(competitionsSelect, []);
      displayCompetitions([]);
    }
  }

  // Load teams based on selected competition, populate select and display list
  competitionsSelect.addEventListener('change', async () => {
    const competitionId = competitionsSelect.value;
    if (!competitionId) return;
    try {
      const teamsData = await fetchAPI(`/competitions/${competitionId}/teams`);
      const teams = teamsData.teams || [];
      populateSelect(teamsSelect, teams, 'id', 'name');
      displayTeams(teams);
      if (teams.length > 0) {
        teamsSelect.value = teams[0].id;
        loadAndShowPlayersForTeam(teams.id);
      } else {
        displayPlayers([]);
      }
    } catch (e) {
      console.error('Failed to load teams:', e);
      populateSelect(teamsSelect, []);
      displayTeams([]);
      displayPlayers([]);
    }
  });

  // Load and display players (squad) for a team with optional filters
  async function loadAndShowPlayersForTeam(teamId) {
    if (!teamId) return;
    try {
      const teamData = await fetchAPI(`/teams/${teamId}`);
      const squad = teamData.squad || [];
      const search = searchInput.value.toLowerCase();
      const position = positionFilter.value;

      let filtered = squad;
      if (search) filtered = filtered.filter(p => p.name?.toLowerCase().includes(search));
      if (position) filtered = filtered.filter(p => p.position === position);

      const teamName = teamData.name || (teamsSelect.selectedOptions[0]?.text ?? '');
      const players = filtered.map(p => ({ ...p, team: teamName }));
      displayPlayers(players);
    } catch (e) {
      console.error('Failed to load team players:', e);
      displayPlayers([]);
    }
  }

  // Update players display when search input or position filter changes
  searchInput.addEventListener('input', () => {
    if (teamsSelect.value) {
      loadAndShowPlayersForTeam(teamsSelect.value);
    }
  });

  positionFilter.addEventListener('change', () => {
    if (teamsSelect.value) {
      loadAndShowPlayersForTeam(teamsSelect.value);
    }
  });

  // Update players if team changes
  teamsSelect.addEventListener('change', async () => {
    const teamId = teamsSelect.value;
    if (!teamId) {
      displayPlayers([]);
      return;
    }
    await loadAndShowPlayersForTeam(teamId);
  });

  // Dark/Light mode toggle button logic
  toggleThemeBtn.addEventListener('click', () => setTheme(!document.body.classList.contains('dark-mode')));
  function setTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    toggleThemeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
  setTheme(false); // Default light mode

  // Initialize app by loading competitions
  if (apiRequestsAllowed) {
    loadCompetitions();
  } else {
    populateSelect(competitionsSelect, []);
    populateSelect(teamsSelect, []);
    displayCompetitions([]);
    displayTeams([]);
    displayPlayers([]);
  }
});
