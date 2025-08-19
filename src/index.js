document.addEventListener('DOMContentLoaded', () => {
  const competitionsSelect = document.getElementById('competitions');
  const teamsSelect = document.getElementById('teams');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const positionFilter = document.getElementById('positionFilter');
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');
  // optional button to refresh today's matches (if present in HTML)
  const todayMatchesBtn = document.getElementById('todayMatchesBtn');

  // Caching & search helpers
  let cachedTeams = [];                // teams for the currently loaded competition
  const cachedSquads = new Map();      // teamId -> squad array
  const SEARCH_DEBOUNCE_MS = 300;

  const debounce = (fn, ms = SEARCH_DEBOUNCE_MS) => {
    let id = null;
    return (...args) => {
      if (id) clearTimeout(id);
      id = setTimeout(() => fn(...args), ms);
    };
  };

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
  const normalizeItems = (maybeArray, propNames = ['teams', 'competitions', 'items', 'matches']) => {
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

  // Helper: attempt various common fields for competition logos/emblems
  function getCompetitionLogoUrl(c) {
    if (!c) return '';
    return c.emblemUrl || c.logo || c.area?.ensignUrl || c.crestUrl || c.ensignUrl || '';
  }

  // Helper: attempt various common fields for team crest/logo
  function getTeamCrestUrl(t) {
    if (!t) return '';
    return t.crestUrl || t.crest || t.logo || '';
  }

  // Helper: find a team's crest by its name using cachedTeams (safe fallback)
  function findTeamCrestByName(name) {
    if (!name || !cachedTeams?.length) return '';
    const team = cachedTeams.find(t => t.name === name);
    return team ? getTeamCrestUrl(team) : '';
  }

  // Display competitions in UI section (with logos)
  function displayCompetitions(competitions) {
    const container = document.getElementById('competitions-list');
    if (!container) return;
    const items = normalizeItems(competitions);
    container.innerHTML = `<h2>Competitions</h2>` + (items.map(c => {
      const logo = getCompetitionLogoUrl(c);
      const img = logo ? `<img src="${logo}" alt="${(c.name||'Competition')} logo" class="competition-logo" onerror="this.style.display='none'">` : '';
      return `<div class="competition-card" data-competition-id="${c.id}">
                ${img}
                <strong>${c.name}</strong>
              </div>`;
    }).join('') || '<p>No competitions</p>');
  }

  // Display teams in UI section (with crests)
  function displayTeams(teams) {
    const container = document.getElementById('teams-list');
    if (!container) return;
    const items = normalizeItems(teams);
    container.innerHTML = `<h2>Teams</h2>` + (items.map(t => {
      const crest = getTeamCrestUrl(t);
      const img = crest ? `<img src="${crest}" alt="${(t.name||'Team')} crest" class="team-crest" onerror="this.style.display='none'">` : '';
      return `<div class="team-card" data-team-id="${t.id}">
                ${img}
                <strong>${t.name}</strong>
              </div>`;
    }).join('') || '<p>No teams</p>');
  }

  // Display matches in UI section (matches of the day)
  function displayMatches(matches) {
    const container = document.getElementById('matches-list');
    if (!container) return;
    const items = normalizeItems(matches);
    if (!items.length) {
      container.innerHTML = '<h2>Matches</h2><p>No matches for the selected date.</p>';
      return;
    }
    // format match display: competition, time, home vs away, score (if available)
    const formatDateTime = (utcDate) => {
      try {
        const d = new Date(utcDate);
        return d.toLocaleString();
      } catch (e) {
        return utcDate || '';
      }
    };
    container.innerHTML = `<h2>Matches</h2>` + items.map(m => {
      const comp = m.competition?.name || m.competition || '';
      const time = formatDateTime(m.utcDate || m.date || '');
      const home = m.homeTeam?.name || m.homeTeam || (m.homeTeamId ? `Team ${m.homeTeamId}` : '');
      const away = m.awayTeam?.name || m.awayTeam || (m.awayTeamId ? `Team ${m.awayTeamId}` : '');
      const score = (m.score && m.score.fullTime) ? `${m.score.fullTime.home ?? ''} - ${m.score.fullTime.away ?? ''}` : '';
      return `<div class="match-card">
                <strong>${home} vs ${away}</strong><br>
                ${comp ? `Competition: ${comp}<br>` : ''}
                Time: ${time}<br>
                ${score ? `Score: ${score}` : ''}
              </div>`;
    }).join('');
  }
  
  // Display players in UI section (include team crest when available)
  function displayPlayers(players) {
    const container = document.getElementById('players-list');
    if (!container) return;
    if (!players.length) {
      container.innerHTML = '<h2>Players</h2><p>No players found.</p>';
      return;
    }
    container.innerHTML = `<h2>Players</h2>` + players.map(p => {
      const photoUrl = getPlayerPhotoUrl(p);
      const photoImg = photoUrl ? `<img src="${photoUrl}" alt="${p.name} photo" class="player-photo" onerror="this.style.display='none'">` : '';
      // try to display small crest for player's team when possible
      const crestUrl = findTeamCrestByName(p.team);
      const crestImg = crestUrl ? `<img src="${crestUrl}" alt="${p.team} crest" class="player-team-crest" onerror="this.style.display='none'"> ` : '';
      return `<div class="player-card">
               ${photoImg}
               <div class="player-info">
                 <strong>${p.name}</strong><br>
                 Team: ${crestImg}${p.team}<br>
                 Position: ${p.position ?? ''}
               </div>
             </div>`;
    }).join('');
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
  async function loadTeamsForCompetition(competitionId) {
    if (!competitionId) {
      populateSelect(teamsSelect, []);
      displayTeams([]);
      displayPlayers([]);
      return;
    }
    try {
      const teamsData = await fetchAPI(`/competitions/${competitionId}/teams`);
      const teams = teamsData.teams || [];
      // cache teams for global search
      cachedTeams = teams;
      cachedSquads.clear();
      populateSelect(teamsSelect, teams, 'id', 'name');
      displayTeams(teams);
      if (teams.length > 0) {
        teamsSelect.value = teams[0].id;
        // load players for the first team by id
        await loadAndShowPlayersForTeam(teams[0].id);
      } else {
        displayPlayers([]);
      }
    } catch (e) {
      console.error('Failed to load teams:', e);
      cachedTeams = [];
      cachedSquads.clear();
      populateSelect(teamsSelect, []);
      displayTeams([]);
      displayPlayers([]);
    }
  }

  // Load and display players (squad) for a team with optional filters
  async function loadAndShowPlayersForTeam(teamId) {
    if (!teamId) return;
    try {
      const teamData = await fetchAPI(`/teams/${teamId}`);
      const squad = teamData.squad || [];
      // cache squad for this team to avoid refetching during searches
      cachedSquads.set(teamId, squad);
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

  // Search across all teams in the selected competition (fetch squads as needed)
  async function searchAcrossCompetitionTeams(searchTerm) {
    const compId = competitionsSelect.value;
    if (!compId) return displayPlayers([]);
    if (!cachedTeams?.length) {
      // ensure teams are loaded (this will populate cachedTeams)
      await loadTeamsForCompetition(compId);
    }
    const results = [];
    for (const team of cachedTeams) {
      const teamId = team.id;
      let squad = cachedSquads.get(teamId);
      if (!squad) {
        try {
          const teamData = await fetchAPI(`/teams/${teamId}`);
          squad = teamData.squad || [];
          cachedSquads.set(teamId, squad);
        } catch (e) {
          console.error('Failed to load squad for team', teamId, e);
          continue;
        }
      }
      for (const p of squad) {
        if (p.name && p.name.toLowerCase().includes(searchTerm)) {
          results.push({ ...p, team: team.name || '' });
        }
      }
    }
    displayPlayers(results);
  }

  // Search competitions by name and display matches
  async function searchCompetitions(query) {
    try {
      const data = await fetchAPI('/competitions');
      const competitions = data.competitions || [];
      const matches = competitions.filter(c => c.name?.toLowerCase().includes(query));
      displayCompetitions(matches);
      displayTeams([]);
      displayPlayers([]);
    } catch (e) {
      console.error('Failed to search competitions:', e);
      displayCompetitions([]);
      displayTeams([]);
      displayPlayers([]);
    }
  }

  // Load matches for a specific date (YYYY-MM-DD)
  async function loadMatchesForDate(dateStr) {
    if (!dateStr) {
      displayMatches([]);
      return;
    }
    try {
      // Football-Data API supports dateFrom & dateTo parameters
      const data = await fetchAPI(`/matches?dateFrom=${dateStr}&dateTo=${dateStr}`);
      const matches = data.matches || [];
      displayMatches(matches);
    } catch (e) {
      console.error('Failed to load matches for date', dateStr, e);
      displayMatches([]);
    }
  }

  // Load matches for today
  async function loadMatchesForToday() {
    // use local date in YYYY-MM-DD
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    await loadMatchesForDate(dateStr);
  }

  // Load matches for the past weekend (most recent completed Saturday-Sunday)
  async function loadMatchesForPastWeekend() {
    const today = new Date();
    // Find the most recent Sunday that is strictly before today.
    // If today is Sunday (0) we go back one week so we get the previous completed weekend.
    const daysBackToSunday = today.getDay() === 0 ? 7 : today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - daysBackToSunday);
    const lastSaturday = new Date(lastSunday);
    lastSaturday.setDate(lastSunday.getDate() - 1);

    const fmt = d => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    };

    const dateFrom = fmt(lastSaturday);
    const dateTo = fmt(lastSunday);
    try {
      const data = await fetchAPI(`/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const matches = data.matches || [];
      displayMatches(matches);
    } catch (e) {
      console.error('Failed to load past weekend matches:', e);
      displayMatches([]);
    }
  }
  
  // 6) search button click (click event) - shows players, teams or competitions depending on context
  async function handleSearchButtonClick(event) {
    const q = (searchInput.value || '').trim().toLowerCase();
    // empty query -> show all competitions
    if (!q) {
      await loadCompetitions();
      return;
    }

    // if a team is selected -> search within that team's squad
    if (teamsSelect.value) {
      await loadAndShowPlayersForTeam(teamsSelect.value);
      return;
    }

    // if a competition is selected -> show matching teams and players across the competition
    if (competitionsSelect.value) {
      const matchingTeams = cachedTeams.filter(t => t.name?.toLowerCase().includes(q));
      displayTeams(matchingTeams);
      await searchAcrossCompetitionTeams(q);
      return;
    }

    // otherwise search competitions by name
    await searchCompetitions(q);
  }

  // --- Named event callbacks (each unique function for .addEventListener) ---

  // 1) competition change (change event)
  async function handleCompetitionChange(event) {
    const competitionId = competitionsSelect.value;
    await loadTeamsForCompetition(competitionId);
  }

  // 2) team change (change event) - distinct callback from competition change
  async function handleTeamChange(event) {
    const teamId = teamsSelect.value;
    if (!teamId) {
      displayPlayers([]);
      return;
    }
    await loadAndShowPlayersForTeam(teamId);
  }

  // 3) search input (input event)
  async function handleSearchInput(event) {
    const q = (searchInput.value || '').trim().toLowerCase();
    // if a team is selected, search within that team's squad (cached or fetched)
    if (teamsSelect.value) {
      await loadAndShowPlayersForTeam(teamsSelect.value);
      return;
    }
    // if no team selected but a competition is selected, search across that competition
    if (competitionsSelect.value) {
      if (!q) {
        // nothing to search - clear players
        displayPlayers([]);
        return;
      }
      await searchAcrossCompetitionTeams(q);
      return;
    }
    // otherwise nothing to search
    displayPlayers([]);
  }

  // 4) position filter change (change event) - different callback
  function handlePositionChange(event) {
    if (teamsSelect.value) {
      loadAndShowPlayersForTeam(teamsSelect.value);
    }
  }

  // 5) theme toggle (click event)
  function handleToggleTheme(event) {
    setTheme(!document.body.classList.contains('dark-mode'));
  }

  // Dark/Light mode helper
  function setTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    toggleThemeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
  setTheme(false); // Default light mode

  // Attach event listeners using .addEventListener (at least 3 distinct types: 'change', 'input', 'click')
   competitionsSelect.addEventListener('change', handleCompetitionChange);
   teamsSelect.addEventListener('change', handleTeamChange);
   searchInput.addEventListener('input', debounce(handleSearchInput, SEARCH_DEBOUNCE_MS));
   if (searchBtn) searchBtn.addEventListener('click', handleSearchButtonClick);
   // delegate clicks from the teams list to handleTeamCardClick
   const teamsListContainer = document.getElementById('teams-list');
   if (teamsListContainer) teamsListContainer.addEventListener('click', handleTeamCardClick);
   positionFilter.addEventListener('change', handlePositionChange);
   toggleThemeBtn.addEventListener('click', handleToggleTheme);
   if (todayMatchesBtn) todayMatchesBtn.addEventListener('click', loadMatchesForToday);

  // 7) click on a team card in the teams list -> show that team's players
  async function handleTeamCardClick(event) {
    const card = event.target.closest('.team-card');
    if (!card) return;
    const teamId = card.getAttribute('data-team-id');
    if (!teamId) return;
    // keep the select in sync and load players
    if (teamsSelect) teamsSelect.value = teamId;
    await loadAndShowPlayersForTeam(teamId);
  }

  // Initialize app by loading competitions and today's matches
  if (apiRequestsAllowed) {
    loadCompetitions();
    loadMatchesForPastWeekend(); // show matches from the past weekend
  } else {
    populateSelect(competitionsSelect, []);
    populateSelect(teamsSelect, []);
    displayCompetitions([]);
    displayTeams([]);
    displayPlayers([]);
  }
});
