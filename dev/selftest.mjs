// Emberclash headless self-test (Node, no DOM): simulates 100 AI-vs-AI games
// from different seeds and asserts the rules engine never crashes, never
// deadlocks, and produces both wins and losses. Run: `node dev/selftest.mjs`
// from the repository root. This file is development tooling only; it is not
// part of game/ and is never shipped in the entry.
import { createRandom } from '../game/src/random.js';
import { createGame } from '../game/src/engine.js';
import { simulateGame } from '../game/src/ai.js';
import { CARDS } from '../game/src/cards.js';

const GAMES = 100;
const wins = [0, 0];
let longest = 0;
let totalTurns = 0;
let crashed = 0;

for (let seed = 1; seed <= GAMES; seed += 1) {
  try {
    const state = createGame(createRandom(seed), seed);
    simulateGame(state);
    if (!state.over) throw new Error(`game ${seed} did not end`);
    if (state.winner !== 0 && state.winner !== 1) throw new Error(`game ${seed} has no winner`);
    wins[state.winner] += 1;
    longest = Math.max(longest, state.turn);
    totalTurns += state.turn;
  } catch (error) {
    crashed += 1;
    console.error(`game ${seed} FAILED:`, error.message);
  }
}

console.log(`self-test: ${GAMES} games, ${crashed} crashes`);
console.log(`wins: player ${wins[0]}, Kael ${wins[1]}`);
console.log(`turns: avg ${(totalTurns / GAMES).toFixed(1)}, longest ${longest}`);
console.log(`cards: ${CARDS.length} unique`);

// Sanity checks on the card data itself.
const ids = new Set(CARDS.map((c) => c.id));
if (ids.size !== CARDS.length) throw new Error('duplicate card id');
for (const c of CARDS) {
  if (c.cost < 1 || c.cost > 8) throw new Error(`${c.id}: cost out of range`);
  if (c.kind === 'minion' && (c.attack < 1 || c.health < 1)) throw new Error(`${c.id}: bad minion stats`);
}
console.log('card data: OK');

if (crashed > 0 || wins[0] === 0 || wins[1] === 0) {
  console.error('SELF-TEST FAILED');
  process.exit(1);
}
console.log('SELF-TEST PASSED');
