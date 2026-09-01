// Procedural rain + thunder using WebAudio. No assets, starts only after a user gesture.
export function createAudio() {
  let ctx = null, master = null, rainGain = null, enabled = false;

  function noiseBuffer(seconds) {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(2, sr * seconds, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        // pinkish noise via simple filter cascade
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.12;
      }
    }
    return buf;
  }

  function start() {
    if (ctx) { ctx.resume(); enabled = true; master.gain.setTargetAtTime(1, ctx.currentTime, 0.4); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // rain bed: pink noise -> band-pass, slow amplitude wobble
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 400;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.12;
    lfo.connect(lfoG).connect(rainGain.gain);
    lfo.start();
    src.connect(bp).connect(hp).connect(rainGain).connect(master);
    src.start();

    // distant city hum
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth'; hum.frequency.value = 55;
    const humF = ctx.createBiquadFilter();
    humF.type = 'lowpass'; humF.frequency.value = 120;
    const humG = ctx.createGain();
    humG.gain.value = 0.05;
    hum.connect(humF).connect(humG).connect(master);
    hum.start();

    enabled = true;
    master.gain.setTargetAtTime(1, ctx.currentTime, 0.6);
  }

  function stop() {
    if (!ctx) return;
    enabled = false;
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
  }

  function thunder(delay = 0.6, strength = 1) {
    if (!ctx || !enabled) return;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(220, t0); lp.frequency.exponentialRampToValueAtTime(60, t0 + 2.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(1.8 * strength, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 2.8);
    src.connect(lp).connect(g).connect(master);
    src.start(t0); src.stop(t0 + 3);
  }

  function setRainLevel(v) { if (rainGain) rainGain.gain.setTargetAtTime(0.55 * v, ctx.currentTime, 0.5); }

  return { start, stop, thunder, setRainLevel, get enabled() { return enabled; } };
}
