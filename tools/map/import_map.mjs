// Make map edits permanent: copy a file exported from the Map page (Edit > Export file) into src/data/balance.json.
//   node tools/map/import_map.mjs creature-evolution-map-2026-11-26.json
// Replaces terrain.islands / seamounts / ridges, scenery.pieces / floats and each boss's entranceX, then run
// `npm test` (the map checks) and open a pull request. Players' own device edits are compared with the shipped map,
// so after this ships their old edits show a "the game was updated" note on the Map page. Numbers written as 1.0 in
// balance.json come back as 1 (the same value).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/map/import_map.mjs <exported map file>');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const path = resolve(root, 'src/data/balance.json');
const ex = JSON.parse(readFileSync(file, 'utf8'));
if (ex.kind !== 'creature-evolution-map-export') {
  console.error('Not a map export file (kind should be creature-evolution-map-export).');
  process.exit(1);
}
const b = JSON.parse(readFileSync(path, 'utf8'));
const isList = (a, keys) => Array.isArray(a) && a.every((o) => o && keys.every((k) => o[k] !== undefined));
const parts = [
  ['terrain', 'islands', ['x', 'width', 'depth']],
  ['terrain', 'seamounts', ['x', 'width', 'top']],
  ['terrain', 'ridges', ['x', 'width', 'height']],
  ['scenery', 'pieces', ['kind', 'x']],
  ['scenery', 'floats', ['kind', 'x']],
];
for (const [group, list, keys] of parts) {
  const a = ex[group]?.[list];
  if (!isList(a, keys)) {
    console.error(`${group}.${list} is missing or broken in the file; nothing written.`);
    process.exit(1);
  }
}
for (const [group, list] of parts) b[group][list] = ex[group][list];
for (const boss of b.bosses.list) if (typeof ex.caves?.[boss.id] === 'number') boss.entranceX = ex.caves[boss.id];
writeFileSync(path, JSON.stringify(b, null, 2) + '\n');
console.log(`Wrote ${parts.map(([g, l]) => `${ex[g][l].length} ${l}`).join(', ')} into src/data/balance.json. Now run npm test.`);
