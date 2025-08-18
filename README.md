# Football Search App

The Football Search App allows users to search for football teams, players, and match information. It provides an intuitive interface for exploring football data and statistics for competitions around the world.

## Features

- Search for teams and players
- View detailed match information
- Responsive and user-friendly UI

## Code Overview

- **Frontend:** Built with HTML, CSS, and JavaScript.
- **API Integration:** Fetches football data from a public API (e.g., [API-Football](https://api.football-data.org/v4/competitions)).
- **State Management:** Utilises local state or Redux for managing search results and user interactions.
- **Server (server/):** Lightweight Node/Express service used to proxy requests, store server-side configuration (API keys), perform simple transformations or caching, and avoid exposing secrets from the frontend.

### Server folder (server/)
The `server/` folder contains the backend portion of the app. Typical responsibilities and contents:

- Purpose
    - Proxy calls to external football APIs so API keys are not exposed in the browser.
    - Normalize or filter API responses for the frontend.
    - Add simple caching, rate-limiting, or request aggregation if needed.

- Common structure
    - server/
        - package.json
        - .env.example (copy to `.env` and fill required values)
        - src/ or lib/
            - index.js or app.js (Express app entry)
            - routes/ (API route definitions)
            - controllers/ (request handlers)
            - middleware/ (logging, CORS, error handling)
            - utils/ (API client, caching helpers)
        - README.md (optional notes for the server)

- Typical environment variables
    - PORT — port the server listens on (e.g., 4000)
    - EXTERNAL_API_KEY — API key for the external football data provider
    - EXTERNAL_API_BASE_URL — base URL for the external API
    - NODE_ENV — development/production
    - (Any other third-party credentials or configuration)

- How it is used by the frontend
    - Frontend sends requests to the server (e.g., http://localhost:4000/api/teams?q=arsenal).
    - The server forwards the request to the external API, attaches the key, and returns formatted JSON to the frontend.

## How to Use

1. **Clone the repository:**
        ```bash
        git clone https://github.com/yourusername/football-search-app.git
        cd football-search-app
        ```

2. **Install dependencies (frontend):**
        ```bash
        npm install
        ```

3. **Start the frontend development server:**
        ```bash
        npm start
        ```

4. **Server (if present):**
        - Install server dependencies and run:
            ```bash
            cd server
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
