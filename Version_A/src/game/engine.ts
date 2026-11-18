import { sfx } from "./audio";
import { render } from "./render";
import type {
  Ent,
  EntKind,
  Float,
  Hud,
  Part,
  Phase,
  Prop,
  RunResult,
} from "./types";

/* ------------------------------------------------------------------ *
 * World constants (arbitrary world units — projection scales them)
 * ------------------------------------------------------------------ */
const CAM_H = 1000; // camera height above the road
const PLAYER_Z = 1000; // distance from camera to the truck
const NEAR_Z = 220; // anything closer is behind us
const FAR_Z = 46000; // draw distance
const KPH = 0.0072; // world units/s -> km/h (display)
const MPU = 0.002; // world units -> metres (display)
const TWEEN = 0.145; // lane change duration (s)
const MAX_PARTS = 420;
const CARGO_MAX = 25; // what the bed can hold — overflow pays a bonus

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export class Game {
  /* canvas / projection */
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  W = 800;
  H = 600;
  dpr = 1;
  cx = 400;
  horizon = 240;
  focal = 300;
  focalNow = 300;
  roadHalf = 1000;
  laneW = 660;
  truckW = 400;
  truckH = 500;
  truckLen = 720;
  boxSize = 100;

  /* phase */
  phase: Phase = "menu";
  t = 0;
  running = false;
  private raf = 0;
  private last = 0;
  demo = true;

  /* truck */
  lane = 1;
  laneX = 0;
  prevLaneX = 0;
  fromX = 0;
  toX = 0;
  tweenT = 1;
  latVel = 0;
  tilt = 0;
  lean = 0;
  leanVel = 0;
  bob = 0;
  cargo = 0;
  bolts = 2;
  invuln = 0;
  toppleCd = 0;
  boxes: { p: number; a: number }[] = [];

  /* drive */
  nitro = 100;
  boosting = false;
  boostPower = 0;
  brake = false;
  speed = 0;
  distance = 0;
  meters = 0;
  diff = 0;

  /* score */
  score = 0;
  dispScore = 0;
  mult = 1;
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  pkgs = 0;
  nearMisses = 0;
  milestone = 0;

  /* world entities */
  ents: Ent[] = [];
  parts: Part[] = [];
  floats: Float[] = [];
  props: Prop[] = [];
  waveAcc = 0;
  propAcc = 0;
  cloudX = 0;
  hintDone = false;

  /* fx */
  shake = 0;
  shakeX = 0;
  shakeY = 0;
  roll = 0;
  flash = 0;
  flashCol = "255,255,255";
  timeScale = 1;
  crashT = 0;
  hurtDir = 0;

  /* ui plumbing */
  toast = "";
  toastT = 0;
  toastKey = 0;
  inputLocked = false;
  onHud: (h: Hud) => void = () => {};
  onResult: (r: RunResult) => void = () => {};
  /** host app may want to log the score before the next run starts */
  onRestartRequest: () => void = () => this.restart();

  /* -------------------------------------------------------------- */
  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.resize();
    this.resetRun(true);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    if (!this.running) {
      this.running = true;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
    sfx.stopBoost();
  }

  private onResize = () => this.resize();
  private onBlur = () => {
    if (document.visibilityState === "hidden" && this.phase === "playing") this.pause();
    this.keys.clear();
    this.boostHeld = false;
    this.brakeHeld = false;
    this.brake = false;
    sfx.stopBoost();
  };

  resize() {
    const c = this.canvas;
    if (!c) return;
    const parent = c.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    const mobile = w * h < 520000;
    this.W = Math.max(320, w);
    this.H = Math.max(360, h);
    // keep the backing store inside a pixel budget so fill-rate stays 60fps-safe
    const budget = 3.3e6;
    let dpr = clamp(window.devicePixelRatio || 1, 1, mobile ? 1.75 : 2);
    const need = this.W * this.H * dpr * dpr;
    if (need > budget) dpr = Math.max(1, Math.sqrt(budget / (this.W * this.H)));
    this.dpr = dpr;
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    c.style.width = this.W + "px";
    c.style.height = this.H + "px";
    const ctx = this.ctx;
    if (ctx) ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.cx = this.W / 2;
    this.horizon = this.H * 0.385;
    this.focal = this.H * 0.44;
    this.focalNow = this.focal;
    const oldLane = this.laneW;
    this.roadHalf = (0.36 * this.W * PLAYER_Z) / this.focal;
    this.laneW = (this.roadHalf * 2) / 3;
    // keep everything already on the road proportional through a resize
    if (oldLane > 0 && Math.abs(oldLane - this.laneW) > 0.5) {
      const k = this.laneW / oldLane;
      this.laneX *= k;
      this.prevLaneX *= k;
      this.fromX *= k;
      this.toX *= k;
      for (const e of this.ents) {
        e.x *= k;
        e.w *= k;
        e.h *= k;
        e.len *= k;
      }
      for (const p of this.parts) {
        p.x *= k;
        p.size *= k;
      }
    }
    this.truckW = this.laneW * 0.6;
    this.truckH = this.truckW * 1.24;
    this.truckLen = this.truckW * 1.8;
    this.boxSize = this.truckW * 0.27;
  }

  /* -------------------------------------------------------------- */
  proj(x: number, dz: number) {
    const s = this.focalNow / dz;
    return { x: this.cx + (x - this.laneX) * s, y: this.horizon + CAM_H * s, s };
  }

  laneToWorld(l: number) {
    return (l - 1) * this.laneW;
  }

  /* -------------------------------------------------------------- */
  resetRun(demo: boolean) {
    this.demo = demo;
    this.lane = 1;
    this.laneX = 0;
    this.prevLaneX = 0;
    this.fromX = 0;
    this.toX = 0;
    this.tweenT = 1;
    this.latVel = 0;
    this.tilt = 0;
    this.lean = 0;
    this.leanVel = 0;
    this.cargo = 0;
    this.bolts = 2;
    this.invuln = 0;
    this.toppleCd = 0;
    this.nitro = demo ? 100 : 62;
    this.boosting = false;
    this.boostPower = 0;
    this.burstUntil = -1;
    this.brake = false;
    this.speed = demo ? 13000 : 12200;
    this.distance = 0;
    this.meters = 0;
    this.diff = 0;
    this.score = 0;
    this.dispScore = 0;
    this.mult = 1;
    this.combo = 0;
    this.comboT = 0;
    this.bestCombo = 0;
    this.pkgs = 0;
    this.nearMisses = 0;
    this.milestone = 0;
    this.ents.length = 0;
    this.floats.length = 0;
    this.props.length = 0;
    this.parts.length = 0;
    this.waveAcc = 0;
    this.propAcc = 0;
    this.hintDone = false;
    this.shake = 0;
    this.roll = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.crashT = 0;
    this.hurtDir = 0;
    this.toast = "";
    this.toastT = 0;
    this.boxes.length = 0;
    // prefill roadside scenery so the first frame isn't empty
    for (let i = 0; i < 22; i++) {
      this.spawnProp(1200 + i * 1500);
    }
    this.lastStruct = "";
    this.lastFine = "";
  }

  start() {
    sfx.unlock();
    this.resetRun(false);
    // pre-populate the highway so there is something to do in the first second
    this.spawnWave(1.05);
    this.spawnWave(2.05);
    this.spawnWave(3.1);
    this.phase = "playing";
    sfx.start();
    this.pushToast("EN ROUTE !");
    this.emit(true);
  }

  restart() {
    this.start();
  }

  toMenu() {
    this.resetRun(true);
    this.phase = "menu";
    sfx.stopBoost();
    this.emit(true);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.boosting = false;
    sfx.stopBoost();
    sfx.ui(false);
    this.emit(true);
  }

  resume() {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.last = performance.now();
    sfx.ui(true);
    this.emit(true);
  }

  togglePause() {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  /* -------------------------------------------------------------- */
  keys = new Set<string>();
  boostHeld = false;
  brakeHeld = false;

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (
      ["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "spacebar"].includes(k) ||
      ["a", "d", "w", "s"].includes(k)
    ) {
      e.preventDefault();
    }
    if (this.inputLocked) return;
    if (this.keys.has(k)) return;
    this.keys.add(k);
    sfx.unlock();

    if (k === "p" || k === "escape") {
      this.togglePause();
      return;
    }
    if (k === "m") {
      sfx.setMuted(!sfx.muted);
      this.emit(true);
      return;
    }
    if (this.phase === "menu") {
      if (k === "enter" || k === " ") this.start();
      return;
    }
    if (this.phase === "over") {
      if (k === "enter" || k === " ") this.onRestartRequest();
      return;
    }
    if (this.phase !== "playing") return;
    if (k === "arrowleft" || k === "a") this.step(-1);
    else if (k === "arrowright" || k === "d") this.step(1);
    else if (k === " " || k === "arrowup" || k === "w" || k === "shift") this.setBoost(true);
    else if (k === "arrowdown" || k === "s") this.setBrake(true);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    if (k === " " || k === "arrowup" || k === "w" || k === "shift") this.setBoost(false);
    if (k === "arrowdown" || k === "s") this.setBrake(false);
  };

  step(dir: number) {
    if (this.phase !== "playing") return;
    const next = clamp(this.lane + dir, 0, 2);
    if (next === this.lane && this.tweenT >= 1) {
      // nudge feedback even at the wall
      this.leanVel += dir * 1.4;
      return;
    }
    if (next === this.lane) return;
    this.lane = next;
    this.fromX = this.laneX;
    this.toX = this.laneToWorld(next);
    this.tweenT = 0;
    sfx.ui(true);
  }

  setBoost(b: boolean) {
    this.boostHeld = b;
    if (!b) {
      this.boosting = false;
      sfx.stopBoost();
    }
  }

  setBrake(b: boolean) {
    this.brakeHeld = b;
    this.brake = b;
  }

  /** tap-to-burst boost for touch */
  private burstUntil = -1;
  boostBurst() {
    if (this.phase !== "playing") return;
    if (this.nitro < 10) {
      this.pushToast("NITRO VIDE");
      sfx.ui(false);
      return;
    }
    this.burstUntil = this.t + 1.15;
    this.setBoost(true);
  }

  /* -------------------------------------------------------------- */
  private loop = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const raw = Math.min(0.05, (now - this.last) / 1000) || 0.016;
    this.last = now;
    if (this.phase !== "paused") {
      this.timeScale = lerp(this.timeScale, 1, Math.min(1, raw * 3.2));
      this.update(raw * this.timeScale, raw);
    }
    const ctx = this.ctx;
    if (ctx) render(this, ctx);
    this.emit(false);
  };

  /* -------------------------------------------------------------- */
  update(dt: number, rawDt: number) {
    this.t += rawDt;
    this.cloudX += rawDt * 6;

    if (this.phase === "over") {
      // coast the wreck to a stop behind the game-over card
      this.speed = lerp(this.speed, 0, Math.min(1, dt * 1.1));
      this.distance += this.speed * dt;
      this.meters = this.distance * MPU;
      this.bob += dt * 2;
      this.damageSmoke(dt * 34);
      this.updateEnts(dt);
      this.updateProps(dt);
      this.updateParticles(dt);
      this.updateFx(rawDt);
      this.focalNow = lerp(this.focalNow, this.focal, Math.min(1, dt * 3));
      return;
    }

    /* ---- difficulty & speed ---- */
    this.diff = clamp(this.meters / 3200, 0, 1.28);
    const target =
      (12200 + 10500 * this.diff) * (this.brake ? 0.6 : 1) * (1 + 0.46 * this.boostPower);
    this.speed = lerp(this.speed, target, Math.min(1, dt * (this.brake ? 5 : 1.3)));
    const ds = this.speed * dt;
    this.distance += ds;
    this.meters = this.distance * MPU;

    /* ---- boost ---- */
    if (this.burstUntil > 0 && this.t >= this.burstUntil) {
      this.burstUntil = -1;
      this.setBoost(false);
    }
    const wantsBoost =
      (this.boostHeld || this.keys.has(" ") || this.keys.has("arrowup") || this.keys.has("w")) &&
      this.nitro > 1 &&
      this.phase === "playing";
    if (wantsBoost && !this.boosting) {
      this.boosting = true;
      sfx.boostStart();
    } else if (!wantsBoost && this.boosting) {
      this.boosting = false;
      sfx.stopBoost();
    }
    this.boostPower = lerp(this.boostPower, this.boosting ? 1 : 0, Math.min(1, dt * 7));
    if (this.boosting) {
      this.nitro = Math.max(0, this.nitro - 30 * dt);
      if (Math.random() < dt * 60) this.boostTrail();
      if (this.nitro <= 0) {
        this.boosting = false;
        sfx.stopBoost();
      }
    }
    // wrecked rig belches smoke
    if (this.bolts < 2 && !this.demo) this.damageSmoke(dt * 16);
    // tyre dust — hangs behind the rig so it reads as a trail, not a strobe
    if (Math.random() < dt * 30) {
      const sd = Math.random() < 0.5 ? -1 : 1;
      this.addPart(
        this.laneX + sd * this.truckW * 0.55,
        6,
        PLAYER_Z - rnd(140, 0),
        sd * rnd(240, 40),
        rnd(210, 50),
        this.speed * rnd(0.92, 0.68),
        rnd(1.1, 0.5),
        rnd(this.truckW * 0.26, this.truckW * 0.1),
        3,
        "#8a7a63",
      );
    }
    this.focalNow = this.focal * (1 + 0.075 * this.boostPower);

    /* ---- steering ---- */
    if (this.demo) this.autopilot(dt);
    this.prevLaneX = this.laneX;
    if (this.tweenT < 1) {
      this.tweenT = Math.min(1, this.tweenT + dt / TWEEN);
      const e = easeOut(this.tweenT);
      const prev = this.laneX;
      this.laneX = lerp(this.fromX, this.toX, e);
      this.latVel = (this.laneX - prev) / Math.max(dt, 0.0001);
    } else {
      this.latVel = lerp(this.latVel, 0, Math.min(1, dt * 12));
      this.laneX = this.laneToWorld(this.lane);
    }
    const tiltTarget = clamp(-this.latVel * 0.00022, -0.34, 0.34);
    this.tilt = lerp(this.tilt, tiltTarget, Math.min(1, dt * 14));
    this.bob += dt * (4.2 + this.speed * 0.00022);

    /* ---- cargo stack lean (spring) ---- */
    const wobbleForce = clamp(this.speed / 15000, 0.55, 1.5) * (this.brake ? 0.35 : 1);
    this.leanVel += (-this.lean * 46 - this.leanVel * 7.4 + this.tilt * 190 * wobbleForce) * dt;
    this.leanVel += Math.sin(this.t * 7.3) * 4.2 * dt * (this.cargo > 0 ? 1 : 0);
    this.lean += this.leanVel * dt;
    this.lean = clamp(this.lean, -2.6, 2.6);
    this.toppleCd = Math.max(0, this.toppleCd - dt);

    if (
      !this.demo &&
      this.phase === "playing" &&
      this.cargo >= 3 &&
      this.toppleCd <= 0 &&
      Math.abs(this.lean) > 1.55 - (this.brake ? 0.5 : 0)
    ) {
      this.toppleBox();
      this.toppleCd = 0.42;
      this.leanVel *= -0.35;
    }

    /* ---- invulnerability ---- */
    this.invuln = Math.max(0, this.invuln - rawDt);

    /* ---- combo timer ---- */
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    this.mult = clamp(1 + Math.floor(this.cargo / 5), 1, 5);

    /* ---- scoring ---- */
    if (this.phase === "playing" && !this.demo) {
      const rate = this.speed * MPU * 1.8 * (1 + 0.85 * this.boostPower);
      this.score += rate * dt * this.mult;
    }
    this.dispScore = lerp(this.dispScore, this.score, Math.min(1, rawDt * 9));
    if (Math.abs(this.dispScore - this.score) < 1) this.dispScore = this.score;

    /* ---- milestones ---- */
    if (!this.demo) {
      const m = Math.floor(this.meters / 400);
      if (m > this.milestone) {
        this.milestone = m;
        const bonus = 300 + 70 * m;
        this.score += bonus;
        this.pushToast(`${m * 400} M  +${bonus}`);
        sfx.milestone();
        this.flash = Math.max(this.flash, 0.22);
        this.flashCol = "255,190,90";
        for (let i = 0; i < 26; i++) this.confetti();
      }
    }

    /* ---- one-off coaching ---- */
    if (!this.hintDone && !this.demo && this.meters > 130 && this.cargo >= 4) {
      this.hintDone = true;
      this.pushToast("FREINEZ POUR STABILISER LES COLIS");
    }

    /* ---- spawn ---- */
    this.waveAcc += ds;
    const gap = this.speed * (1.2 - 0.35 * this.diff);
    if (this.waveAcc > gap) {
      this.waveAcc = 0;
      this.spawnWave();
    }
    this.propAcc += ds;
    if (this.propAcc > 1500) {
      this.propAcc = 0;
      this.spawnProp(FAR_Z * 0.8);
    }

    /* ---- entities ---- */
    this.updateEnts(dt);
    this.updateProps(dt);
    this.updateParticles(dt);
    this.updateFx(rawDt);

    /* ---- crash cinematic ---- */
    if (this.crashT > 0) {
      this.crashT -= rawDt;
      if (this.crashT <= 0) this.finishRun();
    }
  }

  private updateFx(dt: number) {
    const dec = Math.pow(0.0016, dt);
    this.shake *= dec;
    if (this.shake < 0.4) this.shake = 0;
    const m = this.shake;
    this.shakeX = (Math.random() * 2 - 1) * m;
    this.shakeY = (Math.random() * 2 - 1) * m * 0.75;
    this.roll = (Math.random() * 2 - 1) * m * 0.00045 + this.hurtDir * 0.05 * clamp(m / 22, 0, 1);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = "";
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= Math.pow(0.2, dt);
      if (f.life <= 0) this.floats.splice(i, 1);
    }
  }

  /* -------------------------------------------------------------- */
  private autopilot(dt: number) {
    this.aiT -= dt;
    if (this.aiT > 0) return;
    this.aiT = 0.12;
    const danger = [0, 0, 0];
    const goodies = [0, 0, 0];
    const span = 30000;
    for (const e of this.ents) {
      if (e.dz < 200 || e.dz > span) continue;
      const l = e.lane;
      const prox = 0.35 + (1 - e.dz / span) * 1.2;
      if (e.kind === "box" || e.kind === "gold" || e.kind === "nitro" || e.kind === "tools") {
        goodies[l] += (e.kind === "box" ? 2.2 : 4) * prox;
      } else {
        danger[l] += (e.dz < 9000 ? 11 : 3.4) * prox;
      }
    }
    let best = this.lane;
    let bestV = -1e9;
    for (let l = 0; l < 3; l++) {
      const v = goodies[l] * 3.6 - danger[l] * 3.2 - Math.abs(l - this.lane) * 2.4;
      if (v > bestV) {
        bestV = v;
        best = l;
      }
    }
    if (best !== this.lane) this.step(best > this.lane ? 1 : -1);
  }
  private aiT = 0;

  /* -------------------------------------------------------------- */
  private spawnProp(dz: number) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const r = Math.random();
    let kind: Prop["kind"] = "lamp";
    if (r < 0.42) kind = "lamp";
    else if (r < 0.6) kind = "pine";
    else if (r < 0.76) kind = "billboard";
    else if (r < 0.9) kind = "rock";
    else kind = "sign";
    this.props.push({
      kind,
      side,
      dz,
      off: rnd(1.5, 1.05),
      seed: Math.random() * 100,
      dead: false,
    });
    if (this.props.length > 90) this.props.shift();
  }

  private updateProps(dt: number) {
    const ds = this.speed * dt;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const p = this.props[i];
      p.dz -= ds;
      if (p.dz < NEAR_Z * 0.7) this.props.splice(i, 1);
    }
  }

  /* -------------------------------------------------------------- */
  private addEnt(kind: EntKind, lane: number, dz: number, vz = 0): Ent {
    const e: Ent = {
      kind,
      lane,
      x: this.laneToWorld(lane),
      dz,
      vz,
      seed: Math.random() * 100,
      hit: false,
      scored: false,
      dead: false,
      spin: rnd(1.6, 0.4),
      w: 0,
      h: 0,
      len: 0,
    };
    const L = this.laneW;
    switch (kind) {
      case "cone":
        e.w = L * 0.34;
        e.h = L * 0.46;
        e.len = L * 0.34;
        break;
      case "barrier":
        e.w = L * 0.92;
        e.h = L * 0.44;
        e.len = L * 0.3;
        break;
      case "car":
        e.w = L * 0.72;
        e.h = L * 0.6;
        e.len = L * 1.5;
        break;
      case "hauler":
        e.w = L * 0.82;
        e.h = L * 1.05;
        e.len = L * 2.6;
        break;
      case "slick":
        e.w = L * 0.86;
        e.h = 0;
        e.len = L * 1.3;
        break;
      case "box":
      case "gold":
        e.w = L * 0.36;
        e.h = L * 0.36;
        e.len = L * 0.4;
        break;
      case "nitro":
        e.w = L * 0.28;
        e.h = L * 0.4;
        e.len = L * 0.3;
        break;
      case "tools":
        e.w = L * 0.36;
        e.h = L * 0.26;
        e.len = L * 0.34;
        break;
    }
    this.ents.push(e);
    return e;
  }

  private spawnWave(zMul = 1) {
    const d = this.diff;
    const rt = 1.78 - 0.56 * d; // reaction window
    const z0 = PLAYER_Z + this.speed * rt * zMul;
    const free = [true, true, true];

    // never wall off the corridor: lanes that already hold something between
    // the cab and this wave are off limits, and one lane must always stay open.
    const taken = [false, false, false];
    for (const e of this.ents) {
      if (e.kind === "box" || e.kind === "gold" || e.kind === "nitro" || e.kind === "tools")
        continue;
      if (e.dz > PLAYER_Z - 800 && e.dz < z0 + 5200) taken[e.lane] = true;
    }
    const avail = [0, 1, 2].filter((l) => !taken[l]);
    for (const l of [0, 1, 2]) if (taken[l]) free[l] = false;

    const want = Math.random() < 0.3 + 0.42 * d ? 2 : 1;
    const blockers = Math.min(want, Math.max(0, avail.length - 1));
    const lanes = avail.sort(() => Math.random() - 0.5);
    for (let i = 0; i < blockers; i++) {
      const lane = lanes[i];
      free[lane] = false;
      const r = Math.random();
      if (r < 0.26) this.addEnt("cone", lane, z0 + rnd(400));
      else if (r < 0.48) this.addEnt("barrier", lane, z0 + rnd(400));
      else if (r < 0.72)
        this.addEnt("car", lane, z0 + rnd(600), this.speed * rnd(0.56, 0.44));
      else if (r < 0.86)
        this.addEnt("hauler", lane, z0 + rnd(900), this.speed * rnd(0.46, 0.36));
      else this.addEnt("slick", lane, z0 + rnd(400));
    }

    const openLanes = [0, 1, 2].filter((l) => free[l]);
    if (!openLanes.length) return;

    // cargo line in a free lane
    if (Math.random() < 0.9) {
      const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
      const n = 3 + Math.floor(Math.random() * (2 + d * 4));
      const spacing = 760 + Math.random() * 320;
      const curve = Math.random() < 0.35 && openLanes.length > 1;
      let cl = lane;
      for (let i = 0; i < n; i++) {
        if (curve && i > 0 && i % 2 === 0) {
          const alt = openLanes.filter((l) => Math.abs(l - cl) === 1);
          if (alt.length) cl = alt[Math.floor(Math.random() * alt.length)];
        }
        this.addEnt("box", cl, z0 + i * spacing + rnd(200));
      }
    }

    // rares
    const r = Math.random();
    if (r < 0.09) {
      this.addEnt("gold", openLanes[Math.floor(Math.random() * openLanes.length)], z0 + rnd(2600, 900));
    } else if (r < 0.2) {
      this.addEnt("nitro", openLanes[Math.floor(Math.random() * openLanes.length)], z0 + rnd(2400, 700));
    } else if (r < 0.245 && this.bolts < 2) {
      this.addEnt("tools", openLanes[Math.floor(Math.random() * openLanes.length)], z0 + rnd(1500, 400));
    }
  }

  /* -------------------------------------------------------------- */
  private nearMiss(e: Ent) {
    if (e.scored || this.demo || this.phase !== "playing") return;
    e.scored = true;
    this.nearMisses++;
    const pts = 15 * this.mult;
    this.score += pts;
    this.addFloat(e.x, PLAYER_Z, `FRÔLÉ ! +${pts}`, "#7fe3d4", 26);
    this.whoosh(e.x > this.laneX ? 1 : -1);
    sfx.nearMiss();
  }

  private updateEnts(dt: number) {
    const rel = this.speed;
    const tz = PLAYER_Z;
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];
      const close = Math.max(0, (rel - e.vz) * dt);
      const prevDz = e.dz;
      e.dz -= close;
      if (e.dz < NEAR_Z * 0.8) {
        this.ents.splice(i, 1);
        continue;
      }
      if (e.dz > FAR_Z + 6000) continue;

      const isPick =
        e.kind === "box" || e.kind === "gold" || e.kind === "nitro" || e.kind === "tools";
      // swept test: billboards collide on their own plane, and at 230 km/h an
      // entity can travel further than it is long in a single frame
      const win = this.truckLen * 0.3 + e.len * 0.25;
      const crossed = prevDz >= tz - win && e.dz <= tz + win;
      if (!crossed || e.hit) {
        if (!isPick && e.dz < tz - win) this.nearMiss(e);
        continue;
      }
      const tol = (e.w + this.truckW) * 0.4;
      const dx = Math.min(Math.abs(e.x - this.laneX), Math.abs(e.x - this.prevLaneX));
      if (dx >= tol) {
        if (!isPick && dx < this.laneW * 1.12) this.nearMiss(e);
        continue;
      }
      if (this.phase === "over") continue;
      e.hit = true;
      e.scored = true;

      if (isPick) {
        this.collect(e);
        this.ents.splice(i, 1);
      } else if (e.kind === "slick") {
        if (!this.demo && this.phase === "playing") this.skid(e);
        this.ents.splice(i, 1);
      } else if (this.phase === "playing" && this.invuln <= 0 && !this.demo) {
        this.bump(e);
        this.ents.splice(i, 1);
      } else if (this.demo) {
        // attract mode: phase through, small spark for life
        if (Math.random() < 0.4) this.sparks(e.x, 6, "#ffd08a");
      }
    }
  }

  /* -------------------------------------------------------------- */
  private collect(e: Ent) {
    if (e.kind === "box") {
      const full = this.cargo >= CARGO_MAX;
      if (!full) {
        this.cargo++;
        this.boxes.push({ p: Math.random() * 6.28, a: 0 });
        if (this.cargo === CARGO_MAX) this.pushToast("CAMION PLEIN : COLIS BONUS");
      }
      this.pkgs++;
      this.combo++;
      this.comboT = 2.6;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      const pts = (full ? 85 : 18) * this.mult * (1 + Math.min(this.combo, 20) * 0.05);
      this.score += pts;
      this.nitro = Math.min(100, this.nitro + 6);
      this.addFloat(
        e.x,
        e.dz,
        full ? `BONUS +${Math.round(pts)}` : `+${Math.round(pts)}`,
        full ? "#ffe27a" : "#ffd08a",
        full ? 28 : 24,
      );
      this.burst(e.x, e.h * 0.6, 8, "#e8b57a", 190);
      sfx.pickup(Math.min(this.combo - 1, 11));
      this.shake = Math.max(this.shake, 3.2);
      if (this.combo > 0 && this.combo % 15 === 0) {
        this.pushToast(`SÉRIE DE ${this.combo}  x${this.mult}`);
        for (let i = 0; i < 18; i++) this.confetti();
      }
    } else if (e.kind === "gold") {
      this.cargo = Math.min(CARGO_MAX, this.cargo + 3);
      while (this.boxes.length < this.cargo) this.boxes.push({ p: Math.random() * 6.28, a: 0 });
      this.pkgs += 3;
      const pts = 220 * this.mult;
      this.score += pts;
      this.combo += 3;
      this.comboT = 3.4;
      this.addFloat(e.x, e.dz, `OR +${pts}`, "#ffe27a", 34);
      this.burst(e.x, e.h * 0.6, 30, "#ffd85e", 420);
      this.burst(e.x, e.h * 0.6, 14, "#fff3c4", 300);
      this.flash = Math.max(this.flash, 0.3);
      this.flashCol = "255,214,110";
      this.shake = Math.max(this.shake, 8);
      sfx.gold();
      this.pushToast("COLIS DORÉ !");
    } else if (e.kind === "nitro") {
      this.nitro = Math.min(100, this.nitro + 52);
      this.score += 25 * this.mult;
      this.addFloat(e.x, e.dz, "NITRO +52", "#7fe3d4", 28);
      this.burst(e.x, e.h * 0.6, 22, "#6fe0ff", 340);
      sfx.nitro();
      this.shake = Math.max(this.shake, 5);
    } else if (e.kind === "tools") {
      this.bolts = Math.min(2, this.bolts + 1);
      this.score += 60 * this.mult;
      this.addFloat(e.x, e.dz, "CAMION RÉPARÉ", "#a6f07b", 30);
      this.burst(e.x, e.h * 0.6, 24, "#a6f07b", 340);
      sfx.repair();
      this.pushToast("CHÂSSIS RÉPARÉ");
      this.flash = Math.max(this.flash, 0.18);
      this.flashCol = "150,240,140";
    }
  }

  /** oil slick: lose a couple of boxes, big wobble, no chassis damage */
  private skid(e: Ent) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    this.leanVel += dir * 22;
    this.hurtDir = dir;
    this.shake = Math.max(this.shake, 12);
    this.roll += dir * 0.02;
    this.flash = Math.max(this.flash, 0.12);
    this.flashCol = "120,120,140";
    sfx.skid();
    const lost = Math.min(this.cargo, 1 + Math.floor(Math.random() * 2));
    for (let i = 0; i < lost; i++) {
      this.cargo--;
      this.boxes.pop();
      this.dropBox(dir, true);
    }
    if (lost) {
      this.combo = 0;
      this.pushToast("DÉRAPAGE ! -" + lost);
    } else {
      this.addFloat(this.laneX, PLAYER_Z, "DÉRAPAGE !", "#9fb3c8", 30);
    }
    for (let i = 0; i < 16; i++) {
      this.addPart(e.x, 0, PLAYER_Z, rnd(600, -600), rnd(120), this.speed * rnd(0.3, -0.6), 0.7, 26, 2, "#2b2f3a");
    }
  }

  /** chassis strike: cargo spills, one bolt gone */
  private bump(e: Ent) {
    this.bolts--;
    this.invuln = 1.25;
    this.timeScale = 0.42;
    this.shake = 34;
    this.flash = 0.75;
    this.flashCol = "255,120,70";
    this.hurtDir = e.x > this.laneX ? 1 : -1;
    this.roll += this.hurtDir * 0.05;
    this.leanVel += this.hurtDir * 30;
    this.speed *= 0.62;
    this.combo = 0;
    this.comboT = 0;
    sfx.bump();

    this.sparks(e.x, 46, "#ffb35c");
    this.burst(this.laneX, this.truckH * 0.5, 26, "#ff8a4c", 520);
    for (let i = 0; i < 18; i++) {
      this.addPart(
        e.x,
        rnd(this.truckH * 0.6),
        PLAYER_Z,
        rnd(900, -900),
        rnd(700, 100),
        this.speed * rnd(0.5, -0.4),
        rnd(1.1, 0.5),
        rnd(34, 12),
        Math.random() < 0.5 ? 4 : 0,
        Math.random() < 0.5 ? "#8fa3b8" : "#ffc46b",
      );
    }
    // every box on the bed goes flying
    const n = this.cargo;
    this.cargo = 0;
    this.boxes.length = 0;
    this.mult = 1;
    for (let i = 0; i < Math.min(n, 26); i++) this.dropBox(this.hurtDir, false, i * 0.012);
    this.addFloat(this.laneX, PLAYER_Z, n > 0 ? `COLIS PERDUS x${n}` : "CHOC !", "#ff7a5c", 40);
    this.pushToast(n > 0 ? `CHARGEMENT PERDU : ${this.bolts} VIE RESTANTE` : "CAMION ENDOMMAGÉ");

    if (this.bolts <= 0) {
      this.crashT = 1.05;
      this.timeScale = 0.0001;
      this.shake = 52;
      this.flash = 1;
      sfx.crash();
      this.pushToast("ACCIDENT !");
      for (let i = 0; i < 60; i++) {
        this.addPart(
          this.laneX + rnd(300, -300),
          rnd(this.truckH),
          PLAYER_Z + rnd(200, -200),
          rnd(1500, -1500),
          rnd(1300, 100),
          this.speed * rnd(0.62, -0.5),
          rnd(1.5, 0.6),
          rnd(46, 14),
          Math.random() < 0.4 ? 4 : Math.random() < 0.5 ? 1 : 2,
          Math.random() < 0.5 ? "#ffb35c" : "#59636f",
        );
      }
    } else {
      window.setTimeout(() => {
        if (this.phase === "playing") this.pushToast("ENCORE UN CHOC ET C'EST FINI");
      }, 900);
    }
  }

  private finishRun() {
    this.phase = "over";
    this.boosting = false;
    sfx.stopBoost();
    const r: RunResult = {
      score: Math.floor(this.score),
      pkgs: this.pkgs,
      meters: Math.floor(this.meters),
      bestCombo: this.bestCombo,
      nearMisses: this.nearMisses,
      bolts: Math.max(0, this.bolts),
    };
    this.onResult(r);
    this.emit(true);
  }

  /** one box tumbles off the stack */
  private toppleBox() {
    if (this.cargo <= 0) return;
    this.cargo--;
    this.boxes.pop();
    this.combo = 0;
    this.score = Math.max(0, this.score - 5);
    this.dropBox(this.lean > 0 ? 1 : -1, true);
    this.addFloat(this.laneX, PLAYER_Z, "COLIS TOMBÉ !", "#ff9d6e", 26);
    this.shake = Math.max(this.shake, 5);
    sfx.topple();
  }

  private dropBox(dir: number, small: boolean, delay = 0) {
    const idx = Math.max(0, this.boxes.length - 1);
    if (!small) this.boxes.pop();
    const y = this.truckW * 0 + this.truckH * 0.86 + idx * this.boxSize * 0.94;
    {
      this.addPart(
        this.laneX + rnd(120, -120),
        y,
        PLAYER_Z + rnd(120, -260),
        dir * rnd(small ? 900 : 1500, 260) + rnd(300, -300),
        rnd(small ? 620 : 900, 240),
        this.speed * rnd(0.45, -0.5),
        rnd(3.4, 2.1),
        this.boxSize * rnd(1.05, 0.85),
        1,
        "#c98a4b",
        delay,
      );
    }
  }

  /* -------------------------------------------------------------- */
  private addPart(
    x: number,
    y: number,
    dz: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    kind: number,
    color: string,
    delay = 0,
  ) {
    if (this.parts.length >= MAX_PARTS) this.parts.shift();
    const p: Part = {
      x,
      y,
      dz,
      vx,
      vy,
      vz,
      life: life + delay,
      maxLife: life,
      size,
      kind,
      color,
      rot: Math.random() * 6.28,
      vr: rnd(9, -9),
      delay,
      grav: kind === 2 ? -120 : kind === 3 ? -60 : 2400,
    };
    this.parts.push(p);
  }

  private updateParticles(dt: number) {
    const rel = this.speed;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) {
        p.delay -= dt;
        p.dz -= rel * dt;
        if (p.dz < 55) this.parts.splice(i, 1);
        continue;
      }
      p.life -= dt;
      p.dz -= Math.max(-1400, rel - p.vz) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= p.grav * dt;
      p.rot += p.vr * dt;
      if (p.kind === 2 || p.kind === 3) {
        p.vx *= Math.pow(0.35, dt);
        p.vz *= Math.pow(0.5, dt);
        p.size += dt * (p.kind === 2 ? 240 : 90);
      }
      if (p.y < 0 && p.grav > 0) {
        p.y = 0;
        p.vy = -p.vy * (p.kind === 1 ? 0.34 : 0.2);
        p.vx *= 0.72;
        p.vr *= 0.55;
        if (p.kind === 1 && Math.abs(p.vy) > 90 && Math.random() < 0.6) {
          this.addPart(p.x, 0, p.dz, rnd(160, -160), rnd(120, 20), rnd(60, -60), 0.5, p.size * 0.4, 3, "#6b5a45");
        }
      }
      if (p.life <= 0 || p.dz < 55 || p.dz > FAR_Z) this.parts.splice(i, 1);
    }
  }

  private burst(x: number, y: number, n: number, color: string, spd: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const s = rnd(spd, spd * 0.25);
      this.addPart(
        x,
        Math.max(4, y),
        PLAYER_Z + rnd(120, -120),
        Math.cos(a) * s * 0.6,
        Math.abs(Math.sin(a)) * s * 0.5 + 60,
        this.speed * rnd(0.4, -0.2),
        rnd(0.75, 0.35),
        rnd(26, 8),
        0,
        color,
      );
    }
  }

  private sparks(x: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      this.addPart(
        x + rnd(160, -160),
        rnd(this.truckH * 0.8, 10),
        PLAYER_Z + rnd(140, -140),
        rnd(1400, -1400),
        rnd(1000, 100),
        this.speed * rnd(0.55, -0.35),
        rnd(0.8, 0.3),
        rnd(30, 10),
        0,
        color,
      );
    }
  }

  private whoosh(dir: number) {
    for (let i = 0; i < 10; i++) {
      this.addPart(
        this.laneX + dir * this.laneW * rnd(1, 0.4),
        rnd(this.truckH * 0.9, 10),
        PLAYER_Z + rnd(300, -300),
        dir * rnd(1500, 600),
        rnd(240, -60),
        this.speed * rnd(0.6, 0.05),
        rnd(0.4, 0.18),
        rnd(30, 10),
        3,
        "#cfe6ff",
      );
    }
  }

  /** p = probability of puffing this frame */
  private damageSmoke(p: number) {
    if (Math.random() >= Math.min(1, p)) return;
    this.addPart(
      this.laneX + rnd(this.truckW * 0.5, -this.truckW * 0.5),
      this.truckH * rnd(1.05, 0.8),
      PLAYER_Z - rnd(160, 20),
      rnd(120, -120),
      rnd(420, 180),
      this.speed * rnd(0.93, 0.72),
      rnd(1.6, 0.8),
      rnd(this.truckW * 0.32, this.truckW * 0.14),
      2,
      "#6a7280",
    );
  }

  private boostTrail() {
    const side = Math.random() < 0.5 ? -1 : 1;
    this.addPart(
      this.laneX + side * this.truckW * rnd(0.42, 0.2),
      rnd(this.truckH * 0.22, 6),
      PLAYER_Z - rnd(260, 40),
      rnd(140, -140),
      rnd(160, 20),
      this.speed * rnd(0.94, 0.62),
      rnd(0.55, 0.24),
      rnd(46, 16),
      Math.random() < 0.5 ? 5 : 2,
      Math.random() < 0.5 ? "#ffb347" : "#7fd8ff",
    );
  }

  private confetti() {
    const cols = ["#ffb347", "#ff6b4a", "#7fe3d4", "#ffe27a", "#f4ece0"];
    this.addPart(
      this.laneX + rnd(900, -900),
      rnd(2400, 700),
      PLAYER_Z + rnd(900, -200),
      rnd(700, -700),
      rnd(500, -200),
      this.speed * rnd(0.7, -0.2),
      rnd(2.2, 1.2),
      rnd(46, 20),
      1,
      cols[Math.floor(Math.random() * cols.length)],
    );
  }

  private addFloat(x: number, dz: number, text: string, color: string, size: number) {
    const p = this.proj(x, Math.max(dz, NEAR_Z));
    if (this.floats.length > 26) this.floats.shift();
    this.floats.push({
      x: clamp(p.x, 60, this.W - 60),
      y: p.y - this.truckH * p.s * 0.9,
      vy: -130,
      life: 0.95,
      max: 0.95,
      text,
      color,
      size,
    });
  }

  private pushToast(text: string) {
    if (this.demo) return;
    this.toast = text;
    this.toastT = 1.7;
    this.toastKey++;
  }

  /* -------------------------------------------------------------- */
  private lastStruct = "";
  private lastFine = "";
  private lastEmit = 0;
  private emit(force: boolean) {
    const h: Hud = {
      phase: this.phase,
      score: Math.floor(this.dispScore),
      mult: this.mult,
      cargo: this.cargo,
      bolts: this.bolts,
      nitro: this.nitro / 100,
      boosting: this.boosting,
      braking: this.brake,
      meters: Math.floor(this.meters),
      kph: Math.round(this.speed * KPH),
      combo: this.combo,
      toast: this.toast || null,
      toastKey: this.toastKey,
      demo: this.demo,
      muted: sfx.muted,
      invuln: this.invuln > 0,
    };
    // structural changes go out immediately, the fast counters are throttled
    const struct = [h.phase, h.mult, h.cargo, h.bolts, h.boosting, h.braking, h.toastKey, h.muted, h.invuln].join("|");
    const fine = [h.score, h.meters, h.kph, h.combo, Math.round(h.nitro * 40)].join("|");
    const now = performance.now();
    if (!force) {
      if (struct === this.lastStruct) {
        if (fine === this.lastFine) return;
        if (now - this.lastEmit < 55) return;
      }
    }
    this.lastStruct = struct;
    this.lastFine = fine;
    this.lastEmit = now;
    this.onHud(h);
  }
}

export { CAM_H, PLAYER_Z, NEAR_Z, FAR_Z, clamp, lerp, rnd };
