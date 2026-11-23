// Screenshot scenes behind ?shot=start|play|win|lose. Each one plays the real
// rules forward from a fresh seeded game, so every frame is what a real game
// looks like and the same seed always gives the same frame. The win scene
// replays AI-vs-AI games until the player wins; the lose scene until Kael wins.
import { createGame } from './engine.js';
import { playAiTurn, simulateGame } from './ai.js';
import { createRandom } from './random.js';
import { SCREEN_LOSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

/** Simulate whole AI-vs-AI games until `side` wins (tries seeds in order). */
function gameWonBy(seed, side) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const s = seed + attempt * 7919;
    const state = createGame(createRandom(s), s);
    simulateGame(state);
    if (state.winner === side) return state;
  }
  // Fallback (never seen in the self-test): force the result on a fresh game.
  const state = createGame(createRandom(seed), seed);
  state.over = true;
  state.winner = side;
  state.players[1 - side].hp = 0;
  return state;
}

/** Set up the named scene and return the state plus the screen to draw over it. */
export function stageShot(name, seed) {
  if (name === 'win') {
    const state = gameWonBy(seed, 0);
    return { state, screen: SCREEN_WIN };
  }
  if (name === 'lose') {
    const state = gameWonBy(seed, 1);
    return { state, screen: SCREEN_LOSE };
  }
  if (name === 'play') {
    // Mid-game: both sides have traded minions for a few turns, hands are full
    // of choices, and it is the player's turn again — the richest table shot.
    // Try seeds in order until both boards are alive and the hand is full;
    // every candidate is a real game played forward by the rules.
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const s = seed + attempt * 7919;
      const state = createGame(createRandom(s), s);
      let guard = 0;
      while (!state.over && state.turn < 9 && guard < 30) {
        guard += 1;
        playAiTurn(state, state.active);
      }
      if (state.over) continue;
      if (state.players[0].board.length === 0 || state.players[1].board.length === 0) continue;
      if (state.players[0].hand.length < 4 || state.active !== 0) continue;
      return { state, screen: SCREEN_PLAY };
    }
    const state = createGame(createRandom(seed), seed);
    let guard = 0;
    while (!state.over && state.turn < 9 && guard < 30) {
      guard += 1;
      playAiTurn(state, state.active);
    }
    if (state.over) return { state, screen: state.winner === 0 ? SCREEN_WIN : SCREEN_LOSE };
    return { state, screen: SCREEN_PLAY };
  }
  const state = createGame(createRandom(seed), seed);
  return { state, screen: SCREEN_TITLE };
}
