// In-memory city search over a normalized "City, Country" dataset (see
// scripts/build-cities.js). The list is pre-sorted by population descending, so
// for any query the biggest matching city surfaces first. ~23k entries → a full
// scan is well under a millisecond, so no index/DB table is needed.
const path = require('path');
const fs = require('fs');

let LIST = [];
try {
  LIST = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'cities.json'), 'utf8'));
} catch { LIST = []; /* dataset missing — search returns nothing rather than crashing */ }
const LOWER = LIST.map(s => s.toLowerCase());

// Return up to `limit` matches: prefix matches first (ranked by population via the
// pre-sort), then substring matches. De-duplication already happened at build time.
function searchCities(q, limit = 20) {
  q = String(q || '').trim().toLowerCase();
  if (q.length < 1) return [];
  const prefix = [], contains = [];
  for (let i = 0; i < LOWER.length; i++) {
    if (LOWER[i].startsWith(q)) { if (prefix.length < limit) prefix.push(LIST[i]); }
    else if (contains.length < limit && LOWER[i].includes(q)) contains.push(LIST[i]);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}

module.exports = { searchCities, count: LIST.length };
