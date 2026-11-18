import type { Game } from "./engine";
import type { Ent } from "./types";

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/* ---------------- palette ---------------- */
const P = {
  roadA: "#343b47",
  roadB: "#2f3641",
  dirtA: "#2b2f26",
  dirtB: "#262a22",
  rumbleA: "#d94a30",
  rumbleB: "#e9dfcd",
  line: "#e6d9bd",
  cream: "#f4ece0",
  truckBody: "#f2e7d6",
  truckAccent: "#e8452f",
  truckDark: "#2b303a",
  box: "#c98a4b",
  boxTop: "#e0b078",
  boxSide: "#a9703a",
  gold: "#f5c33c",
  goldTop: "#ffe89a",
  cyan: "#6fe0ff",
  mint: "#7fe3d4",
};

/* ---------------- prerendered layers ---------------- */
interface Layers {
  w: number;
  h: number;
  sky: HTMLCanvasElement;
  ridge: HTMLCanvasElement;
  city: HTMLCanvasElement;
  vig: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  smoke: HTMLCanvasElement;
  dust: HTMLCanvasElement;
  flame: HTMLCanvasElement;
  tile: number;
}
let L: Layers | null = null;

function mk(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

function sprite(size: number, stops: [number, string][]) {
  const c = mk(size, size);
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

function buildLayers(g: Game) {
  const W = g.W;
  const H = g.H;
  const hz = g.horizon;
  const tile = Math.ceil(W * 1.5) + 200;

  /* sky */
  const sky = mk(W + 200, hz + 200);
  {
    const x = sky.getContext("2d")!;
    const grad = x.createLinearGradient(0, 0, 0, sky.height);
    grad.addColorStop(0, "#08121f");
    grad.addColorStop(0.26, "#12294a");
    grad.addColorStop(0.5, "#3d4470");
    grad.addColorStop(0.68, "#8a5570");
    grad.addColorStop(0.84, "#d97a45");
    grad.addColorStop(0.96, "#f6a94e");
    grad.addColorStop(1, "#ffc978");
    x.fillStyle = grad;
    x.fillRect(0, 0, sky.width, sky.height);
    // stars
    for (let i = 0; i < 130; i++) {
      const sy = Math.pow(Math.random(), 1.7) * sky.height * 0.62;
      const a = clamp(1 - sy / (sky.height * 0.62), 0, 1) * Math.random() * 0.85;
      x.fillStyle = `rgba(255,246,225,${a.toFixed(3)})`;
      const s = Math.random() < 0.85 ? 1 : 2;
      x.fillRect(Math.random() * sky.width, sy, s, s);
    }
    // sun
    const sx = sky.width * 0.66;
    const sy = sky.height - H * 0.045;
    const sr = H * 0.085;
    const halo = x.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 4.2);
    halo.addColorStop(0, "rgba(255,196,110,0.55)");
    halo.addColorStop(0.35, "rgba(255,140,80,0.18)");
    halo.addColorStop(1, "rgba(255,120,60,0)");
    x.fillStyle = halo;
    x.fillRect(sx - sr * 4.5, sy - sr * 4.5, sr * 9, sr * 9);
    const disc = x.createLinearGradient(0, sy - sr, 0, sy + sr);
    disc.addColorStop(0, "#ffe9a8");
    disc.addColorStop(0.5, "#ffb35c");
    disc.addColorStop(1, "#ff7a45");
    x.fillStyle = disc;
    x.beginPath();
    x.arc(sx, sy, sr, 0, 6.2832);
    x.fill();
    // retro bands across the sun
    x.globalCompositeOperation = "destination-out";
    for (let i = 0; i < 5; i++) {
      const by = sy - sr * 0.15 + i * sr * 0.22;
      x.fillRect(sx - sr * 1.2, by, sr * 2.4, sr * 0.055 + i * sr * 0.022);
    }
    x.globalCompositeOperation = "source-over";
    // clouds
    for (let i = 0; i < 9; i++) {
      const cy = sky.height * (0.42 + Math.random() * 0.5);
      const cxp = Math.random() * sky.width;
      const cw = W * (0.1 + Math.random() * 0.22);
      const ch = cw * 0.13;
      const a = 0.05 + Math.random() * 0.14;
      const cg = x.createLinearGradient(0, cy - ch, 0, cy + ch);
      cg.addColorStop(0, `rgba(255,214,170,${a})`);
      cg.addColorStop(1, `rgba(90,60,90,${a * 0.5})`);
      x.fillStyle = cg;
      x.beginPath();
      x.ellipse(cxp, cy, cw, ch, 0, 0, 6.2832);
      x.fill();
    }
  }

  /* far ridge */
  const ridgeH = Math.round(H * 0.19);
  const ridge = mk(tile, ridgeH);
  {
    const x = ridge.getContext("2d")!;
    x.fillStyle = "#20294a";
    x.beginPath();
    x.moveTo(0, ridgeH);
    let px = 0;
    let py = ridgeH * (0.45 + Math.random() * 0.2);
    x.lineTo(0, py);
    while (px < tile) {
      const step = tile / 14;
      px += step * (0.6 + Math.random() * 0.8);
      const ny = ridgeH * (0.18 + Math.random() * 0.5);
      x.lineTo(px - step * 0.5, (py + ny) / 2 - ridgeH * 0.05);
      x.lineTo(px, ny);
      py = ny;
    }
    x.lineTo(tile, ridgeH);
    x.closePath();
    x.fill();
    x.fillStyle = "rgba(255,170,110,0.13)";
    x.fillRect(0, ridgeH - 3, tile, 3);
  }

  /* city skyline */
  const cityH = Math.round(H * 0.14);
  const city = mk(tile, cityH);
  {
    const x = city.getContext("2d")!;
    let px = 0;
    while (px < tile) {
      const bw = 16 + Math.random() * 62;
      const bh = cityH * (0.24 + Math.random() * 0.72);
      x.fillStyle = "#161d33";
      x.fillRect(px, cityH - bh, bw, bh);
      x.fillStyle = "rgba(255,190,120,0.5)";
      for (let wy = cityH - bh + 6; wy < cityH - 5; wy += 9) {
        for (let wx = px + 4; wx < px + bw - 5; wx += 8) {
          if (Math.random() < 0.34) x.fillRect(wx, wy, 3, 4);
        }
      }
      if (Math.random() < 0.16) {
        x.fillStyle = "#ff5a4a";
        x.fillRect(px + bw / 2 - 1, cityH - bh - 12, 2, 12);
        x.beginPath();
        x.arc(px + bw / 2, cityH - bh - 13, 2.2, 0, 6.2832);
        x.fillStyle = "rgba(255,90,70,0.95)";
        x.fill();
      }
      px += bw + 3 + Math.random() * 10;
    }
  }

  /* vignette */
  const vig = mk(W, H);
  {
    const x = vig.getContext("2d")!;
    const rg = x.createRadialGradient(W / 2, H * 0.56, Math.min(W, H) * 0.24, W / 2, H * 0.56, Math.max(W, H) * 0.82);
    rg.addColorStop(0, "rgba(0,0,0,0)");
    rg.addColorStop(0.62, "rgba(4,8,16,0.24)");
    rg.addColorStop(1, "rgba(3,6,12,0.72)");
    x.fillStyle = rg;
    x.fillRect(0, 0, W, H);
  }

  L = {
    w: W,
    h: H,
    sky,
    ridge,
    city,
    vig,
    tile,
    glow: sprite(64, [
      [0, "rgba(255,255,255,0.95)"],
      [0.25, "rgba(255,226,160,0.55)"],
      [1, "rgba(255,190,110,0)"],
    ]),
    smoke: sprite(64, [
      [0, "rgba(120,126,140,0.5)"],
      [0.5, "rgba(90,96,110,0.24)"],
      [1, "rgba(70,76,90,0)"],
    ]),
    dust: sprite(64, [
      [0, "rgba(190,160,120,0.55)"],
      [0.6, "rgba(150,120,90,0.2)"],
      [1, "rgba(120,100,80,0)"],
    ]),
    flame: sprite(64, [
      [0, "rgba(255,255,235,0.95)"],
      [0.3, "rgba(255,178,64,0.7)"],
      [0.65, "rgba(255,96,40,0.25)"],
      [1, "rgba(255,60,20,0)"],
    ]),
  };
}

/* ---------------- helpers ---------------- */
function fade(dz: number) {
  return 1 - clamp((dz - 15000) / 24000, 0, 1);
}

function cube(
  x: CanvasRenderingContext2D,
  cxp: number,
  baseY: number,
  w: number,
  h: number,
  k: number,
  front: string,
  top: string,
  side: string,
) {
  const dx = w * 0.36 * k;
  const dy = h * 0.34 * k;
  x.fillStyle = side;
  x.beginPath();
  x.moveTo(cxp + w / 2, baseY);
  x.lineTo(cxp + w / 2 + dx, baseY - dy);
  x.lineTo(cxp + w / 2 + dx, baseY - h - dy);
  x.lineTo(cxp + w / 2, baseY - h);
  x.closePath();
  x.fill();
  x.fillStyle = top;
  x.beginPath();
  x.moveTo(cxp - w / 2, baseY - h);
  x.lineTo(cxp - w / 2 + dx, baseY - h - dy);
  x.lineTo(cxp + w / 2 + dx, baseY - h - dy);
  x.lineTo(cxp + w / 2, baseY - h);
  x.closePath();
  x.fill();
  x.fillStyle = front;
  x.fillRect(cxp - w / 2, baseY - h, w, h);
}

function shadow(x: CanvasRenderingContext2D, cxp: number, y: number, w: number, a: number) {
  x.fillStyle = `rgba(8,10,16,${a})`;
  x.beginPath();
  x.ellipse(cxp, y, w * 0.62, w * 0.17, 0, 0, 6.2832);
  x.fill();
}

function rr(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number) {
  const rad = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  x.beginPath();
  x.moveTo(px + rad, py);
  x.lineTo(px + w - rad, py);
  x.quadraticCurveTo(px + w, py, px + w, py + rad);
  x.lineTo(px + w, py + h - rad);
  x.quadraticCurveTo(px + w, py + h, px + w - rad, py + h);
  x.lineTo(px + rad, py + h);
  x.quadraticCurveTo(px, py + h, px, py + h - rad);
  x.lineTo(px, py + rad);
  x.quadraticCurveTo(px, py, px + rad, py);
  x.closePath();
}

/* ---------------- main ---------------- */
const sorted: Ent[] = [];

export function render(g: Game, x: CanvasRenderingContext2D) {
  if (!L || L.w !== g.W || L.h !== g.H) buildLayers(g);
  const W = g.W;
  const H = g.H;

  x.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = "source-over";
  x.fillStyle = "#08121f";
  x.fillRect(0, 0, W, H);

  x.save();
  x.translate(W / 2 + g.shakeX, H * 0.52 + g.shakeY);
  x.rotate(g.roll);
  x.translate(-W / 2, -H * 0.52);

  drawSky(g, x);
  drawGround(g, x);
  drawProps(g, x, true);
  drawEntities(g, x, 0, Infinity);
  drawProps(g, x, false);
  drawParticles(g, x);
  drawSpeedFx(g, x);
  drawCockpit(g, x);
  x.restore();

  drawFloats(g, x);
  drawOverlay(g, x);
}

/* ---------------- background ---------------- */
function drawSky(g: Game, x: CanvasRenderingContext2D) {
  if (!L) return;
  const W = g.W;
  const H = g.H;
  const hz = g.horizon;
  // parallax in screen pixels: a lane change nudges the skyline, never slides it
  const lane = g.laneW > 0 ? g.laneX / g.laneW : 0;
  const steer = -lane * 16;
  x.drawImage(L.sky, -100 + steer * 0.3, -100, W + 200, hz + 200);

  const tile = L.tile;
  const wrap = (v: number) => -(((v % tile) + tile) % tile);

  let rx = wrap(g.distance * 0.011 + steer * 0.5);
  x.globalAlpha = 0.96;
  while (rx < W + 100) {
    x.drawImage(L.ridge, rx, hz - L.ridge.height + 6);
    rx += tile;
  }
  let cxo = wrap(g.distance * 0.031 + steer * 1.15);
  x.globalAlpha = 1;
  while (cxo < W + 100) {
    x.drawImage(L.city, cxo, hz - L.city.height + 5);
    cxo += tile;
  }

  // dusk haze sitting on the horizon line
  const hzg = x.createLinearGradient(0, hz - H * 0.15, 0, hz + H * 0.07);
  hzg.addColorStop(0, "rgba(255,168,96,0)");
  hzg.addColorStop(0.62, "rgba(255,158,88,0.34)");
  hzg.addColorStop(1, "rgba(120,96,120,0.04)");
  x.fillStyle = hzg;
  x.fillRect(-100, hz - H * 0.15, W + 200, H * 0.23);
  x.globalAlpha = 1;
}

/* ---------------- road ---------------- */
function drawGround(g: Game, x: CanvasRenderingContext2D) {
  const W = g.W;
  const hz = g.horizon;
  const bandLen = 900;
  const camZ = g.distance - 1000;
  const i0 = Math.floor((camZ + 200) / bandLen);
  const roadHalf = g.roadHalf;
  const laneW = g.laneW;

  x.fillStyle = P.dirtB;
  x.fillRect(-100, hz - 1, W + 200, g.H - hz + 120);

  const dashW = laneW * 0.055;
  const edgeW = laneW * 0.07;

  for (let i = i0; i < i0 + 96; i++) {
    let dzA = i * bandLen - camZ;
    const dzB = dzA + bandLen;
    if (dzA < 200) dzA = 200;
    if (dzA >= dzB) continue;
    const sA = g.focalNow / dzA;
    const sB = g.focalNow / dzB;
    const yA = hz + 1000 * sA + 0.6; // slight overlap kills band seams
    const yB = hz + 1000 * sB;
    if (yA - yB < 0.28 && i > i0 + 6) break;
    if (yB > g.H + 140) continue;
    const even = ((i % 2) + 2) % 2 === 0;

    // ground
    x.fillStyle = even ? P.dirtA : P.dirtB;
    x.fillRect(-100, yB, W + 200, yA - yB + 1);

    // road
    const centerA = W / 2 - g.laneX * sA;
    const centerB = W / 2 - g.laneX * sB;
    const xA1 = centerA - roadHalf * sA;
    const xA2 = centerA + roadHalf * sA;
    const xB1 = centerB - roadHalf * sB;
    const xB2 = centerB + roadHalf * sB;
    x.fillStyle = even ? P.roadA : P.roadB;
    x.beginPath();
    x.moveTo(xA1, yA);
    x.lineTo(xA2, yA);
    x.lineTo(xB2, yB);
    x.lineTo(xB1, yB);
    x.closePath();
    x.fill();

    // rumble strips
    const rc = even ? P.rumbleA : P.rumbleB;
    x.fillStyle = rc;
    quad(x, xA1, yA, xA1 - roadHalf * 0.1 * sA, yA, xB1 - roadHalf * 0.1 * sB, yB, xB1, yB);
    quad(x, xA2, yA, xA2 + roadHalf * 0.1 * sA, yA, xB2 + roadHalf * 0.1 * sB, yB, xB2, yB);

    // edge lines
    x.fillStyle = even ? "rgba(240,230,205,0.75)" : "rgba(240,230,205,0.5)";
    quad(
      x,
      centerA - roadHalf * 0.93 * sA, yA, centerA - roadHalf * 0.93 * sA + edgeW * sA, yA,
      centerB - roadHalf * 0.93 * sB + edgeW * sB, yB, centerB - roadHalf * 0.93 * sB, yB,
    );
    quad(
      x,
      centerA + roadHalf * 0.93 * sA - edgeW * sA, yA, centerA + roadHalf * 0.93 * sA, yA,
      centerB + roadHalf * 0.93 * sB, yB, centerB + roadHalf * 0.93 * sB - edgeW * sB, yB,
    );

    // lane dashes
    if (even) {
      x.fillStyle = P.line;
      const dzM = dzA + bandLen * 0.52;
      const sM = g.focalNow / dzM;
      const yM = hz + 1000 * sM;
      for (const lx of [-laneW / 2, laneW / 2]) {
        x.beginPath();
        x.moveTo(centerA + lx * sA - (dashW * sA) / 2, yA);
        x.lineTo(centerA + lx * sA + (dashW * sA) / 2, yA);
        x.lineTo(W / 2 + (lx - g.laneX) * sM + (dashW * sM) / 2, yM);
        x.lineTo(W / 2 + (lx - g.laneX) * sM - (dashW * sM) / 2, yM);
        x.closePath();
        x.fill();
      }
    }
    if (dzA > 40000) break;
  }

  // sun pool on the road
  const pool = x.createRadialGradient(W * 0.66, hz, 4, W * 0.66, hz, W * 0.42);
  pool.addColorStop(0, "rgba(255,190,120,0.3)");
  pool.addColorStop(1, "rgba(255,170,100,0)");
  x.fillStyle = pool;
  x.fillRect(0, hz - 2, W, g.H * 0.3);
}

function quad(
  x: CanvasRenderingContext2D,
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number,
) {
  x.beginPath();
  x.moveTo(x1, y1);
  x.lineTo(x2, y2);
  x.lineTo(x3, y3);
  x.lineTo(x4, y4);
  x.closePath();
  x.fill();
}

/* ---------------- roadside props ---------------- */
function drawProps(g: Game, x: CanvasRenderingContext2D, behind: boolean) {
  for (let i = 0; i < g.props.length; i++) {
    const p = g.props[i];
    const far = p.dz > 1000;
    if (behind !== far && p.kind !== "lamp") continue;
    if (p.kind === "lamp" && !behind) continue;
    const s = g.focalNow / p.dz;
    const a = fade(p.dz);
    if (a < 0.03) continue;
    const px = g.cx + (p.side * g.roadHalf * p.off - g.laneX) * s;
    const py = g.horizon + 1000 * s;
    const u = g.laneW * s;
    if (u < 0.5) continue;
    x.globalAlpha = a;
    switch (p.kind) {
      case "lamp":
        drawLamp(x, px, py, u, p.side, a);
        break;
      case "pine": {
        const h = u * (1.5 + (p.seed % 1));
        x.fillStyle = "#141d24";
        x.beginPath();
        x.moveTo(px, py - h);
        x.lineTo(px + u * 0.42, py);
        x.lineTo(px - u * 0.42, py);
        x.closePath();
        x.fill();
        x.fillStyle = "#0f161c";
        x.fillRect(px - u * 0.05, py - h * 0.12, u * 0.1, h * 0.14);
        break;
      }
      case "rock": {
        const h = u * 0.3;
        x.fillStyle = "#2c2f36";
        x.beginPath();
        x.moveTo(px - u * 0.4, py);
        x.lineTo(px - u * 0.18, py - h);
        x.lineTo(px + u * 0.14, py - h * 0.8);
        x.lineTo(px + u * 0.42, py);
        x.closePath();
        x.fill();
        break;
      }
      case "sign": {
        const h = u * 1.1;
        x.fillStyle = "#20262e";
        x.fillRect(px - u * 0.04, py - h, u * 0.08, h);
        x.fillStyle = "#1d5c46";
        x.fillRect(px - u * 0.55, py - h - u * 0.42, u * 1.1, u * 0.44);
        x.fillStyle = "rgba(240,240,225,0.85)";
        if (u > 26) x.fillRect(px - u * 0.44, py - h - u * 0.3, u * 0.88, u * 0.06);
        if (u > 26) x.fillRect(px - u * 0.44, py - h - u * 0.17, u * 0.6, u * 0.06);
        break;
      }
      case "billboard": {
        const h = u * 1.5;
        const pw = u * 2.1;
        const ph = u * 1.0;
        x.fillStyle = "#1b2029";
        x.fillRect(px - pw * 0.3, py - h, u * 0.1, h);
        x.fillRect(px + pw * 0.2, py - h, u * 0.1, h);
        x.fillStyle = "#12161d";
        x.fillRect(px - pw / 2, py - h - ph, pw, ph);
        x.fillStyle = p.seed % 2 < 1 ? "#e8452f" : "#f0a24a";
        x.fillRect(px - pw / 2 + u * 0.06, py - h - ph + u * 0.06, pw - u * 0.12, ph - u * 0.12);
        if (pw > 70) {
          x.fillStyle = "#1a1418";
          x.font = `700 ${Math.round(ph * 0.34)}px Bungee, Impact, sans-serif`;
          x.textAlign = "center";
          x.textBaseline = "middle";
          const words = ["LOGIPHAR", "LIVRAISON EXPRESS", "SERVICE DE NUIT", "GARDEZ LE CAP", "TRANSPORT & DISTRIBUTION"];
          x.fillText(words[Math.floor(p.seed) % words.length], px, py - h - ph * 0.5, pw * 0.86);
          x.textAlign = "left";
          x.textBaseline = "alphabetic";
        }
        break;
      }
    }
    x.globalAlpha = 1;
  }
}

function drawLamp(x: CanvasRenderingContext2D, px: number, py: number, u: number, side: number, a: number) {
  const h = u * 2.5;
  x.strokeStyle = "#232a33";
  x.lineWidth = Math.max(1, u * 0.075);
  x.beginPath();
  x.moveTo(px, py);
  x.lineTo(px, py - h);
  x.lineTo(px - side * u * 0.55, py - h - u * 0.06);
  x.stroke();
  const lx = px - side * u * 0.55;
  const ly = py - h - u * 0.02;
  x.fillStyle = "#2c333d";
  x.fillRect(lx - u * 0.16, ly, u * 0.32, u * 0.1);
  if (u > 5 && L) {
    x.globalCompositeOperation = "lighter";
    x.globalAlpha = a * 0.8;
    x.drawImage(L.glow, lx - u * 0.9, ly - u * 0.85, u * 1.8, u * 1.8);
    x.globalAlpha = a * 0.22;
    x.drawImage(L.glow, lx - u * 2.6, py - u * 0.9, u * 5.2, u * 1.8);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
  }
  x.fillStyle = "#ffd79a";
  x.fillRect(lx - u * 0.11, ly + u * 0.08, u * 0.22, u * 0.05);
}

/* ---------------- entities ---------------- */
function drawEntities(g: Game, x: CanvasRenderingContext2D, from: number, to: number) {
  sorted.length = 0;
  for (let i = 0; i < g.ents.length; i++) {
    const e = g.ents[i];
    if (e.dz > 46000 || e.dz < 720) continue;
    if (e.dz < from || e.dz >= to) continue;
    sorted.push(e);
  }
  sorted.sort((a, b) => b.dz - a.dz);
  for (let i = 0; i < sorted.length; i++) drawEnt(g, x, sorted[i]);
}

function drawEnt(g: Game, x: CanvasRenderingContext2D, e: Ent) {
  const s = g.focalNow / e.dz;
  const a = fade(e.dz);
  if (a < 0.03) return;
  const px = g.cx + (e.x - g.laneX) * s;
  const py = g.horizon + 1000 * s;
  const u = g.laneW * s;
  const w = e.w * s;
  const h = e.h * s;
  if (w < 0.6 && h < 0.6) return;
  if (px < -300 || px > g.W + 300) return;
  x.globalAlpha = a;
  const t = g.t;

  switch (e.kind) {
    case "slick": {
      x.fillStyle = "rgba(14,16,22,0.82)";
      x.beginPath();
      x.ellipse(px, py, w * 0.62, w * 0.2, 0, 0, 6.2832);
      x.fill();
      x.globalAlpha = a * 0.3;
      x.fillStyle = "#4a6a7a";
      x.beginPath();
      x.ellipse(px - w * 0.12, py - w * 0.02, w * 0.34, w * 0.1, 0.3, 0, 6.2832);
      x.fill();
      x.fillStyle = "#6a4a7a";
      x.beginPath();
      x.ellipse(px + w * 0.18, py + w * 0.03, w * 0.26, w * 0.08, -0.2, 0, 6.2832);
      x.fill();
      break;
    }
    case "cone": {
      shadow(x, px, py, w * 1.1, 0.4 * a);
      x.fillStyle = "#20242c";
      x.fillRect(px - w * 0.56, py - h * 0.1, w * 1.12, h * 0.12);
      x.fillStyle = "#ef5b2b";
      x.beginPath();
      x.moveTo(px, py - h);
      x.lineTo(px + w * 0.42, py - h * 0.06);
      x.lineTo(px - w * 0.42, py - h * 0.06);
      x.closePath();
      x.fill();
      x.fillStyle = "#f6efe2";
      x.fillRect(px - w * 0.3, py - h * 0.6, w * 0.6, h * 0.17);
      x.fillStyle = "rgba(255,255,255,0.22)";
      x.beginPath();
      x.moveTo(px, py - h);
      x.lineTo(px + w * 0.1, py - h * 0.1);
      x.lineTo(px - w * 0.06, py - h * 0.1);
      x.closePath();
      x.fill();
      break;
    }
    case "barrier": {
      shadow(x, px, py, w * 1.05, 0.45 * a);
      x.fillStyle = "#9aa3ad";
      x.beginPath();
      x.moveTo(px - w * 0.5, py);
      x.lineTo(px + w * 0.5, py);
      x.lineTo(px + w * 0.36, py - h);
      x.lineTo(px - w * 0.36, py - h);
      x.closePath();
      x.fill();
      x.fillStyle = "#c3cbd4";
      x.fillRect(px - w * 0.36, py - h, w * 0.72, h * 0.16);
      x.save();
      x.beginPath();
      x.moveTo(px - w * 0.5, py);
      x.lineTo(px + w * 0.5, py);
      x.lineTo(px + w * 0.36, py - h);
      x.lineTo(px - w * 0.36, py - h);
      x.closePath();
      x.clip();
      x.fillStyle = "#e0503a";
      for (let i = -2; i < 8; i++) {
        x.save();
        x.translate(px - w * 0.5 + i * w * 0.19, py);
        x.transform(1, 0, -0.42, 1, 0, 0);
        x.fillRect(0, -h, w * 0.09, h);
        x.restore();
      }
      x.restore();
      x.fillStyle = "rgba(255,190,120,0.5)";
      x.fillRect(px - w * 0.36, py - h * 0.9, w * 0.72, h * 0.06);
      break;
    }
    case "car":
    case "hauler": {
      const big = e.kind === "hauler";
      const bobY = Math.sin(t * 9 + e.seed) * u * 0.012;
      shadow(x, px, py, w * 1.25, 0.5 * a);
      const yb = py + bobY;
      // wheels
      x.fillStyle = "#12161c";
      x.fillRect(px - w * 0.52, yb - h * 0.2, w * 0.14, h * 0.2);
      x.fillRect(px + w * 0.38, yb - h * 0.2, w * 0.14, h * 0.2);
      if (big) {
        x.fillRect(px - w * 0.56, yb - h * 0.42, w * 0.16, h * 0.24);
        x.fillRect(px + w * 0.4, yb - h * 0.42, w * 0.16, h * 0.24);
      }
      // body
      const bodyCol = big ? "#dfe4ea" : ["#c0483c", "#3f6d8e", "#4a7a5c", "#d9c48a"][Math.floor(e.seed) % 4];
      x.fillStyle = bodyCol;
      rr(x, px - w / 2, yb - h, w, h * 0.86, w * 0.1);
      x.fill();
      // roof / cabin
      x.fillStyle = big ? "#c8ced6" : shade(bodyCol, -22);
      rr(x, px - w * 0.42, yb - h * (big ? 1.02 : 1.06), w * 0.84, h * (big ? 0.2 : 0.24), w * 0.08);
      x.fill();
      if (big) {
        // roll-up door
        x.fillStyle = "#b9c0c9";
        x.fillRect(px - w * 0.4, yb - h * 0.94, w * 0.8, h * 0.74);
        x.strokeStyle = "rgba(60,70,84,0.5)";
        x.lineWidth = Math.max(0.6, u * 0.012);
        for (let i = 1; i < 7; i++) {
          const yy = yb - h * 0.94 + (h * 0.74 * i) / 7;
          x.beginPath();
          x.moveTo(px - w * 0.4, yy);
          x.lineTo(px + w * 0.4, yy);
          x.stroke();
        }
        x.fillStyle = "#e8452f";
        x.fillRect(px - w * 0.4, yb - h * 0.5, w * 0.8, h * 0.1);
      } else {
        x.fillStyle = "rgba(24,32,44,0.85)";
        rr(x, px - w * 0.36, yb - h * 0.98, w * 0.72, h * 0.26, w * 0.05);
        x.fill();
        x.fillStyle = "rgba(255,255,255,0.12)";
        x.fillRect(px - w * 0.3, yb - h * 0.95, w * 0.2, h * 0.2);
      }
      // bumper
      x.fillStyle = "#2b303a";
      x.fillRect(px - w * 0.52, yb - h * 0.24, w * 1.04, h * 0.14);
      // lights
      const blink = Math.sin(t * 5 + e.seed) > 0.2;
      x.fillStyle = blink ? "#ff4a3a" : "#8e2b22";
      x.fillRect(px - w * 0.46, yb - h * 0.42, w * 0.14, h * 0.1);
      x.fillRect(px + w * 0.32, yb - h * 0.42, w * 0.14, h * 0.1);
      if (u > 22 && L) {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = a * (blink ? 0.5 : 0.2);
        x.drawImage(L.glow, px - w * 0.62, yb - h * 0.58, w * 0.46, h * 0.42);
        x.drawImage(L.glow, px + w * 0.16, yb - h * 0.58, w * 0.46, h * 0.42);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = a;
      }
      break;
    }
    case "box":
    case "gold": {
      const gold = e.kind === "gold";
      const bob = Math.sin(t * 3.4 + e.seed) * u * 0.1;
      const baseY = py - u * 0.16 - bob;
      const spin = Math.sin(t * 1.6 + e.seed) * 0.14;
      shadow(x, px, py, w * 1.2, 0.36 * a);
      x.save();
      x.translate(px, baseY);
      x.rotate(spin);
      if (gold && L) {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = a * (0.45 + Math.sin(t * 6) * 0.12);
        x.drawImage(L.glow, -w * 1.5, -h * 2.6, w * 3, h * 3.4);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = a;
      }
      cube(
        x, 0, 0, w, h, 1,
        gold ? P.gold : P.box,
        gold ? P.goldTop : P.boxTop,
        gold ? "#c79a24" : P.boxSide,
      );
      // tape
      x.fillStyle = gold ? "rgba(255,255,255,0.6)" : "rgba(226,204,164,0.85)";
      x.fillRect(-w * 0.06, -h, w * 0.12, h);
      x.fillRect(-w / 2, -h * 0.56, w, h * 0.12);
      if (gold) {
        x.fillStyle = "#7a5a10";
        x.font = `700 ${Math.max(6, Math.round(h * 0.5))}px Bungee, sans-serif`;
        x.textAlign = "center";
        x.fillText("★", 0, -h * 0.3);
        x.textAlign = "left";
      } else if (w > 26) {
        x.fillStyle = "rgba(120,80,40,0.65)";
        x.fillRect(-w * 0.32, -h * 0.36, w * 0.24, h * 0.07);
        x.fillRect(-w * 0.32, -h * 0.24, w * 0.16, h * 0.07);
      }
      x.restore();
      break;
    }
    case "nitro": {
      const bob = Math.sin(t * 4 + e.seed) * u * 0.1;
      const baseY = py - u * 0.18 - bob;
      shadow(x, px, py, w * 1.1, 0.32 * a);
      if (L) {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = a * 0.5;
        x.drawImage(L.glow, px - w * 1.6, baseY - h * 2.4, w * 3.2, h * 3.2);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = a;
      }
      x.fillStyle = "#1d4b5c";
      rr(x, px - w * 0.4, baseY - h, w * 0.8, h, w * 0.24);
      x.fill();
      x.fillStyle = "#2f7f96";
      rr(x, px - w * 0.4, baseY - h, w * 0.34, h, w * 0.16);
      x.fill();
      x.fillStyle = "#22282f";
      x.fillRect(px - w * 0.16, baseY - h * 1.18, w * 0.32, h * 0.2);
      x.fillStyle = P.cyan;
      x.beginPath();
      x.moveTo(px + w * 0.06, baseY - h * 0.86);
      x.lineTo(px - w * 0.18, baseY - h * 0.42);
      x.lineTo(px - w * 0.02, baseY - h * 0.42);
      x.lineTo(px - w * 0.1, baseY - h * 0.12);
      x.lineTo(px + w * 0.2, baseY - h * 0.56);
      x.lineTo(px + w * 0.02, baseY - h * 0.56);
      x.closePath();
      x.fill();
      break;
    }
    case "tools": {
      const bob = Math.sin(t * 3 + e.seed) * u * 0.08;
      const baseY = py - u * 0.12 - bob;
      shadow(x, px, py, w * 1.1, 0.34 * a);
      if (L) {
        x.globalCompositeOperation = "lighter";
        x.globalAlpha = a * 0.4;
        x.drawImage(L.glow, px - w * 1.5, baseY - h * 2.6, w * 3, h * 3.4);
        x.globalCompositeOperation = "source-over";
        x.globalAlpha = a;
      }
      x.fillStyle = "#b8332a";
      rr(x, px - w / 2, baseY - h, w, h, w * 0.1);
      x.fill();
      x.fillStyle = "#8d241e";
      x.fillRect(px - w / 2, baseY - h * 0.62, w, h * 0.12);
      x.strokeStyle = "#e6e0d4";
      x.lineWidth = Math.max(1, w * 0.09);
      x.beginPath();
      x.arc(px, baseY - h * 1.02, w * 0.18, Math.PI, 0);
      x.stroke();
      x.fillStyle = "#f4ece0";
      x.fillRect(px - w * 0.06, baseY - h * 0.52, w * 0.12, h * 0.34);
      x.fillRect(px - w * 0.2, baseY - h * 0.41, w * 0.4, h * 0.12);
      break;
    }
  }
  x.globalAlpha = 1;
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(((n >> 16) & 255) + amt, 0, 255);
  const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
  const b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${gg},${b})`;
}

/* ---------------- view from the driver seat ---------------- */
function drawCockpit(g: Game, x: CanvasRenderingContext2D) {
  const W = g.W;
  const H = g.H;
  const v = Math.min(W, H);
  const sway = g.tilt * W * 0.028;
  const bounce = Math.sin(g.bob) * H * 0.0025;
  const dashY = H * 0.86 + bounce;
  const frame = Math.max(16, W * 0.045);

  // The windshield frame makes the moving road read as a driver's view.
  x.fillStyle = '#101720';
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(W, 0);
  x.lineTo(W, H * 0.085);
  x.quadraticCurveTo(W * 0.5, H * 0.025, 0, H * 0.085);
  x.closePath();
  x.fill();
  x.fillStyle = '#26303b';
  x.beginPath();
  x.moveTo(0, H * 0.064);
  x.lineTo(frame, H * 0.085);
  x.lineTo(W * 0.08, dashY);
  x.lineTo(0, dashY + H * 0.055);
  x.closePath();
  x.fill();
  x.beginPath();
  x.moveTo(W, H * 0.064);
  x.lineTo(W - frame, H * 0.085);
  x.lineTo(W * 0.92, dashY);
  x.lineTo(W, dashY + H * 0.055);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,175,68,0.23)';
  x.lineWidth = Math.max(2, v * 0.004);
  x.beginPath();
  x.moveTo(frame, H * 0.09);
  x.lineTo(W * 0.08, dashY);
  x.moveTo(W - frame, H * 0.09);
  x.lineTo(W * 0.92, dashY);
  x.stroke();

  // Small rear-view mirror: the stacked load remains visible in first person.
  const mw = Math.min(W * 0.2, 170);
  const mh = Math.min(H * 0.085, 54);
  const mx = W * 0.5 - mw * 0.5;
  const my = H * 0.076;
  x.fillStyle = '#0e141b';
  x.fillRect(W * 0.5 - 3, H * 0.048, 6, H * 0.04);
  rr(x, mx - 4, my - 4, mw + 8, mh + 8, 7);
  x.fillStyle = '#39434d';
  x.fill();
  rr(x, mx, my, mw, mh, 4);
  x.save();
  x.clip();
  const glass = x.createLinearGradient(0, my, 0, my + mh);
  glass.addColorStop(0, '#23394d');
  glass.addColorStop(1, '#bc7455');
  x.fillStyle = glass;
  x.fillRect(mx, my, mw, mh);
  x.fillStyle = '#313845';
  x.beginPath();
  x.moveTo(mx, my + mh);
  x.lineTo(mx + mw * 0.38, my + mh * 0.53);
  x.lineTo(mx + mw * 0.62, my + mh * 0.53);
  x.lineTo(mx + mw, my + mh);
  x.fill();
  const visible = Math.min(g.cargo, 6);
  const bw = Math.max(7, mh * 0.22);
  for (let i = 0; i < visible; i++) {
    const boxX = mx + mw * 0.5 - bw * 0.5 + g.lean * i * 0.6;
    const boxY = my + mh * 0.77 - i * bw * 0.57;
    x.fillStyle = i % 2 ? '#e4a05b' : '#c77f3d';
    x.fillRect(boxX, boxY, bw, bw * 0.62);
    x.fillStyle = '#ffcf88';
    x.fillRect(boxX + bw * 0.42, boxY, bw * 0.13, bw * 0.62);
  }
  x.restore();
  x.strokeStyle = 'rgba(255,255,255,0.2)';
  x.lineWidth = 1;
  x.strokeRect(mx + 1, my + 1, mw - 2, mh - 2);

  // Hood tip beyond the windscreen, with the orange Logiphar livery.
  x.fillStyle = '#eee8df';
  x.beginPath();
  x.moveTo(W * 0.28, dashY + H * 0.008);
  x.quadraticCurveTo(W * 0.5, dashY - H * 0.10, W * 0.72, dashY + H * 0.008);
  x.lineTo(W * 0.82, dashY + H * 0.10);
  x.lineTo(W * 0.18, dashY + H * 0.10);
  x.closePath();
  x.fill();
  x.strokeStyle = '#f28b19';
  x.lineWidth = Math.max(3, H * 0.012);
  x.beginPath();
  x.moveTo(W * 0.35, dashY - H * 0.007);
  x.quadraticCurveTo(W * 0.5, dashY - H * 0.056, W * 0.65, dashY - H * 0.007);
  x.stroke();

  // Dashboard and orange trim.
  const dash = x.createLinearGradient(0, dashY, 0, H);
  dash.addColorStop(0, '#34404b');
  dash.addColorStop(0.22, '#171f28');
  dash.addColorStop(1, '#080e16');
  x.fillStyle = dash;
  x.beginPath();
  x.moveTo(0, dashY + H * 0.05);
  x.quadraticCurveTo(W * 0.5, dashY - H * 0.06, W, dashY + H * 0.05);
  x.lineTo(W, H);
  x.lineTo(0, H);
  x.closePath();
  x.fill();
  x.strokeStyle = '#f28b19';
  x.lineWidth = Math.max(2, H * 0.006);
  x.beginPath();
  x.moveTo(0, dashY + H * 0.055);
  x.quadraticCurveTo(W * 0.5, dashY - H * 0.055, W, dashY + H * 0.055);
  x.stroke();

  // Turn wheel is driven by the same easing as the lane change.
  const wx = W * (W < 650 ? 0.47 : 0.34) + sway;
  const wy = H * 0.995;
  const wr = Math.min(H * 0.18, W * 0.18);
  x.save();
  x.translate(wx, wy);
  x.rotate(-g.tilt * 1.6);
  x.fillStyle = '#0a0e14';
  x.strokeStyle = '#414a54';
  x.lineWidth = Math.max(11, wr * 0.19);
  x.beginPath();
  x.arc(0, 0, wr, 0, Math.PI * 2);
  x.stroke();
  x.strokeStyle = '#151b22';
  x.lineWidth = Math.max(5, wr * 0.12);
  x.beginPath();
  x.arc(0, 0, wr * 0.77, 0, Math.PI * 2);
  x.stroke();
  x.fillStyle = '#303a44';
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 3;
    x.save();
    x.rotate(a);
    x.fillRect(-wr * 0.065, -wr * 0.82, wr * 0.13, wr * 0.72);
    x.restore();
  }
  x.fillStyle = '#f28b19';
  x.beginPath();
  x.arc(0, 0, wr * 0.23, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#101720';
  x.font = `700 ${Math.max(9, wr * 0.17)}px Barlow, sans-serif`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('L', 0, 0);
  x.restore();

  // The passenger-side plaque is branded by the SVG mounted above the canvas.
  const panelX = W * 0.62;
  const panelY = H * 0.885;
  x.fillStyle = '#0b111a';
  rr(x, panelX, panelY, W * 0.26, H * 0.075, 4);
  x.fill();
  x.strokeStyle = '#42505c';
  x.lineWidth = 1;
  x.stroke();
}

/* ---------------- particles ---------------- */
function drawParticles(g: Game, x: CanvasRenderingContext2D) {
  for (let i = 0; i < g.parts.length; i++) {
    const p = g.parts[i];
    if (p.delay > 0 || p.dz < 45) continue;
    const s = g.focalNow / p.dz;
    const px = g.cx + (p.x - g.laneX) * s;
    const py = g.horizon + (1000 - p.y) * s;
    const sz = Math.max(0.8, p.size * s);
    if (px < -80 || px > g.W + 80 || py < -120 || py > g.H + 120) continue;
    const life = clamp(p.life / p.maxLife, 0, 1);
    if (p.kind === 1) {
      x.globalAlpha = clamp(life * 1.4, 0, 1);
      x.save();
      x.translate(px, py);
      x.rotate(p.rot);
      x.fillStyle = p.color;
      x.fillRect(-sz / 2, -sz / 2, sz, sz * 0.9);
      x.fillStyle = "rgba(255,235,200,0.45)";
      x.fillRect(-sz / 2, -sz / 2, sz, sz * 0.2);
      x.restore();
      x.globalAlpha = 1;
      continue;
    }
    if (p.kind === 0 || p.kind === 4) {
      x.globalCompositeOperation = "lighter";
      x.globalAlpha = clamp(life * 1.2, 0, 1) * (p.kind === 4 ? 0.7 : 1);
      x.fillStyle = p.color;
      const l = p.kind === 0 ? sz * (0.6 + life * 1.4) : sz;
      x.fillRect(px - sz * 0.18, py - l * 0.5, sz * 0.36, l);
      x.globalCompositeOperation = "source-over";
      x.globalAlpha = 1;
      continue;
    }
    if (!L) continue;
    const spr = p.kind === 2 ? L.smoke : p.kind === 3 ? L.dust : L.flame;
    if (p.kind === 5) x.globalCompositeOperation = "lighter";
    x.globalAlpha = clamp(life * (p.kind === 5 ? 1.1 : 0.85), 0, 1);
    x.drawImage(spr, px - sz, py - sz, sz * 2, sz * 2);
    x.globalCompositeOperation = "source-over";
    x.globalAlpha = 1;
  }
}

/* ---------------- screen fx ---------------- */
function drawSpeedFx(g: Game, x: CanvasRenderingContext2D) {
  const W = g.W;
  const H = g.H;
  const sp = clamp((g.speed - 12000) / 12000, 0, 1) * 0.5 + g.boostPower;
  if (sp > 0.06 && g.phase !== "over") {
    const hz = g.horizon;
    x.save();
    x.globalCompositeOperation = "lighter";
    x.strokeStyle = g.boostPower > 0.2 ? "rgba(255,196,110,0.5)" : "rgba(200,225,255,0.24)";
    x.lineWidth = Math.max(1, H * 0.0022);
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832 + g.t * 0.35;
      const r0 = Math.min(W, H) * (0.22 + ((i * 37) % 17) / 40);
      const r1 = r0 + Math.min(W, H) * (0.16 + 0.4 * sp);
      const cxx = W / 2;
      const cyy = hz + H * 0.06;
      x.globalAlpha = clamp(sp * (0.25 + ((i * 13) % 7) / 12), 0, 0.7);
      x.beginPath();
      x.moveTo(cxx + Math.cos(a) * r0, cyy + Math.sin(a) * r0 * 0.62);
      x.lineTo(cxx + Math.cos(a) * r1, cyy + Math.sin(a) * r1 * 0.62);
      x.stroke();
    }
    x.restore();
    x.globalAlpha = 1;
  }
  if (g.boostPower > 0.05) {
    const bg = x.createRadialGradient(W / 2, H * 0.6, H * 0.1, W / 2, H * 0.6, H * 0.95);
    bg.addColorStop(0, "rgba(255,150,60,0)");
    bg.addColorStop(1, `rgba(255,120,40,${0.3 * g.boostPower})`);
    x.fillStyle = bg;
    x.fillRect(0, 0, W, H);
  }
  if (g.brake) {
    const bg = x.createLinearGradient(0, H, 0, H * 0.55);
    bg.addColorStop(0, "rgba(255,60,40,0.2)");
    bg.addColorStop(1, "rgba(255,60,40,0)");
    x.fillStyle = bg;
    x.fillRect(0, H * 0.55, W, H * 0.45);
  }
}

function drawFloats(g: Game, x: CanvasRenderingContext2D) {
  for (let i = 0; i < g.floats.length; i++) {
    const f = g.floats[i];
    const k = clamp(f.life / f.max, 0, 1);
    const pop = 1 + (1 - k) * 0.12 + Math.sin((1 - k) * 9) * 0.05 * k;
    x.save();
    x.globalAlpha = clamp(k * 1.6, 0, 1);
    x.translate(f.x, f.y);
    x.scale(pop, pop);
    x.font = `400 ${f.size}px Bungee, Impact, sans-serif`;
    x.textAlign = "center";
    x.lineWidth = Math.max(2, f.size * 0.16);
    x.strokeStyle = "rgba(10,12,20,0.85)";
    x.strokeText(f.text, 0, 0);
    x.fillStyle = f.color;
    x.fillText(f.text, 0, 0);
    x.restore();
  }
  x.globalAlpha = 1;
  x.textAlign = "left";
}

function drawOverlay(g: Game, x: CanvasRenderingContext2D) {
  const W = g.W;
  const H = g.H;
  if (g.flash > 0.002) {
    x.fillStyle = `rgba(${g.flashCol},${clamp(g.flash * 0.6, 0, 0.85)})`;
    x.fillRect(0, 0, W, H);
  }
  if (L) {
    x.globalAlpha = g.phase === "over" ? 1 : 0.85;
    x.drawImage(L.vig, 0, 0, W, H);
    x.globalAlpha = 1;
  }
  if (g.phase === "over") {
    x.fillStyle = "rgba(8,10,18,0.45)";
    x.fillRect(0, 0, W, H);
  }
  if (g.phase === "menu") {
    const gr = x.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, "rgba(8,12,22,0.72)");
    gr.addColorStop(0.55, "rgba(8,12,22,0.36)");
    gr.addColorStop(1, "rgba(8,12,22,0.8)");
    x.fillStyle = gr;
    x.fillRect(0, 0, W, H);
  }
}
