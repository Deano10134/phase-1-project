document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const competitionsSelect = document.getElementById('competitions');
  const teamsSelect = document.getElementById('teams');
  const searchInput = document.getElementById('searchInput');
  const searchBtn = document.getElementById('searchBtn');
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');
  const todayMatchesBtn = document.getElementById('todayMatchesBtn');
  const matchDateInput = document.getElementById('matchDate');

  // Cache and constants
  let cachedTeams = [];
  let cachedCompetitions = [];
  let cachedGlobalTeams = [];
  let globalTeamsLoaded = false;
  const cachedSquads = new Map();
  const SEARCH_DEBOUNCE_MS = 300;
  let lastMatchesParams = null;
  const TEAM_MATCHES_CACHE_TTL_MS = 60_000;
  const teamMatchesCache = new Map();
  const inFlightTeamMatches = new Map();
  let lastSelectedTeamId = null;
  let lastSelectedCompetitionId = null;
  const inFlightRequests = new Map();
  let isGloballyRateLimited = false;
  let globalRateLimitUntil = 0;
  let _globalRateLimitTimer = null;

  // DRY constants / helpers
  const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
  const formatDate = d => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d || ''));
  const createElement = (tag, attrs = {}, styles = {}) => {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => { if (v != null) el.setAttribute(k, String(v)); });
    Object.assign(el.style, styles);
    return el;
  };
  const updateThemeUI = isDark => {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    if (toggleThemeBtn) {
      toggleThemeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      toggleThemeBtn.setAttribute('aria-pressed', String(isDark));
      toggleThemeBtn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  };
  const safeFetchAPI = (path, fallback = {}) => fetchAPI(path).catch(e => { console.warn(`safeFetchAPI ${path} failed`, e); return fallback; });
  const displayEmptyMatches = () => { displayMatches([]); setMatchesDateLabel(null); };
  const fetchMatchesForTeam = async (teamId, date) => date && ISO_DATE_REGEX.test(date) ? await getTeamMatches(teamId, { dateFrom: date, dateTo: date }) : await getTeamMatches(teamId);
  const setGlobalRateLimit = waitMs => {
    isGloballyRateLimited = true;
    globalRateLimitUntil = Date.now() + Math.max(0, Number(waitMs) || 0);
    clearTimeout(_globalRateLimitTimer);
    _globalRateLimitTimer = setTimeout(() => { isGloballyRateLimited = false; globalRateLimitUntil = 0; }, globalRateLimitUntil - Date.now() + 50);
    showNotice('API rate limit active — backing off');
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const debounce = (fn, ms = SEARCH_DEBOUNCE_MS) => { let timeoutId; return (...args) => { clearTimeout(timeoutId); timeoutId = setTimeout(() => fn(...args), ms); }; };
  const getTodayStr = () => new Date().toISOString().slice(0, 10);
  const setMatchesDateLabel = (from, to = from) => {
    const el = document.getElementById('matchesDate');
    if (!el) return;
    if (!from) { el.textContent = ''; return; }
    el.textContent = from === to ? new Date(from).toLocaleDateString() : `${new Date(from).toLocaleDateString()} — ${new Date(to).toLocaleDateString()}`;
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
    select.innerHTML = items.length ? `<option value="">Select</option>${items.map(i => `<option value="${i[valueKey]}">${i[textKey] || ''}</option>`).join('')}` : '<option value="">No items</option>';
  };
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
  const clearPlayers = () => { const container = document.getElementById('players-list'); if (container) container.innerHTML = ''; };
  const showNotice = (msg, timeout = 4000) => {
    let b = document.getElementById('notice-banner');
    if (!b) {
      b = createElement('div', { id: 'notice-banner' }, { position: 'fixed', top: '12px', right: '12px', background: 'rgba(0,0,0,0.8)', color: '#fff', padding: '8px 12px', borderRadius: '6px', zIndex: '9999', fontFamily: 'system-ui,Arial,sans-serif', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' });
      document.body.appendChild(b);
    }
    b.textContent = msg;
    b.style.display = 'block';
    clearTimeout(b._hideTimeout);
    b._hideTimeout = setTimeout(() => { b.style.display = 'none'; }, timeout);
  };

  // API config
  const API_BASE = 'http://localhost:8010/proxy';
  const API_TOKEN = (() => {
    if (typeof process !== 'undefined' && process.env && process.env.API_TOKEN) return process.env.API_TOKEN;
    if (typeof window !== 'undefined') {
      if (window.__env?.API_TOKEN) return window.__env.API_TOKEN;
      if (window._env_?.API_TOKEN) return window._env_.API_TOKEN;
      if (window.VITE_API_TOKEN) return window.VITE_API_TOKEN;
    }
    return '';
  })();
  const isFileProtocol = window.location.protocol === 'file:';
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const usingLocalProxy = API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1');
  const apiRequestsAllowed = usingLocalProxy || (!isFileProtocol && isLocalhost);
  const headers = { Accept: 'application/json', ...(API_TOKEN && { 'X-Auth-Token': API_TOKEN }) };

  if (!apiRequestsAllowed) {
    const banner = createElement('div', { id: 'cors-warning' }, { background: '#ffefc2', border: '1px solid #f0c36d', padding: '12px', margin: '8px', fontFamily: 'system-ui,Arial,sans-serif' });
    banner.innerHTML = '<strong>CORS / Origin mismatch</strong> — serve from http://localhost or run proxy at http://localhost:3000.<br>Examples: <code>python -m http.server 8000</code> or <code>npx serve .</code><br>Start proxy server and reload.';
    document.body.insertBefore(banner, document.body.firstChild);
  }

  // Search suggestions
  let suggestionBox = null;
  let suggestionItems = [];
  let suggestionFocused = -1;
  const createSuggestionBox = () => {
    if (suggestionBox) return suggestionBox;
    suggestionBox = createElement('div', { id: 'search-suggestions' }, { position: 'absolute', zIndex: '9998', background: '#fff', border: '1px solid rgba(0,0,0,0.12)', boxShadow: '0 6px 18px rgba(0,0,0,0.08)', maxHeight: '240px', overflow: 'auto', minWidth: '220px', fontFamily: 'system-ui,Arial,sans-serif' });
    document.body.appendChild(suggestionBox);
    return suggestionBox;
  };
  const positionSuggestionBox = () => {
    if (!suggestionBox || !searchInput) return;
    const r = searchInput.getBoundingClientRect();
    suggestionBox.style.left = `${r.left + window.scrollX}px`;
    suggestionBox.style.top = `${r.bottom + window.scrollY + 6}px`;
    suggestionBox.style.width = `${Math.max(220, r.width)}px`;
  };
  const hideSearchSuggestions = () => { if (suggestionBox) suggestionBox.style.display = 'none'; suggestionItems = []; suggestionFocused = -1; };
  const showSearchSuggestions = list => {
    createSuggestionBox();
    positionSuggestionBox();
    if (!list || !list.length) { hideSearchSuggestions(); return; }
    suggestionBox.innerHTML = list.map((it, i) => {
      const subtitle = it.type === 'team' ? (it.extra?.competition?.name || '') : (it.extra?.area?.name || '');
      return `<div class="sugg-item" data-idx="${i}" data-type="${it.type}" data-id="${it.id}" style="padding:8px 10px;cursor:pointer;border-bottom:1px solid rgba(0,0,0,0.04)">
        <div style="font-weight:600">${escapeHtml(it.name)}</div>
        <div style="font-size:11px;color:#666;margin-top:4px">${escapeHtml(subtitle)}</div>
      </div>`;
    }).join('');
    suggestionBox.style.display = 'block';
    Array.from(suggestionBox.querySelectorAll('.sugg-item')).forEach(el => {
      el.addEventListener('pointerdown', ev => {
        ev.preventDefault();
        const idx = Number(el.getAttribute('data-idx'));
        const sel = list[idx];
        if (sel) selectSuggestion(sel);
      });
    });
  };
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const selectSuggestion = async item => {
    if (!item) return hideSearchSuggestions();
    searchInput.value = item.name;
    hideSearchSuggestions();
    if (item.type === 'team') {
      lastSelectedTeamId = item.id;
      lastSelectedCompetitionId = null;
      const selectedDate = (matchDateInput?.value || '').trim();
      const matches = await fetchMatchesForTeam(item.id, selectedDate);
      displayTeams([item.extra || { id: item.id, name: item.name }]);
      displayMatches(matches || []);
    } else if (item.type === 'competition') {
      lastSelectedCompetitionId = item.id;
      lastSelectedTeamId = null;
      const selectedDate = (matchDateInput?.value || '').trim();
      const path = selectedDate && ISO_DATE_REGEX.test(selectedDate) ? `/v4/competitions/${item.id}/matches?dateFrom=${selectedDate}&dateTo=${selectedDate}` : `/v4/competitions/${item.id}/matches`;
      const data = await fetchAPI(path);
      displayCompetitions([item.extra || { id: item.id, name: item.name }]);
      displayMatches(data.matches || []);
    }
  };
  const focusNextSuggestion = delta => {
    const nodes = suggestionBox?.querySelectorAll('.sugg-item') || [];
    if (!nodes.length) return;
    suggestionFocused = (suggestionFocused + delta + nodes.length) % nodes.length;
    nodes.forEach(n => n.style.background = '');
    const el = nodes[suggestionFocused];
    if (el) el.style.background = 'rgba(0,0,0,0.04)';
  };
  const suggestionKeyHandler = e => {
    if (!suggestionBox || suggestionBox.style.display === 'none') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); focusNextSuggestion(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusNextSuggestion(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const nodes = suggestionBox.querySelectorAll('.sugg-item');
      if (nodes[suggestionFocused]) {
        const idx = Number(nodes[suggestionFocused].getAttribute('data-idx'));
        const list = suggestionBox._lastList || [];
        selectSuggestion(list[idx]);
      } else {
        handleSearchButtonClick().catch(() => {});
      }
    } else if (e.key === 'Escape') hideSearchSuggestions();
  };

  // Display functions
  const renderCards = (containerId, items, { title, getImageUrl, imgClass, cardClass, valueKey, textKey, dataAttr }) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const normalized = normalizeItems(items);
    if (!normalized.length) {
      container.innerHTML = `<h2>${title}</h2><p>No ${title.toLowerCase()} found.</p>`;
      return;
    }
    container.innerHTML = `<h2>${title}</h2>` + normalized.map(i => {
      const imgUrl = getImageUrl(i);
      const img = imgUrl ? `<img src="${imgUrl}" alt="${title} image" class="${imgClass}" onerror="this.style.display='none'">` : '';
      return `<div class="${cardClass}" ${dataAttr ? `data-${dataAttr}="${i[valueKey]}"` : ''}>${img}<strong>${i[textKey] || ''}</strong></div>`;
    }).join('');
  };
  const displayCompetitions = competitions => renderCards('competitions-list', competitions, { title: 'Competitions', getImageUrl: getCompetitionLogoUrl, imgClass: 'competition-logo', cardClass: 'competition-card', valueKey: 'id', textKey: 'name', dataAttr: 'competition-id' });
  const displayTeams = teams => renderCards('teams-list', teams, { title: 'Teams', getImageUrl: getTeamCrestUrl, imgClass: 'team-crest', cardClass: 'team-card', valueKey: 'id', textKey: 'name', dataAttr: 'team-id' });
  const displayMatches = matches => {
    const container = document.getElementById('matches-list');
    if (!container) return;
    const items = normalizeItems(matches);
    if (!items.length) {
      container.innerHTML = '<h2>Matches</h2><p>No matches for the selected date.</p>';
      return;
    }
    const findTeamInCache = id => cachedTeams.find(t => String(t.id) === String(id) || String(t.team?.id) === String(id));
    const formatDateTime = d => { try { return new Date(d).toLocaleString(); } catch { return d || ''; } };
    container.innerHTML = '<h2>Matches</h2>' + items.map(m => {
      const { competition, homeTeam, awayTeam, score, utcDate, date, homeTeamId, awayTeamId } = m;
      const comp = competition?.name || competition || '';
      const time = formatDateTime(utcDate || date);
      const homeName = homeTeam?.name || `Team ${homeTeamId || ''}`;
      const awayName = awayTeam?.name || `Team ${awayTeamId || ''}`;
      const fullTimeScore = score?.fullTime;
      const scoreStr = fullTimeScore ? `${fullTimeScore.home ?? ''} - ${fullTimeScore.away ?? ''}` : '';
      const homeCrest = getTeamCrestUrl(homeTeam) || (findTeamInCache(homeTeamId) ? getTeamCrestUrl(findTeamInCache(homeTeamId)) : '');
      const awayCrest = getTeamCrestUrl(awayTeam) || (findTeamInCache(awayTeamId) ? getTeamCrestUrl(findTeamInCache(awayTeamId)) : '');
      const homeImg = homeCrest ? `<img src="${homeCrest}" alt="${homeName} crest" class="team-crest-small" onerror="this.style.display='none'">` : '';
      const awayImg = awayCrest ? `<img src="${awayCrest}" alt="${awayName} crest" class="team-crest-small" onerror="this.style.display='none'">` : '';
      return `<div class="match-card"><div class="teams home">${homeImg}<span class="team-name">${homeName}</span></div><div class="score">${scoreStr || '&nbsp;'}</div><div class="teams away">${awayImg}<span class="team-name">${awayName}</span></div><div class="meta"><span>${comp || ''}</span><span>${time}</span></div></div>`;
    }).join('');
  };

  // API functions
  const fetchWithRetry = async (url, options = {}, retries = 3, baseDelay = 700) => {
    let attempt = 0;
    while (attempt < retries) {
      if (isGloballyRateLimited && Date.now() < globalRateLimitUntil) await sleep(globalRateLimitUntil - Date.now());
      const res = await fetch(url, options);
      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        let waitMs = baseDelay;
        if (retryAfter) {
          const n = Number(retryAfter);
          waitMs = !isNaN(n) ? n * 1000 : (Date.parse(retryAfter) - Date.now()) || waitMs;
        }
        setGlobalRateLimit(waitMs);
        await sleep(waitMs);
        attempt++;
        continue;
      }
      return res;
    }
    throw new Error(`Failed to fetch after ${retries} attempts.`);
  };
  const fetchAPI = async (path, options = {}) => {
    if (!apiRequestsAllowed) throw new Error('API requests are disabled.');
    if (isGloballyRateLimited && Date.now() < globalRateLimitUntil) throw new Error('Global API rate limit active');
    const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
    const opts = { ...options, headers: { ...headers, ...options.headers } };
    const key = `${(opts.method || 'GET').toUpperCase()}::${url}::${opts.body ? JSON.stringify(opts.body) : ''}`;
    if (inFlightRequests.has(key)) return inFlightRequests.get(key);
    const p = (async () => {
      const res = await fetchWithRetry(url, opts, 2, 700);
      const text = await res.text();
      if (res.status === 403 && usingLocalProxy && API_TOKEN) {
        const directUrl = path.startsWith('http') ? path : `https://api.football-data.org/v4/${path}`;
        const directOpts = { ...opts, headers: { ...opts.headers, 'X-Auth-Token': API_TOKEN } };
        const directRes = await fetchWithRetry(directUrl, directOpts, 1, 900);
        const directText = await directRes.text();
        if (directRes.ok) return JSON.parse(directText);
      }
      if (res.ok) return JSON.parse(text);
      throw new Error(`API error (${res.status}): ${res.statusText}`);
    })().catch(err => {
      if (err.message.includes('rate') || err.message.includes('failed to fetch')) {
        showNotice('API rate limit or network error — try again shortly');
        return {};
      }
      throw err;
    }).finally(() => inFlightRequests.delete(key));
    inFlightRequests.set(key, p);
    return p;
  };

  // Loaders
  const loadCompetitions = async () => {
    try {
      const data = await fetchAPI('/v4/competitions');
      cachedCompetitions = data.competitions || [];
      populateSelect(competitionsSelect, cachedCompetitions);
      displayCompetitions(cachedCompetitions);
    } catch {
      populateSelect(competitionsSelect, []);
      displayCompetitions([]);
    }
  };
  const loadTeamsForCompetition = async compId => {
    if (!compId) {
      populateSelect(teamsSelect, []);
      displayTeams([]);
      clearPlayers();
      return;
    }
    try {
      const data = await fetchAPI(`/v4/competitions/${compId}/teams`);
      cachedTeams = data.teams || [];
      cachedSquads.clear();
      populateSelect(teamsSelect, cachedTeams);
      displayTeams(cachedTeams);
      if (cachedTeams.length) {
        teamsSelect.value = cachedTeams[0].id;
        teamsSelect.dispatchEvent(new Event('change', { bubbles: true }));
      } else clearPlayers();
    } catch {
      cachedTeams = [];
      cachedSquads.clear();
      populateSelect(teamsSelect, []);
      displayTeams([]);
      clearPlayers();
    }
  };
  const loadMatchesForDate = async date => {
    if (!date) {
      setMatchesDateLabel(null);
      return displayMatches([]);
    }
    try {
      lastMatchesParams = { dateFrom: date, dateTo: date };
      if (matchDateInput) matchDateInput.value = date;
      setMatchesDateLabel(date, date);
      const data = await fetchAPI(`/v4/matches?dateFrom=${date}&dateTo=${date}`);
      displayMatches(data.matches || []);
    } catch {
      setMatchesDateLabel(null);
      displayMatches([]);
    }
  };
  const loadMatchesForToday = async () => { const today = getTodayStr(); await loadMatchesForDate(today); };
  const loadMatchesForPastWeekend = async () => {
    const today = new Date();
    const daysBack = today.getDay() === 0 ? 7 : today.getDay();
    const lastSunday = new Date(today);
    lastSunday.setDate(today.getDate() - daysBack);
    const lastSaturday = new Date(lastSunday);
    lastSaturday.setDate(lastSunday.getDate() - 1);
    const fmt = d => d.toISOString().slice(0, 10);
    lastMatchesParams = { dateFrom: fmt(lastSaturday), dateTo: fmt(lastSunday) };
    try {
      setMatchesDateLabel(lastMatchesParams.dateFrom, lastMatchesParams.dateTo);
      if (matchDateInput) matchDateInput.value = '';
      const data = await fetchAPI(`/v4/matches?dateFrom=${lastMatchesParams.dateFrom}&dateTo=${lastMatchesParams.dateTo}`);
      displayMatches(data.matches || []);
    } catch {
      setMatchesDateLabel(null);
      displayMatches([]);
    }
  };
  const refreshMatches = async () => {
    const selectedDate = (matchDateInput?.value || '').trim();
    const teamId = lastSelectedTeamId;
    const compId = lastSelectedCompetitionId;
    if (teamId && selectedDate && ISO_DATE_REGEX.test(selectedDate)) {
      const matches = await getTeamMatches(teamId, { dateFrom: selectedDate, dateTo: selectedDate });
      displayMatches(matches || []);
      return;
    }
    if (!teamId && compId && selectedDate && ISO_DATE_REGEX.test(selectedDate)) {
      const data = await fetchAPI(`/v4/competitions/${compId}/matches?dateFrom=${selectedDate}&dateTo=${selectedDate}`);
      displayMatches(data.matches || []);
      return;
    }
    if (teamId) {
      const matches = await getTeamMatches(teamId);
      displayMatches(matches || []);
      return;
    }
    if (compId) {
      const data = await fetchAPI(`/v4/competitions/${compId}/matches`);
      displayMatches(data.matches || []);
      return;
    }
    await loadMatchesForToday();
  };
  const getTeamMatches = async (teamId, opts = {}) => {
    if (!teamId) return [];
    const { dateFrom = '', dateTo = '' } = opts;
    const now = Date.now();
    const teamKey = `${teamId}::${dateFrom}::${dateTo}`;
    const cached = teamMatchesCache.get(teamKey);
    if (cached && cached.expiresAt > now) return cached.data;
    const inflight = inFlightTeamMatches.get(teamKey);
    if (inflight) return inflight;
    const p = (async () => {
      const qs = [];
      if (dateFrom) qs.push(`dateFrom=${encodeURIComponent(dateFrom)}`);
      if (dateTo) qs.push(`dateTo=${encodeURIComponent(dateTo)}`);
      const path = `/v4/teams/${teamId}/matches${qs.length ? `?${qs.join('&')}` : ''}`;
      const data = await fetchAPI(path);
      const matches = Array.isArray(data) ? data : (data.matches || []);
      teamMatchesCache.set(teamKey, { data: matches, expiresAt: now + TEAM_MATCHES_CACHE_TTL_MS });
      return matches;
    })().finally(() => inFlightTeamMatches.delete(teamKey));
    inFlightTeamMatches.set(teamKey, p);
    return p;
  };

  // Event handlers
  const handleCompetitionChange = async () => {
    lastSelectedCompetitionId = competitionsSelect.value || null;
    lastSelectedTeamId = null;
    await loadTeamsForCompetition(competitionsSelect.value);
  };
  const handleTeamChange = async () => {
    const teamId = teamsSelect?.value;
    lastSelectedTeamId = teamId || null;
    lastSelectedCompetitionId = null;
    if (!teamId) {
      clearPlayers();
      displayEmptyMatches();
      return;
    }
    clearPlayers();
    try {
      const selectedDate = (matchDateInput?.value || '').trim();
      const matches = await fetchMatchesForTeam(teamId, selectedDate);
      displayMatches(matches || []);
      document.getElementById('matches-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      displayEmptyMatches();
    }
  };
  const handleSearchInput = async () => {
    const q = (searchInput.value || '').trim().toLowerCase();
    if (competitionsSelect.value) {
      if (!q) {
        displayTeams(cachedTeams);
        return;
      }
      const matchingTeams = cachedTeams.filter(t => t.name?.toLowerCase().includes(q));
      displayTeams(matchingTeams);
      return;
    }
    if (!q) {
      hideSearchSuggestions();
      await loadCompetitions();
      return;
    }
    try {
      if (!cachedCompetitions.length) {
        const data = await fetchAPI('/v4/competitions');
        cachedCompetitions = data.competitions || [];
      }
    } catch {}
    if (!globalTeamsLoaded) {
      try {
        const td = await fetchAPI('/v4/teams');
        cachedGlobalTeams = td.teams || [];
        globalTeamsLoaded = true;
      } catch { globalTeamsLoaded = true; }
    }
    const comps = cachedCompetitions.filter(c => c.name?.toLowerCase().includes(q)).slice(0, 5).map(c => ({ type: 'competition', id: c.id, name: c.name, extra: c }));
    const teamsFromCache = [...cachedGlobalTeams, ...cachedTeams];
    const uniqTeams = [];
    const seenIds = new Set();
    for (const t of teamsFromCache) {
      if (!t || !t.id || seenIds.has(t.id)) continue;
      if (t.name?.toLowerCase().includes(q)) {
        uniqTeams.push({ type: 'team', id: t.id, name: t.name, extra: t });
        seenIds.add(t.id);
      }
      if (uniqTeams.length >= 6) break;
    }
    const suggestions = [...uniqTeams.slice(0, 6), ...comps.slice(0, 4)].slice(0, 8);
    createSuggestionBox();
    suggestionBox._lastList = suggestions;
    showSearchSuggestions(suggestions);
  };
  const handleToggleTheme = () => {
    const isDark = !document.body.classList.contains('dark-mode');
    updateThemeUI(isDark);
  };
  const handleSearchButtonClick = async () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      await loadCompetitions();
      await loadMatchesForToday();
      return;
    }
    try {
      const teamData = await fetchAPI('/v4/teams');
      const matchedTeam = (teamData.teams || []).find(t => t.name?.toLowerCase().includes(query));
      if (matchedTeam) {
        cachedTeams = [matchedTeam];
        displayTeams(cachedTeams);
        lastSelectedTeamId = matchedTeam.id;
        lastSelectedCompetitionId = null;
        const matches = await getTeamMatches(matchedTeam.id);
        displayMatches(matches || []);
        return;
      }
    } catch {}
    try {
      const compData = await fetchAPI('/v4/competitions');
      const matchedComp = (compData.competitions || []).find(c => c.name?.toLowerCase().includes(query));
      if (matchedComp) {
        displayCompetitions([matchedComp]);
        lastSelectedCompetitionId = matchedComp.id;
        lastSelectedTeamId = null;
        const data = await fetchAPI(`/v4/competitions/${matchedComp.id}/matches`);
        displayMatches(data.matches || []);
        return;
      }
    } catch {
      displayCompetitions([]);
      displayMatches([]);
    }
    showNotice('No teams or competitions found for your search.');
    displayTeams([]);
    displayCompetitions([]);
    displayMatches([]);
  };
  const handleTeamCardClick = async event => {
    const card = event.target.closest('.team-card');
    if (!card) return;
    const teamId = card.getAttribute('data-team-id');
    if (!teamId) return;
    teamsSelect.value = teamId;
    lastSelectedTeamId = teamId;
    lastSelectedCompetitionId = null;
    try {
      const selectedDate = (matchDateInput?.value || '').trim();
      const matches = selectedDate && ISO_DATE_REGEX.test(selectedDate) ? await getTeamMatches(teamId, { dateFrom: selectedDate, dateTo: selectedDate }) : await getTeamMatches(teamId);
      displayMatches(matches);
      document.getElementById('matches-list')?.scrollIntoView({ behavior: 'smooth' });
    } catch {
      displayMatches([]);
    }
  };

  // Attach listeners
  competitionsSelect?.addEventListener('change', handleCompetitionChange);
  teamsSelect?.addEventListener('change', handleTeamChange);
  const debouncedSearchInputHandler = debounce(handleSearchInput, SEARCH_DEBOUNCE_MS);
  searchInput?.addEventListener('input', debouncedSearchInputHandler);
  searchInput?.addEventListener('keydown', suggestionKeyHandler);
  searchInput?.addEventListener('blur', () => setTimeout(hideSearchSuggestions, 150));
  searchBtn?.addEventListener('click', handleSearchButtonClick);
  toggleThemeBtn?.addEventListener('click', handleToggleTheme);
  document.getElementById('teams-list')?.addEventListener('click', handleTeamCardClick);
  document.getElementById('refreshBtn')?.addEventListener('click', refreshMatches);

  if (matchDateInput) {
    matchDateInput.max = getTodayStr();
    matchDateInput.addEventListener('change', async e => {
      const date = (e.target.value || '').trim();
      if (!date) {
        await loadMatchesForPastWeekend();
        return;
      }
      if (!ISO_DATE_REGEX.test(date)) {
        showNotice('Invalid date format — use YYYY-MM-DD');
        return;
      }
      await loadMatchesForDate(date);
    });
    matchDateInput.addEventListener('keydown', async e => {
      if (e.key === 'Escape') {
        matchDateInput.value = '';
        await loadMatchesForPastWeekend();
      }
    });
  }

  if (todayMatchesBtn) {
    todayMatchesBtn.addEventListener('click', async () => {
      todayMatchesBtn.disabled = true;
      try {
        const today = getTodayStr();
        if (matchDateInput) matchDateInput.value = today;
        setMatchesDateLabel(today, today);
        await loadMatchesForDate(today);
      } finally {
        setTimeout(() => { todayMatchesBtn.disabled = false; }, 400);
      }
    });
  }

  // Load theme
  const savedTheme = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  updateThemeUI(savedTheme ? savedTheme === 'dark' : !!prefersDark);

  if (apiRequestsAllowed) {
    (async () => {
      try { await loadCompetitions(); } catch { populateSelect(competitionsSelect, []); displayCompetitions([]); clearPlayers(); }
      try { await loadMatchesForPastWeekend(); } catch { displayMatches([]); }
    })();
  }
});
