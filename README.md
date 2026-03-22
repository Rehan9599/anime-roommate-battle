# animeroom battle

Fast-paced 1v1 draft-and-battle game where players build teams from anime/comic cards, assign fixed roles, activate boosters, and resolve a final simulation with a detailed post-battle explanation panel.

## What this project includes

- Frontend: React + Vite
- Backend API: Node.js + Express
- Storage: PostgreSQL (with in-memory fallback when PostgreSQL is unavailable)
- Match systems:
  - Role-based team scoring (Captain, Vice Captain, Healer, Support, Traitor)
  - Draft phase with hand limits and turn logic
  - Booster card effects with activation slots
  - AI drafting and booster usage
  - Scoreboard and recent match history

## Repository structure

```text
.
|- client/
|  |- src/
|  |  |- App.jsx
|  |  |- styles.css
|- server/
|  |- src/
|  |  |- index.js
|  |  |- battleEngine.js
|  |  |- characters.js
|  |- data/
|  |  |- db.json
|  |  |- ml_model.json
|  |  |- postgres_setup.sql
|- ml/
|  |- train_battle_model.py
|- README.md
```

## Requirements

- Node.js 18+
- npm 9+
- PostgreSQL 13+ (optional but recommended)

## Quick start

1. Install dependencies for both apps.

```bash
npm run install:all
```

2. Configure environment variables in `server/.env` or root `.env` (depending on your setup).

```env
PGHOST=127.0.0.1
PGPORT=5432
PGDATABASE=anime_roommate_battle
PGUSER=postgres
PGPASSWORD=postgres
# Optional alternative:
# DATABASE_URL=postgres://user:pass@host:5432/dbname

# Optional external enrichers
SUPERHERO_API_TOKEN=your_token_here
```

3. (Optional) Prepare PostgreSQL schema.

- Use `server/data/postgres_setup.sql`, or run your own equivalent DDL.

4. (Optional) Seed PostgreSQL from JSON data.

```bash
npm --prefix server run seed:pg
```

5. Start frontend + backend together.

```bash
npm run dev
```

6. Open the app.

- Frontend: http://localhost:5173
- Backend health: http://localhost:4000/api/health

## Available scripts

Root `package.json`:

- `npm run install:all`: install dependencies in `server` and `client`
- `npm run dev`: run backend and frontend concurrently

Server `server/package.json`:

- `npm --prefix server run dev`: start backend with nodemon
- `npm --prefix server run start`: start backend with node
- `npm --prefix server run seed:pg`: seed PostgreSQL from JSON

Client `client/package.json`:

- `npm --prefix client run dev`: start Vite dev server
- `npm --prefix client run build`: production build
- `npm --prefix client run preview`: preview production build

## Gameplay overview

1. Draft cards until each side reaches its draft limit.
2. Assign one card to each role:
   - Captain
   - Vice Captain
   - Healer
   - Support
   - Traitor
3. Use booster cards by dragging to the booster slot.
4. Start battle simulation.
5. Review winner plus post-battle story panel.

### Important gameplay notes

- Drag and drop actions are only available during the active player's turn.
- Draw locks and booster locks can disable part of a turn.
- If a player cannot draw (for example, exhausted draft count), turn flow auto-passes.
- Traitor outcomes include stochastic betrayal logic and can strongly swing final scores.

## API endpoints

- `GET /api/health`
- `GET /api/characters`
- `GET /api/universes`
- `POST /api/random-card`
- `POST /api/ai-decision`
- `POST /api/battle`
- `GET /api/scorecard`

## Troubleshooting

### Backend not running

If API calls fail or the frontend looks stuck during battle logic:

```bash
npm --prefix server run dev
```

Then refresh the frontend.

### PostgreSQL unavailable

The backend falls back to in-memory storage automatically. This is fine for local testing, but data will not persist between restarts.

### Stale frontend state

After major gameplay changes, do a hard refresh in the browser to clear stale Vite client state.

## License

ISC
