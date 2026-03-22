const ROLE_MULTIPLIERS = {
  captain: 1.35,
  viceCaptain: 1.2,
  healer: 1.0,
  support: 0.95,
  traitor: 0.85
};

const POSITION_ROLE_FIT = {
  captain: { leader: 1.16, strategist: 1.1, wildcard: 1.04 },
  viceCaptain: { brawler: 1.12, assassin: 1.1, tank: 1.06 },
  healer: { healer: 1.18, support: 1.12, mystic: 1.08 },
  support: { support: 1.16, strategist: 1.1, ranged: 1.06 },
  traitor: { wildcard: 1.18, assassin: 1.1, strategist: 1.05 }
};

const DEFAULT_ML_MODEL = {
  featureOrder: [
    "powerDiff",
    "loyaltyDiff",
    "captainDiff",
    "healerDiff",
    "traitorRiskDiff",
    "roleFitDiff",
    "cohesionDiff",
    "webSignalDiff"
  ],
  coefficients: [0.0048, 0.12, 0.0027, 0.0024, -0.9, 0.8, 0.65, 0],
  intercept: 0
};

export function validateTeam(team, roleKeys, rosterById) {
  if (!team || !team.roles) {
    return "Missing team payload";
  }

  const keys = Object.keys(team.roles);
  if (keys.length !== roleKeys.length) {
    return `Team must contain exactly ${roleKeys.length} role assignments`;
  }

  for (const role of roleKeys) {
    if (!team.roles[role]) {
      return `Missing role assignment: ${role}`;
    }

    if (!rosterById[team.roles[role]]) {
      return `Unknown character id in ${role}: ${team.roles[role]}`;
    }
  }

  return null;
}

function roleFitMultiplier(positionRole, universeRole) {
  return POSITION_ROLE_FIT[positionRole]?.[universeRole] || 1;
}

function countUniverses(assigned) {
  const counts = {};
  assigned.forEach((c) => {
    counts[c.anime] = (counts[c.anime] || 0) + 1;
  });
  return counts;
}

function computeRawRoleScore(teamRoles, rosterById) {
  return Object.entries(teamRoles).reduce((sum, [role, id]) => {
    const character = rosterById[id];
    const fit = roleFitMultiplier(role, character.universeRole);
    return sum + character.powerLevel * (ROLE_MULTIPLIERS[role] || 1) * fit;
  }, 0);
}

function findTopUniverseBonus(universeCounts) {
  const maxCount = Object.values(universeCounts).reduce((m, n) => Math.max(m, n), 0);
  if (maxCount >= 4) return 0.08;
  if (maxCount >= 3) return 0.05;
  return 0;
}

function healerSupportBonus(teamRoles, rosterById) {
  const healer = rosterById[teamRoles.healer];
  const support = rosterById[teamRoles.support];
  const healerFit = roleFitMultiplier("healer", healer.universeRole);
  const supportFit = roleFitMultiplier("support", support.universeRole);
  return healer.powerLevel * 0.08 * healerFit + support.powerLevel * 0.06 * supportFit;
}

function traitorSwing(ownTeamRoles, enemyTeamRoles, rosterById) {
  const traitor = rosterById[ownTeamRoles.traitor];
  const betrayalChance = Math.max(0.12, 0.5 - traitor.loyalty * 0.04);
  const betrayed = Math.random() < betrayalChance;

  if (!betrayed) {
    return {
      betrayed,
      ownDelta: traitor.powerLevel * 0.1,
      enemyDelta: 0,
      betrayalChance
    };
  }

  const enemyCaptain = rosterById[enemyTeamRoles.captain];
  return {
    betrayed,
    ownDelta: -traitor.powerLevel * 0.45,
    enemyDelta: enemyCaptain.powerLevel * 0.15,
    betrayalChance
  };
}

function computeCohesion(assigned) {
  const roleCounts = assigned.reduce((acc, c) => {
    acc[c.universeRole] = (acc[c.universeRole] || 0) + 1;
    return acc;
  }, {});

  const distinctRoles = Object.keys(roleCounts).length;
  const diversityBonus = distinctRoles >= 4 ? 0.06 : distinctRoles >= 3 ? 0.03 : 0;
  return diversityBonus;
}

function teamAveragePower(assigned) {
  return assigned.reduce((sum, c) => sum + c.powerLevel, 0) / assigned.length;
}

function teamAverageLoyalty(assigned) {
  return assigned.reduce((sum, c) => sum + c.loyalty, 0) / assigned.length;
}

function getFeatureMap(teamA, teamB, rosterById) {
  const assignedA = Object.values(teamA.roles).map((id) => rosterById[id]);
  const assignedB = Object.values(teamB.roles).map((id) => rosterById[id]);

  const traitorA = rosterById[teamA.roles.traitor];
  const traitorB = rosterById[teamB.roles.traitor];
  const captainA = rosterById[teamA.roles.captain];
  const captainB = rosterById[teamB.roles.captain];
  const healerA = rosterById[teamA.roles.healer];
  const healerB = rosterById[teamB.roles.healer];

  const roleFitA = Object.entries(teamA.roles).reduce((sum, [role, id]) => {
    return sum + (roleFitMultiplier(role, rosterById[id].universeRole) - 1);
  }, 0);
  const roleFitB = Object.entries(teamB.roles).reduce((sum, [role, id]) => {
    return sum + (roleFitMultiplier(role, rosterById[id].universeRole) - 1);
  }, 0);

  return {
    powerDiff: teamAveragePower(assignedA) - teamAveragePower(assignedB),
    loyaltyDiff: teamAverageLoyalty(assignedA) - teamAverageLoyalty(assignedB),
    captainDiff: captainA.powerLevel - captainB.powerLevel,
    healerDiff: healerA.powerLevel - healerB.powerLevel,
    traitorRiskDiff: (10 - traitorA.loyalty) / 10 - (10 - traitorB.loyalty) / 10,
    roleFitDiff: roleFitA - roleFitB,
    cohesionDiff: computeCohesion(assignedA) - computeCohesion(assignedB),
    webSignalDiff: 0
  };
}

function mlProbability(features, model) {
  const usedModel = model || DEFAULT_ML_MODEL;
  const z = usedModel.featureOrder.reduce((sum, key, i) => {
    return sum + (features[key] || 0) * (usedModel.coefficients[i] || 0);
  }, usedModel.intercept || 0);
  return 1 / (1 + Math.exp(-z));
}

function applyBoosterModifiers(ownScore, enemyScore, effect) {
  let nextOwn = ownScore;
  let nextEnemy = enemyScore;

  if (!effect) {
    return { own: nextOwn, enemy: nextEnemy };
  }

  if (effect === "power_boost") {
    nextOwn *= 1.3;
  } else if (effect === "double_damage") {
    nextOwn *= 1.1;
  } else if (effect === "shield_team") {
    nextEnemy *= 0.9;
  } else if (effect === "heal_team") {
    nextOwn *= 1.25;
  } else if (effect === "lock_hand") {
    nextEnemy *= 0.9;
  } else if (effect === "steal_card") {
    nextOwn *= 1.05;
    nextEnemy *= 0.9;
  } else if (effect === "reload_deck") {
    nextOwn *= 1.1;
  } else if (effect === "draw_two_cards") {
    nextOwn *= 1.12;
  } else if (effect === "reverse_turn") {
    nextOwn *= 1.08;
  } else if (effect === "swap_one_card") {
    nextOwn *= 1.1;
  }

  return { own: nextOwn, enemy: nextEnemy };
}

function normalizeBoosterEffects(team) {
  if (Array.isArray(team?.boosterEffects)) {
    return team.boosterEffects.filter(Boolean).slice(0, 2);
  }

  if (team?.boosterEffect) {
    return [team.boosterEffect];
  }

  return [];
}

export function runBattle({ teamA, teamB, rosterById, model }) {
  const assignedA = Object.values(teamA.roles).map((id) => rosterById[id]);
  const assignedB = Object.values(teamB.roles).map((id) => rosterById[id]);

  const baseA = computeRawRoleScore(teamA.roles, rosterById);
  const baseB = computeRawRoleScore(teamB.roles, rosterById);

  const universeBonusA = findTopUniverseBonus(countUniverses(assignedA));
  const universeBonusB = findTopUniverseBonus(countUniverses(assignedB));
  const cohesionA = computeCohesion(assignedA);
  const cohesionB = computeCohesion(assignedB);

  const sustainA = healerSupportBonus(teamA.roles, rosterById);
  const sustainB = healerSupportBonus(teamB.roles, rosterById);

  const traitorA = traitorSwing(teamA.roles, teamB.roles, rosterById);
  const traitorB = traitorSwing(teamB.roles, teamA.roles, rosterById);

  const featureMap = getFeatureMap(teamA, teamB, rosterById);
  const pA = mlProbability(featureMap, model);
  const pB = 1 - pA;

  let scoreA = baseA * (1 + universeBonusA + cohesionA) + sustainA + traitorA.ownDelta + traitorB.enemyDelta + pA * 180;
  let scoreB = baseB * (1 + universeBonusB + cohesionB) + sustainB + traitorB.ownDelta + traitorA.enemyDelta + pB * 180;

  const boosterEffectsA = normalizeBoosterEffects(teamA);
  const boosterEffectsB = normalizeBoosterEffects(teamB);

  for (const effect of boosterEffectsA) {
    const boosted = applyBoosterModifiers(scoreA, scoreB, effect);
    scoreA = boosted.own;
    scoreB = boosted.enemy;
  }

  for (const effect of boosterEffectsB) {
    const boosted = applyBoosterModifiers(scoreB, scoreA, effect);
    scoreB = boosted.own;
    scoreA = boosted.enemy;
  }

  const winner = scoreA === scoreB ? "draw" : scoreA > scoreB ? "player1" : "player2";

  return {
    winner,
    scoreA: Number(scoreA.toFixed(2)),
    scoreB: Number(scoreB.toFixed(2)),
    breakdown: {
      player1: {
        base: Number(baseA.toFixed(2)),
        universeBonusPct: universeBonusA,
        cohesionBonusPct: cohesionA,
        mlWinProbability: Number(pA.toFixed(4)),
        sustain: Number(sustainA.toFixed(2)),
        traitor: traitorA,
        boosterEffects: boosterEffectsA
      },
      player2: {
        base: Number(baseB.toFixed(2)),
        universeBonusPct: universeBonusB,
        cohesionBonusPct: cohesionB,
        mlWinProbability: Number(pB.toFixed(4)),
        sustain: Number(sustainB.toFixed(2)),
        traitor: traitorB,
        boosterEffects: boosterEffectsB
      }
    }
  };
}
