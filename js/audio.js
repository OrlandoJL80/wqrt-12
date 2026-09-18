/* WQRT-12 — original period beds (70s / 80s / 90s library style) + SFX.
   Not licensed recordings. Synthesized to sit under analog broadcast. */
(function (global) {
  const Audio = {
    ctx: null,
    master: null,
    beds: {},
    currentBed: null,
    corruption: 0,
    _ringTimer: null,
    _speech: null,
    _alert: null,
    _hum: null,
    _noise: null,
    _music: null,
    _sched: null,
    _ahead: 0,
    _lfo: null,
  };

  function ctx() {
    if (!Audio.ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      Audio.ctx = new C();
      Audio.master = Audio.ctx.createGain();
      Audio.master.gain.value = 0.72;
      const comp = Audio.ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 10;
      comp.ratio.value = 3.5;
      Audio.master.connect(comp);
      comp.connect(Audio.ctx.destination);
    }
    return Audio.ctx;
  }
  function now() { return ctx().currentTime; }
  function midi(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  function pinkBuffer() {
    if (Audio._pinkBuf) return Audio._pinkBuf;
    const c = ctx();
    const len = Math.floor(c.sampleRate * 2);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    Audio._pinkBuf = buf;
    return buf;
  }
  function makePink(c) {
    const src = c.createBufferSource();
    src.buffer = pinkBuffer();
    src.loop = true;
    src.start();
    return src;
  }

  function osc(type, freq, gain) {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    o.start();
    return { o, g };
  }

  function connectBed(name, node, gainValue) {
    const g = ctx().createGain();
    g.gain.value = 0;
    node.connect(g);
    g.connect(Audio.master);
    Audio.beds[name] = { node, g, target: gainValue };
  }

  function fadeBed(name, to, t) {
    const bed = Audio.beds[name];
    if (!bed) return;
    const g = bed.g.gain;
    g.cancelScheduledValues(now());
    g.setValueAtTime(g.value, now());
    g.linearRampToValueAtTime(to, now() + t);
  }

  function tvBus() {
    if (Audio._music) return Audio._music;
    const c = ctx();
    const inG = c.createGain();
    inG.gain.value = 0.9;
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 160;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    const out = c.createGain();
    out.gain.value = 0;
    inG.connect(hp);
    hp.connect(lp);
    lp.connect(out);
    out.connect(Audio.master);
    Audio._music = { in: inG, out: out };
    return Audio._music;
  }

  function envGain(t, dur, peak, a, r) {
    const c = ctx();
    const g = c.createGain();
    a = a || 0.01;
    r = r || 0.12;
    peak = peak || 0.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    const hold = Math.max(0.02, dur - a - r);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  function tone(type, freq, t, dur, peak, dest, detune) {
    const c = ctx();
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    if (Audio._lfo && (Audio.currentBed === "survey" || Audio.corruption > 0.4)) {
      try { Audio._lfo.connect(o.detune); } catch (e) { /* ignore */ }
    }
    const g = envGain(t, dur, peak, 0.012, Math.min(0.25, dur * 0.4));
    o.connect(g);
    g.connect(dest || tvBus().in);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function organNote(freq, t, dur, peak, dest) {
    const c = ctx();
    const mix = c.createGain();
    const g = envGain(t, dur, peak, 0.04, 0.3);
    const harms = [1, 2, 3, 4, 6, 8];
    const amps = [0.35, 0.28, 0.16, 0.12, 0.08, 0.05];
    harms.forEach((h, i) => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * h;
      o.detune.value = (i - 2) * 1.5;
      const hg = c.createGain();
      hg.gain.value = amps[i];
      o.connect(hg);
      hg.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.08);
    });
    mix.connect(g);
    g.connect(dest || tvBus().in);
  }

  function rhodes(freq, t, dur, peak, dest) {
    const c = ctx();
    const car = c.createOscillator();
    const mod = c.createOscillator();
    const modG = c.createGain();
    car.type = "sine";
    mod.type = "sine";
    car.frequency.value = freq;
    mod.frequency.value = freq * 2;
    modG.gain.value = freq * 1.6;
    mod.connect(modG);
    modG.connect(car.frequency);
    const g = envGain(t, dur, peak, 0.008, 0.35);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    car.connect(lp);
    lp.connect(g);
    g.connect(dest || tvBus().in);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.05);
    mod.stop(t + dur + 0.05);
  }

  function brass(freq, t, dur, peak, dest) {
    const c = ctx();
    const mix = c.createGain();
    [0, 7, -9].forEach((d) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = d;
      o.connect(mix);
      o.start(t);
      o.stop(t + dur + 0.05);
    });
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.linearRampToValueAtTime(900, t + dur);
    const g = envGain(t, dur, peak, 0.03, 0.18);
    mix.connect(lp);
    lp.connect(g);
    g.connect(dest || tvBus().in);
  }

  function noiseHit(t, dur, peak, hpFreq, dest) {
    const c = ctx();
    const src = c.createBufferSource();
    src.buffer = pinkBuffer();
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = hpFreq || 4000;
    const g = envGain(t, dur, peak, 0.005, dur * 0.7);
    src.connect(hp);
    hp.connect(g);
    g.connect(dest || tvBus().in);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function bass(freq, t, dur, peak, dest) {
    tone("triangle", freq, t, dur, peak, dest, 0);
    tone("sine", freq * 0.5, t, dur, peak * 0.5, dest, 0);
  }

  /* ---- period loops (original library cues) ---- */
  function barLen(bpm) { return (60 / bpm) * 4; }

  function scheduleShop(t0, bar) {
    const dest = tvBus().in;
    const beat = bar / 4;
    const chords = [
      [48, 52, 55, 59],
      [45, 49, 52, 55],
      [50, 53, 57, 60],
      [43, 47, 50, 57],
    ];
    const roots = [36, 33, 38, 31];
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * bar;
      chords[b].forEach((n, i) => rhodes(midi(n), t, bar * 0.95, 0.035 / (1 + i * 0.15), dest));
      bass(midi(roots[b]), t, beat * 1.6, 0.11, dest);
      bass(midi(roots[b]), t + beat * 2, beat * 1.4, 0.09, dest);
      for (let s = 0; s < 8; s++) {
        noiseHit(t + s * (beat / 2), 0.04, s % 2 === 0 ? 0.03 : 0.018, 6000, dest);
      }
    }
    const lickT = t0 + 3 * bar + beat;
    [76, 74, 72, 67].forEach((n, i) => {
      rhodes(midi(n), lickT + i * (beat / 2), beat * 0.55, 0.045, dest);
    });
  }

  function scheduleFaith(t0, bar) {
    const dest = tvBus().in;
    const seq = [53, 48, 46, 53];
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * bar;
      const root = midi(seq[b]);
      organNote(root, t, bar * 0.98, 0.07, dest);
      organNote(root * 1.25, t, bar * 0.98, 0.045, dest);
      organNote(root * 1.5, t, bar * 0.98, 0.03, dest);
    }
    const stuck = midi(60);
    organNote(stuck, t0, bar * 4.05, 0.025 + Audio.corruption * 0.05, dest);
  }

  function scheduleSurvey(t0, bar) {
    const dest = tvBus().in;
    bass(midi(38), t0, bar * 4, 0.08, dest);
    tone("sine", midi(50), t0, bar * 4, 0.04, dest, -8);
    const notes = [62, 65, 67, 69, 67, 65, 62, 58];
    notes.forEach((n, i) => {
      const t = t0 + i * (bar / 2);
      tone("triangle", midi(n), t, bar * 0.45, 0.055, dest, 6);
      tone("sine", midi(n) * 2, t, bar * 0.3, 0.015, dest, 12);
    });
    noiseHit(t0 + bar * 2.5, 0.8, 0.04, 800, dest);
  }

  function scheduleWeather(t0, bar) {
    const dest = tvBus().in;
    const chords = [
      [53, 57, 60, 64],
      [50, 53, 57, 60],
      [55, 58, 62, 65],
      [48, 52, 55, 58],
    ];
    chords.forEach((ch, b) => {
      const t = t0 + b * bar;
      ch.forEach((n, i) => {
        tone("sine", midi(n), t, bar * 1.05, 0.03 / (1 + i * 0.2), dest, i * 3);
        rhodes(midi(n), t + 0.05, bar * 0.8, 0.028, dest);
      });
    });
  }

  function scheduleNews(t0, bar) {
    const dest = tvBus().in;
    const sting = [60, 64, 67, 72, 67];
    sting.forEach((n, i) => brass(midi(n), t0 + i * 0.11, 0.35, 0.07, dest));
    scheduleWeather(t0 + bar, bar);
  }

  function scheduleSat(t0, bar) {
    const dest = tvBus().in;
    tone("sine", 55, t0, bar * 4, 0.07, dest, 0);
    tone("sine", 82.4, t0, bar * 4, 0.045, dest, 0);
    const motif = [48, 51, 55, 56];
    motif.forEach((n, i) => tone("sine", midi(n), t0 + i * bar, bar * 0.9, 0.05, dest, 0));
  }

  function scheduleCam3(t0, bar) {
    const dest = tvBus().in;
    [220, 223.4, 227, 331, 110].forEach((f, i) => {
      tone("sine", f, t0, bar * 4, 0.03 + (i === 4 ? 0.04 : 0), dest, 0);
    });
    for (let i = 0; i < 6; i++) {
      noiseHit(t0 + i * (bar * 0.7) + 0.4, 0.5, 0.02, 500, dest);
    }
  }

  function scheduleId(t0) {
    const dest = tvBus().in;
    [60, 64, 67, 72].forEach((n, i) => brass(midi(n), t0 + i * 0.16, 0.5, 0.08, dest));
    rhodes(midi(72), t0 + 0.7, 1.2, 0.06, dest);
  }

  function scheduleQuiet(t0, bar) {
    const dest = tvBus().in;
    const chords = [
      [48, 51, 55, 58],
      [45, 48, 52, 55],
      [50, 53, 56, 60],
      [43, 46, 50, 55],
    ];
    chords.forEach((ch, b) => {
      const t = t0 + b * bar;
      ch.forEach((n, i) => organNote(midi(n), t, bar * 0.98, 0.04 / (1 + i * 0.2), dest));
    });
    tone("sine", 49, t0, bar * 4, 0.05, dest, 0);
  }

  function scheduleBarsTone() {
    /* 1 kHz lives on the static bed */
  }

  const LOOPS = {
    shop: { bpm: 104, bars: 4, fn: scheduleShop },
    faith: { bpm: 48, bars: 4, fn: scheduleFaith },
    survey: { bpm: 68, bars: 4, fn: scheduleSurvey },
    weather: { bpm: 84, bars: 4, fn: scheduleWeather },
    news: { bpm: 100, bars: 5, fn: scheduleNews },
    sat: { bpm: 40, bars: 4, fn: scheduleSat },
    cam3: { bpm: 46, bars: 4, fn: scheduleCam3 },
    id: { bpm: 90, bars: 2, fn: function (t0, bar) { scheduleId(t0); } },
    quiet: { bpm: 52, bars: 4, fn: scheduleQuiet },
  };

  function stopMusic() {
    if (Audio._sched) {
      clearTimeout(Audio._sched);
      Audio._sched = null;
    }
    const bus = tvBus();
    bus.out.gain.cancelScheduledValues(now());
    bus.out.gain.setValueAtTime(bus.out.gain.value, now());
    bus.out.gain.linearRampToValueAtTime(0, now() + 0.35);
  }

  function pumpMusic() {
    if (!Audio.currentBed || !LOOPS[Audio.currentBed]) return;
    const spec = LOOPS[Audio.currentBed];
    const bar = barLen(spec.bpm);
    const chunk = bar * spec.bars;
    const t = now();
    while (Audio._ahead < t + 2.2) {
      spec.fn(Audio._ahead, bar);
      Audio._ahead += chunk;
    }
    Audio._sched = setTimeout(pumpMusic, 450);
  }

  function startMusic(name) {
    stopMusic();
    Audio.currentBed = name;
    if (!LOOPS[name]) {
      Audio.currentBed = name;
      return;
    }
    const bus = tvBus();
    bus.out.gain.cancelScheduledValues(now());
    bus.out.gain.setValueAtTime(0, now());
    bus.out.gain.linearRampToValueAtTime(0.85, now() + 0.45);
    Audio._ahead = now() + 0.08;
    pumpMusic();
  }

  function ensureLfo() {
    if (Audio._lfo) return;
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o.frequency.value = 0.35;
    g.gain.value = 18;
    o.connect(g);
    o.start();
    Audio._lfo = g;
  }

  function ensureBeds() {
    if (Audio._hum) return;
    const c = ctx();
    ensureLfo();
    tvBus();

    Audio._noise = makePink(c);
    const noiseFilter = c.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.value = 1200;
    noiseFilter.Q.value = 0.4;
    Audio._noise.connect(noiseFilter);
    connectBed("hiss", noiseFilter, 0.04);

    const hum1 = osc("sine", 60, 1);
    const hum2 = osc("sine", 120, 0.35);
    const humMix = c.createGain();
    hum1.g.gain.value = 0.55;
    hum2.g.gain.value = 0.22;
    hum1.g.connect(humMix);
    hum2.g.connect(humMix);
    connectBed("hum", humMix, 0.07);
    Audio._hum = humMix;

    const bars = osc("sine", 1000, 1);
    connectBed("bars", bars.g, 0.08);
  }

  Audio.start = function () {
    ctx();
    if (Audio.ctx.state === "suspended") Audio.ctx.resume();
    ensureBeds();
    fadeBed("hiss", 0.04, 0.4);
    fadeBed("hum", 0.07, 0.8);
  };

  Audio.setBed = function (name) {
    ensureBeds();
    const prev = Audio.currentBed;
    fadeBed("bars", name === "bars" ? 0.08 : 0, 0.25);
    if (name === prev) return;
    if (name && LOOPS[name]) startMusic(name);
    else {
      stopMusic();
      Audio.currentBed = name || null;
    }
    if (prev && name && prev !== name) Audio.cart();
  };

  Audio.setCorruption = function (v) {
    Audio.corruption = Math.max(0, Math.min(1, v));
    if (!Audio.beds.hiss) return;
    fadeBed("hiss", 0.04 + Audio.corruption * 0.14, 0.25);
    fadeBed("hum", 0.07 + Audio.corruption * 0.1, 0.25);
    if (Audio._lfo) Audio._lfo.gain.setTargetAtTime(18 + Audio.corruption * 40, now(), 0.3);
    const bus = tvBus();
    if (Audio.corruption > 0.55 && Audio.currentBed === "shop") {
      startMusic("quiet");
    }
  };

  Audio.beep = function (freq, dur, level) {
    const c = ctx();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.value = freq || 880;
    g.gain.value = 0;
    o.connect(g);
    g.connect(Audio.master);
    const t = now();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level || 0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.07));
    o.start(t);
    o.stop(t + (dur || 0.07) + 0.02);
  };

  Audio.button = function () {
    Audio.beep(1400, 0.04, 0.045);
    Audio.beep(900, 0.03, 0.025);
  };

  Audio.cart = function () {
    const c = ctx();
    const t = now();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g);
    g.connect(Audio.master);
    o.start(t);
    o.stop(t + 0.14);
    noiseHit(t, 0.06, 0.05, 2000, Audio.master);
  };

  Audio.punch = function () {
    Audio.cart();
    Audio.beep(520, 0.07, 0.06);
  };

  Audio.phoneRing = function () {
    Audio.phoneStop();
    const ring = () => {
      const c = ctx();
      const t = now();
      [0, 0.22].forEach((off) => {
        const o = c.createOscillator();
        const o2 = c.createOscillator();
        const g = c.createGain();
        o.type = "square";
        o2.type = "square";
        o.frequency.value = 480;
        o2.frequency.value = 440;
        const mix = c.createGain();
        mix.gain.value = 0.07;
        o.connect(mix);
        o2.connect(mix);
        mix.connect(g);
        g.connect(Audio.master);
        g.gain.setValueAtTime(0, t + off);
        g.gain.linearRampToValueAtTime(0.09, t + off + 0.02);
        g.gain.setValueAtTime(0.09, t + off + 0.16);
        g.gain.linearRampToValueAtTime(0, t + off + 0.2);
        o.start(t + off);
        o2.start(t + off);
        o.stop(t + off + 0.22);
        o2.stop(t + off + 0.22);
      });
    };
    ring();
    Audio._ringTimer = setInterval(ring, 1400);
  };

  Audio.phoneStop = function () {
    if (Audio._ringTimer) {
      clearInterval(Audio._ringTimer);
      Audio._ringTimer = null;
    }
  };

  Audio.pickup = function () {
    Audio.phoneStop();
    Audio.beep(180, 0.12, 0.08);
  };

  Audio.hangup = function () {
    Audio.stopSpeech();
    Audio.beep(120, 0.18, 0.1);
  };

  Audio.knock = function () {
    const c = ctx();
    const t = now();
    [0, 0.16, 0.28].forEach((off, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = 90 - i * 8;
      g.gain.value = 0;
      o.connect(g);
      g.connect(Audio.master);
      g.gain.setValueAtTime(0, t + off);
      g.gain.linearRampToValueAtTime(0.22, t + off + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + off + 0.12);
      o.start(t + off);
      o.stop(t + off + 0.14);
    });
  };

  Audio.alertTones = function () {
    Audio.stopAlert();
    const c = ctx();
    const o = c.createOscillator();
    const o2 = c.createOscillator();
    const g = c.createGain();
    o.type = "sine";
    o2.type = "sine";
    o.frequency.value = 740;
    o2.frequency.value = 1048;
    g.gain.value = 0.11;
    o.connect(g);
    o2.connect(g);
    g.connect(Audio.master);
    o.start();
    o2.start();
    Audio._alert = { o, o2, g };
  };

  Audio.stopAlert = function () {
    if (!Audio._alert) return;
    try { Audio._alert.o.stop(); Audio._alert.o2.stop(); } catch (e) { /* already stopped */ }
    Audio._alert = null;
  };

  Audio.speechBed = function () {
    Audio.stopSpeech();
    const c = ctx();
    const noise = makePink(c);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    const g = c.createGain();
    g.gain.value = 0;
    noise.connect(bp);
    bp.connect(g);
    const toneV = osc("sawtooth", 110, 0.02);
    const tp = c.createBiquadFilter();
    tp.type = "lowpass";
    tp.frequency.value = 700;
    toneV.g.connect(tp);
    tp.connect(g);
    g.connect(Audio.master);
    const pulse = () => {
      if (!Audio._speech) return;
      const t = now();
      const on = 0.04 + Math.random() * 0.11;
      const off = 0.03 + Math.random() * 0.08;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.01);
      g.gain.linearRampToValueAtTime(0.0001, t + on);
      Audio._speech.timer = setTimeout(pulse, (on + off) * 1000);
    };
    Audio._speech = { noise, g, tone: toneV, timer: null };
    pulse();
  };

  Audio.stopSpeech = function () {
    if (!Audio._speech) return;
    clearTimeout(Audio._speech.timer);
    try { Audio._speech.noise.stop(); Audio._speech.tone.o.stop(); } catch (e) { /* already stopped */ }
    Audio._speech = null;
  };

  Audio.txKill = function () {
    Audio.setBed(null);
    Audio.stopAlert();
    Audio.stopSpeech();
    Audio.phoneStop();
    const c = ctx();
    const t = now();
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(20, t + 1.4);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g);
    g.connect(Audio.master);
    o.start(t);
    o.stop(t + 1.7);
    fadeBed("hiss", 0.01, 1);
    fadeBed("hum", 0.02, 1);
  };

  Audio.stinger = function () {
    const c = ctx();
    const t = now();
    brass(midi(36), t, 0.9, 0.12, Audio.master);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "sawtooth";
    o.frequency.value = 55;
    g.gain.value = 0;
    o.connect(g);
    g.connect(Audio.master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.2, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.start(t);
    o.stop(t + 1);
  };

  Audio.muteAll = function () {
    if (!Audio.master) return;
    Audio.master.gain.setTargetAtTime(0, now(), 0.2);
    stopMusic();
  };

  global.WQRTAudio = Audio;
})(window);
