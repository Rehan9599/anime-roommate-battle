const WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const DDG_QUERY = "https://duckduckgo.com/";
const DDG_IMAGE_API = "https://duckduckgo.com/i.js";

function normalizeName(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "anime-roommate-battle-local-app/1.0" }
  });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "anime-roommate-battle-local-app/1.0" }
  });
  if (!response.ok) {
    return null;
  }
  return response.text();
}

async function fetchFromWikipedia(title) {
  const url = `${WIKI_SUMMARY}${encodeURIComponent(title)}`;
  const payload = await fetchJson(url);
  return {
    imageUrl: payload?.thumbnail?.source || null,
    info: payload?.extract || null,
    source: payload ? "wikipedia" : null
  };
}

function buildSearchQuery(character) {
  return `${character.name} ${character.anime} character official art`;
}

async function fetchDdgVqdToken(query) {
  const html = await fetchText(`${DDG_QUERY}?q=${encodeURIComponent(query)}&iax=images&ia=images`);
  if (!html) {
    return null;
  }

  const match = html.match(/vqd=['"]([^'"]+)['"]/i) || html.match(/"vqd":"([^"]+)"/i);
  return match?.[1] || null;
}

function isGoodImageResult(result, character) {
  const image = result?.image || "";
  if (!image) return false;

  const lower = image.toLowerCase();
  if (lower.includes("sprite") || lower.includes("icon") || lower.includes("thumb")) {
    return false;
  }

  const title = `${result?.title || ""} ${result?.source || ""}`.toLowerCase();
  const target = normalizeName(character.name);
  const titleNorm = normalizeName(title);
  return !target || titleNorm.includes(target) || target.includes(titleNorm);
}

async function fetchFromWebImageSearch(character) {
  const query = buildSearchQuery(character);
  const vqd = await fetchDdgVqdToken(query);
  if (!vqd) {
    return null;
  }

  const url = `${DDG_IMAGE_API}?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`;
  const payload = await fetchJson(url);
  const candidates = Array.isArray(payload?.results) ? payload.results : [];
  const best = candidates.find((item) => isGoodImageResult(item, character)) || candidates[0];
  if (!best) {
    return null;
  }

  return {
    imageUrl: best?.image || best?.thumbnail || null,
    info: best?.title || null,
    source: "websearch"
  };
}

export async function enrichCharacterImages(characters, options = {}) {
  const { force = false } = options;
  const next = [];

  for (const character of characters) {
    const hasRequired =
      character.imageUrl
      && character.infoSource
      && character.infoSource !== "jikan"
      && character.infoSource !== "superheroapi";
    if (!force && hasRequired) {
      next.push(character);
      continue;
    }

    const external = await fetchFromWebImageSearch(character);

    const wiki = await fetchFromWikipedia(character.wikiTitle || character.name);

    const merged = {
      ...character,
      imageUrl: external?.imageUrl || character.imageUrl || wiki.imageUrl || `https://robohash.org/${encodeURIComponent(character.id)}.png?set=set2`,
      infoSource: external?.source || wiki.source || character.infoSource || "fallback",
      info: external?.info || wiki.info || character.info || null,
      apiRefs: {
        ...(character.apiRefs || {}),
        searchSource: external?.source || character.apiRefs?.searchSource || null
      }
    };

    next.push(merged);
  }

  return next;
}
