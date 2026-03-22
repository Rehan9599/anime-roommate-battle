const POSITION_ROLE_FIT = {
  captain: { leader: 1.16, strategist: 1.1, wildcard: 1.04 },
  viceCaptain: { brawler: 1.12, assassin: 1.1, tank: 1.06 },
  healer: { healer: 1.18, support: 1.12, mystic: 1.08 },
  support: { support: 1.16, strategist: 1.1, ranged: 1.06 },
  traitor: { wildcard: 1.18, assassin: 1.1, strategist: 1.05 }
};

function openRoles(team) {
  return Object.entries(team)
    .filter(([, card]) => !card)
    .map(([role]) => role);
}

function roleScoreForCard(role, card) {
  const fit = POSITION_ROLE_FIT[role]?.[card.universeRole] || 1;
  let score = card.powerLevel * fit;

  // Traitor should usually be a volatile/low-loyalty character.
  if (role === "traitor") {
    if (card.loyalty >= 8) {
      score *= 0.58;
    } else if (card.loyalty <= 4) {
      score *= 1.14;
    }
  } else {
    // Outside traitor, very loyal characters are slightly favored.
    if (card.loyalty >= 8) {
      score *= 1.05;
    }
  }

  return score;
}

function bestRole(team, card) {
  const roles = openRoles(team);
  if (!roles.length) {
    return null;
  }

  let topRole = roles[0];
  let topScore = -Infinity;

  for (const role of roles) {
    const score = roleScoreForCard(role, card);
    if (score > topScore) {
      topScore = score;
      topRole = role;
    }
  }

  return { role: topRole, score: topScore };
}

function heuristicDecision({ team, card, skipRemaining }) {
  const pick = bestRole(team, card);
  if (!pick) {
    return {
      action: "skip",
      role: null,
      reason: "No open role left."
    };
  }

  const remainingSlots = openRoles(team).length;
  const threshold = remainingSlots <= 2 ? 920 : remainingSlots <= 3 ? 860 : 780;
  const shouldSkip = skipRemaining > 0 && pick.score < threshold;

  return {
    action: shouldSkip ? "skip" : "assign",
    role: shouldSkip ? null : pick.role,
    reason: shouldSkip
      ? `Card value ${Math.round(pick.score)} is below threshold ${threshold}.`
      : `Best fit is ${pick.role} with value ${Math.round(pick.score)}.`
  };
}

export async function chooseAiAction(input) {
  return {
    ...heuristicDecision(input),
    source: "heuristic"
  };
}
