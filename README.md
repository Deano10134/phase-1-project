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

1. Start the local proxy (if you have `server/` code):
   - Configure API key in `server/.env` (copy `.env.example` if present).
   - Install and run the server:
     ```
     cd server
     npm install
     npm run dev   # or `npm start`
     ```
2. Start or serve the frontend:
   - If using a simple static server, from project root:
     ```
     npx serve .        # or python -m http.server 8000
     ```
   - Or use your preferred dev workflow (open the served URL on localhost).

3. Open the frontend in your browser at the served localhost URL (e.g., `http://localhost:3000` or the port your static server uses).

4. Use the search input, select competitions/teams, or click a team card to view players (photos/crests will show when available). Use the "Refresh" button in the Matches section to re-fetch matches.

## Notes

- The app hides images that fail to load to avoid broken layout.
- The set of image fields probed by the app is heuristic — some APIs return different fields. If your data source uses other names, adapt the helper functions in `src/index.js`.
- Dark/Light mode toggle is available via the "Switch to Dark Mode" button; styles adapt for images and content.

## License

This project is licensed under the MIT License.
            npm install
            # development with auto-reload
            npm run dev
            # or production
            npm start
            ```
        - Create a `.env` file in `server/` (or copy `.env.example`) and set keys such as `PORT` and `EXTERNAL_API_KEY`.

5. **Open your browser:**  
        Navigate to `http://localhost:3000` to use the app (adjust if your frontend runs on a different port).

6. **Search:**  
        Enter a team or player name in the search bar to view results.

## Customization

- Update API keys in `.env` (frontend and/or `server/.env`) if required.
- Modify styles in the `src/styles` folder.
- Extend server routes or controllers in `server/src/` to add new endpoints or response handling.

## License

This project is licensed under the MIT License.
