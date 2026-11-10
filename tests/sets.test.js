// Every card in data/sets must accept its own full answer and each listed alternative,
// in both directions (answer in Vietnamese, answer in English).
// Run: node tests/sets.test.js
const fs = require('fs'), path = require('path');
const M = require('../matcher.js');
const dir = path.join(__dirname, '..', 'data', 'sets');
let pass = 0, fail = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const set = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const c of set.cards) {
    for (const [side, lang] of [['back', set.backLang], ['front', set.frontLang]]) {
      const expected = c[side];
      const tries = [expected, ...M.splitTopLevel(expected)];
      for (const typed of tries) {
        const r = M.check(typed, expected, { lang });
        if (r.status === 'correct') pass++;
        else { fail++; console.log(`FAIL ${f} [${lang}] typed ${JSON.stringify(typed)} for ${JSON.stringify(expected)} -> ${r.status}`); }
      }
    }
  }
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
