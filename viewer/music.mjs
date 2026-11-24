// Procedural score scheduling. The injected clock and context keep audio testable.
import { moodOf } from '../src/kit/story.mjs';

/** Expand a fixed number of bars, retaining holds and independent voice patterns. */
export function notesOf(tune, start = 0, bars = 1, offset = 0, bpm = tune.bpm) {
  const unit = 60 / bpm / 4, notes = [];
  for (const voice of tune.voices) {
    const steps = voice.steps.trim().split(/\s+/).filter(Boolean);
    if (!steps.length) continue;
    for (let i = 0; i < bars * 16; i++) {
      const at = (offset * 16 + i) % steps.length, step = steps[at];
      if (step === '.' || step === '-') continue;
      let hold = 1;
      while (hold < steps.length && steps[(at + hold) % steps.length] === '-') hold++;
      const midi = tune.root + voice.oct * 12 + tune.scale[Number(step)];
      notes.push({ frequency: 440 * 2 ** ((midi - 69) / 12), start: start + i * unit,
        length: hold * unit, wave: voice.wave, volume: Math.min(10, voice.vol) / 10 });
    }
  }
  return notes.sort((a, b) => a.start - b.start);
}
/** Construct no context until toggle is called by the sound button. */
export function createMusic({ clock = globalThis, makeContext } = {}) {
  let context, master, timer, enabled = false, hidden = false, reduced = false;
  let desired = null, active = null, nextBar = 0, bar = 0, bpm = 84, pending = [];
  const live = new Set();
  const key = mood => mood ? JSON.stringify(mood) : '';
  function note(value) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = value.wave;
    oscillator.frequency.value = value.frequency;
    oscillator.connect(gain);
    gain.connect(master);
    const start = Math.max(context.currentTime, value.start), end = start + value.length;
    if (reduced) gain.gain.setValueAtTime(value.volume, start);
    else {
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(value.volume, start + Math.min(.01, value.length / 2));
      gain.gain.setValueAtTime(value.volume, Math.max(start + .01, end - .06));
      gain.gain.linearRampToValueAtTime(0, end);
    }
    live.add(oscillator);
    oscillator.onended = () => {
      live.delete(oscillator); oscillator.disconnect(); gain.disconnect?.();
    };
    oscillator.start(start);
    oscillator.stop(end);
  }
  function tick() {
    if (!enabled || hidden) return;
    const until = context.currentTime + .5;
    // Drop stale planning after a stalled tab; never enqueue a burst of old bars.
    if (nextBar < context.currentTime - .5) {
      pending = []; nextBar = context.currentTime; bar = 0;
    }
    while (nextBar < until) {
      if (key(desired) !== key(active)) {
        active = desired;
        if (active && (!reduced || bar === 0)) bpm = active.tune.bpm;
        bar = 0;
      }
      if (active) pending.push(...notesOf(active.tune, nextBar, 1, bar, bpm));
      nextBar += 16 * 60 / bpm / 4;
      bar++;
    }
    while (pending.length && pending[0].start < until) note(pending.shift());
  }
  function stop() {
    if (timer !== undefined) clock.clearInterval(timer);
    timer = undefined;
    pending = [];
    for (const oscillator of live) { oscillator.stop(); oscillator.disconnect(); }
    live.clear();
    if (master) master.gain.value = 0;
  }
  function start() {
    if (!enabled || hidden || !context) return;
    context.resume();
    master.gain.value = .15;
    nextBar = context.currentTime; bar = 0; active = null;
    tick();
    timer = clock.setInterval(tick, 200);
  }
  return {
    update(world) { desired = moodOf(world); },
    toggle() {
      enabled = !enabled;
      if (enabled) {
        if (!context) {
          context = makeContext();
          master = context.createGain();
          master.connect(context.destination);
        }
        start();
      } else { stop(); context?.suspend(); }
      return enabled;
    },
    reduced(value) { reduced = !!value; },
    hidden(value) {
      hidden = !!value;
      if (hidden) { stop(); context?.suspend(); }
      else start();
    },
    dispose() { enabled = false; stop(); context?.suspend(); }
  };
}
