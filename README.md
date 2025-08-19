# Football Search App

The Football Search App allows users to search for football teams, players, and match information. It provides an intuitive interface for exploring football data and statistics for competitions around the world.

## What's new

This project now displays images in the UI:

- Competition logos/emblems are shown in the Competitions list.
- Team crests are shown next to each team in the Teams list and next to players.
- Player photos/headshots are shown in the Players list (when available).

The frontend attempts to find these images in common API response fields (examples include: `emblemUrl`, `logo`, `crestUrl` for competitions and teams; `photo`, `photoUrl`, `imageUrl`, `headshot`, `avatar`, `picture` for players). If an image URL is invalid the image element is hidden to preserve layout.

## UI / Styling notes

- Images use a unified fixed size to keep the layout consistent:
  - CSS classes: `.competition-logo`, `.team-crest`, `.player-photo`, `.player-team-crest`.
  - Images are sized and constrained with `width`, `height`, `object-fit: contain` and a fixed flex basis so they don't stretch layout.
- Player and team list items use a flex layout:
  - `.team-card` and `.player-card` align image + text horizontally for a compact list view.
  - Player details are wrapped in `.player-info` to keep text aligned.

## Code overview (changes)

- Frontend
  - `src/index.js`:
    - Added helpers to extract logo/crest/photo URLs and render them in `displayCompetitions`, `displayTeams`, and `displayPlayers`.
    - Caches teams and squads (`cachedTeams`, `cachedSquads`) to reduce repeated API calls when searching teams/players.
    - Keeps selects and list UI in sync; clicking a team card selects the team and loads its squad.
  - `styles.css`:
    - Unified crest/photo sizing and improved list card layout with flexbox.

## API / Proxy

- To avoid exposing API keys and to handle CORS, the app uses a small local proxy during development.
  - Default proxy base used by the frontend: `http://localhost:3000/api`
  - Start the proxy (if provided in `server/`) and point the frontend to it. The proxy should forward requests to the external football API and attach API keys server-side.
  - If you don't run the proxy, make sure you serve the frontend from `http://localhost` (not `file://`) to allow API requests.

## How to run (quick)

1. Create env files and configure API keys
        - Copy `server/.env.example` to `server/.env` and set `PORT`, `EXTERNAL_API_KEY`, etc.
        - If the frontend requires environment variables, create/update its `.env` as needed.

2. Start the local proxy (if `server/` exists)
        ```
        cd server
        npm installg
        npm run dev   # or npm start
        ```
        The proxy should run on the configured `PORT` (commonly 3000) and forward requests to the external API.

3. Serve the frontend
        - From the project root:
        ```
        npx serve .        # or python -m http.server 8000
        ```
        - Or run your preferred frontend dev workflow. Ensure the frontend is served over http(s) (not `file://`).

4. Open the app in your browser
        - Visit the served URL (e.g., `http://localhost:3000` or the port used by your static server).

5. Use the app
        - Use the search input, select competitions/teams, or click a team card to view players (photos/crests appear when available).
        - Use the "Refresh" button in Matches to re-fetch match data.

Notes:
- If you don't run the proxy, ensure the frontend is served from `http://localhost` so API requests can be made.
- Update keys in `.env` any time they change.

## Notes

- The app hides images that fail to load to avoid broken layout.
- The set of image fields probed by the app is heuristic — some APIs return different fields. If your data source uses other names, adapt the helper functions in `src/index.js`.
- Dark/Light mode toggle is available via the "Switch to Dark Mode" button; styles adapt for images and content.

## Customization

- Update API keys in `.env` (frontend and/or `server/.env`) if required.
- Modify styles in the `src/styles` folder.
- Extend server routes or controllers in `server/src/` to add new endpoints or response handling.

## License

This project is licensed under the MIT License.
