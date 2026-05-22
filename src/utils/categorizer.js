const GENERIC = new Set(['uncategorized', 'other income', 'other expense']);

function normalizeCategory(str) {
  return (str || '').trim().toLowerCase();
}

function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function wordSet(str) {
  return new Set(normalize(str).split(' ').filter(w => w.length > 2));
}

export function buildPatternMap(transactions) {
  const votes = new Map();
  for (const tx of transactions) {
    const cat = normalizeCategory(tx.category);
    if (tx.excluded) continue;
    if (!cat) continue;
    if (GENERIC.has(cat) && !tx.categorized) continue;
    const key = normalize(tx.description);
    if (!key) continue;
    const prev = votes.get(key) ?? { category: tx.category, count: 0 };
    const count = tx.category === prev.category ? prev.count + 1 : prev.count;
    if (count >= prev.count) votes.set(key, { category: tx.category, count });
  }
  return votes;
}

export function suggest(description, patternMap) {
  if (!patternMap || patternMap.size === 0) return null;
  const norm = normalize(description);
  if (!norm) return null;
  const dWords = wordSet(description);

  let best = null;
  let bestScore = 0;

  for (const [pattern, suggestion] of patternMap) {
    let score = 0;
    if (norm === pattern) {
      score = 10000;
    } else if (norm.includes(pattern) && pattern.length > 4) {
      score = pattern.length * 10;
    } else if (pattern.includes(norm) && norm.length > 4) {
      score = norm.length * 8;
    } else {
      const pWords = wordSet(pattern);
      let overlap = 0;
      for (const w of dWords) { if (pWords.has(w)) overlap++; }
      if (overlap > 0) score = overlap * 20 + suggestion.count * 2;
    }
    if (score > bestScore) { bestScore = score; best = suggestion; }
  }

  return bestScore > 0 ? best : null;
}

export function isUncategorized(tx) {
  const cat = normalizeCategory(tx.category);
  if (!cat) return true;
  if (tx.categorized) return false;
  return GENERIC.has(cat);
}
