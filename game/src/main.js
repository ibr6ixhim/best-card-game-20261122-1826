// Emberclash bootstrap and main loop: owns the screen state, wires the renderer,
// audio and input together, and runs the AI turn as a slow, visible sequence so
// the player can follow what Kael does. Shot mode (?shot=start|play|win|lose)
// stages one deterministic scene instead of running the loop, for screenshots.
import { createRandom } from './random.js';
import { attackWithMinion, createGame, endTurn, playCard } from './engine.js';
import { chooseMove } from './ai.js';
import { createAudio } from './audio.js';
import { bindKeyboard } from './input.js';
import { SCREEN_LOSE, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN, createRenderer } from './render.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const stage = document.getElementById('stage');
const audio = createAudio();
let state = createGame(createRandom(seed), seed);
let screen = SCREEN_TITLE;
let endSoundPlayed = false;

const renderer = createRenderer(stage, {
  onPlay: () => { audio.unlock(); audio.click(); startDuel(); },
  onPlayCard: (handIndex, target) => playHandCard(handIndex, target),
  onAttack: (minionUid, target) => attack(minionUid, target),
  onEndTurn: () => endPlayerTurn(),
  onRestart: () => { audio.click(); startDuel(); },
  onTitle: () => { screen = SCREEN_TITLE; renderer.render(state, screen); },
  onMute: () => toggleMute(),
});

/** Top-right controls: mute and restart, always visible above the table. */
const controls = document.createElement('div');
controls.className = 'controls';
const muteBtn = document.createElement('button');
muteBtn.className = 'ctrl-btn';
muteBtn.textContent = '🔊 Sound: On';
muteBtn.addEventListener('click', () => toggleMute());
const restartBtn = document.createElement('button');
restartBtn.className = 'ctrl-btn';
restartBtn.textContent = '↻ Restart (R)';
restartBtn.addEventListener('click', () => { audio.click(); startDuel(); });
controls.append(muteBtn, restartBtn);
stage.append(controls);

function toggleMute() {
  const muted = audio.toggleMute();
  muteBtn.textContent = muted ? '🔇 Sound: Off' : '🔊 Sound: On';
}

function startDuel() {
  const freshSeed = Math.floor(Math.random() * 4294967296);
  state = createGame(createRandom(freshSeed), freshSeed);
  screen = SCREEN_PLAY;
  endSoundPlayed = false;
  renderer.render(state, screen);
}

function renderAll() {
  renderer.render(state, screen);
}

/** Show damage numbers, sounds and shake for the events one action caused. */
function showEffects(events) {
  if (!events) return;
  for (const event of events) {
    if (event.type === 'summon') audio.summon();
    else if (event.type === 'heal') {
      audio.heal();
      renderer.floater(`+${event.amount}`, 'heal', renderer.nodeFor({ kind: 'hero', side: event.side }));
    } else if (event.type === 'damage-hero') {
      audio.hit();
      renderer.floater(`-${event.amount}`, 'damage', renderer.nodeFor({ kind: 'hero', side: event.side }));
      if (event.amount >= 5) renderer.shake(true);
    } else if (event.type === 'damage') {
      audio.hit();
      renderer.floater(`-${event.amount}`, 'damage', renderer.nodeFor({ kind: 'minion', side: event.side, minionId: event.minion.uid }));
    } else if (event.type === 'destroy') {
      audio.hit();
      renderer.shake(false);
    }
  }
}

/** After any action, switch to the end screen (once) when the game is over. */
function finishIfOver() {
  if (!state.over) return false;
  screen = state.winner === 0 ? SCREEN_WIN : SCREEN_LOSE;
  if (!endSoundPlayed) {
    endSoundPlayed = true;
    if (state.winner === 0) audio.win();
    else audio.lose();
  }
  return true;
}

function playHandCard(handIndex, target) {
  if (screen !== SCREEN_PLAY || state.over || state.active !== 0) return;
  const events = playCard(state, 0, handIndex, target);
  if (!events) return;
  audio.flip();
  showEffects(events);
  finishIfOver();
  renderAll();
}

function attack(minionUid, target) {
  if (screen !== SCREEN_PLAY || state.over || state.active !== 0) return;
  const events = attackWithMinion(state, 0, minionUid, target);
  if (!events) return;
  showEffects(events);
  finishIfOver();
  renderAll();
}

function endPlayerTurn() {
  if (screen !== SCREEN_PLAY || state.over || state.active !== 0) return;
  audio.click();
  endTurn(state);
  renderAll();
  setTimeout(runAiStep, 650);
}

/** One AI move at a time, so the player sees Kael play instead of a jump cut. */
function runAiStep() {
  if (state.over || state.active !== 1) return;
  const move = chooseMove(state, 1);
  if (!move) {
    endTurn(state);
    renderAll();
    return;
  }
  const events = move.type === 'card'
    ? playCard(state, 1, move.handIndex, move.target)
    : attackWithMinion(state, 1, move.minionUid, move.target);
  showEffects(events);
  if (finishIfOver()) {
    renderAll();
    return;
  }
  renderAll();
  setTimeout(runAiStep, 650);
}

bindKeyboard({
  onEndTurn: () => endPlayerTurn(),
  onMute: () => toggleMute(),
  onRestart: () => startDuel(),
  onPlayHand: (index) => {
    const node = stage.querySelector(`[data-hand-index="${index}"]`);
    if (node) node.click();
  },
  onCancel: () => renderer.clearSelection(),
});

// Debug handle for automated smoke tests (read-only state, no cheats): the
// CDP smoke test drives the real buttons and reads the game through this.
window.__ember = {
  get state() { return state; },
  get screen() { return screen; },
};

if (shot) {
  // Screenshot mode: stage one deterministic scene, paint it twice, and flag
  // readiness for the headless screenshot run.
  const scene = stageShot(shot, seed);
  state = scene.state;
  screen = scene.screen;
  let painted = 0;
  const paint = () => {
    renderer.render(state, screen);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  renderer.render(state, SCREEN_TITLE);
}
