// Emberclash renderer: DOM cards on a felt table. The stage is a fixed 1280x720
// scene scaled to the window, so the layout is identical at 1280x720 and
// 1920x1080. Cards are real DOM nodes (crisp text at any size), the table is
// CSS gradients, and every illustration is a procedural emoji glyph + gradient:
// no image files, no network. Clicks flow back to main.js through callbacks.
import { ELEMENTS, RARITY_STYLE, cardById } from './cards.js';
import { legalAttackTargets } from './engine.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

const STAGE_W = 1280;
const STAGE_H = 720;

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Build one card node. `size` is 'hand' (large) or 'board' (small). */
function cardNode(card, size, playable, extra) {
  const element = ELEMENTS[card.element];
  const node = el('div', `card ${size} rarity-${card.rarity}${playable ? ' playable' : ''}`);
  node.style.setProperty('--el', element.color);
  node.style.setProperty('--el-glow', element.glow);
  node.style.setProperty('--frame', RARITY_STYLE[card.rarity].border);
  const cost = el('div', 'cost', String(card.cost));
  const icon = el('div', 'el-icon', element.icon);
  const art = el('div', 'art', element.icon);
  const name = el('div', 'name', card.name);
  const elName = el('div', 'el-name', element.name);
  const text = el('div', 'text', card.text);
  node.append(cost, icon, art, name, elName, text);
  if (card.kind === 'minion') {
    const stats = el('div', 'stats');
    stats.append(el('span', 'atk', `⚔ ${extra?.attack ?? card.attack}`), el('span', 'hp', `♥ ${extra?.health ?? card.health}`));
    node.append(stats);
    if (extra?.taunt) node.append(el('div', 'taunt-badge', '🛡 TAUNT'));
    if (extra && extra.canAttack === false) node.classList.add('exhausted');
    if (extra && extra.canAttack) node.classList.add('ready');
  } else {
    const stats = el('div', 'stats spell-stats');
    const bits = [];
    if (card.damage) bits.push(`💥 ${card.damage + (extra?.bonus || 0)}`);
    if (card.heal) bits.push(`✚ ${card.heal}`);
    if (card.draw) bits.push(`🂠 +${card.draw}`);
    if (card.destroyMax !== undefined) bits.push('☠ destroy');
    stats.append(el('span', 'spell-bit', bits.join('  ')));
    node.append(stats);
  }
  return node;
}

export function createRenderer(stage, callbacks) {
  const table = el('div', 'table');
  const foeZone = el('div', 'zone foe-zone');
  const midZone = el('div', 'zone mid-zone');
  const myZone = el('div', 'zone my-zone');
  const floaters = el('div', 'floaters');
  const tooltip = el('div', 'tooltip');
  stage.append(table, foeZone, midZone, myZone, floaters, tooltip);
  table.append(foeZone, midZone, myZone);

  const foeHero = el('div', 'hero foe-hero');
  const foeHand = el('div', 'hand-backs');
  const foeBoard = el('div', 'board foe-board');
  foeZone.append(foeHero, foeBoard, foeHand);

  const turnBanner = el('div', 'turn-banner');
  const logBox = el('div', 'log');
  const endTurnBtn = el('button', 'end-turn', 'END TURN ⏎');
  endTurnBtn.addEventListener('click', () => callbacks.onEndTurn());
  const midLeft = el('div', 'mid-left');
  midLeft.append(turnBanner, logBox);
  midZone.append(midLeft, endTurnBtn);

  const myBoard = el('div', 'board my-board');
  const myHand = el('div', 'hand my-hand');
  const myHero = el('div', 'hero my-hero');
  myZone.append(myBoard, myHand, myHero);

  const titleScreen = el('div', 'overlay title-screen');
  titleScreen.innerHTML = `
    <div class="title-inner">
      <div class="title-flame">🔥</div>
      <h1>EMBERCLASH</h1>
      <p class="tagline">Duel of the Last Flame</p>
      <p class="pitch">Two flamekeepers. One last flame. Play cards, summon minions,
      and snuff out the enemy hero before your own fire dies.</p>
      <button class="play-btn">▶ &nbsp;START DUEL</button>
      <div class="howto">
        <h2>How to Play</h2>
        <ul>
          <li><b>Goal:</b> reduce the enemy hero from 30 HP to 0.</li>
          <li><b>Energy:</b> grows by 1 each turn (max 10). Cards cost energy equal to their cost.</li>
          <li><b>Minions:</b> click one to attack; it cannot attack on the turn it is played.</li>
          <li><b>Taunt 🛡:</b> enemies must attack this minion first.</li>
          <li><b>Element Synergy:</b> play two cards of the same element in a row for +1 attack/damage.</li>
          <li><b>Keyboard:</b> 1–7 play a hand card · Space = End Turn · M = mute · R = restart.</li>
        </ul>
      </div>
      <p class="credit">An original Emberclash game — built for the Make the best card game bounty.</p>
    </div>`;
  titleScreen.querySelector('.play-btn').addEventListener('click', () => callbacks.onPlay());
  stage.append(titleScreen);

  const endScreen = el('div', 'overlay end-screen hidden');
  endScreen.innerHTML = `
    <div class="end-inner">
      <div class="end-flame">🔥</div>
      <h1 class="end-title"></h1>
      <p class="end-sub"></p>
      <p class="end-stats"></p>
      <div class="end-buttons">
        <button class="play-btn again-btn">↻ &nbsp;PLAY AGAIN</button>
        <button class="ghost-btn title-btn">← &nbsp;BACK TO TITLE</button>
      </div>
    </div>`;
  endScreen.querySelector('.again-btn').addEventListener('click', () => callbacks.onRestart());
  endScreen.querySelector('.title-btn').addEventListener('click', () => callbacks.onTitle());
  stage.append(endScreen);

  let selectedHand = null;
  let selectedAttacker = null;
  let lastState = null;

  function fitStage() {
    const scale = Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);
    stage.style.transform = `translate(-50%, -50%) scale(${scale})`;
    // The shake keyframes reuse this scale so the scene never jumps size.
    stage.style.setProperty('--s', String(scale));
  }
  window.addEventListener('resize', fitStage);
  fitStage();

  function heroPanel(player, isFoe) {
    const node = el('div', 'hero-panel');
    const avatar = el('div', 'avatar', isFoe ? '😈' : '🧑‍🚀');
    const info = el('div', 'hero-info');
    const name = el('div', 'hero-name', player.name + (isFoe ? ' · Kael the Emberlord' : ' · Flamekeeper'));
    const hpBar = el('div', 'hp-bar');
    const hpFill = el('div', 'hp-fill');
    hpFill.style.width = `${Math.max(0, player.hp) / 30 * 100}%`;
    hpBar.append(hpFill, el('span', 'hp-text', `♥ ${Math.max(0, player.hp)} / 30`));
    const energy = el('div', 'energy', `◆ Energy ${player.energy}/${player.maxEnergy}   🂠 Deck ${player.deck.length}   ✋ ${player.hand.length} cards`);
    info.append(name, hpBar, energy);
    node.append(avatar, info);
    return node;
  }

  function clearSelection() {
    selectedHand = null;
    selectedAttacker = null;
    stage.querySelectorAll('.selected, .targetable').forEach((n) => n.classList.remove('selected', 'targetable'));
  }

  function markTargets(targets) {
    for (const t of targets) {
      if (t.kind === 'hero') {
        (t.side === 1 ? foeHero : myHero).classList.add('targetable');
      } else {
        const node = stage.querySelector(`[data-uid="${t.minionId}"]`);
        if (node) node.classList.add('targetable');
      }
    }
  }

  function playSelectedHand(target) {
    const index = selectedHand;
    clearSelection();
    callbacks.onPlayCard(index, target);
  }

  function attackSelected(target) {
    const uid = selectedAttacker;
    clearSelection();
    callbacks.onAttack(uid, target);
  }

  /** Paint a full state. `screen` is one of SCREEN_TITLE / SCREEN_PLAY / ... */
  function render(state, screen) {
    lastState = state;
    clearSelection();
    const me = state.players[0];
    const foe = state.players[1];

    foeHero.replaceChildren(heroPanel(foe, true));
    myHero.replaceChildren(heroPanel(me, false));

    foeHand.replaceChildren();
    for (let i = 0; i < foe.hand.length; i += 1) foeHand.append(el('div', 'card-back', '🔥'));

    foeBoard.replaceChildren();
    for (const m of foe.board) {
      const card = cardById(m.cardId);
      const node = cardNode(card, 'board', false, { attack: m.attack, health: m.health, taunt: m.taunt, canAttack: false });
      node.dataset.uid = m.uid;
      node.addEventListener('click', () => {
        if (selectedHand !== null) {
          playSelectedHand({ kind: 'minion', side: 1, minionId: m.uid });
        } else if (selectedAttacker) {
          attackSelected({ kind: 'minion', side: 1, minionId: m.uid });
        }
      });
      foeBoard.append(node);
    }

    myBoard.replaceChildren();
    for (const m of me.board) {
      const card = cardById(m.cardId);
      const node = cardNode(card, 'board', false, { attack: m.attack, health: m.health, taunt: m.taunt, canAttack: m.canAttack });
      node.dataset.uid = m.uid;
      node.addEventListener('click', () => {
        if (m.canAttack && state.active === 0 && !state.over) {
          clearSelection();
          selectedAttacker = m.uid;
          node.classList.add('selected');
          markTargets(legalAttackTargets(state, 0));
        }
      });
      myBoard.append(node);
    }

    myHand.replaceChildren();
    me.hand.forEach((id, i) => {
      const card = cardById(id);
      const playable = state.active === 0 && !state.over && me.energy >= card.cost
        && (card.kind !== 'minion' || me.board.length < 7);
      const node = cardNode(card, 'hand', playable, { bonus: me.lastElement === card.element ? 1 : 0 });
      node.dataset.handIndex = String(i);
      node.addEventListener('click', () => {
        if (!playable) return;
        clearSelection();
        selectedHand = i;
        node.classList.add('selected');
        if (card.kind === 'spell' && card.damage && card.target !== 'none') {
          const targets = [];
          if (card.target === 'any-enemy' || card.target === 'enemy-hero') targets.push({ kind: 'hero', side: 1 });
          if (card.target === 'any-enemy' || card.target === 'enemy-minion') {
            for (const m of foe.board) {
              if (card.destroyMax !== undefined && m.attack > card.destroyMax) continue;
              targets.push({ kind: 'minion', side: 1, minionId: m.uid });
            }
          }
          markTargets(targets);
        } else {
          playSelectedHand(null);
        }
      });
      node.addEventListener('mouseenter', (event) => showTooltip(card, event));
      node.addEventListener('mousemove', (event) => moveTooltip(event));
      node.addEventListener('mouseleave', hideTooltip);
      myHand.append(node);
    });

    foeHero.onclick = () => {
      if (selectedHand !== null) playSelectedHand({ kind: 'hero', side: 1 });
      else if (selectedAttacker) attackSelected({ kind: 'hero', side: 1 });
    };
    myHero.onclick = () => clearSelection();

    turnBanner.textContent = state.over
      ? (state.winner === 0 ? '🏆 You win!' : '💀 Kael wins!')
      : (state.active === 0 ? '— YOUR TURN — play a card, then End Turn' : '— Kael\'s turn… —');
    turnBanner.classList.toggle('foe-turn', state.active === 1 && !state.over);
    endTurnBtn.disabled = state.over || state.active !== 0;
    endTurnBtn.classList.toggle('pulse', state.active === 0 && !state.over);

    logBox.replaceChildren();
    for (const line of state.log.slice(-3)) logBox.append(el('div', 'log-line', line));

    titleScreen.classList.toggle('hidden', screen !== SCREEN_TITLE);
    endScreen.classList.toggle('hidden', screen !== SCREEN_WIN && screen !== SCREEN_LOSE);
    if (screen === SCREEN_WIN || screen === SCREEN_LOSE) {
      const won = screen === SCREEN_WIN;
      endScreen.querySelector('.end-title').textContent = won ? '🏆 VICTORY!' : '💀 DEFEAT';
      endScreen.querySelector('.end-title').className = `end-title ${won ? 'win' : 'lose'}`;
      endScreen.querySelector('.end-sub').textContent = won
        ? 'The last flame still burns in your hands. Kael is snuffed out.'
        : 'Your flame dies… Kael claims the last ember.';
      endScreen.querySelector('.end-stats').textContent =
        `Duel lasted ${state.turn} turns · Final HP ${Math.max(0, me.hp)} – ${Math.max(0, foe.hp)} · Seed ${state.seed}`;
      endScreen.querySelector('.end-flame').textContent = won ? '🔥' : '🌑';
    }
  }

  function showTooltip(card, event) {
    const element = ELEMENTS[card.element];
    tooltip.innerHTML = '';
    tooltip.append(
      el('div', 'tt-name', `${element.icon} ${card.name}`),
      el('div', 'tt-meta', `${element.name} · Cost ${card.cost} · ${RARITY_STYLE[card.rarity].label}`),
      el('div', 'tt-text', card.text),
    );
    tooltip.classList.add('visible');
    moveTooltip(event);
  }
  function moveTooltip(event) {
    const rect = stage.getBoundingClientRect();
    tooltip.style.left = `${(event.clientX - rect.left) / (rect.width / STAGE_W) - 110}px`;
    tooltip.style.top = `${(event.clientY - rect.top) / (rect.height / STAGE_H) - 130}px`;
  }
  function hideTooltip() { tooltip.classList.remove('visible'); }

  /** Floating damage/heal number over a hero panel or a minion node. */
  function floater(text, kind, anchorNode) {
    if (!anchorNode) return;
    const stageRect = stage.getBoundingClientRect();
    const rect = anchorNode.getBoundingClientRect();
    const node = el('div', `floater ${kind}`, text);
    node.style.left = `${(rect.left + rect.width / 2 - stageRect.left) / (stageRect.width / STAGE_W)}px`;
    node.style.top = `${(rect.top - stageRect.top) / (stageRect.height / STAGE_H)}px`;
    floaters.append(node);
    setTimeout(() => node.remove(), 1200);
  }

  function nodeFor(target) {
    if (!target) return null;
    if (target.kind === 'hero') return target.side === 1 ? foeHero : myHero;
    return stage.querySelector(`[data-uid="${target.minionId}"]`);
  }

  function shake(big) {
    stage.classList.remove('shake', 'shake-big');
    void stage.offsetWidth;
    stage.classList.add(big ? 'shake-big' : 'shake');
    setTimeout(() => stage.classList.remove('shake', 'shake-big'), 500);
  }

  return {
    render,
    clearSelection,
    floater,
    nodeFor,
    shake,
    get selectedHand() { return selectedHand; },
    get selectedAttacker() { return selectedAttacker; },
    get lastState() { return lastState; },
  };
}
