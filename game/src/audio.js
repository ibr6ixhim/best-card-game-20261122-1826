// Emberclash sound: every effect is synthesized with WebAudio, no audio files.
// A tiny helper builds short tones and noise bursts; mute is a single flag.
export function createAudio() {
  let context = null;
  let muted = false;

  function ensure() {
    if (!context) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        context = new AudioContext();
      } catch {
        context = null;
      }
    }
    if (context && context.state === 'suspended') context.resume().catch(() => {});
    return context;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  }

  function noise(dur, vol, low) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx) return;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = low;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    source.connect(filter).connect(gain).connect(ctx.destination);
    source.start();
  }

  return {
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    unlock() { ensure(); },
    flip() { noise(0.08, 0.25, 3000); tone(520, 0.07, 'triangle', 0.12, 760); },
    hit() { noise(0.18, 0.5, 900); tone(160, 0.2, 'sawtooth', 0.25, 60); },
    heal() { tone(523, 0.25, 'sine', 0.2, 784); tone(784, 0.3, 'sine', 0.15, 1046); },
    summon() { tone(220, 0.15, 'triangle', 0.2, 440); },
    win() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.35, 'triangle', 0.22), i * 130)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.4, 'sawtooth', 0.15), i * 160)); },
    click() { tone(700, 0.05, 'square', 0.08); },
    draw() { noise(0.06, 0.2, 4000); },
  };
}
