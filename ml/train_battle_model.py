import json
import random
import re
import urllib.request
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

ROOT = Path(__file__).resolve().parents[1]
CHAR_PATH = ROOT / "server" / "src" / "characters.js"
OUT_PATH = ROOT / "server" / "data" / "ml_model.json"

FEATURE_ORDER = [
    "powerDiff",
    "loyaltyDiff",
    "captainDiff",
    "healerDiff",
    "traitorRiskDiff",
    "roleFitDiff",
    "cohesionDiff",
    "webSignalDiff",
]

POSITION_ROLE_FIT = {
    "captain": {"leader": 1.16, "strategist": 1.10, "wildcard": 1.04},
    "viceCaptain": {"brawler": 1.12, "assassin": 1.10, "tank": 1.06},
    "healer": {"healer": 1.18, "support": 1.12, "mystic": 1.08},
    "support": {"support": 1.16, "strategist": 1.10, "ranged": 1.06},
    "traitor": {"wildcard": 1.18, "assassin": 1.10, "strategist": 1.05},
}

ROLES = ["captain", "viceCaptain", "healer", "support", "traitor"]


def extract_json_from_js(js_text: str):
    match = re.search(r"export\s+const\s+CHARACTERS\s*=\s*(\[[\s\S]*?\]);", js_text)
    if not match:
        raise ValueError("Could not locate CHARACTERS array in characters.js")
    payload = match.group(1)
    payload = re.sub(r"(\{|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*:", r'\1 "\2":', payload)
    payload = re.sub(r",\s*([}\]])", r"\1", payload)
    return json.loads(payload)


def role_fit(position, universe_role):
    return POSITION_ROLE_FIT.get(position, {}).get(universe_role, 1.0)


def cohesion(team):
    counts = {}
    for c in team.values():
        counts[c["universeRole"]] = counts.get(c["universeRole"], 0) + 1
    distinct = len(counts)
    if distinct >= 4:
        return 0.06
    if distinct >= 3:
        return 0.03
    return 0.0


def build_random_team(pool):
    picks = random.sample(pool, 5)
    return {role: picks[i] for i, role in enumerate(ROLES)}


def build_features(team_a, team_b, web_signal):
    def avg(team, key):
        return sum(c[key] for c in team.values()) / 5

    role_fit_a = sum(role_fit(role, team_a[role]["universeRole"]) - 1 for role in ROLES)
    role_fit_b = sum(role_fit(role, team_b[role]["universeRole"]) - 1 for role in ROLES)

    return {
        "powerDiff": avg(team_a, "powerLevel") - avg(team_b, "powerLevel"),
        "loyaltyDiff": avg(team_a, "loyalty") - avg(team_b, "loyalty"),
        "captainDiff": team_a["captain"]["powerLevel"] - team_b["captain"]["powerLevel"],
        "healerDiff": team_a["healer"]["powerLevel"] - team_b["healer"]["powerLevel"],
        "traitorRiskDiff": (10 - team_a["traitor"]["loyalty"]) / 10 - (10 - team_b["traitor"]["loyalty"]) / 10,
        "roleFitDiff": role_fit_a - role_fit_b,
        "cohesionDiff": cohesion(team_a) - cohesion(team_b),
        "webSignalDiff": web_signal,
    }


def pseudo_label(features):
    score = (
        features["powerDiff"] * 0.005
        + features["loyaltyDiff"] * 0.11
        + features["captainDiff"] * 0.0025
        + features["healerDiff"] * 0.0023
        - features["traitorRiskDiff"] * 0.9
        + features["roleFitDiff"] * 0.75
        + features["cohesionDiff"] * 0.6
        + features["webSignalDiff"] * 0.12
        + random.uniform(-0.25, 0.25)
    )
    return 1 if score > 0 else 0


def fetch_web_signal():
    # Tiny web signal: page summary length from Wikipedia for Marvel and DC.
    endpoints = [
        "https://en.wikipedia.org/api/rest_v1/page/summary/Marvel_Comics",
        "https://en.wikipedia.org/api/rest_v1/page/summary/DC_Comics",
    ]
    lengths = []
    for url in endpoints:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "anime-roommate-battle-trainer/1.0"})
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                lengths.append(len(data.get("extract", "")))
        except Exception:
            lengths.append(0)
    return (lengths[0] - lengths[1]) / 1000.0


def main():
    characters = extract_json_from_js(CHAR_PATH.read_text(encoding="utf-8"))
    web_signal = fetch_web_signal()

    X = []
    y = []
    for _ in range(3000):
        team_a = build_random_team(characters)
        team_b = build_random_team(characters)
        f = build_features(team_a, team_b, web_signal)
        X.append([f[k] for k in FEATURE_ORDER])
        y.append(pseudo_label(f))

    X = np.array(X)
    y = np.array(y)

    model = LogisticRegression(max_iter=700)
    model.fit(X, y)

    out = {
        "featureOrder": FEATURE_ORDER,
        "coefficients": [float(v) for v in model.coef_[0]],
        "intercept": float(model.intercept_[0]),
        "meta": {
            "samples": int(len(X)),
            "source": "scikit-learn logistic regression with web signal from Wikipedia summaries",
        },
    }
    OUT_PATH.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"Wrote {OUT_PATH}")


if __name__ == "__main__":
    main()
