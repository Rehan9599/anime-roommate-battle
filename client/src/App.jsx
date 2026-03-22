import { useEffect, useRef, useState } from "react";

const ROLE_LABELS = {
  captain: "Captain",
  viceCaptain: "Vice Captain",
  healer: "Healer",
  support: "Support",
  traitor: "Traitor"
};

const POSITION_ROLE_FIT = {
  captain: { leader: 1.16, strategist: 1.1, wildcard: 1.04 },
  viceCaptain: { brawler: 1.12, assassin: 1.1, tank: 1.06 },
  healer: { healer: 1.18, support: 1.12, mystic: 1.08 },
  support: { support: 1.16, strategist: 1.1, ranged: 1.06 },
  traitor: { wildcard: 1.18, assassin: 1.1, strategist: 1.05 }
};

const EMPTY_TEAM = {
  captain: null,
  viceCaptain: null,
  healer: null,
  support: null,
  traitor: null
};

const ACTION_CARD_DEFS = [
  { actionType: "draw_one_more", name: "Draw One More", description: "Instantly draw one extra card." },
  { actionType: "reverse_turn", name: "U-Turn", description: "Skip opponent's next draft turn." },
  { actionType: "swap_one_card", name: "Swap One Card", description: "Swap one weak card with a stronger option." }
];

const CARD_IMAGE_FALLBACK = "https://dummyimage.com/320x180/dae3ff/33426b.png&text=Card+Art";

function scoreCandidate(role, card) {
  const fit = POSITION_ROLE_FIT[role]?.[card.universeRole] || 1;
  let score = card.powerLevel * fit;
  if (role === "traitor") {
    if (card.loyalty >= 8) score *= 0.58;
    else if (card.loyalty <= 4) score *= 1.14;
  } else if (card.loyalty >= 8) {
    score *= 1.05;
  }
  return score;
}

function isReady(team) {
  return Object.values(team).every(Boolean);
}

function shuffle(list) {
  return [...list].sort(() => Math.random() - 0.5);
}

function nextPlayer(player) {
  return player === "A" ? "B" : "A";
}

function resolveNextTurn(player, keepTurn, turnSkipsState) {
  const nextSkips = { ...turnSkipsState };
  if (keepTurn) {
    return { nextTurn: player, nextSkips };
  }

  let next = nextPlayer(player);
  let guard = 0;
  while ((nextSkips[next] || 0) > 0 && guard < 4) {
    nextSkips[next] -= 1;
    next = nextPlayer(next);
    guard += 1;
  }

  return { nextTurn: next, nextSkips };
}

function formatEffectLabel(effect) {
  if (!effect) return "";
  return effect.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function toFixedNumber(value, decimals = 2) {
  return Number(value || 0).toFixed(decimals);
}

function traitorNetDelta(selfBreakdown, enemyBreakdown) {
  return Number(selfBreakdown?.traitor?.ownDelta || 0) + Number(enemyBreakdown?.traitor?.enemyDelta || 0);
}

function combinedSynergyPct(playerBreakdown) {
  const universe = Number(playerBreakdown?.universeBonusPct || 0);
  const cohesion = Number(playerBreakdown?.cohesionBonusPct || 0);
  return (universe + cohesion) * 100;
}

function roleCardName(team, role) {
  return team?.[role]?.name || ROLE_LABELS[role];
}

function getBattleStory(result, playerOneLabel, playerTwoLabel, teamA, teamB) {
  const p1 = result?.breakdown?.player1 || {};
  const p2 = result?.breakdown?.player2 || {};

  if (!result || !result.breakdown) {
    return [
      {
        title: "Result Snapshot",
        text: "The winner was decided by total score, but detailed battle factors were unavailable."
      }
    ];
  }

  if (result.winner === "draw") {
    const capA = roleCardName(teamA, "captain");
    const capB = roleCardName(teamB, "captain");
    const healerA = roleCardName(teamA, "healer");
    const healerB = roleCardName(teamB, "healer");
    return [
      {
        title: "Photo Finish",
        text: `${capA} and ${capB} traded blows all match, ending dead even at ${toFixedNumber(result.scoreA)} - ${toFixedNumber(result.scoreB)}.`
      },
      {
        title: "Sustain Mirror",
        text: `${healerA} and ${healerB} kept both sides alive, with sustain values of ${toFixedNumber(p1.sustain)} and ${toFixedNumber(p2.sustain)}.`
      },
      {
        title: "No Break Point",
        text: `Both teams hovered around similar synergy (${toFixedNumber(combinedSynergyPct(p1), 1)}% vs ${toFixedNumber(combinedSynergyPct(p2), 1)}%), so no side created a final knockout edge.`
      }
    ];
  }

  const winnerIsP1 = result.winner === "player1";
  const winnerLabel = winnerIsP1 ? playerOneLabel : playerTwoLabel;
  const loserLabel = winnerIsP1 ? playerTwoLabel : playerOneLabel;
  const winner = winnerIsP1 ? p1 : p2;
  const loser = winnerIsP1 ? p2 : p1;
  const winnerTeam = winnerIsP1 ? teamA : teamB;
  const loserTeam = winnerIsP1 ? teamB : teamA;

  const winnerCaptain = roleCardName(winnerTeam, "captain");
  const loserCaptain = roleCardName(loserTeam, "captain");
  const winnerHealer = roleCardName(winnerTeam, "healer");
  const winnerSupport = roleCardName(winnerTeam, "support");
  const winnerTraitor = roleCardName(winnerTeam, "traitor");
  const loserTraitor = roleCardName(loserTeam, "traitor");

  const story = [];
  const scoreGap = Math.abs(Number(result.scoreA) - Number(result.scoreB));
  story.push({
    title: "Final Blow",
    text: `${winnerLabel} closed the fight with ${winnerCaptain} leading the charge, finishing ${toFixedNumber(scoreGap)} points ahead of ${loserLabel}.`
  });

  const baseDelta = Number(winner.base || 0) - Number(loser.base || 0);
  if (Math.abs(baseDelta) >= 0.5) {
    story.push({
      title: "Draft Edge",
      text: `${winnerCaptain} outpaced ${loserCaptain} in core pressure, giving ${winnerLabel} a +${toFixedNumber(baseDelta)} base-power edge.`
    });
  }

  const synergyDelta = combinedSynergyPct(winner) - combinedSynergyPct(loser);
  if (Math.abs(synergyDelta) >= 0.5) {
    story.push({
      title: "Team Chemistry",
      text: `${winnerSupport} and ${winnerHealer} synced beautifully, pushing team synergy by +${toFixedNumber(synergyDelta, 1)}% over ${loserLabel}.`
    });
  }

  const sustainDelta = Number(winner.sustain || 0) - Number(loser.sustain || 0);
  if (Math.abs(sustainDelta) >= 0.3) {
    story.push({
      title: "Stability Control",
      text: `${winnerHealer} anchored the lineup and generated +${toFixedNumber(sustainDelta)} sustain for ${winnerLabel}.`
    });
  }

  const traitorDelta = traitorNetDelta(winner, loser) - traitorNetDelta(loser, winner);
  if (Math.abs(traitorDelta) >= 0.3) {
    const winnerTraitorTag = winner?.traitor?.betrayed ? "went rogue" : "held the line";
    const loserTraitorTag = loser?.traitor?.betrayed ? "went rogue" : "held the line";
    story.push({
      title: "Wildcard Moment",
      text: `${winnerTraitor} ${winnerTraitorTag} while ${loserTraitor} ${loserTraitorTag}, swinging momentum by ${toFixedNumber(traitorDelta)}.`
    });
  }

  const winnerBoosters = Array.isArray(winner.boosterEffects) ? winner.boosterEffects : [];
  if (winnerBoosters.length) {
    story.push({
      title: "Utility Burst",
      text: `${winnerLabel} timed boosters perfectly (${winnerBoosters.map(formatEffectLabel).join(", ")}), creating decisive tempo.`
    });
  }

  if (story.length < 3) {
    const mlDelta = (Number(winner.mlWinProbability || 0) - Number(loser.mlWinProbability || 0)) * 100;
    story.push({
      title: "Pre-Fight Forecast",
      text: `Before the final clash, the model already leaned toward ${winnerLabel} by ${toFixedNumber(mlDelta, 1)}% win odds.`
    });
  }

  return story.slice(0, 4);
}

function isBoosterCard(card) {
  return card?.type === "Booster";
}

function isAssignableCharacter(card) {
  return !!card && card.kind !== "action" && card.type !== "Booster";
}

function countAssignableInHand(hand) {
  return hand.filter((card) => isAssignableCharacter(card)).length;
}

function buildActionCards(extraCount = 0) {
  const cards = [];
  let idx = 1;
  for (const def of ACTION_CARD_DEFS) {
    for (let i = 0; i < 3; i += 1) {
      cards.push({
        id: `action-${def.actionType}-${idx}`,
        kind: "action",
        actionType: def.actionType,
        name: def.name,
        description: def.description,
        anime: "Special",
        type: "Action",
        powerLevel: 0,
        loyalty: 0,
        imageUrl: "https://dummyimage.com/320x180/f7ca83/3f2d1f.png&text=Action+Card"
      });
      idx += 1;
    }
  }
  for (let i = 0; i < extraCount; i += 1) {
    const def = ACTION_CARD_DEFS[i % ACTION_CARD_DEFS.length];
    cards.push({
      id: `action-bonus-${i + 1}`,
      kind: "action",
      actionType: def.actionType,
      name: def.name,
      description: def.description,
      anime: "Special",
      type: "Action",
      powerLevel: 0,
      loyalty: 0,
      imageUrl: "https://dummyimage.com/320x180/f7ca83/3f2d1f.png&text=Action+Card"
    });
  }
  return cards;
}

function decodeEntities(text) {
  return String(text)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function isNoisySketchLine(line) {
  const l = line.toLowerCase();
  if (!l) return true;

  const metadataPrefixes = [
    "age:", "birthday:", "height:", "weight:", "blood type:", "gender:", "status:", "occupation:",
    "debut:", "aliases:", "birthday", "class:", "rank:", "team:", "origin:", "voice actor:"
  ];
  if (metadataPrefixes.some((prefix) => l.startsWith(prefix))) return true;

  const noisyPhrases = [
    "may refer to",
    "list of characters",
    "disambiguation",
    "this article",
    "source:",
    "edited",
    "chronologically",
    "fictional characters created by"
  ];
  if (noisyPhrases.some((phrase) => l.includes(phrase))) return true;

  return false;
}

function buildRoleFallback(card) {
  const roleText = {
    leader: "commanding leader",
    strategist: "tactical strategist",
    brawler: "close-range brawler",
    assassin: "precision assassin",
    tank: "frontline tank",
    healer: "battle healer",
    support: "support specialist",
    mystic: "mystic specialist",
    ranged: "ranged attacker",
    wildcard: "wildcard disruptor"
  };
  const profile = roleText[card.universeRole] || "versatile fighter";
  return `${card.name} is a ${profile} from ${card.anime}.`;
}

function extractCleanDescriptionChunks(source) {
  return decodeEntities(source)
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .flatMap((line) => line.split(/[.!?]+/))
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((line) => !isNoisySketchLine(line));
}

function getCharacterSketch(card) {
  if (!card) return "";
  if (card.kind === "action") return card.description || "Action effect card.";

  const source = card.sketch || card.tagline || card.summary || card.info || "";
  if (!source) {
    return buildRoleFallback(card);
  }

  const chunks = extractCleanDescriptionChunks(source);

  const preferred = chunks.find((line) => /\bis\b/i.test(line) && line.length >= 30)
    || chunks.find((line) => line.length >= 35)
    || "";

  if (!preferred) {
    return buildRoleFallback(card);
  }

  const cleaned = preferred
    .replace(/^\([^)]*\)\s*/, "")
    .replace(/\s+\([^)]*source[^)]*\)$/i, "")
    .trim();

  if (!cleaned || cleaned.length < 16) {
    return buildRoleFallback(card);
  }

  const sentence = cleaned.endsWith(".") ? cleaned : `${cleaned}.`;
  return sentence.slice(0, 130);
}

function getCardDescription(card) {
  if (!card) return "";

  if (card.kind === "action") {
    return card.description || "Use this action card to alter draft tempo.";
  }

  const source = card.description || card.summary || card.info || card.sketch || "";
  if (!source) {
    return buildRoleFallback(card);
  }

  const chunks = extractCleanDescriptionChunks(source);
  if (!chunks.length) {
    return buildRoleFallback(card);
  }

  const combined = chunks
    .filter((line) => line.length >= 24)
    .slice(0, 2)
    .join(". ")
    .replace(/\s+\([^)]*source[^)]*\)$/i, "")
    .trim();

  if (!combined) {
    return buildRoleFallback(card);
  }

  const sentence = combined.endsWith(".") ? combined : `${combined}.`;
  return sentence.slice(0, 180);
}

function FlippableCard({ card, flipped, onToggle }) {
  return (
    <button type="button" className={`flip-card ${flipped ? "is-flipped" : ""}`} onClick={onToggle}>
      <span className="flip-card-inner">
        <span className="flip-face flip-front">
          <img
            className="flip-image"
            src={card.imageUrl || CARD_IMAGE_FALLBACK}
            alt={card.name}
            loading="lazy"
            onError={(e) => {
              if (e.currentTarget.src !== CARD_IMAGE_FALLBACK) {
                e.currentTarget.src = CARD_IMAGE_FALLBACK;
              }
            }}
          />
          <strong>{card.name}</strong>
          <small>{card.anime}</small>
        </span>
        <span className="flip-face flip-back">
          <strong>{card.name}</strong>
          <small>{card.anime}</small>
          <p className="card-description">{getCardDescription(card)}</p>
        </span>
      </span>
    </button>
  );
}

function PlayerPanel({
  playerName,
  team,
  handCards,
  onDropToRole,
  onDragStartCard,
  onDragEndCard,
  draggedCardId,
  flippedCards,
  onToggleCard,
  canDraw,
  onDraw,
  isActive,
  draftedCount,
  readonly,
  boosters = [],
  onDropToBooster,
  boosterCount = 0
}) {
  const teamRoles = Object.entries(team);
  const boosterCards = handCards.filter((c) => !isAssignableCharacter(c));
  const regularCards = handCards.filter((c) => isAssignableCharacter(c));
  const canInteract = isActive && !readonly;

  return (
    <section className="player-panel">
      <h2>{playerName}</h2>
      <p className={`turn-badge ${isActive ? "active" : "waiting"}`}>{isActive ? "Your Turn" : "Waiting"}</p>
      <p className="draft-meta">Drafted: {draftedCount}/10 | Hand: {regularCards.length}/5</p>
      {!readonly && (
        <button className="draw-btn" disabled={!canDraw || !isActive} onClick={onDraw}>
          Draw Next Card
        </button>
      )}

      <div className="role-assignment-grid">
        {teamRoles.map(([role, card]) => (
          <article
            key={`${playerName}-${role}`}
            className={`slot-card ${!card && draggedCardId ? "drop-ready" : ""}`}
            onDragOver={(e) => {
              if (canInteract && !card && draggedCardId) {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (canInteract && !card && draggedCardId) {
                onDropToRole(role);
              }
            }}
          >
            <span className="role-title">{ROLE_LABELS[role]}</span>
            {card ? (
              <FlippableCard card={card} flipped={!!flippedCards[card.id]} onToggle={() => onToggleCard(card.id)} />
            ) : (
              <small>{draggedCardId && !readonly ? "Drop card here" : "Unassigned"}</small>
            )}
          </article>
        ))}
      </div>
      <div className="booster-zone">
        <h3>⚡ Booster Slot ({boosterCount}/2)</h3>
        <div className="booster-slots">
          <article
            className={`booster-slot ${boosters.length ? "filled" : "empty"} ${draggedCardId && handCards.find((c) => c.id === draggedCardId)?.type === "Booster" ? "drop-ready" : ""}`}
            onDragOver={(e) => {
              if (canInteract && boosters.length < 2 && draggedCardId && handCards.find((c) => c.id === draggedCardId)?.type === "Booster") {
                e.preventDefault();
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (canInteract && boosters.length < 2 && draggedCardId && handCards.find((c) => c.id === draggedCardId)?.type === "Booster") {
                onDropToBooster();
              }
            }}
          >
            {boosters.length ? (
              <>
                <div className="booster-stack">
                  {boosters.map((booster) => (
                    <div key={`${playerName}-${booster.id}`} className="booster-mini-card">
                      <img src={booster.imageUrl || CARD_IMAGE_FALLBACK} alt={booster.name} loading="lazy" />
                      <strong>{booster.name}</strong>
                    </div>
                  ))}
                </div>
                <span className="booster-badge">✓ Active x{boosters.length}</span>
              </>
            ) : (
              <small className="booster-empty">Drop booster here</small>
            )}
          </article>
        </div>
      </div>

      <div className="hand-zone">
        <h3>Deck Hand</h3>
        <div className="hand-grid">
          {regularCards.map((card) => (
            <article
              key={`${playerName}-hand-${card.id}`}
              className={`hand-card ${draggedCardId === card.id ? "dragging" : ""}`}
                  draggable={canInteract}
                  onDragStart={() => canInteract && onDragStartCard(card.id)}
              onDragEnd={onDragEndCard}
            >
              <FlippableCard card={card} flipped={!!flippedCards[card.id]} onToggle={() => onToggleCard(card.id)} />
            </article>
          ))}
        </div>

        {boosterCards.length > 0 && (
          <div className="booster-hand-section">
            <h4>Booster Cards in Hand</h4>
            <div className="hand-grid">
              {boosterCards.map((card) => (
                <article
                  key={`${playerName}-booster-hand-${card.id}`}
                  className={`hand-card booster-hand-card ${draggedCardId === card.id ? "dragging" : ""}`}
                  draggable={canInteract && boosterCount < 2}
                  onDragStart={() => canInteract && boosterCount < 2 && onDragStartCard(card.id)}
                  onDragEnd={onDragEndCard}
                >
                  <FlippableCard card={card} flipped={!!flippedCards[card.id]} onToggle={() => onToggleCard(card.id)} />
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const [characters, setCharacters] = useState([]);
  const [gameMode, setGameMode] = useState("pvp");
  const [teamA, setTeamA] = useState(EMPTY_TEAM);
  const [teamB, setTeamB] = useState(EMPTY_TEAM);
  const [handA, setHandA] = useState([]);
  const [handB, setHandB] = useState([]);
  const [draftedCount, setDraftedCount] = useState({ A: 0, B: 0 });
  const [currentTurn, setCurrentTurn] = useState("A");
  const [draftPile, setDraftPile] = useState([]);
  const [skips, setSkips] = useState({ A: 1, B: 1 });
  const [swapA, setSwapA] = useState({ from: "captain", to: "viceCaptain" });
  const [swapB, setSwapB] = useState({ from: "captain", to: "viceCaptain" });
  const [battleResult, setBattleResult] = useState(null);
  const [showVictoryOverlay, setShowVictoryOverlay] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [scorecard, setScorecard] = useState(null);
  const [showScorecard, setShowScorecard] = useState(false);
  const [pendingMode, setPendingMode] = useState("pvp");
  const [currentPage, setCurrentPage] = useState(() => (window.location.pathname === "/battle" ? "battle" : "lobby"));
  const [showLobbyOverlay, setShowLobbyOverlay] = useState(false);
  const [introCards, setIntroCards] = useState({ left: [], right: [] });
  const [error, setError] = useState("");
  const [aiStatus, setAiStatus] = useState("");
  const [aiRevealCard, setAiRevealCard] = useState(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [dragCardByPlayer, setDragCardByPlayer] = useState({ A: null, B: null });
  const [flippedCards, setFlippedCards] = useState({});
  const [boostersA, setBoostersA] = useState([]);
  const [boostersB, setBoostersB] = useState([]);
  const [boosterDrawnCount, setBoosterDrawnCount] = useState({ A: 0, B: 0 });
  const [boosterLocks, setBoosterLocks] = useState({ A: 0, B: 0 });
  const [drawLocks, setDrawLocks] = useState({ A: 0, B: 0 });
  const [discardPiles, setDiscardPiles] = useState({ A: [], B: [] });
  const [turnSkips, setTurnSkips] = useState({ A: 0, B: 0 });

  const audioRef = useRef(null);

  const AI_PICK_DELAY_MS = 900;
  const AI_REVEAL_DELAY_MS = 2000;

  async function apiRequest(url, options = {}) {
    const res = await fetch(url, options);
    const rawText = await res.text();

    let payload = {};
    if (rawText) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = { error: rawText };
      }
    }

    if (!res.ok) {
      throw new Error(payload.error || `Request failed with status ${res.status}`);
    }

    return payload;
  }

  function playTone(freq = 440, duration = 0.08, type = "sine") {
    try {
      if (!audioRef.current) {
        audioRef.current = new window.AudioContext();
      }
      const ctx = audioRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const now = ctx.currentTime;
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    } catch {
      // Skip sound if browser blocks autoplay.
    }
  }

  useEffect(() => {
    apiRequest("/api/characters")
      .then((data) => {
        setCharacters(data.characters || []);
      })
      .catch((err) => setError(err.message || "Could not load character API."));
  }, []);

  useEffect(() => {
    const seen = window.localStorage.getItem("arb_seen_rules_v2");
    if (!seen) {
      setShowRules(true);
      window.localStorage.setItem("arb_seen_rules_v2", "1");
    }
  }, []);

  useEffect(() => {
    async function fetchScorecard() {
      try {
        const payload = await apiRequest("/api/scorecard");
        setScorecard(payload);
      } catch {
        // Keep lobby usable if scorecard API is unavailable.
      }
    }
    fetchScorecard();
  }, []);

  useEffect(() => {
    if (!characters.length || currentPage !== "lobby") {
      return;
    }

    setShowLobbyOverlay(false);

    const shuffled = [...characters].sort(() => Math.random() - 0.5);
    setIntroCards({
      left: shuffled.slice(0, 5),
      right: shuffled.slice(5, 10)
    });

    const timer = setTimeout(() => {
      setShowLobbyOverlay(true);
    }, 1100);

    return () => clearTimeout(timer);
  }, [characters, currentPage]);

  useEffect(() => {
    function onPopstate() {
      setCurrentPage(window.location.pathname === "/battle" ? "battle" : "lobby");
    }

    window.addEventListener("popstate", onPopstate);
    return () => window.removeEventListener("popstate", onPopstate);
  }, []);

  function navigateTo(path) {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setCurrentPage(path === "/battle" ? "battle" : "lobby");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pullNextCardForPlayer(player, pile, boosterCounts) {
    let attempts = pile.length;
    while (attempts > 0) {
      const card = pile.shift();
      if (!card) return null;

      if (isBoosterCard(card) && (boosterCounts[player] || 0) >= 4) {
        pile.push(card);
        attempts -= 1;
        continue;
      }

      return card;
    }

    return null;
  }

  function startDraft(nextMode = gameMode) {
    if (!characters.length) {
      setError("Characters are still loading.");
      return;
    }

    const base = shuffle(characters.map((c) => ({ ...c, kind: "character" })));
    const nonBoosterPool = base.filter((c) => c.type !== "Booster");

    let firstA = [];
    let firstB = [];
    let remainder = [];

    if (nonBoosterPool.length >= 2) {
      const guaranteedA = nonBoosterPool[0];
      const guaranteedB = nonBoosterPool[1];
      const usedIds = new Set([guaranteedA.id, guaranteedB.id]);
      const otherPool = shuffle(base.filter((c) => !usedIds.has(c.id)));

      firstA = [guaranteedA, ...otherPool.slice(0, 2)];
      firstB = [guaranteedB, ...otherPool.slice(2, 4)];
      remainder = otherPool.slice(4);
    } else {
      firstA = base.slice(0, 3);
      firstB = base.slice(3, 6);
      remainder = base.slice(6);
    }

    const extraActionCount = base.length === 80 ? 20 : 0;
    const actionCards = buildActionCards(extraActionCount);
    const pile = shuffle([...remainder, ...actionCards]);

    setGameMode(nextMode);
    setTeamA(EMPTY_TEAM);
    setTeamB(EMPTY_TEAM);
    setHandA(firstA);
    setHandB(firstB);
    setDraftPile(pile);
    setDraftedCount({ A: 3, B: 3 });
    setCurrentTurn("A");
    setSkips({ A: 1, B: 1 });
    setSwapA({ from: "captain", to: "viceCaptain" });
    setSwapB({ from: "captain", to: "viceCaptain" });
    setBattleResult(null);
    setShowVictoryOverlay(false);
    setAiRevealCard(null);
    setAiStatus("");
    setAiBusy(false);
    setDragCardByPlayer({ A: null, B: null });
    setFlippedCards({});
    setError("");
    setBoostersA([]);
    setBoostersB([]);
    setBoosterDrawnCount({ A: 0, B: 0 });
    setBoosterLocks({ A: 0, B: 0 });
    setDrawLocks({ A: 0, B: 0 });
    setDiscardPiles({ A: [], B: [] });
    setTurnSkips({ A: 0, B: 0 });
  }

  useEffect(() => {
    if (!characters.length) {
      return;
    }
    startDraft("pvp");
  }, [characters]);

  function assignFromHand(player, role, cardId) {
    const team = player === "A" ? teamA : teamB;
    const hand = player === "A" ? handA : handB;

    const current = team[role];

    if (current) {
      setError("Role lock is active. Assigned cards cannot be changed.");
      return;
    }

    const chosen = hand.find((c) => c.id === cardId);
    if (!chosen) return;

    const nextHand = hand.filter((c) => c.id !== cardId);
    if (current) {
      nextHand.push(current);
    }

    const nextTeam = { ...team, [role]: chosen };

    if (player === "A") {
      setTeamA(nextTeam);
      setHandA(nextHand);
    } else {
      setTeamB(nextTeam);
      setHandB(nextHand);
    }

    setBattleResult(null);
    playTone(760, 0.08, "square");
  }

  function startDragCard(player, cardId) {
    setDragCardByPlayer((prev) => ({ ...prev, [player]: cardId }));
  }

  function endDragCard(player) {
    setDragCardByPlayer((prev) => ({ ...prev, [player]: null }));
  }

  function dropCardToRole(player, role) {
    const cardId = dragCardByPlayer[player];
    if (!cardId) return;
    assignFromHand(player, role, cardId);
    setDragCardByPlayer((prev) => ({ ...prev, [player]: null }));
  }

  function toggleCardFlip(cardId) {
    setFlippedCards((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  }

  function dropBoosterCard(player) {
    const cardId = dragCardByPlayer[player];
    if (!cardId) return;
    if (currentTurn !== player) {
      setError("Booster cards can only be used on your turn.");
      return;
    }
    if ((boosterLocks[player] || 0) > 0) {
      setBoosterLocks((prev) => ({ ...prev, [player]: Math.max(0, (prev[player] || 0) - 1) }));
      setError("Booster slot is locked for this turn.");
      return;
    }

    const hands = { A: [...handA], B: [...handB] };
    const teams = { A: { ...teamA }, B: { ...teamB } };
    const drafted = { ...draftedCount };
    const pile = [...draftPile];
    const boosterCounts = { ...boosterDrawnCount };
    const locks = { ...boosterLocks };
    const drawLockState = { ...drawLocks };
    const discards = { A: [...discardPiles.A], B: [...discardPiles.B] };
    const turnSkipsState = { ...turnSkips };
    const boosters = player === "A" ? boostersA : boostersB;

    if (boosters.length >= 2) {
      setError("Only 2 boosters can be used in this slot.");
      return;
    }

    const card = hands[player].find((c) => c.id === cardId);
    if (!card || card.type !== "Booster") return;

    hands[player] = hands[player].filter((c) => c.id !== cardId);
    const nextBoosters = [...boosters, card];

    let effectMessage = `${card.name} activated.`;
    const opponent = nextPlayer(player);

    if (card.effect === "draw_two_cards") {
      let drawn = 0;
      while (drawn < 2 && drafted[player] < 10 && pile.length && countAssignableInHand(hands[player]) < 5) {
        const extra = pullNextCardForPlayer(player, pile, boosterCounts);
        if (!extra) break;
        if (isBoosterCard(extra)) boosterCounts[player] += 1;
        if (isAssignableCharacter(extra)) drafted[player] += 1;
        hands[player].push(extra);
        drawn += 1;
      }
      effectMessage = `${card.name}: drew ${drawn} extra card${drawn === 1 ? "" : "s"}.`;
    } else if (card.effect === "reverse_turn") {
      turnSkipsState[opponent] = (turnSkipsState[opponent] || 0) + 1;
      effectMessage = `${card.name}: ${opponent === "A" ? "Player 1" : "Player 2"} turn will be skipped.`;
    } else if (card.effect === "swap_one_card") {
      effectMessage = `${card.name}: ${applySwapOneCard(player, teams, hands, pile)}`;
    } else if (card.effect === "steal_card") {
      if (hands[opponent].length && countAssignableInHand(hands[player]) < 5) {
        const stolenIdx = Math.floor(Math.random() * hands[opponent].length);
        const stolen = hands[opponent][stolenIdx];
        hands[opponent] = hands[opponent].filter((_, idx) => idx !== stolenIdx);
        hands[player].push(stolen);
        effectMessage = `${card.name}: randomly stole ${stolen.name}.`;
      } else {
        effectMessage = `${card.name}: no card could be stolen.`;
      }
    } else if (card.effect === "lock_hand") {
      locks[opponent] = 1;
      drawLockState[opponent] = 1;
      effectMessage = `${card.name}: opponent draw and booster slot locked for next turn.`;
    } else if (card.effect === "reload_deck") {
      const returned = discards[player].length;
      if (returned > 0) {
        const refreshed = shuffle([...pile, ...discards[player]]);
        pile.length = 0;
        pile.push(...refreshed);
        discards[player] = [];
      }
      effectMessage = `${card.name}: reshuffled ${returned} discard card${returned === 1 ? "" : "s"} into deck.`;
    }

    if (player === "A") {
      setHandA(hands.A);
      setHandB(hands.B);
      setTeamA(teams.A);
      setTeamB(teams.B);
      setDraftedCount(drafted);
      setDraftPile(pile);
      setBoosterDrawnCount(boosterCounts);
      setBoosterLocks(locks);
      setDrawLocks(drawLockState);
      setDiscardPiles(discards);
      setTurnSkips(turnSkipsState);
      setBoostersA(nextBoosters);
      setAiStatus(effectMessage);
    } else {
      setHandA(hands.A);
      setHandB(hands.B);
      setTeamA(teams.A);
      setTeamB(teams.B);
      setDraftedCount(drafted);
      setDraftPile(pile);
      setBoosterDrawnCount(boosterCounts);
      setBoosterLocks(locks);
      setDrawLocks(drawLockState);
      setDiscardPiles(discards);
      setTurnSkips(turnSkipsState);
      setBoostersB(nextBoosters);
    }

    setDragCardByPlayer((prev) => ({ ...prev, [player]: null }));
    setError("");

    playTone(880, 0.12, "sine");
  }

  function applySwapOneCard(player, teams, hands, pile) {
    const team = teams[player];
    const hand = hands[player];
    const playableHand = hand.filter((c) => isAssignableCharacter(c));

    if (!playableHand.length) {
      return "Swap One Card fizzled (no assignable cards in hand).";
    }

    const assigned = Object.entries(team).filter(([, c]) => !!c);
    if (assigned.length) {
      let weakestRole = assigned[0][0];
      let weakestScore = scoreCandidate(weakestRole, team[weakestRole]);
      for (const [role, card] of assigned) {
        const s = scoreCandidate(role, card);
        if (s < weakestScore) {
          weakestScore = s;
          weakestRole = role;
        }
      }

      let bestHand = playableHand[0];
      let bestScore = scoreCandidate(weakestRole, bestHand);
      for (const card of playableHand) {
        const s = scoreCandidate(weakestRole, card);
        if (s > bestScore) {
          bestScore = s;
          bestHand = card;
        }
      }

      const outgoing = team[weakestRole];
      teams[player] = { ...team, [weakestRole]: bestHand };
      hands[player] = [...hand.filter((c) => c.id !== bestHand.id), outgoing];

      if (bestScore > weakestScore) {
        return `Swap One Card upgraded ${ROLE_LABELS[weakestRole]}.`;
      }

      return `Swap One Card swapped ${ROLE_LABELS[weakestRole]}.`;
    }

    if (!pile?.length) {
      return "Swap One Card fizzled (pile empty).";
    }

    const nonBoosterPile = pile.filter((c) => isAssignableCharacter(c));
    if (!nonBoosterPile.length) {
      return "Swap One Card fizzled (no valid pile cards).";
    }

    const weakestHand = playableHand.reduce((min, card) => (card.powerLevel < min.powerLevel ? card : min), playableHand[0]);
    const strongestPile = nonBoosterPile.reduce((max, card) => (card.powerLevel > max.powerLevel ? card : max), nonBoosterPile[0]);

    if (strongestPile.powerLevel <= weakestHand.powerLevel) {
      return "Swap One Card found no stronger replacement.";
    }

    hands[player] = [...hand.filter((c) => c.id !== weakestHand.id), strongestPile];
    const replaceIdx = pile.findIndex((c) => c.id === strongestPile.id);
    if (replaceIdx >= 0) {
      pile.splice(replaceIdx, 1);
      pile.push(weakestHand);
    }

    return "Swap One Card upgraded hand strength.";
  }

  function drawOne(player, { forAi = false } = {}) {
    if (currentTurn !== player && !forAi) {
      return;
    }

    const hands = { A: [...handA], B: [...handB] };
    const teams = { A: { ...teamA }, B: { ...teamB } };
    const drafted = { ...draftedCount };
    const boosterCounts = { ...boosterDrawnCount };
    const locks = { ...boosterLocks };
    const drawLockState = { ...drawLocks };
    const discards = { A: [...discardPiles.A], B: [...discardPiles.B] };
    const turnSkipsState = { ...turnSkips };
    const pile = [...draftPile];

    if (locks[player] > 0) {
      locks[player] -= 1;
    }

    if ((drawLockState[player] || 0) > 0) {
      drawLockState[player] -= 1;
      setDrawLocks(drawLockState);
      setBoosterLocks(locks);
      const { nextTurn, nextSkips } = resolveNextTurn(player, false, turnSkipsState);
      setTurnSkips(nextSkips);
      setCurrentTurn(nextTurn);
      setError(`${player === "A" ? "Your" : "Opponent"} draw phase is locked this turn.`);
      return;
    }

    if (drafted[player] >= 10) {
      const { nextTurn, nextSkips } = resolveNextTurn(player, false, turnSkipsState);
      setTurnSkips(nextSkips);
      setCurrentTurn(nextTurn);
      return;
    }

    if (!forAi && countAssignableInHand(hands[player]) >= 5) {
      setError("Hand is full. Turn passed to keep battle flowing.");
      setBoosterLocks(locks);
      const { nextTurn, nextSkips } = resolveNextTurn(player, false, turnSkipsState);
      setTurnSkips(nextSkips);
      setCurrentTurn(nextTurn);
      return;
    }

    if (!pile.length) {
      setError("Draft pile is empty.");
      const { nextTurn, nextSkips } = resolveNextTurn(player, false, turnSkipsState);
      setTurnSkips(nextSkips);
      setCurrentTurn(nextTurn);
      return;
    }

    let keepTurn = false;
    let info = "";

    function processCard(card) {
      if (!card) return;

      if (isAssignableCharacter(card)) {
        drafted[player] += 1;
      }
      if (isBoosterCard(card)) {
        boosterCounts[player] += 1;
      }

      if (card.kind === "action") {
        if (card.actionType === "draw_one_more") {
          info = "Action: Draw One More";
          if (drafted[player] < 10 && pile.length) {
            const bonus = pullNextCardForPlayer(player, pile, boosterCounts);
            processCard(bonus);
          }
          return;
        }

        if (card.actionType === "reverse_turn") {
          keepTurn = true;
          info = "Action: Reverse (you play again).";
          return;
        }

        if (card.actionType === "swap_one_card") {
          info = `Action: ${applySwapOneCard(player, teams, hands, pile)}`;
          return;
        }
      }

      if (countAssignableInHand(hands[player]) >= 5) {
        info = "Hand was full, drawn card was discarded.";
        discards[player].push(card);
        return;
      }

      hands[player].push(card);
      info = `${card.name} added to hand.`;
    }

    const drawn = pullNextCardForPlayer(player, pile, boosterCounts);
    if (!drawn) {
      setError("No draftable cards left for this player.");
      return;
    }
    processCard(drawn);

    setHandA(hands.A);
    setHandB(hands.B);
    setTeamA(teams.A);
    setTeamB(teams.B);
    setDraftedCount(drafted);
    setBoosterDrawnCount(boosterCounts);
    setBoosterLocks(locks);
    setDrawLocks(drawLockState);
    setDiscardPiles(discards);
    setDraftPile(pile);
    setBattleResult(null);
    setError("");
    playTone(560, 0.1, "triangle");

    if (gameMode === "ai") {
      const { nextTurn, nextSkips } = resolveNextTurn(player, keepTurn, turnSkipsState);
      setTurnSkips(nextSkips);
      setCurrentTurn(nextTurn);
      if (player === "A") {
        setAiStatus(info);
      }
      return;
    }

    const { nextTurn, nextSkips } = resolveNextTurn(player, keepTurn, turnSkipsState);
    setTurnSkips(nextSkips);
    setCurrentTurn(nextTurn);
  }

  function aiBestAssignment(team, hand) {
    const openRoles = Object.entries(team)
      .filter(([, value]) => !value)
      .map(([role]) => role);

    const candidateHand = hand.filter((card) => card.type !== "Booster");

    if (!openRoles.length || !candidateHand.length) return null;

    let best = null;

    for (const card of candidateHand) {
      for (const role of openRoles) {
        const score = scoreCandidate(role, card);
        if (!best || score > best.score) {
          best = { role, card, score };
        }
      }
    }

    return best;
  }

  useEffect(() => {
    if (gameMode !== "ai" || currentTurn !== "B" || aiBusy) {
      return;
    }

    if (draftedCount.B >= 10) {
      setCurrentTurn("A");
      return;
    }

    setAiBusy(true);

    async function runAiTurn() {
      try {
        setAiStatus("AI is choosing...");
        await new Promise((resolve) => setTimeout(resolve, AI_PICK_DELAY_MS));

        const hands = { A: [...handA], B: [...handB] };
        const teams = { A: { ...teamA }, B: { ...teamB } };
        const boosters = { A: [...boostersA], B: [...boostersB] };
        const drafted = { ...draftedCount };
        const boosterCounts = { ...boosterDrawnCount };
        const locks = { ...boosterLocks };
        const drawLockState = { ...drawLocks };
        const discards = { A: [...discardPiles.A], B: [...discardPiles.B] };
        const turnSkipsState = { ...turnSkips };
        const pile = [...draftPile];
        let aiBoosterUsedThisTurn = false;

        function aiUseBoosterFromHand() {
          if (aiBoosterUsedThisTurn) return false;
          if (locks.B > 0) {
            locks.B -= 1;
            setAiStatus("AI booster slot is locked this turn.");
            return false;
          }
          if (boosters.B.length >= 2) return false;
          const booster = hands.B.find((c) => c.type === "Booster");
          if (!booster) return false;

          hands.B = hands.B.filter((c) => c.id !== booster.id);
          boosters.B = [...boosters.B, booster];

          if (booster.effect === "draw_two_cards") {
            let drawn = 0;
            while (drawn < 2 && drafted.B < 10 && pile.length && countAssignableInHand(hands.B) < 5) {
              const extra = pullNextCardForPlayer("B", pile, boosterCounts);
              if (!extra) break;
              hands.B.push(extra);
              if (isAssignableCharacter(extra)) drafted.B += 1;
              if (isBoosterCard(extra)) boosterCounts.B += 1;
              drawn += 1;
            }
            setAiStatus(`AI activated ${booster.name} and drew ${drawn} extra.`);
          } else if (booster.effect === "swap_one_card") {
            setAiStatus(`AI activated ${booster.name}: ${applySwapOneCard("B", teams, hands, pile)}`);
          } else if (booster.effect === "reverse_turn") {
            turnSkipsState.A = (turnSkipsState.A || 0) + 1;
            setAiStatus(`AI activated ${booster.name}: your next turn will be skipped.`);
          } else if (booster.effect === "lock_hand") {
            locks.A = 1;
            drawLockState.A = 1;
            setAiStatus(`AI activated ${booster.name}: your draw and booster slot are locked next turn.`);
          } else if (booster.effect === "steal_card") {
            if (hands.A.length && countAssignableInHand(hands.B) < 5) {
              const stolenIdx = Math.floor(Math.random() * hands.A.length);
              const stolen = hands.A[stolenIdx];
              hands.A = hands.A.filter((_, idx) => idx !== stolenIdx);
              hands.B.push(stolen);
              setAiStatus(`AI activated ${booster.name} and randomly stole ${stolen.name}.`);
            } else {
              setAiStatus(`AI activated ${booster.name}, but no card could be stolen.`);
            }
          } else if (booster.effect === "reload_deck") {
            const returned = discards.B.length;
            if (returned > 0) {
              const refreshed = shuffle([...pile, ...discards.B]);
              pile.length = 0;
              pile.push(...refreshed);
              discards.B = [];
            }
            setAiStatus(`AI activated ${booster.name} and reloaded ${returned} discard cards.`);
          } else {
            setAiStatus(`AI activated booster: ${booster.name}.`);
          }
          aiBoosterUsedThisTurn = true;
          return true;
        }

        aiUseBoosterFromHand();

        if ((drawLockState.B || 0) > 0) {
          drawLockState.B -= 1;
          setAiStatus("AI draw phase is locked and skips drawing.");
          const autoLocked = aiBestAssignment(teams.B, hands.B);
          if (autoLocked) {
            teams.B = { ...teams.B, [autoLocked.role]: autoLocked.card };
            hands.B = hands.B.filter((c) => c.id !== autoLocked.card.id);
            setAiStatus(`AI assigned ${autoLocked.card.name} as ${ROLE_LABELS[autoLocked.role]} while draw-locked.`);
          }

          setTeamA(teams.A);
          setTeamB(teams.B);
          setHandA(hands.A);
          setHandB(hands.B);
          setBoostersB(boosters.B);
          setDraftedCount(drafted);
          setBoosterDrawnCount(boosterCounts);
          setBoosterLocks(locks);
          setDrawLocks(drawLockState);
          setDiscardPiles(discards);
          setTurnSkips(turnSkipsState);
          setDraftPile(pile);
          setBattleResult(null);

          const { nextTurn, nextSkips } = resolveNextTurn("B", false, turnSkipsState);
          setTurnSkips(nextSkips);
          setCurrentTurn(nextTurn);
          return;
        }

        if (countAssignableInHand(hands.B) >= 5 && !isReady(teams.B)) {
          const auto = aiBestAssignment(teams.B, hands.B);
          if (auto) {
            teams.B = { ...teams.B, [auto.role]: auto.card };
            hands.B = hands.B.filter((c) => c.id !== auto.card.id);
            setAiStatus(`AI assigned ${auto.card.name} as ${ROLE_LABELS[auto.role]}.`);
            setTeamB(teams.B);
            setHandB(hands.B);
          }
        }

        if (drafted.B >= 10 || !pile.length) {
          setCurrentTurn("A");
          return;
        }

        const drawn = pullNextCardForPlayer("B", pile, boosterCounts);
        if (!drawn) {
          setCurrentTurn("A");
          return;
        }
        if (isAssignableCharacter(drawn)) drafted.B += 1;
        if (isBoosterCard(drawn)) boosterCounts.B += 1;

        let keepTurn = false;

        if (drawn.kind === "action") {
          if (drawn.actionType === "draw_one_more") {
            setAiStatus("AI played Draw One More.");
            if (drafted.B < 10 && pile.length) {
              const bonus = pullNextCardForPlayer("B", pile, boosterCounts);
              if (!bonus) {
                setCurrentTurn("A");
                return;
              }
              if (isAssignableCharacter(bonus)) drafted.B += 1;
              if (isBoosterCard(bonus)) boosterCounts.B += 1;
              if (bonus.kind === "character") {
                setAiRevealCard(bonus);
                await new Promise((resolve) => setTimeout(resolve, AI_REVEAL_DELAY_MS));
                setAiRevealCard(null);
                if (countAssignableInHand(hands.B) < 5) hands.B.push(bonus);
                else discards.B.push(bonus);
              }
            }
          } else if (drawn.actionType === "reverse_turn") {
            keepTurn = true;
            setAiStatus("AI played Reverse and keeps turn.");
          } else if (drawn.actionType === "swap_one_card") {
            setAiStatus(applySwapOneCard("B", teams, hands, pile));
          }
        } else {
          setAiRevealCard(drawn);
          await new Promise((resolve) => setTimeout(resolve, AI_REVEAL_DELAY_MS));
          setAiRevealCard(null);
          if (countAssignableInHand(hands.B) < 5) {
            hands.B.push(drawn);
          } else {
            discards.B.push(drawn);
          }
        }

        aiUseBoosterFromHand();

        const auto = aiBestAssignment(teams.B, hands.B);
        if (auto) {
          teams.B = { ...teams.B, [auto.role]: auto.card };
          hands.B = hands.B.filter((c) => c.id !== auto.card.id);
          setAiStatus(`AI assigned ${auto.card.name} as ${ROLE_LABELS[auto.role]}.`);
        }

        setTeamA(teams.A);
        setTeamB(teams.B);
        setHandA(hands.A);
        setHandB(hands.B);
        setBoostersB(boosters.B);
        setDraftedCount(drafted);
        setBoosterDrawnCount(boosterCounts);
        setBoosterLocks(locks);
        setDrawLocks(drawLockState);
        setDiscardPiles(discards);
        setTurnSkips(turnSkipsState);
        setDraftPile(pile);
        setBattleResult(null);

        const { nextTurn, nextSkips } = resolveNextTurn("B", keepTurn, turnSkipsState);
        setTurnSkips(nextSkips);
        setCurrentTurn(nextTurn);
      } catch {
        setError("AI turn failed.");
        setCurrentTurn("A");
      } finally {
        setAiBusy(false);
      }
    }

    runAiTurn();
  }, [gameMode, currentTurn, aiBusy, handA, handB, teamA, teamB, boostersA, boostersB, draftedCount, boosterDrawnCount, boosterLocks, drawLocks, discardPiles, turnSkips, draftPile]);

  useEffect(() => {
    if (currentPage !== "battle") {
      return;
    }

    const active = currentTurn;
    const waiting = nextPlayer(active);
    const activeExhausted = (draftedCount[active] || 0) >= 10;
    const waitingExhausted = (draftedCount[waiting] || 0) >= 10;

    // If active player has no draws left but opponent still can play, auto-pass turn.
    if (!activeExhausted || waitingExhausted) {
      return;
    }

    const { nextTurn, nextSkips } = resolveNextTurn(active, false, turnSkips);
    if (nextTurn !== currentTurn) {
      setTurnSkips(nextSkips);
      setCurrentTurn(nextTurn);
      setError("");
    }
  }, [currentPage, currentTurn, draftedCount, turnSkips]);

  function swapTeamCards(player) {
    const team = player === "A" ? teamA : teamB;
    const choice = player === "A" ? swapA : swapB;

    if (skips[player] < 1) return;
    if (!isReady(team)) return;
    if (choice.from === choice.to) {
      setError("Swap needs two different positions.");
      return;
    }

    const next = { ...team };
    const temp = next[choice.from];
    next[choice.from] = next[choice.to];
    next[choice.to] = temp;

    if (player === "A") setTeamA(next);
    else setTeamB(next);

    setSkips((prev) => ({ ...prev, [player]: 0 }));
    setBattleResult(null);
    playTone(680, 0.12, "triangle");
  }

  function teamDraftValue(team) {
    return Object.entries(team).reduce((sum, [role, card]) => {
      if (!card) return sum;
      return sum + scoreCandidate(role, card);
    }, 0);
  }

  function findBestSwapChoice(team) {
    const roles = Object.keys(team);
    let bestChoice = null;
    let bestGain = 0;
    const baseValue = teamDraftValue(team);

    for (let i = 0; i < roles.length; i += 1) {
      for (let j = i + 1; j < roles.length; j += 1) {
        const from = roles[i];
        const to = roles[j];
        const swapped = { ...team, [from]: team[to], [to]: team[from] };
        const gain = teamDraftValue(swapped) - baseValue;
        if (gain > bestGain) {
          bestGain = gain;
          bestChoice = { from, to };
        }
      }
    }

    return bestChoice;
  }

  function autoSwapAiTeam() {
    const suggestion = findBestSwapChoice(teamB);
    if (!suggestion) {
      setError("AI found no beneficial swap.");
      return;
    }

    setSwapB(suggestion);

    const next = { ...teamB };
    const temp = next[suggestion.from];
    next[suggestion.from] = next[suggestion.to];
    next[suggestion.to] = temp;

    setTeamB(next);
    setSkips((prev) => ({ ...prev, B: 0 }));
    setBattleResult(null);
    setAiStatus(`AI swapped ${ROLE_LABELS[suggestion.from]} and ${ROLE_LABELS[suggestion.to]}.`);
    playTone(680, 0.12, "triangle");
  }

  async function fight() {
    if (!isReady(teamA) || !isReady(teamB)) {
      setError("Both teams need all 5 roles assigned.");
      return;
    }

    setError("");
    const body = {
      mode: gameMode,
      teamA: {
        name: gameMode === "ai" ? "You" : "Player 1",
        roles: Object.fromEntries(Object.entries(teamA).map(([r, c]) => [r, c.id])),
        boosterEffects: boostersA.map((b) => b.effect)
      },
      teamB: {
        name: gameMode === "ai" ? "AI" : "Player 2",
        roles: Object.fromEntries(Object.entries(teamB).map(([r, c]) => [r, c.id])),
        boosterEffects: boostersB.map((b) => b.effect)
      }
    };

    let payload;
    try {
      payload = await apiRequest("/api/battle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (err) {
      setError(err.message || "Battle failed.");
      return;
    }

    setBattleResult(payload);
    setShowVictoryOverlay(payload.winner !== "draw");

    try {
      const latestScore = await apiRequest("/api/scorecard");
      setScorecard(latestScore);
    } catch {
      // Skip scorecard refresh silently if endpoint is unavailable.
    }

    if (payload.winner === "draw") {
      playTone(380, 0.2, "sine");
    } else {
      playTone(620, 0.12, "sawtooth");
      playTone(820, 0.2, "triangle");
    }
  }

  function resetGame() {
    startDraft(gameMode);
    playTone(300, 0.07, "sine");
  }

  const winnerTeam =
    battleResult?.winner === "player1" ? teamA : battleResult?.winner === "player2" ? teamB : null;
  const winnerName =
    battleResult?.winner === "player1"
      ? gameMode === "ai"
        ? "You"
        : "Player 1"
      : battleResult?.winner === "player2"
      ? gameMode === "ai"
        ? "AI"
        : "Player 2"
      : "";
  const playerOneLabel = gameMode === "ai" ? "You" : "Player 1";
  const playerTwoLabel = gameMode === "ai" ? "AI" : "Player 2";
  const breakdownA = battleResult?.breakdown?.player1;
  const breakdownB = battleResult?.breakdown?.player2;
  const battleStory = battleResult
    ? getBattleStory(battleResult, playerOneLabel, playerTwoLabel, teamA, teamB)
    : [];

  const canDrawA = currentTurn === "A" && draftedCount.A < 10 && countAssignableInHand(handA) < 5 && draftPile.length > 0;
  const canDrawB = currentTurn === "B" && draftedCount.B < 10 && countAssignableInHand(handB) < 5 && draftPile.length > 0;
  const canBattle = isReady(teamA) && isReady(teamB);
  const draftPressure = Math.round(((draftedCount.A + draftedCount.B) / 20) * 100);

  function enterBattlePage() {
    startDraft(pendingMode);
    navigateTo("/battle");
  }

  return (
    <main className={`app-shell ${currentPage === "battle" ? "battle-shell" : "lobby-shell"}`}>
      {showRules && (
        <section className="rules-panel">
          <h3>Quick Role Rules</h3>
          <p><strong>Captain:</strong> highest battle impact slot.</p>
          <p><strong>Vice Captain:</strong> strong secondary damage slot.</p>
          <p><strong>Healer:</strong> sustain and stability role.</p>
          <p><strong>Support:</strong> team synergy and utility role.</p>
          <p><strong>Traitor:</strong> risky slot, low-loyalty picks are better here.</p>
          <p><strong>Draft Rule:</strong> start with 3 cards each, draw 1 per turn to 10 total, hand max 5.</p>
          <p><strong>Role Lock:</strong> once assigned to a role, that card cannot be changed.</p>
          <p><strong>Sketch Hint:</strong> use each card's sketch line to pick by lore knowledge.</p>
          <button className="rules-btn" onClick={() => setShowRules(false)}>Got it</button>
        </section>
      )}

      {showVictoryOverlay && battleResult && battleResult.winner !== "draw" && winnerTeam && (
        <section className="victory-overlay" role="dialog" aria-modal="true" aria-label="Winning team showcase">
          <div className="victory-panel">
            <h2>{winnerName} Victory Parade</h2>
            <p>Final lineup reveal</p>
            <div className="victory-list">
              {Object.entries(winnerTeam).map(([role, card], idx) => (
                <article key={`overlay-${role}`} className="victory-item" style={{ animationDelay: `${180 + idx * 190}ms` }}>
                  <span>{ROLE_LABELS[role]}</span>
                  <img src={card.imageUrl} alt={card.name} loading="lazy" />
                  <strong>{card.name}</strong>
                </article>
              ))}
            </div>
            <button className="victory-continue-btn" onClick={() => setShowVictoryOverlay(false)}>
              Continue
            </button>
          </div>
        </section>
      )}

      {currentPage === "lobby" ? (
        <>
          <section className="lobby-vs-walls" aria-label="Versus background showcase">
            <div className="intro-column intro-left-wall">
              {introCards.left.map((fighter) => (
                <article key={`intro-left-${fighter.id}`} className="intro-fighter">
                  <img src={fighter.imageUrl || CARD_IMAGE_FALLBACK} alt={fighter.name} loading="lazy" />
                </article>
              ))}
            </div>
            <div className="intro-vs-core">VS</div>
            <div className="intro-column intro-right-wall">
              {introCards.right.map((fighter) => (
                <article key={`intro-right-${fighter.id}`} className="intro-fighter">
                  <img src={fighter.imageUrl || CARD_IMAGE_FALLBACK} alt={fighter.name} loading="lazy" />
                </article>
              ))}
            </div>
          </section>

          <div className={`lobby-overlay-stack ${showLobbyOverlay ? "show" : ""}`}>
            <header className="lobby-header">
              <h1>animeroom battle</h1>
              <p>Front Desk: choose mode, review scoreboard, then launch full-screen battle.</p>
              <p>Draft rules stay the same: 3 starter cards, draw to 10, hand cap 5, role lock enabled.</p>
              <div className="mode-row lobby-actions">
                <label htmlFor="mode-select">Game Mode</label>
                <select id="mode-select" value={pendingMode} onChange={(e) => setPendingMode(e.target.value)}>
                  <option value="pvp">Player vs Player</option>
                  <option value="ai">Player vs AI</option>
                </select>
                <button className="lets-battle-btn" onClick={enterBattlePage}>Let&apos;s Battle</button>
              </div>
            </header>

            <section className="scorecard-actions">
              <button className="scorecard-toggle-btn" onClick={() => setShowScorecard((prev) => !prev)}>
                {showScorecard ? "Hide Scorecard" : "Show Scorecard"}
              </button>
            </section>

            {showScorecard && (
              <section className="scorecard-panel">
                <div className="scorecard-header">
                  <h3>⚔️ Scoreboard</h3>
                </div>
                {!scorecard ? (
                  <p className="scorecard-loading">Loading scorecard...</p>
                ) : (
                  <div className="scorecard-grid">
                    <div className="stat-card stat-total">
                      <div className="stat-label">Total Matches</div>
                      <div className="stat-value">{scorecard.totalMatches || 0}</div>
                    </div>
                    <div className="stat-card stat-pvp">
                      <div className="stat-label">PvP Matches</div>
                      <div className="stat-value">{scorecard.byMode?.pvp || 0}</div>
                    </div>
                    <div className="stat-card stat-ai">
                      <div className="stat-label">Vs AI Matches</div>
                      <div className="stat-value">{scorecard.byMode?.ai || 0}</div>
                    </div>
                    <div className="stat-card stat-pvp-record">
                      <div className="stat-label">PvP Record</div>
                      <div className="stat-breakdown">
                        <span className="record-item" style={{color: '#2c6ef6'}}>P1: {scorecard.pvpWins?.player1 || 0}</span>
                        <span className="record-item" style={{color: '#f44963'}}>P2: {scorecard.pvpWins?.player2 || 0}</span>
                        <span className="record-item" style={{color: '#17ba7b'}}>Draw: {scorecard.pvpWins?.draw || 0}</span>
                      </div>
                    </div>
                    <div className="stat-card stat-ai-record">
                      <div className="stat-label">AI Record</div>
                      <div className="stat-breakdown">
                        <span className="record-item" style={{color: '#17ba7b'}}>You: {scorecard.aiWins?.you || 0}</span>
                        <span className="record-item" style={{color: '#ff6b6b'}}>AI: {scorecard.aiWins?.ai || 0}</span>
                        <span className="record-item" style={{color: '#ffc107'}}>Draw: {scorecard.aiWins?.draw || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      ) : (
        <>
          <header className="battle-header">
            <h1>Battle Arena</h1>
            <div className="mode-row battle-actions">
              <button className="draw-btn battle-top-btn" onClick={() => navigateTo("/")}>Leave Battle</button>
              <button className="draw-btn battle-top-btn" onClick={() => startDraft(gameMode)}>New Draft</button>
            </div>
            <p className="turn-line">Current Turn: {currentTurn === "A" ? (gameMode === "ai" ? "You" : "Player 1") : gameMode === "ai" ? "AI" : "Player 2"}</p>
            {gameMode === "ai" && aiStatus && <p className="ai-line">{aiStatus}</p>}
          </header>

          <section className="battle-hype-strip" aria-label="Battle momentum">
            <span className="hype-chip">Mode: {gameMode === "ai" ? "Duel vs AI" : "PvP Clash"}</span>
            <span className="hype-chip pulse">Draft Pressure: {draftPressure}%</span>
            <span className="hype-chip">Deck Count {draftedCount.A} - {draftedCount.B}</span>
          </section>

          <section className="arena-grid">
            <PlayerPanel
              playerName={gameMode === "ai" ? "You" : "Player 1"}
              team={teamA}
              handCards={handA}
              onDropToRole={(role) => dropCardToRole("A", role)}
              onDragStartCard={(cardId) => startDragCard("A", cardId)}
              onDragEndCard={() => endDragCard("A")}
              draggedCardId={dragCardByPlayer.A}
              flippedCards={flippedCards}
              onToggleCard={toggleCardFlip}
              canDraw={canDrawA}
              onDraw={() => drawOne("A")}
              isActive={currentTurn === "A"}
              draftedCount={draftedCount.A}
              readonly={false}
              boosters={boostersA}
              onDropToBooster={() => dropBoosterCard("A")}
              boosterCount={boostersA.length}
            />

            <PlayerPanel
              playerName={gameMode === "ai" ? "AI" : "Player 2"}
              team={teamB}
              handCards={handB}
              onDropToRole={(role) => dropCardToRole("B", role)}
              onDragStartCard={(cardId) => startDragCard("B", cardId)}
              onDragEndCard={() => endDragCard("B")}
              draggedCardId={dragCardByPlayer.B}
              flippedCards={flippedCards}
              onToggleCard={toggleCardFlip}
              canDraw={canDrawB}
              onDraw={() => drawOne("B")}
              isActive={currentTurn === "B"}
              draftedCount={draftedCount.B}
              readonly={gameMode === "ai"}
              boosters={boostersB}
              onDropToBooster={() => dropBoosterCard("B")}
              boosterCount={boostersB.length}
            />
          </section>

          {gameMode === "ai" && aiRevealCard && (
            <section className="player-panel">
              <h3>AI Chosen Card</h3>
              <div className="drawn-card show">
                <FlippableCard
                  card={aiRevealCard}
                  flipped={!!flippedCards[aiRevealCard.id]}
                  onToggle={() => toggleCardFlip(aiRevealCard.id)}
                />
              </div>
            </section>
          )}

          <section className="control-row">
            <button className="fight-btn" disabled={!canBattle} onClick={fight}>Battle Now</button>
            <button className="reset-btn" onClick={resetGame}>Reset Match</button>
          </section>

          {battleResult && (
            <section className="result-wrap">
              <div className={`winner-banner ${battleResult.winner === "draw" ? "draw" : battleResult.winner === "player1" ? "p1" : "p2"}`}>
                <div className="winner-confetti" aria-hidden="true">
                  {Array.from({ length: 10 }).map((_, idx) => <span key={`confetti-${idx}`} />)}
                </div>
                <h2>
                  {battleResult.winner === "draw"
                    ? "Draw Showdown"
                    : battleResult.winner === "player1"
                    ? gameMode === "ai"
                      ? "You Win!"
                      : "Player 1 Wins!"
                    : gameMode === "ai"
                    ? "AI Wins!"
                    : "Player 2 Wins!"}
                </h2>
              </div>

              <section className="result-panel">
                <h2>{battleResult.winner === "draw" ? "Draw!" : battleResult.winner === "player1" ? "Player 1 Wins!" : "Player 2 Wins!"}</h2>
                <div className="result-score-strip">
                  <article className="score-pill score-pill-a">
                    <span>{playerOneLabel}</span>
                    <strong>{toFixedNumber(battleResult.scoreA)}</strong>
                  </article>
                  <article className="score-gap-pill">
                    Gap {toFixedNumber(Math.abs(Number(battleResult.scoreA) - Number(battleResult.scoreB)))}
                  </article>
                  <article className="score-pill score-pill-b">
                    <span>{playerTwoLabel}</span>
                    <strong>{toFixedNumber(battleResult.scoreB)}</strong>
                  </article>
                </div>

                <div className="result-insight-panel" aria-label="Battle explanation panel">
                  <h3>Battle Story</h3>

                  <div className="insight-factors-grid">
                    {battleStory.map((beat, idx) => (
                      <article key={`${beat.title}-${idx}`} className="factor-card story-card">
                        <h4>{beat.title}</h4>
                        <p className="factor-hint story-text">{beat.text}</p>
                        <div className="factor-values">
                          <span>{playerOneLabel}: <strong>{toFixedNumber(battleResult.scoreA)}</strong></span>
                          <span>{playerTwoLabel}: <strong>{toFixedNumber(battleResult.scoreB)}</strong></span>
                        </div>
                      </article>
                    ))}
                  </div>

                  <p className="insight-boosters">
                    {playerOneLabel} boosters: {breakdownA?.boosterEffects?.length ? breakdownA.boosterEffects.map(formatEffectLabel).join(", ") : "None"}
                    {" | "}
                    {playerTwoLabel} boosters: {breakdownB?.boosterEffects?.length ? breakdownB.boosterEffects.map(formatEffectLabel).join(", ") : "None"}
                  </p>
                </div>
              </section>
            </section>
          )}
        </>
      )}

      {error && <p className="error-text">{error}</p>}

      <footer>
        <p>
          Total cards in pool: {characters.length}
          {currentPage === "battle" ? ` | Remaining in draft pile: ${draftPile.length}` : ""}
        </p>
      </footer>
    </main>
  );
}
