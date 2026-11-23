// Emberclash rules engine: pure functions over a plain state object. No DOM, no
// Math.random, no I/O here, so the self-test can run it headless in Node.
// A game: two heroes at 30 HP, energy that grows 1 per turn to a max of 10, a
// 30-card deck, a 7-card hand, one draw per turn, and a board of minions.
// Minions cannot attack the turn they are played. Taunt minions must be attacked
// before any other target. Playing two cards of the same element in a row on your
// turn gives the second +1 attack (minion) or +1 damage (spell): the Ember Synergy.
import { buildDeck, cardById } from './cards.js';
import { shuffle } from './random.js';

export const MAX_HP = 30;
export const MAX_ENERGY = 10;
export const MAX_HAND = 7;
export const MAX_BOARD = 7;
export const START_HAND = 5;

let minionSerial = 0;

/** Fresh game state for a seed. `random` is the seeded generator from random.js. */
export function createGame(random, seed) {
  minionSerial = 0;
  const state = {
    seed,
    turn: 1,
    active: 0,
    over: false,
    winner: null,
    log: [],
    players: [0, 1].map((side) => ({
      side,
      name: side === 0 ? 'You' : 'Kael',
      hp: MAX_HP,
      // The first player opens with 2 energy for one turn only (max stays 1):
      // a single-turn head start, not a permanent lead — the second player
      // would otherwise sit one energy ahead on every one of their turns.
      energy: side === 0 ? 2 : 1,
      maxEnergy: 1,
      fatigue: 0,
      deck: shuffle(random, buildDeck()),
      hand: [],
      board: [],
      lastElement: null,
    })),
  };
  for (let i = 0; i < START_HAND; i += 1) {
    drawCard(state, 0, true);
    drawCard(state, 1, true);
  }
  pushLog(state, 'The duel begins! The last flame burns — win before it dies.');
  return state;
}

/** Append a line to the short event log (kept to the last 30 lines). */
export function pushLog(state, text) {
  state.log.push(text);
  if (state.log.length > 30) state.log.splice(0, state.log.length - 30);
}

/** Draw one card for `side`; an empty deck deals rising fatigue damage instead. */
export function drawCard(state, side, silent) {
  const p = state.players[side];
  if (p.deck.length === 0) {
    p.fatigue += 1;
    p.hp -= p.fatigue;
    if (!silent) pushLog(state, `${p.name} is out of cards! Fatigue -${p.fatigue} HP.`);
    checkEnd(state);
    return null;
  }
  const id = p.deck.pop();
  if (p.hand.length >= MAX_HAND) {
    if (!silent) pushLog(state, `${p.name}'s hand is full — ${cardById(id).name} burns away.`);
    return null;
  }
  p.hand.push(id);
  return id;
}

/** End the current turn: switch sides, grow energy, draw, refresh minions. */
export function endTurn(state) {
  if (state.over) return;
  const next = 1 - state.active;
  const p = state.players[next];
  p.maxEnergy = Math.min(MAX_ENERGY, p.maxEnergy + 1);
  p.energy = p.maxEnergy;
  p.lastElement = null;
  for (const m of p.board) m.canAttack = true;
  state.active = next;
  state.turn += 1;
  drawCard(state, next, false);
  pushLog(state, next === 0 ? `Your turn — ${p.energy} energy.` : `Kael's turn — ${p.energy} energy.`);
}

/** Can `side` play the card at `handIndex` right now (ignoring targets)? */
export function canPlayCard(state, side, handIndex) {
  if (state.over || state.active !== side) return false;
  const p = state.players[side];
  const id = p.hand[handIndex];
  if (id === undefined) return false;
  const card = cardById(id);
  if (p.energy < card.cost) return false;
  if (card.kind === 'minion' && p.board.length >= MAX_BOARD) return false;
  return true;
}

/**
 * Play a card from hand. `target` is { kind: 'hero'|'minion', side, minionId }
 * for spells that need one; minions need none. Returns the events it caused
 * (for animation and sound) or null when the play is illegal.
 */
export function playCard(state, side, handIndex, target) {
  if (!canPlayCard(state, side, handIndex)) return null;
  const p = state.players[side];
  const foe = state.players[1 - side];
  const id = p.hand[handIndex];
  const card = cardById(id);
  const events = [];
  const synergy = p.lastElement === card.element;
  const bonus = synergy ? 1 : 0;
  // Validate spell targets BEFORE spending energy or removing the card, so an
  // illegal play changes nothing and the caller can simply try another move.
  if (card.kind === 'spell' && card.damage && card.target !== 'none') {
    if (!target) return null;
    if (target.kind === 'hero' && card.target === 'enemy-minion') return null;
    if (target.kind === 'minion' && card.target === 'enemy-hero') return null;
    if (target.kind === 'minion') {
      const victim = foe.board.find((m) => m.uid === target.minionId);
      if (!victim) return null;
      if (card.destroyMax !== undefined && victim.attack > card.destroyMax) return null;
    }
    if (target.kind === 'hero' && card.target === 'enemy-minion') return null;
  }
  if (card.kind === 'spell' && card.destroyMax !== undefined) {
    if (!target || target.kind !== 'minion') return null;
    const victim = foe.board.find((m) => m.uid === target.minionId);
    if (!victim || victim.attack > card.destroyMax) return null;
  }
  p.energy -= card.cost;
  p.hand.splice(handIndex, 1);
  p.lastElement = card.element;

  if (card.kind === 'minion') {
    const minion = {
      uid: `m${minionSerial++}`,
      cardId: card.id,
      name: card.name,
      element: card.element,
      attack: card.attack + bonus,
      health: card.health,
      maxHealth: card.health,
      taunt: !!card.taunt,
      canAttack: false,
    };
    p.board.push(minion);
    events.push({ type: 'summon', side, minion, synergy });
    pushLog(state, `${p.name} plays ${card.name} (${card.attack + bonus}/${card.health})${synergy ? ' — Synergy +1!' : ''}.`);
    if (card.draw) for (let i = 0; i < card.draw; i += 1) drawCard(state, side, false);
  } else {
    const dmg = (card.damage || 0) + bonus;
    if (card.heal) {
      const before = p.hp;
      p.hp = Math.min(MAX_HP, p.hp + card.heal);
      events.push({ type: 'heal', side, amount: p.hp - before });
      pushLog(state, `${p.name} restores ${p.hp - before} HP with ${card.name}.`);
    }
    if (card.destroyMax !== undefined) {
      // Target was validated above, so the victim always exists here.
      const victim = foe.board.find((m) => m.uid === target.minionId);
      foe.board = foe.board.filter((m) => m.uid !== victim.uid);
      events.push({ type: 'destroy', side: 1 - side, minion: victim });
      pushLog(state, `${card.name} destroys ${victim.name}!`);
    }
    if (card.damage && card.target === 'none') {
      const dead = [];
      for (const m of foe.board.slice()) {
        m.health -= dmg;
        events.push({ type: 'damage', side: 1 - side, minion: m, amount: dmg });
        if (m.health <= 0) dead.push(m);
      }
      for (const m of dead) {
        foe.board = foe.board.filter((x) => x.uid !== m.uid);
        pushLog(state, `${m.name} is destroyed by ${card.name}.`);
      }
      if (dead.length === 0) pushLog(state, `${p.name} plays ${card.name} (${dmg} to all enemy minions).`);
    }
    if (card.damage && card.target !== 'none') {
      if (target && target.kind === 'hero') {
        foe.hp -= dmg;
        events.push({ type: 'damage-hero', side: 1 - side, amount: dmg });
        pushLog(state, `${card.name} hits ${foe.name} for ${dmg}!`);
      } else if (target && target.kind === 'minion') {
        // Target was validated above, so the victim always exists here.
        const victim = foe.board.find((m) => m.uid === target.minionId);
        victim.health -= dmg;
        events.push({ type: 'damage', side: 1 - side, minion: victim, amount: dmg });
        if (victim.health <= 0) {
          foe.board = foe.board.filter((m) => m.uid !== victim.uid);
          pushLog(state, `${victim.name} is destroyed by ${card.name}.`);
        } else {
          pushLog(state, `${card.name} hits ${victim.name} for ${dmg}.`);
        }
      } else {
        return null;
      }
    }
    if (synergy && card.damage) pushLog(state, 'Element synergy: +1 damage!');
    if (card.draw) for (let i = 0; i < card.draw; i += 1) drawCard(state, side, false);
  }
  checkEnd(state);
  return events;
}

/** Targets a minion attack may legally hit (taunt forces itself first). */
export function legalAttackTargets(state, side) {
  const foe = state.players[1 - side];
  const taunts = foe.board.filter((m) => m.taunt);
  if (taunts.length > 0) return taunts.map((m) => ({ kind: 'minion', side: 1 - side, minionId: m.uid }));
  return [{ kind: 'hero', side: 1 - side }].concat(
    foe.board.map((m) => ({ kind: 'minion', side: 1 - side, minionId: m.uid })),
  );
}

/** A minion attacks: damage to the target, retaliation from a minion target. */
export function attackWithMinion(state, side, minionUid, target) {
  if (state.over || state.active !== side) return null;
  const p = state.players[side];
  const foe = state.players[1 - side];
  const attacker = p.board.find((m) => m.uid === minionUid);
  if (!attacker || !attacker.canAttack) return null;
  const legal = legalAttackTargets(state, side);
  const ok = legal.some((t) => t.kind === target.kind
    && (t.kind === 'hero' || t.minionId === target.minionId));
  if (!ok) return null;
  const events = [];
  attacker.canAttack = false;
  if (target.kind === 'hero') {
    foe.hp -= attacker.attack;
    events.push({ type: 'damage-hero', side: 1 - side, amount: attacker.attack, by: attacker });
    pushLog(state, `${attacker.name} attacks ${foe.name} for ${attacker.attack}!`);
  } else {
    const victim = foe.board.find((m) => m.uid === target.minionId);
    if (!victim) return null;
    victim.health -= attacker.attack;
    attacker.health -= victim.attack;
    events.push({ type: 'damage', side: 1 - side, minion: victim, amount: attacker.attack, by: attacker });
    events.push({ type: 'damage', side, minion: attacker, amount: victim.attack, by: victim });
    pushLog(state, `${attacker.name} attacks ${victim.name} (${attacker.attack} vs ${victim.attack}).`);
    if (victim.health <= 0) {
      foe.board = foe.board.filter((m) => m.uid !== victim.uid);
      pushLog(state, `${victim.name} is destroyed!`);
    }
    if (attacker.health <= 0) {
      p.board = p.board.filter((m) => m.uid !== attacker.uid);
      pushLog(state, `${attacker.name} falls to the counterattack!`);
    }
  }
  checkEnd(state);
  return events;
}

/** Decide the winner: the side whose hero still stands. Both at 0 goes to the attacker. */
export function checkEnd(state) {
  if (state.over) return;
  const a = state.players[0].hp;
  const b = state.players[1].hp;
  if (a <= 0 && b <= 0) {
    state.over = true;
    state.winner = state.active;
    pushLog(state, 'Both heroes fall — the attacker wins!');
  } else if (b <= 0) {
    state.over = true;
    state.winner = 0;
    pushLog(state, 'Kael falls! You win the duel!');
  } else if (a <= 0) {
    state.over = true;
    state.winner = 1;
    pushLog(state, 'You fall! Kael wins the duel.');
  }
}

/** All legal moves for `side`, for the AI and the self-test. */
export function legalMoves(state, side) {
  const moves = [];
  const p = state.players[side];
  for (let i = 0; i < p.hand.length; i += 1) {
    if (!canPlayCard(state, side, i)) continue;
    const card = cardById(p.hand[i]);
    if (card.kind === 'minion' || card.target === 'none' || card.target === 'own-hero') {
      moves.push({ type: 'card', handIndex: i, target: null });
    } else if (card.target === 'enemy-hero') {
      moves.push({ type: 'card', handIndex: i, target: { kind: 'hero', side: 1 - side } });
    } else {
      const foe = state.players[1 - side];
      if (card.target === 'any-enemy' || card.target === 'enemy-minion') {
        moves.push({ type: 'card', handIndex: i, target: { kind: 'hero', side: 1 - side } });
        for (const m of foe.board) {
          if (card.destroyMax !== undefined && m.attack > card.destroyMax) continue;
          moves.push({ type: 'card', handIndex: i, target: { kind: 'minion', side: 1 - side, minionId: m.uid } });
        }
      }
    }
  }
  for (const m of p.board) {
    if (!m.canAttack) continue;
    for (const t of legalAttackTargets(state, side)) {
      moves.push({ type: 'attack', minionUid: m.uid, target: t });
    }
  }
  return moves;
}

/** Deep-ish clone for AI lookahead: plain JSON round-trip is enough here. */
export function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
