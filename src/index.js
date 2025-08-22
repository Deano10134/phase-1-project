document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const competitionsSelect = document.getElementById('competitions');
  const teamsSelect = document.getElementById('teams');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const positionFilter = document.getElementById('positionFilter');
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');
  const todayMatchesBtn = document.getElementById('todayMatchesBtn');
  const matchDateInput = document.getElementById('matchDate');

  // Cache and constants
  let cachedTeams = [];
  const cachedSquads = new Map();
  const SEARCH_DEBOUNCE_MS = 300;
  let lastMatchesParams = null;
  const TEAM_MATCHES_CACHE_TTL_MS = 60_000;
  const teamMatchesCache = new Map(); // key: teamId, val: { data, expiresAt }
  const inFlightTeamMatches = new Map(); // key: teamId, val: Promise

  // API config and checks
  const API_BASE = 'http://localhost:3000/api';
  // Set your API token here if authentication is required.
  // For security, consider loading this from an environment variable or a secure config file.
  const API_TOKEN = '';
  const isFileProtocol = window.location.protocol === 'file:';
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const usingLocalProxy = API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
  const apiRequestsAllowed = usingLocalProxy || (!isFileProtocol && isLocalhost);

  if (!apiRequestsAllowed) {
    const banner = document.createElement('div');
    banner.id = 'cors-warning';
    banner.style.cssText = 'background:#ffefc2;border:1px solid #f0c36d;padding:12px;margin:8px;font-family:system-ui,Arial,sans-serif;';
    banner.innerHTML = `
      <strong>CORS / Origin mismatch</strong> — serve from http://localhost or run proxy at http://localhost:3000.<br>
      Examples: <code>python -m http.server 8000</code> or <code>npx serve .</code><br>
      Start proxy server and reload.
    `;
    document.body.insertBefore(banner, document.body.firstChild);
  }

  const headers = { Accept: 'application/json', ...(API_TOKEN && { 'X-Auth-Token': API_TOKEN }) };

  // Utilities
  const debounce = (fn, ms = SEARCH_DEBOUNCE_MS) => {
    let timeoutId;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), ms);
    };
  };

  const normalizeItems = (data, keys = ['teams', 'competitions', 'items', 'matches']) => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    for (const key of keys) if (Array.isArray(data[key])) return data[key];
    return [];
  };

  const populateSelect = (select, data, valueKey = 'id', textKey = 'name') => {
    if (!select) return;
    const items = normalizeItems(data);
    select.innerHTML = items.length
      ? `<option value="">Select</option>${items.map(i => `<option value="${i[valueKey]}">${i[textKey] || ''}</option>`).join('')}`
      : '<option value="">No items</option>';
  };

  // Extract URLs for logos/crests/photos
  const getFirstValidUrl = (obj, candidates) => {
    if (!obj) return '';
    for (const key of candidates) {
      const v = obj[key];
      if (typeof v === 'string' && v.trim()) return v;
      if (v && typeof v === 'object' && typeof v.url === 'string' && v.url.trim()) return v.url;
    }
    if (Array.isArray(obj.photos) && obj.photos[0]?.url) return obj.photos[0].url;
    return '';
  };

  const getCompetitionLogoUrl = c => getFirstValidUrl(c, ['emblemUrl', 'logo', 'crestUrl', 'ensignUrl']);
  const getTeamCrestUrl = t => getFirstValidUrl(t, ['crestUrl', 'crest', 'logo']);
  // players removed: no player photos needed

  // Clear players area helper (replaces previous displayPlayers usage)
  const clearPlayers = () => {
    const container = document.getElementById('players-list');
    if (!container) return;
    container.innerHTML = '';
  };
  
  // concurrency helper (limits parallel requests if needed)
  async function asyncPool(poolLimit, array, iteratorFn) {
    const ret = [];
    const executing = [];
    for (const item of array) {
      const p = Promise.resolve().then(() => iteratorFn(item));
      ret.push(p);

      if (poolLimit <= array.length) {
        const e = p.then(() => executing.splice(executing.indexOf(e), 1));
        executing.push(e);
        if (executing.length >= poolLimit) {
          await Promise.race(executing);
        }
      }
    }
    return Promise.all(ret);
  }

  // Display functions (competitions, teams, matches, players)
  const renderCards = (containerId, items, options) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const normalized = normalizeItems(items);
    if (!normalized.length) {
      container.innerHTML = `<h2>${options.title}</h2><p>No ${options.title.toLowerCase()} found.</p>`;
      return;
    }
    container.innerHTML = `<h2>${options.title}</h2>` + normalized.map(i => {
      const imgUrl = options.getImageUrl(i);
      const img = imgUrl ? `<img src="${imgUrl}" alt="${options.alt || options.title} image" class="${options.imgClass}" onerror="this.style.display='none'">` : '';
      return `
        <div class="${options.cardClass}" ${options.dataAttr ? `data-${options.dataAttr}="${i[options.valueKey]}"` : ''}>
          ${img}
          <strong>${i[options.textKey] || ''}</strong>
        </div>`;
    }).join('');
  };

  const displayCompetitions = competitions =>
    renderCards('competitions-list', competitions, { title: 'Competitions', getImageUrl: getCompetitionLogoUrl, imgClass: 'competition-logo', cardClass: 'competition-card', valueKey: 'id', textKey: 'name', dataAttr: 'competition-id' });

  const displayTeams = teams =>
    renderCards('teams-list', teams, { title: 'Teams', getImageUrl: getTeamCrestUrl, imgClass: 'team-crest', cardClass: 'team-card', valueKey: 'id', textKey: 'name', dataAttr: 'team-id' });

  const displayMatches = matches => {
    const container = document.getElementById('matches-list');
    if (!container) return;
    const items = normalizeItems(matches);
    if (!items.length) {
      container.innerHTML = '<h2>Matches</h2><p>No matches for the selected date.</p>';
      return;
    }
    const formatDateTime = d => {
      try {
        return new Date(d).toLocaleString();
      } catch { return d || ''; }
    };
    container.innerHTML = '<h2>Matches</h2>' + items.map(m => {
      const comp = m.competition?.name || m.competition || '';
      const time = formatDateTime(m.utcDate || m.date);
      const home = m.homeTeam?.name || `Team ${m.homeTeamId || ''}`;
      const away = m.awayTeam?.name || `Team ${m.awayTeamId || ''}`;
      const score = m.score?.fullTime ? `${m.score.fullTime.home ?? ''} - ${m.score.fullTime.away ?? ''}` : '';
      return `
        <div class="match-card">
          <strong>${home} vs ${away}</strong><br>
          ${comp ? `Competition: ${comp}<br>` : ''}
          Time: ${time}<br>
          ${score ? `Score: ${score}` : ''}
        </div>`;
    }).join('');
  };

  // API fetch helper with retry on 429
  async function fetchAPI(path, options = {}) {
    if (!apiRequestsAllowed) throw new Error('API requests are disabled: serve from localhost or start proxy.');

    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const opts = { ...options, headers: { ...headers, ...options.headers } };
    const maxRetries = 3;
    let attempt = 0;

    while (true) {
      try {
        const res = await fetch(url, opts);
        const text = await res.text();
        if (res.ok) return JSON.parse(text);
        if (res.status === 429 && attempt < maxRetries) {
          attempt++;
          const ra = res.headers.get('retry-after');
          const waitMs = ra ? Number(ra) * 1000 : (2 ** attempt) * 500;
          await new Promise(r => setTimeout(r, waitMs));
          continue;
        }
        let parsedData = text;
        try { parsedData = JSON.parse(text); } catch {}
        throw new Error(`API error (${res.status}): ${res.statusText} - ${typeof parsedData === 'string' ? parsedData : JSON.stringify(parsedData)}`);
      } catch (err) {
        if (attempt < maxRetries) {
          attempt++;
          await new Promise(r => setTimeout(r, 500 * attempt));
          continue;
        }
        throw err;
      }
    }
  }

  // Loaders and search handlers

  async function loadCompetitions() {
    try {
      const data = await fetchAPI('/competitions');
      const comps = data.competitions || [];
      populateSelect(competitionsSelect, comps);
      displayCompetitions(comps);
    } catch {
      populateSelect(competitionsSelect, []);
      displayCompetitions([]);
    }
  }

  async function loadTeamsForCompetition(compId) {
    if (!compId) {
      populateSelect(teamsSelect, []);
      displayTeams([]);
      clearPlayers();
      return;
    }
    try {
      const data = await fetchAPI(`/competitions/${compId}/teams`);
      cachedTeams = data.teams || [];
      cachedSquads.clear();
      populateSelect(teamsSelect, cachedTeams);
      displayTeams(cachedTeams);
      if (cachedTeams.length) {
        teamsSelect.value = cachedTeams[0].id;
        // players removed: do not auto-load squad to avoid extra API requests
      } else {
        clearPlayers();
      }
    } catch {
      cachedTeams = [];
      cachedSquads.clear();
      populateSelect(teamsSelect, []);
      displayTeams([]);
      clearPlayers();
    }
  }

  async function searchCompetitions(query) {
    try {
      const data = await fetchAPI('/competitions');
      const matching = (data.competitions || []).filter(c => c.name?.toLowerCase().includes(query));
      displayCompetitions(matching);
      displayTeams([]);
      clearPlayers();
    } catch {
      displayCompetitions([]);
      displayTeams([]);
      clearPlayers();
    }
  }

  async function loadMatchesForDate(date) {
    if (!date) return displayMatches([]);
    try {
      lastMatchesParams = { dateFrom: date, dateTo: date };
      const data = await fetchAPI(`/matches?dateFrom=${date}&dateTo=${date}`);
      displayMatches(data.matches || []);
    } catch {
      displayMatches([]);
    }
  }

  async function loadMatchesForToday() {
    const today = new Date().toISOString().slice(0, 10);
    await loadMatchesForDate(today);
  }

  async function loadMatchesForPastWeekend() {
    const today = new Date();
    const daysBackToSunday = today.getDay() === 0 ? 7 : today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - daysBackToSunday);
    const lastSaturday = new Date(lastSunday);
    lastSaturday.setDate(lastSunday.getDate() - 1);
    const fmt = d => d.toISOString().slice(0, 10);
    lastMatchesParams = { dateFrom: fmt(lastSaturday), dateTo: fmt(lastSunday) };
    try {
      const data = await fetchAPI(`/matches?dateFrom=${lastMatchesParams.dateFrom}&dateTo=${lastMatchesParams.dateTo}`);
      displayMatches(data.matches || []);
    } catch {
      displayMatches([]);
    }
  }

  async function refreshMatches() {
    if (lastMatchesParams) {
      try {
        const data = await fetchAPI(`/matches?dateFrom=${lastMatchesParams.dateFrom}&dateTo=${lastMatchesParams.dateTo}`);
        displayMatches(data.matches || []);
        return;
      } catch {
        displayMatches([]);
      }
    }
    await loadMatchesForToday();
  }

  // Event Handlers
  async function handleCompetitionChange() {
    await loadTeamsForCompetition(competitionsSelect.value);
  }

  async function handleTeamChange() {
    // players removed — selecting a team will just set the select value and clear players area
    if (!teamsSelect.value) {
      clearPlayers();
      return;
    }
    clearPlayers();
  }

  async function handleSearchInput() {
    const q = searchInput.value.trim().toLowerCase();
    // If a competition is selected, filter teams client-side
    if (competitionsSelect.value) {
      if (!q) {
        displayTeams(cachedTeams);
        return;
      }
      const matchingTeams = cachedTeams.filter(t => t.name?.toLowerCase().includes(q));
      displayTeams(matchingTeams);
      return;
    }
    // Otherwise, search competitions
    if (!q) {
      await loadCompetitions();
      return;
    }
    await searchCompetitions(q);
  }

  function handleToggleTheme() {
    const isDark = !document.body.classList.contains('dark-mode');
    setTheme(isDark);
  }

  function setTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    if (toggleThemeBtn) {
      toggleThemeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      toggleThemeBtn.setAttribute('aria-pressed', String(isDark));
      toggleThemeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  // Load theme preference from localStorage, default to system preference (then light mode)
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(savedTheme ? savedTheme === 'dark' : !!prefersDark);

  async function handleSearchButtonClick() {
    const q = searchInput.value.trim().toLowerCase();
    if (!q) {
      await loadCompetitions();
      return;
    }
    if (teamsSelect.value) {
      if (competitionsSelect.value) {
        const matchingTeams = cachedTeams.filter(t => t.name?.toLowerCase().includes(q));
        displayTeams(matchingTeams);
        // Only search players from matching teams for efficiency
        if (matchingTeams.length) {
          // fetch squads for matching teams only
          const squadsPromises = matchingTeams.map(async team => {
            let squad = cachedSquads.get(team.id);
            if (!squad) {
              try {
                const teamData = await fetchAPI(`/teams/${team.id}`);
                squad = teamData.squad || [];
                cachedSquads.set(team.id, squad);
              } catch {
                squad = [];
              }
            }
            return squad.map(p => ({ ...p, team: team.name }));
          });
          const squadsArray = await Promise.all(squadsPromises);
          const allPlayers = squadsArray.flat();
          const results = allPlayers.filter(p => p.name?.toLowerCase().includes(q));
          displayPlayers(results);
        }
        return;
      }
      // players removed: team-specific search handled by team card click
      return;
    }
    await searchCompetitions(q);
  }

  async function getTeamMatches(teamId) {
    const now = Date.now();
    const cached = teamMatchesCache.get(teamId);
    if (cached && cached.expiresAt > now) return cached.data;
    const inflight = inFlightTeamMatches.get(teamId);
    if (inflight) return inflight;
    const p = (async () => {
      const data = await fetchAPI(`/teams/${teamId}/matches`);
      const matches = Array.isArray(data) ? data : (data.matches || []);
      teamMatchesCache.set(teamId, { data: matches, expiresAt: now + TEAM_MATCHES_CACHE_TTL_MS });
      return matches;
    })().finally(() => inFlightTeamMatches.delete(teamId));
    inFlightTeamMatches.set(teamId, p);
    return p;
  }

  async function handleTeamCardClick(event) {
    const card = event.target.closest('.team-card');
    if (!card) return;
    const teamId = card.getAttribute('data-team-id');
    if (!teamId) return;

    teamsSelect.value = teamId;

    // Load and show matches for the clicked team
    try {
      const matches = await getTeamMatches(teamId);
      displayMatches(matches);
      const matchesEl = document.getElementById('matches-list');
      if (matchesEl) matchesEl.scrollIntoView({ behavior: 'smooth' });
    } catch {
      displayMatches([]);
    }
  }
  // Attach listeners
  competitionsSelect?.addEventListener('change', handleCompetitionChange);
  teamsSelect?.addEventListener('change', handleTeamChange);
  // Create a single debounced handler for search input
  const debouncedSearchInputHandler = debounce(handleSearchInput, SEARCH_DEBOUNCE_MS);
  searchInput?.addEventListener('input', debouncedSearchInputHandler);
  searchBtn?.addEventListener('click', handleSearchButtonClick);
  toggleThemeBtn?.addEventListener('click', handleToggleTheme);
  document.getElementById('teams-list')?.addEventListener('click', handleTeamCardClick);
  // positionFilter listener removed (player UI removed)

  if (matchDateInput) {
    if (!matchDateInput.max) {
      matchDateInput.max = new Date().toISOString().slice(0, 10);
    }
    matchDateInput.addEventListener('change', async e => {
      const date = e.target.value.trim();
      if (date) await loadMatchesForDate(date);
      else await loadMatchesForPastWeekend();
    });
  }

  if (todayMatchesBtn) {
    todayMatchesBtn.addEventListener('click', async () => {
      todayMatchesBtn.disabled = true;
      try {
        await refreshMatches();
      } finally {
        setTimeout(() => { todayMatchesBtn.disabled = false; }, 400);
      }
    });
  }
  if (apiRequestsAllowed) {
    (async () => {
      try {
        await loadCompetitions();
      } catch {
        populateSelect(competitionsSelect, []);
        displayCompetitions([]);
        clearPlayers();
      }
      try {
        await loadMatchesForPastWeekend();
      } catch {
        displayMatches([]);
      }
    })();
  }
});

