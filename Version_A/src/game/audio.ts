/**
 * Tiny WebAudio synth — no assets, all procedural.
 * Every sound is short and punchy so the loop stays cheap.
 */

type Ctx = AudioContext & { _unlocked?: boolean };

const PENT = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27];

class Sfx {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private boostSrc: AudioBufferSourceNode | null = null;
  private boostGain: GainNode | null = null;
  muted = false;

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return;
      const ctx = new AC() as Ctx;
      const master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      // shared noise buffer
      const len = Math.floor(ctx.sampleRate * 0.7);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
    if (m) this.stopBoost();
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slideTo?: number,
    delay = 0,
  ) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.muted) return;
    const t = this.now() + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private hiss(dur: number, vol: number, f0: number, f1: number, q = 1, delay = 0) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise || this.muted) return;
    const t = this.now() + delay;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp);
    bp.connect(g);
    g.connect(master);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  pickup(step: number) {
    const semi = PENT[Math.min(step, PENT.length - 1)];
    const f = 392 * Math.pow(2, semi / 12);
    this.tone(f, 0.11, "triangle", 0.22);
    this.tone(f * 2, 0.07, "sine", 0.1, undefined, 0.01);
  }

  gold() {
    [0, 4, 7, 12].forEach((s, i) =>
      this.tone(523 * Math.pow(2, s / 12), 0.16, "square", 0.13, undefined, i * 0.05),
    );
  }

  nitro() {
    this.tone(180, 0.32, "sawtooth", 0.14, 900);
    this.hiss(0.3, 0.1, 400, 3000, 2);
  }

  repair() {
    this.tone(660, 0.1, "square", 0.14);
    this.tone(880, 0.16, "square", 0.13, undefined, 0.09);
  }

  nearMiss() {
    this.hiss(0.22, 0.16, 2200, 240, 1.2);
  }

  topple() {
    this.tone(220, 0.09, "square", 0.1, 120);
    this.hiss(0.12, 0.09, 900, 300, 1);
  }

  bump() {
    this.tone(150, 0.4, "sawtooth", 0.3, 42);
    this.hiss(0.45, 0.34, 1400, 90, 0.7);
    this.tone(70, 0.5, "sine", 0.34, 40);
  }

  skid() {
    this.hiss(0.5, 0.2, 2600, 500, 3);
    this.tone(110, 0.3, "sawtooth", 0.12, 70);
  }

  crash() {
    this.tone(90, 0.9, "sawtooth", 0.34, 28);
    this.hiss(1.0, 0.4, 1800, 60, 0.6);
    this.tone(200, 0.7, "square", 0.16, 40, 0.05);
  }

  boostStart() {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noise || this.muted || this.boostSrc) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 700;
    bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.12);
    s.connect(bp);
    bp.connect(g);
    g.connect(master);
    s.start();
    this.boostSrc = s;
    this.boostGain = g;
    this.tone(120, 0.3, "sawtooth", 0.16, 420);
  }

  boostTick() {
    if (this.boostGain && this.ctx) {
      this.boostGain.gain.setTargetAtTime(0.13, this.ctx.currentTime, 0.08);
    }
  }

  stopBoost() {
    const ctx = this.ctx;
    if (!ctx || !this.boostSrc || !this.boostGain) return;
    const s = this.boostSrc;
    this.boostGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06);
    try {
      s.stop(ctx.currentTime + 0.3);
    } catch {
      /* noop */
    }
    this.boostSrc = null;
    this.boostGain = null;
  }

  ui(up = true) {
    this.tone(up ? 520 : 340, 0.07, "square", 0.1, up ? 720 : 240);
  }

  milestone() {
    [0, 7, 12, 19].forEach((s, i) =>
      this.tone(330 * Math.pow(2, s / 12), 0.22, "triangle", 0.15, undefined, i * 0.06),
    );
  }

  start() {
    [0, 5, 9, 12].forEach((s, i) =>
      this.tone(262 * Math.pow(2, s / 12), 0.18, "square", 0.12, undefined, i * 0.055),
    );
  }
}

export const sfx = new Sfx();
