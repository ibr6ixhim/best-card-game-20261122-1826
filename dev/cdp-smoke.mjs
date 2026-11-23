// Emberclash CDP smoke test (Node 22+, no dependencies): drives the real game
// in headless Chrome over the DevTools protocol — clicks START DUEL, plays
// cards, ends turns, lets the AI answer, and plays until the game ends, then
// restarts. Fails loudly on any console error, page error, or network request
// outside localhost. Run: `node dev/cdp-smoke.mjs` (serve.ts must be running).
// Development tooling only; never shipped in game/.
const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium-1255/chrome-linux64/chrome`;
const PORT = 9333;
const GAME_URL = 'http://localhost:8080/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

import { spawn } from 'node:child_process';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, '--window-size=1280,720', 'about:blank',
], { stdio: 'ignore' });

const errors = [];
const requests = [];
let ws;
let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evalJs(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (res.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(res.exceptionDetails)}`);
  return res.result?.value;
}

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(250);
    try {
      const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === 'page');
    } catch { /* chrome not up yet */ }
  }
  if (!target) throw new Error('no chrome target');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg.result);
      pending.delete(msg.id);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${JSON.stringify(msg.params.exceptionDetails).slice(0, 300)}`);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(`console.error: ${JSON.stringify(msg.params.args).slice(0, 300)}`);
    } else if (msg.method === 'Network.requestWillBeSent') {
      const url = msg.params.request.url;
      if (!url.startsWith('http://localhost:8080') && !url.startsWith('data:') && !url.startsWith('chrome')) {
        requests.push(url);
      }
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url: GAME_URL });
  await sleep(2000);

  const hasEmber = await evalJs(`!!window.__ember`);
  if (!hasEmber) throw new Error('game did not boot (no window.__ember)');
  console.log('boot: OK, title screen:', await evalJs(`window.__ember.screen`));

  await evalJs(`document.querySelector('.title-screen .play-btn').click()`);
  await sleep(500);
  console.log('after START DUEL, screen:', await evalJs(`window.__ember.screen`));

  // Play a full game on a time budget (the AI answers one move every 650 ms,
  // so a game takes a couple of minutes wall-clock): on the player's turn,
  // take one action per poll — play the first playable card (clicking its
  // target when it needs one) or attack with the first ready minion — then
  // end the turn; wait out the AI's moves.
  const deadline = Date.now() + 300000;
  let polls = 0;
  while (Date.now() < deadline) {
    polls += 1;
    const over = await evalJs(`window.__ember.state.over`);
    if (over) break;
    const active = await evalJs(`window.__ember.state.active`);
    if (active !== 0) { await sleep(800); continue; }
    const acted = await evalJs(`(() => {
      const card = document.querySelector('.my-hand .card.playable');
      if (card) {
        card.click();
        const t = document.querySelector('.foe-hero.targetable, .foe-board .card.targetable');
        if (t) { t.click(); return 'card-targeted'; }
        return 'card';
      }
      const minion = document.querySelector('.my-board .card.ready');
      if (minion) {
        minion.click();
        const t = document.querySelector('.foe-hero.targetable, .foe-board .card.targetable');
        if (t) { t.click(); return 'attack'; }
        return 'minion-no-target';
      }
      return 'none';
    })()`);
    if (acted === 'none' || acted === 'minion-no-target') {
      await evalJs(`document.querySelector('.end-turn').click()`);
      await sleep(1000);
    } else {
      await sleep(300);
    }
  }
  const finalState = await evalJs(`({ over: window.__ember.state.over, winner: window.__ember.state.winner, screen: window.__ember.screen, turns: window.__ember.state.turn })`);
  console.log('game over:', JSON.stringify(finalState));
  if (!finalState.over) throw new Error('game did not finish within the time budget');
  const endVisible = await evalJs(`!document.querySelector('.end-screen').classList.contains('hidden')`);
  console.log('end screen visible:', endVisible);
  if (!endVisible) throw new Error('end screen did not show');

  await evalJs(`document.querySelector('.end-screen .again-btn').click()`);
  await sleep(500);
  const restarted = await evalJs(`({ screen: window.__ember.screen, over: window.__ember.state.over })`);
  console.log('after PLAY AGAIN:', JSON.stringify(restarted));
  if (restarted.screen !== 'play' || restarted.over) throw new Error('restart failed');

  console.log('console errors:', errors.length ? errors : 'none');
  console.log('non-local requests:', requests.length ? requests : 'none');
  if (errors.length > 0) throw new Error('console/page errors found');
  if (requests.length > 0) throw new Error('network requests found');
  console.log('CDP SMOKE TEST PASSED');
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  chrome.kill();
}
process.exit(0);
