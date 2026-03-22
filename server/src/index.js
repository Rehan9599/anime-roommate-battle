import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { CHARACTERS, ROLES } from "./characters.js";
import { runBattle, validateTeam } from "./battleEngine.js";
import { enrichCharacterImages } from "./imageService.js";
import { chooseAiAction } from "./aiService.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const app = express();
const PORT = 4000;
const PG_HOST = process.env.PGHOST || process.env.PG_HOST || "127.0.0.1";
const PG_PORT = Number(process.env.PGPORT || process.env.PG_PORT || 5432);
const PG_DATABASE = process.env.PGDATABASE || process.env.PG_DATABASE || "anime_roommate_battle";
const PG_USER = process.env.PGUSER || process.env.PG_USER || "postgres";
const PG_PASSWORD = process.env.PGPASSWORD || process.env.PG_PASSWORD || "postgres";
const DATABASE_URL = process.env.DATABASE_URL || "";

app.use(cors());
app.use(express.json());

let usePostgres = false;
let pgPool = null;
let inMemoryCharacters = [...CHARACTERS];
let inMemoryMatches = [];

async function loadLocalCharacterCache() {
  try {
    const raw = await readFile(new URL("../data/db.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw);
    const cachedCharacters = Array.isArray(parsed?.characters) ? parsed.characters : [];
    const cacheById = Object.fromEntries(cachedCharacters.map((c) => [c.id, c]));
    return CHARACTERS.map((base) => ({ ...base, ...(cacheById[base.id] || {}) }));
  } catch {
    return [...CHARACTERS];
  }
}

async function initStorage() {
  try {
    pgPool = DATABASE_URL
      ? new Pool({ connectionString: DATABASE_URL })
      : new Pool({
          host: PG_HOST,
          port: PG_PORT,
          database: PG_DATABASE,
          user: PG_USER,
          password: PG_PASSWORD
        });

    await pgPool.query("SELECT 1");
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS arb_characters (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);
    await pgPool.query(`
      CREATE TABLE IF NOT EXISTS arb_matches (
        id BIGSERIAL PRIMARY KEY,
        mode TEXT NOT NULL,
        played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        team_a_name TEXT NOT NULL,
        team_b_name TEXT NOT NULL,
        winner TEXT NOT NULL,
        score_a DOUBLE PRECISION NOT NULL,
        score_b DOUBLE PRECISION NOT NULL
      )
    `);

    const existingCharactersResult = await pgPool.query("SELECT data FROM arb_characters");
    const existingCharacters = existingCharactersResult.rows.map((row) => row.data);
    const existingById = Object.fromEntries(existingCharacters.map((c) => [c.id, c]));
    const localSeed = await loadLocalCharacterCache();
    const merged = localSeed.map((base) => ({ ...base, ...(existingById[base.id] || {}) }));

    for (const character of merged) {
      await pgPool.query(
        `
          INSERT INTO arb_characters (id, data)
          VALUES ($1, $2::jsonb)
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
        `,
        [character.id, JSON.stringify(character)]
      );
    }

    const needsApiEnrichment = merged.some(
      (c) => !c.imageUrl || !c.infoSource || c.infoSource === "jikan" || c.infoSource === "superheroapi"
    );

    if (needsApiEnrichment) {
      const enriched = await enrichCharacterImages(merged, {
        superheroToken: process.env.SUPERHERO_API_TOKEN || ""
      });

      for (const character of enriched) {
        await pgPool.query(
          `
            INSERT INTO arb_characters (id, data)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
          `,
          [character.id, JSON.stringify(character)]
        );
      }
    }

    usePostgres = true;
    console.log(`Connected to PostgreSQL at ${PG_HOST}:${PG_PORT}/${PG_DATABASE}`);
  } catch (error) {
    usePostgres = false;
    inMemoryCharacters = await loadLocalCharacterCache();
    inMemoryMatches = [];
    console.warn("PostgreSQL unavailable. Falling back to in-memory storage.");
    console.warn(error?.message || error);
  }
}

await initStorage();

let rosterById = Object.fromEntries(inMemoryCharacters.map((c) => [c.id, c]));
let trainedModel = null;

try {
  const raw = await readFile(new URL("../data/ml_model.json", import.meta.url), "utf8");
  trainedModel = JSON.parse(raw);
  console.log("Loaded trained battle model from data/ml_model.json");
} catch {
  console.log("No trained model found. Using default battle weights.");
}

async function refreshRoster() {
  const characters = usePostgres
    ? (await pgPool.query("SELECT data FROM arb_characters")).rows.map((row) => row.data)
    : inMemoryCharacters;
  rosterById = Object.fromEntries(characters.map((c) => [c.id, c]));
  return characters;
}

async function recordMatch(match) {
  if (usePostgres) {
    await pgPool.query(
      `
        INSERT INTO arb_matches (mode, played_at, team_a_name, team_b_name, winner, score_a, score_b)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [
        match.mode,
        match.playedAt,
        match.teamAName,
        match.teamBName,
        match.winner,
        match.scoreA,
        match.scoreB
      ]
    );
    return;
  }
  inMemoryMatches.push(match);
}

async function readMatches() {
  if (usePostgres) {
    const result = await pgPool.query(`
      SELECT mode, played_at, team_a_name, team_b_name, winner, score_a, score_b
      FROM arb_matches
      ORDER BY played_at DESC
    `);

    return result.rows.map((row) => ({
      mode: row.mode,
      playedAt: row.played_at,
      teamAName: row.team_a_name,
      teamBName: row.team_b_name,
      winner: row.winner,
      scoreA: Number(row.score_a),
      scoreB: Number(row.score_b)
    }));
  }
  return inMemoryMatches;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "anime-roommate-battle-api", storage: usePostgres ? "postgres" : "memory" });
});

app.get("/api/characters", async (_req, res) => {
  const characters = await refreshRoster();
  res.json({
    count: characters.length,
    roles: ROLES,
    characters
  });
});

app.get("/api/universes", async (_req, res) => {
  const characters = await refreshRoster();
  const universes = [...new Set(characters.map((c) => c.anime))];
  res.json({ universes });
});

app.post("/api/random-card", async (req, res) => {
  const characters = await refreshRoster();
  const excludeIds = req.body?.excludeIds || [];
  const available = characters.filter((c) => !excludeIds.includes(c.id));

  if (!available.length) {
    return res.status(400).json({ error: "No cards left to draw" });
  }

  const randomCard = available[Math.floor(Math.random() * available.length)];
  return res.json({ card: randomCard, remaining: available.length - 1 });
});

app.post("/api/ai-decision", async (req, res) => {
  const { team, card, skipRemaining = 0 } = req.body || {};

  if (!team || !card) {
    return res.status(400).json({ error: "Missing team or card payload." });
  }

  const action = await chooseAiAction({
    team,
    card,
    skipRemaining
  });

  if (action.action === "assign") {
    const openRoles = Object.entries(team)
      .filter(([, value]) => !value)
      .map(([role]) => role);

    if (!openRoles.includes(action.role)) {
      action.role = openRoles[0] || null;
      action.reason = "Adjusted to first available role.";
    }
  }

  res.json(action);
});

app.post("/api/battle", async (req, res) => {
  const { teamA, teamB, mode = "pvp" } = req.body || {};

  await refreshRoster();

  const errA = validateTeam(teamA, ROLES, rosterById);
  if (errA) {
    return res.status(400).json({ error: `Player 1: ${errA}` });
  }

  const errB = validateTeam(teamB, ROLES, rosterById);
  if (errB) {
    return res.status(400).json({ error: `Player 2: ${errB}` });
  }

  const allIds = [...Object.values(teamA.roles), ...Object.values(teamB.roles)];
  if (new Set(allIds).size !== allIds.length) {
    return res.status(400).json({ error: "Duplicate character used across teams" });
  }

  const result = runBattle({ teamA, teamB, rosterById, model: trainedModel });

  await recordMatch({
    mode,
    playedAt: new Date(),
    teamAName: teamA.name || "Player 1",
    teamBName: teamB.name || "Player 2",
    winner: result.winner,
    scoreA: result.scoreA,
    scoreB: result.scoreB
  });

  return res.json(result);
});

app.get("/api/scorecard", async (_req, res) => {
  const matches = await readMatches();
  const recentMatches = [...matches]
    .sort((a, b) => new Date(b.playedAt).getTime() - new Date(a.playedAt).getTime())
    .slice(0, 8);

  const summary = {
    totalMatches: matches.length,
    byMode: { pvp: 0, ai: 0 },
    pvpWins: { player1: 0, player2: 0, draw: 0 },
    aiWins: { you: 0, ai: 0, draw: 0 }
  };

  for (const match of matches) {
    const mode = match.mode === "ai" ? "ai" : "pvp";
    summary.byMode[mode] += 1;

    if (mode === "pvp") {
      if (match.winner === "player1") summary.pvpWins.player1 += 1;
      else if (match.winner === "player2") summary.pvpWins.player2 += 1;
      else summary.pvpWins.draw += 1;
    } else {
      if (match.winner === "player1") summary.aiWins.you += 1;
      else if (match.winner === "player2") summary.aiWins.ai += 1;
      else summary.aiWins.draw += 1;
    }
  }

  res.json({
    ...summary,
    recentMatches
  });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err?.status || 500;
  const message = err?.message || "Internal Server Error";
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
