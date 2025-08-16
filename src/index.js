let lastPlayers = [];

document.addEventListener('DOMContentLoaded', async () => {
  const competitionsSelect = document.getElementById('competitions');
  const teamsSelect = document.getElementById('teams');
  const searchBtn = document.getElementById('searchBtn');
  const searchInput = document.getElementById('searchInput');
  const positionFilter = document.getElementById('positionFilter');
  const toggleThemeBtn = document.getElementById('toggleThemeBtn');

  // Helpers
  const fetchAPI = (url) => fetch(`http://localhost:3000${url}`).then(r => r.json());
  const populateSelect = (select, items, valueKey = 'id', textKey = 'name') => {
    if (!select || !Array.isArray(items)) return;
    select.innerHTML = `<option value="">Select</option>` + 
      items.map(i => `<option value="${i[valueKey]}">${i[textKey]}</option>`).join('');
  };

  // Load competitions from JSON Server
  try {
    const competitions = await fetchAPI('/competitions');
    populateSelect(competitionsSelect, competitions);
  } catch (e) {
    console.error('Failed to load competitions:', e);
  }

  // Core: fetch, filter, display players
  async function updatePlayers(search = '', position = '') {
    const teamId = teamsSelect?.value;
    if (!teamId) {
      displayPlayers([]);
      return;
    }
    const team = await fetchAPI(`/teams/${teamId}`);
    let squad = team?.squad ?? [];

    if (search) squad = squad.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));
    if (position) squad = squad.filter(p => p.position?.toLowerCase() === position.toLowerCase());

    const teamName = teamsSelect?.selectedOptions[0]?.text ?? '';
    lastPlayers = squad.map(p => ({ ...p, team: teamName }));
    displayPlayers(lastPlayers);
  }

  function displayPlayers(players) {
    const resultsDiv = document.getElementById('results-container'); // FIXED id
    if (!resultsDiv) return;
    if (!players.length) {
      resultsDiv.innerHTML = '<p>No players found.</p>';
      return;
    }
    resultsDiv.innerHTML = players.map(p => `
      <div class="player-card">
        <strong>${p.name}</strong><br>
        Team: ${p.team}<br>
        Position: ${p.position ?? ''}
      </div>`).join('');
  }

  // UI Events
  competitionsSelect?.addEventListener('change', async () => {
    // JSON server expects teams to be linked with competitionId
    const teams = await fetchAPI(`/teams?competitionId=${competitionsSelect.value}`);
    populateSelect(teamsSelect, teams);
  });

  teamsSelect?.addEventListener('change', () => updatePlayers(searchInput?.value, positionFilter?.value));
  searchInput?.addEventListener('input', () => updatePlayers(searchInput.value, positionFilter?.value));
  positionFilter?.addEventListener('change', () => updatePlayers(searchInput?.value, positionFilter.value));
  searchBtn?.addEventListener('click', () => updatePlayers(searchInput?.value, positionFilter?.value));

  toggleThemeBtn?.addEventListener('click', () => setTheme(!document.body.classList.contains('dark-mode')));

  function setTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    toggleThemeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }

  // Initialize
  setTheme(false);
});
