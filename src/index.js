async function fetchAPI(endpoint) {
    const API_KEY = '104f5355e36b413cbadcc412e056d366'; 
    const url = `https://corsproxy.io/?https://api.football-data.org/v4${endpoint}`;
    const response = await fetch(url, {
        headers: { 'X-Auth-Token': API_KEY }
    });
    return response.json();
}
let lastPlayers = []; // Store last filtered players

document.addEventListener('DOMContentLoaded', async () => {
    const data = await fetchAPI('/competitions');
    const select = document.getElementById('competitions');
    const select2 = document.getElementById('teams');
    const searchbtn = document.getElementById('searchBtn');

    loadCompetitions(data, select);

    if (searchbtn) {
        searchbtn.addEventListener('click', async () => {
            const searchInput = document.getElementById('searchInput');
            const positionFilter = document.getElementById('positionFilter');
            const teamsSelect = document.getElementById('teams');
            const teamId = teamsSelect && teamsSelect.value ? teamsSelect.value : null;
            const search = searchInput ? searchInput.value : '';
            const position = positionFilter ? positionFilter.value : '';
            if (teamId) {
                lastPlayers = await getFilteredPlayers(search, position, teamId);
                displayPlayers(lastPlayers);
            } else {
                // Optionally, show a message to select a team
                const resultsDiv = document.getElementById('results');
                if (resultsDiv) {
                    resultsDiv.innerHTML = '<p>Please select a team first.</p>';
                }
            }
        });
    }

    if (select) {
        select.addEventListener('change', async function() {
            const competitionId = this.value;
            await loadTeams(competitionId, select2);
        });
    }

    if (select2) {
        select2.addEventListener('change', async function() {
            const teamId = this.value;
            await loadSquad(teamId);
        });
    }

    setTheme(false); // Default to light mode
});

// Helper to fetch and filter players, but does NOT display
async function getFilteredPlayers(search = '', position = '', teamId = null) {
    let players = [];
    if (teamId) {
        const data = await fetchAPI(`/teams/${teamId}`);
        players = data.squad || [];
    }
    if (search) {
        players = players.filter(player =>
            player.name.toLowerCase().includes(search.toLowerCase())
        );
    }
    if (position) {
        players = players.filter(player =>
            player.position && player.position.toLowerCase() === position.toLowerCase()
        );
    }
    // Add team name to player object for display
    const teamsSelect = document.getElementById('teams');
    players = players.map(player => ({
        ...player,
        team: teamsSelect ? teamsSelect.options[teamsSelect.selectedIndex].text : ''
    }));
    return players;
}

function loadCompetitions(data, select) {
    if (!select) return; // Prevent error if element is not found
    if (!data || !Array.isArray(data.competitions)) return; // Prevent error if competitions is missing
    data.competitions.forEach(comp => {
        const opt = document.createElement('option');
        opt.value = comp.id;
        opt.textContent = comp.name;
        select.appendChild(opt);
    });
}
async function loadTeams(competitionId, select) {
    const data = await fetchAPI(`/competitions/${competitionId}/teams`);
    if (!select) return; // Prevent error if element is not found
    select.innerHTML = '';
    if (!data || !Array.isArray(data.teams)) return; // Prevent error if teams is missing
    data.teams.forEach(team => {
        const opt = document.createElement('option');
        opt.value = team.id;
        opt.textContent = team.name;
        select.appendChild(opt);
    });
}
async function loadSquad(teamId) {
    const data = await fetchAPI(`/teams/${teamId}`);
    const squadEl = document.getElementById('squad');
    if (!squadEl) return; // Prevent error if element is not found
    squadEl.innerHTML = '';
    if (!data || !Array.isArray(data.squad)) return; // Prevent error if squad is missing
    data.squad.forEach(player => {
        const li = document.createElement('li');
        li.textContent = `${player.name} – ${player.position}`;
        squadEl.appendChild(li);
    });
}

// Display players
function displayPlayers(players) {
    const resultsDiv = document.getElementById('results');
    if (!resultsDiv) return; // Prevent error if element is not found
    if (players.length === 0) {
        resultsDiv.innerHTML = '<p>No players found.</p>';
        return;
    }
    resultsDiv.innerHTML = players.map(player => `
        <div class="player-card">
            <strong>${player.name}</strong><br>
            Team: ${player.team}<br>
            Position: ${player.position}
        </div>
    `).join('');
}

fetch('https://corsproxy.io/?https://api.football-data.org/v4/competitions', {
    headers: {
        'X-Auth-Token': '104f5355e36b413cbadcc412e056d366'
    }
})
    .then(response => response.json())
    .then(data => {
        console.log(data);
        // Process and display player data
    })
    .catch(error => {
        console.error('Error fetching player data:', error);
    });

// Theme toggle logic
function setTheme(isDark) {
    document.body.classList.toggle('dark-mode', isDark);
    document.body.classList.toggle('light-mode', !isDark);
    const toggleThemeBtn = document.getElementById('toggleThemeBtn');
    if (toggleThemeBtn) {
        toggleThemeBtn.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
    }
}

const searchInput = document.getElementById('searchInput');
if (searchInput) {
    searchInput.addEventListener('input', function() {
        const search = this.value;
        const positionFilter = document.getElementById('positionFilter');
        const position = positionFilter ? positionFilter.value : '';
        fetchAndDisplayPlayers(search, position);
    });
}

const positionFilter = document.getElementById('positionFilter');
if (positionFilter) {
    positionFilter.addEventListener('change', function() {
        const position = this.value;
        const searchInput = document.getElementById('searchInput');
        const search = searchInput ? searchInput.value : '';
        fetchAndDisplayPlayers(search, position);
    });
}

const toggleThemeBtn = document.getElementById('toggleThemeBtn');
if (toggleThemeBtn) {
    toggleThemeBtn.addEventListener('click', function() {
        const isDark = document.body.classList.contains('dark-mode');
        setTheme(!isDark);
    });
}

// Helper function to fetch and display players based on search and position
async function fetchAndDisplayPlayers(search = '', position = '') {
    // Example: Fetch teams and filter players by search and position
    const teamsSelect = document.getElementById('teams');
    const teamId = teamsSelect && teamsSelect.value ? teamsSelect.value : null;
    let players = [];

    if (teamId) {
        const data = await fetchAPI(`/teams/${teamId}`);
        players = data.squad || [];
    }

    // Filter players by search and position
    if (search) {
        players = players.filter(player =>
            player.name.toLowerCase().includes(search.toLowerCase())
        );
    }
    if (position) {
        players = players.filter(player =>
            player.position && player.position.toLowerCase() === position.toLowerCase()
        );
    }

    // Add team name to player object for display
    players = players.map(player => ({
        ...player,
        team: teamsSelect ? teamsSelect.options[teamsSelect.selectedIndex].text : ''
    }));

    displayPlayers(players);
}

// Initial load
fetchAndDisplayPlayers();

// NOTE: If you see CORS errors in the browser console, this is because the football-data.org API
// does not allow requests directly from browsers (client-side JavaScript).
// To resolve this for local development, you must use a backend proxy or a CORS proxy service.
// Example: Use https://corsproxy.io/?https://api.football-data.org/v4/competitions
// Or set up your own backend to forward requests.

// Example usage with corsproxy.io (for development only):
// const url = `https://corsproxy.io/?https://api.football-data.org/v4${endpoint}`;
