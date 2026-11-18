// All sound is synthesized with WebAudio, no files. One AudioContext is made on the first user
// gesture; every effect is a short oscillator or noise burst, and the car engine is a continuous
// oscillator whose pitch follows speed. Every call is guarded, so the game runs silently where
// audio is blocked.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engine = null;
  let engineGain = null;
  let lastSiren = 0;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(type, f0, f1, dur, gain, delay = 0) {
    const c = ensure();
    if (!c) return;
    try {
      const t = c.currentTime + delay;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch {
      // ignore
    }
  }

  function noise(dur, gain, filterFreq, delay = 0) {
    const c = ensure();
    if (!c) return;
    try {
      const t = c.currentTime + delay;
      const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const g = c.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch {
      // ignore
    }
  }

  return {
    shot() {
      tone('square', 900, 220, 0.09, 0.25);
      noise(0.05, 0.2, 3000);
    },
    swing() {
      noise(0.12, 0.12, 1200);
      tone('triangle', 300, 120, 0.12, 0.1);
    },
    crash() {
      noise(0.25, 0.4, 900);
      tone('sawtooth', 120, 40, 0.3, 0.25);
    },
    cash() {
      tone('square', 880, 880, 0.08, 0.18);
      tone('square', 1320, 1320, 0.1, 0.18, 0.08);
    },
    hurt() {
      tone('sawtooth', 180, 70, 0.2, 0.3);
    },
    pickup() {
      tone('sine', 520, 780, 0.12, 0.2);
    },
    alert() {
      tone('square', 660, 660, 0.12, 0.2);
      tone('square', 880, 880, 0.12, 0.2, 0.14);
    },
    horn() {
      tone('square', 420, 400, 0.3, 0.12);
    },
    siren(now) {
      if (now - lastSiren < 0.9) return;
      lastSiren = now;
      tone('sawtooth', 600, 1100, 0.4, 0.08);
      tone('sawtooth', 1100, 600, 0.4, 0.08, 0.4);
    },
    step() {
      noise(0.04, 0.04, 700);
    },
    startEngine() {
      const c = ensure();
      if (!c || engine) return;
      engine = c.createOscillator();
      engine.type = 'sawtooth';
      engine.frequency.value = 60;
      engineGain = c.createGain();
      engineGain.gain.value = 0.0;
      engine.connect(engineGain);
      engineGain.connect(master);
      engine.start();
    },
    updateEngine(speed) {
      if (!engine || !engineGain || !ctx) return;
      const f = 50 + Math.min(1, Math.abs(speed) / 350) * 160;
      engine.frequency.setTargetAtTime(f, ctx.currentTime, 0.05);
      engineGain.gain.setTargetAtTime(Math.abs(speed) > 5 ? 0.05 : 0, ctx.currentTime, 0.08);
    },
    stopEngine() {
      if (!engine) return;
      try {
        engine.stop();
      } catch {
        // ignore
      }
      engine = null;
      engineGain = null;
    },
  };
}
