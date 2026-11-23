// Emberclash input: mouse clicks on cards, minions and buttons, plus keyboard
// shortcuts. This module only translates raw events into game intents and hands
// them to callbacks the main loop owns; it holds no game state itself.
// Shortcuts: 1-7 play a hand card, Space/Enter ends the turn, M mutes, R restarts.
export const KEY_END_TURN = ' ';
export const KEY_MUTE = 'm';
export const KEY_RESTART = 'r';

/**
 * Bind the keyboard. Returns an unsubscribe function.
 * onEndTurn / onMute / onRestart / onPlayHand (index) are the callbacks.
 */
export function bindKeyboard(callbacks) {
  function onKey(event) {
    if (event.repeat) return;
    const key = event.key.toLowerCase();
    if (key === ' ' || key === 'enter') {
      event.preventDefault();
      callbacks.onEndTurn();
    } else if (key === KEY_MUTE) {
      callbacks.onMute();
    } else if (key === KEY_RESTART) {
      callbacks.onRestart();
    } else if (key >= '1' && key <= '7') {
      callbacks.onPlayHand(Number(key) - 1);
    } else if (key === 'escape') {
      callbacks.onCancel();
    }
  }
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
