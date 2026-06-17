// Build script (dev only): generates server/data/cities.json — a deduplicated,
// normalized "City, Country" dataset for the searchable city picker.
//
// Source: all-the-cities (GeoNames-derived) + i18n-iso-countries for names.
// Run with:  node server/scripts/build-cities.js
//
// We filter to population >= 15,000 (tier 1/2/3 worldwide — ~25k cities) so the
// committed dataset stays small and search stays fast, while covering essentially
// every city a founder/investor would plausibly be based in. Re-run to refresh.
const fs = require('fs');
const path = require('path');
const cities = require('all-the-cities');
const countries = require('i18n-iso-countries');

const MIN_POPULATION = 15000;

// Friendly short country names where the ISO standard name is verbose/formal.
const NAME_OVERRIDES = {
  US: 'USA', GB: 'UK', AE: 'UAE', RU: 'Russia', KR: 'South Korea', KP: 'North Korea',
  IR: 'Iran', SY: 'Syria', LA: 'Laos', MD: 'Moldova', TZ: 'Tanzania', BO: 'Bolivia',
  VE: 'Venezuela', VN: 'Vietnam', CD: 'DR Congo', CG: 'Congo', CZ: 'Czechia',
  MK: 'North Macedonia', BN: 'Brunei', TW: 'Taiwan', PS: 'Palestine',
  CN: 'China', TR: 'Turkey',
};
function countryName(iso2) {
  if (NAME_OVERRIDES[iso2]) return NAME_OVERRIDES[iso2];
  return countries.getName(iso2, 'en', { select: 'official' }) || countries.getName(iso2, 'en') || iso2;
}

// Dedupe by "City, Country" (same name can appear for multiple admin regions);
// keep the most populous instance so the canonical city wins.
const best = new Map();
for (const c of cities) {
  if (!c.name || c.population < MIN_POPULATION) continue;
  const country = countryName(c.country);
  if (!country) continue;
  const label = `${c.name}, ${country}`;
  const key = label.toLowerCase();
  const prev = best.get(key);
  if (!prev || c.population > prev.pop) best.set(key, { label, pop: c.population });
}

// Sort by population desc so the picker surfaces the biggest, most-likely match
// first when many cities share a search prefix.
const list = [...best.values()].sort((a, b) => b.pop - a.pop).map(x => x.label);

const outDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, 'cities.json');
fs.writeFileSync(outFile, JSON.stringify(list));
console.log(`Wrote ${list.length} cities to ${outFile} (${(fs.statSync(outFile).size / 1024 / 1024).toFixed(2)} MB)`);
