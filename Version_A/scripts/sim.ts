/* Headless smoke test: stubs DOM/canvas and drives the real engine + renderer. */
const grad = { addColorStop() {} };
function fakeCtx() {
  const target: any = {
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    measureText: () => ({ width: 12 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    canvas: null,
  };
  return new Proxy(target, {
    get(t, p) {
      if (p in t) return t[p];
      return () => undefined;
    },
    set(t, p, v) {
      t[p] = v;
      return true;
    },
  });
}
function fakeCanvas(w: number, h: number) {
  const c: any = {
    width: w,
    height: h,
    style: {},
    clientWidth: w,
    clientHeight: h,
    getContext: () => fakeCtx(),
    parentElement: { clientWidth: w, clientHeight: h },
    addEventListener() {},
    removeEventListener() {},
  };
  return c;
}

const g: any = globalThis;
g.window = {
  devicePixelRatio: 2,
  addEventListener() {},
  removeEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  localStorage: {
    _d: {} as Record<string, string>,
    getItem(k: string) {
      return this._d[k] ?? null;
    },
    setItem(k: string, v: string) {
      this._d[k] = v;
    },
  },
  setTimeout: (fn: () => void, t: number) => setTimeout(fn, t),
  innerWidth: 1280,
  innerHeight: 720,
};
g.document = {
  createElement: (t: string) => (t === "canvas" ? fakeCanvas(300, 150) : { style: {} }),
  addEventListener() {},
  removeEventListener() {},
  visibilityState: "visible",
  fonts: { ready: Promise.resolve() },
};
g.performance = { now: () => Date.now() };
g.requestAnimationFrame = () => 0;
g.cancelAnimationFrame = () => {};
g.HTMLCanvasElement = function () {};

import { Game } from "../src/game/engine";
import { render } from "../src/game/render";

/* death forensics */
const proto: any = (Game as any).prototype;
const origBump = proto.bump;
let bumpLog: string[] = [];
proto.bump = function (e: any) {
  bumpLog.push(
    `BUMP m=${Math.floor(this.meters)} kind=${e.kind} lane=${e.lane} truckLane=${this.lane} dx=${Math.round(Math.abs(e.x - this.laneX))} dz=${Math.round(e.dz)} tween=${this.tweenT.toFixed(2)} speed=${Math.round(this.speed)}`,
  );
  return origBump.call(this, e);
};

const ctx = fakeCtx();
const game = new Game();
game.canvas = fakeCanvas(1280, 720);
game.ctx = ctx;
game.resize();
game.resetRun(true);

let over: any = null;
game.onResult = (r: any) => (over = r);

const frames = 60 * 70;
let bumps = 0;
let phaseChanges: string[] = [];
let lastPhase = game.phase;

/* --- attract mode --- */
for (let i = 0; i < 60 * 12; i++) {
  game.update(1 / 60, 1 / 60);
  render(game, ctx);
}
console.log(
  `attract: ents=${game.ents.length} props=${game.props.length} parts=${game.parts.length} cargo=${game.cargo} speed=${Math.round(game.speed)}`,
);

/* --- real run, passive driver (should crash) --- */
game.start();
game.inputLocked = false;
for (let i = 0; i < frames && game.phase !== "over"; i++) {
  game.update(1 / 60, 1 / 60);
  render(game, ctx);
  if (game.phase !== lastPhase) {
    phaseChanges.push(game.phase);
    lastPhase = game.phase;
  }
  if (i % 97 === 0) game.step(Math.random() < 0.5 ? -1 : 1);
  if (i % 211 === 0) game.setBoost(true);
  if (i % 211 === 100) game.setBoost(false);
  if (i % 331 === 0) {
    game.setBrake(true);
  }
  if (i % 331 === 40) game.setBrake(false);
  if (game.bolts < 2) bumps++;
}
console.log(
  `run: phase=${game.phase} score=${Math.floor(game.score)} pkgs=${game.pkgs} m=${Math.floor(game.meters)} bolts=${game.bolts} combo=${game.bestCombo} near=${game.nearMisses} parts=${game.parts.length} floats=${game.floats.length}`,
);
console.log("result:", JSON.stringify(over));
console.log("phases:", phaseChanges.join(","));
console.log(bumpLog.join("\n"));
bumpLog = [];

/* --- portrait resize + more frames --- */
game.canvas = fakeCanvas(390, 780);
game.resize();
console.log(`portrait: roadHalf=${Math.round(game.roadHalf)} laneW=${Math.round(game.laneW)} truckW=${Math.round(game.truckW)} focal=${Math.round(game.focal)}`);
game.start();
for (let i = 0; i < 60 * 40 && game.phase !== "over"; i++) {
  game.update(1 / 60, 1 / 60);
  render(game, ctx);
  if (i % 43 === 0) game.step(i % 86 === 0 ? 1 : -1);
}
console.log(`portrait run ok: phase=${game.phase} score=${Math.floor(game.score)} cargo=${game.cargo}`);

/* --- pause / resume / menu --- */
game.pause();
game.update(1 / 60, 1 / 60);
game.resume();
game.update(1 / 60, 1 / 60);
game.toMenu();
for (let i = 0; i < 120; i++) {
  game.update(1 / 60, 1 / 60);
  render(game, ctx);
}
console.log("menu/pause cycle ok, phase =", game.phase, "parts =", game.parts.length);

/* --- extreme: huge canvas + long run with a greedy driver --- */
game.canvas = fakeCanvas(2560, 1080);
game.resize();
game.start();
let maxParts = 0;
let maxEnts = 0;
let i2 = 0;
for (let i = 0; i < 60 * 180 && game.phase !== "over"; i++) {
  // dodge: pick lane with least danger
  if (i % 16 === 0) {
    const danger = [0, 0, 0];
    const good = [0, 0, 0];
    for (const e of game.ents) {
      if (e.dz < 9500) {
        if (["box", "gold", "nitro", "tools"].includes(e.kind)) good[e.lane] += 2;
        else danger[e.lane] += e.dz < 6000 ? 6 : 2;
      }
    }
    let best = game.lane, bv = -1e9;
    for (let l = 0; l < 3; l++) {
      const v = good[l] * 3 - danger[l] * 4 - Math.abs(l - game.lane);
      if (v > bv) { bv = v; best = l; }
    }
    if (best !== game.lane) game.step(best > game.lane ? 1 : -1);
  }
  game.update(1 / 60, 1 / 60);
  render(game, ctx);
  i2++;
  maxParts = Math.max(maxParts, game.parts.length);
  maxEnts = Math.max(maxEnts, game.ents.length);
}
console.log(
  `casual(${(i2/60).toFixed(1)}s): phase=${game.phase} score=${Math.floor(game.score)} pkgs=${game.pkgs} m=${Math.floor(game.meters)} mult=${game.mult} cargo=${game.cargo} maxParts=${maxParts} maxEnts=${maxEnts} bumps=${game.bolts}`,
);
console.log("--- expert bumps ---\n" + bumpLog.join("\n"));
console.log("SMOKE OK");
