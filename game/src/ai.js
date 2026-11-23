// Kael, the Emberlord: a greedy AI that reads the board instead of playing at
// random. It scores every legal move on a cloned state and plays the best one,
// then repeats until no move scores above the "pass" threshold. Priorities:
// take lethal when it is there, remove the biggest threat, protect its own
// hero with taunts, and spend energy efficiently instead of hoarding it.
import { attackWithMinion, cloneState, endTurn, legalMoves, playCard } from './engine.js';
import { cardById } from './cards.js';

/** Heuristic value of a position for `side`: higher is better for that side. */
export function evaluate(state, side) {
  const me = state.players[side];
  const foe = state.players[1 - side];
  if (state.over) return state.winner === side ? 10000 : -10000;
  let score = (me.hp - foe.hp) * 10;
  score += me.board.reduce((s, m) => s + m.attack * 2 + m.health, 0);
  score -= foe.board.reduce((s, m) => s + m.attack * 2 + m.health, 0);
  score += me.hand.length * 1.5 - foe.hand.length * 1.5;
  score += me.board.filter((m) => m.taunt).length * 3;
  score -= foe.board.filter((m) => m.taunt).length * 3;
  return score;
}

/** Score one candidate move by playing it on a clone and evaluating. */
function scoreMove(state, side, move) {
  const next = cloneState(state);
  if (move.type === 'card') playCard(next, side, move.handIndex, move.target);
  else attackWithMinion(next, side, move.minionUid, move.target);
  let score = evaluate(next, side);
  // Prefer moves that end the game now, and cheap efficient plays over waste.
  if (next.over && next.winner === side) score += 5000;
  if (move.type === 'card') {
    const card = cardById(state.players[side].hand[move.handIndex]);
    score += 0.5;
    if (card.kind === 'spell' && card.target === 'none') score += 1;
  }
  // Attacking the hero when a taunt stands is illegal already; attacking a
  // minion you cannot kill is a bad trade unless it saves your hero.
  if (move.type === 'attack' && move.target.kind === 'minion') {
    const victim = state.players[1 - side].board.find((m) => m.uid === move.target.minionId);
    const attacker = state.players[side].board.find((m) => m.uid === move.minionUid);
    if (victim && attacker && victim.health > attacker.attack && attacker.health <= victim.attack) score -= 6;
    if (victim && victim.attack >= 5) score += 4;
  }
  return score;
}

/** Pick the AI's best move, or null when it should pass the turn. */
export function chooseMove(state, side) {
  const moves = legalMoves(state, side);
  if (moves.length === 0) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = scoreMove(state, side, move);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  // Passing beats playing a card that makes the position worse, unless the
  // hand is full and a card would be burned by the next draw.
  const handFull = state.players[side].hand.length >= 7;
  if (bestScore < evaluate(state, side) && !handFull) return null;
  return best;
}

/** Play the AI's whole turn: keep choosing moves until it passes, then end. */
export function playAiTurn(state, side) {
  let guard = 0;
  while (!state.over && guard < 40) {
    guard += 1;
    const move = chooseMove(state, side);
    if (!move) break;
    if (move.type === 'card') playCard(state, side, move.handIndex, move.target);
    else attackWithMinion(state, side, move.minionUid, move.target);
    if (state.over) break;
  }
  if (!state.over) endTurn(state);
}

/** Headless full game, AI on both sides: used by the self-test and the shots. */
export function simulateGame(state) {
  let guard = 0;
  while (!state.over && guard < 200) {
    guard += 1;
    const side = state.active;
    playAiTurn(state, side);
    if (state.over) break;
    // playAiTurn ends the turn; the loop continues with the other side.
    if (state.active === side) endTurn(state);
  }
  if (!state.over) {
    // A 200-turn game that never ends is a deadlock: the healthier hero wins.
    state.over = true;
    state.winner = state.players[0].hp >= state.players[1].hp ? 0 : 1;
  }
  return state;
}
