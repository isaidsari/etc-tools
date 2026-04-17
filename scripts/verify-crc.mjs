// Run every algorithm in data-crc.js against "123456789" and compare the result
// with the published RevEng check value embedded in the source as a `// check: XX`
// trailing comment on each algo line.
//
//   node scripts/verify-crc.mjs
//
// Exits 0 if every algo matches its reference, 1 otherwise.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC_PATH = new URL('../js/tools/data-crc.js', import.meta.url);
const src = readFileSync(SRC_PATH, 'utf8');

const expected = new Map();
for (const line of src.split('\n')) {
    const m = line.match(/name:\s*['"]([^'"]+)['"].*?\/\/\s*check:\s*([0-9A-Fa-f]+)/);
    if (m) expected.set(m[1], m[2].toUpperCase());
}

const ctx = { window: { registerTool: () => {} }, document: { addEventListener: () => {} } };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.algos = crcLogic.algos; this.toHex = crcLogic.toHex;', ctx);

const payload = new TextEncoder().encode('123456789');

let checked = 0, failed = 0, skipped = 0;
for (const algo of ctx.algos) {
    const rawWant = expected.get(algo.name);
    if (!rawWant) { skipped++; continue; }
    const want = rawWant.padStart(algo.size * 2, '0');

    const got = ctx.toHex(algo.calc(payload), algo.size);
    checked++;
    if (got === want) {
        console.log(`  ok   ${algo.name.padEnd(36)} ${got}`);
    } else {
        failed++;
        console.log(`  FAIL ${algo.name.padEnd(36)} got ${got}, want ${want}`);
    }
}

console.log(`\n${checked - failed}/${checked} matched · ${failed} failed · ${skipped} no reference`);
process.exit(failed ? 1 : 0);
