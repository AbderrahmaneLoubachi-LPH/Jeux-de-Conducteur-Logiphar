export type Phase = 'start' | 'playing' | 'paused' | 'gameover';
export type Lane = 0 | 1 | 2;
type ItemKind = 'parcel' | 'cone' | 'barrier' | 'van';

type Item = {
  id: number;
  lane: Lane;
  distance: number;
  kind: ItemKind;
  variant: number;
  phase: number;
  handled?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  duration: number;
  size: number;
  color: string;
  square: boolean;
};

type FlyingBox = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  life: number;
  size: number;
};

type FloatingText = {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
};

export type GameEvent =
  | { type: 'pickup' }
  | { type: 'impact'; lost: number }
  | { type: 'crash' }
  | { type: 'finished' };

export type World = {
  phase: Phase;
  targetLane: Lane;
  cameraLane: number;
  wheelTurn: number;
  time: number;
  distance: number;
  speed: number;
  score: number;
  cargo: number;
  collected: number;
  impacts: number;
  immunity: number;
  crashTimer: number;
  nextWave: number;
  waveCount: number;
  nextId: number;
  items: Item[];
  particles: Particle[];
  flyingBoxes: FlyingBox[];
  floatingTexts: FloatingText[];
  shake: number;
  flash: number;
  flashColor: string;
};

const FAR = 175;
const FOCAL = 38;
const HIT_DISTANCE = 8;
const BASE_SPEED = 29;
const MAX_SPEED = 47;

const random = (a: number, b: number) => a + Math.random() * (b - a);
const choose = (count: number) => Math.floor(Math.random() * count);
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function addItem(world: World, kind: ItemKind, lane: Lane, distance: number) {
  world.items.push({
    id: world.nextId++,
    kind,
    lane,
    distance,
    variant: choose(4),
    phase: random(0, Math.PI * 2),
  });
}

export function createWorld(phase: Phase = 'start'): World {
  const world: World = {
    phase,
    targetLane: 1,
    cameraLane: 1,
    wheelTurn: 0,
    time: 0,
    distance: 0,
    speed: BASE_SPEED,
    score: 0,
    cargo: 1,
    collected: 0,
    impacts: 0,
    immunity: 0,
    crashTimer: 0,
    nextWave: 0.8,
    waveCount: 0,
    nextId: 0,
    items: [],
    particles: [],
    flyingBoxes: [],
    floatingTexts: [],
    shake: 0,
    flash: 0,
    flashColor: '255, 255, 255',
  };

  // A pickup is reachable immediately; the first hazard follows a few seconds later.
  addItem(world, 'parcel', 1, 44);
  addItem(world, 'cone', 0, 72);
  addItem(world, 'parcel', 2, 92);
  addItem(world, 'barrier', 1, 111);
  addItem(world, 'parcel', 0, 143);
  return world;
}

export function steer(world: World, direction: -1 | 1) {
  if (world.phase !== 'playing' || world.crashTimer > 0) return;
  const lane = clamp(world.targetLane + direction, 0, 2) as Lane;
  if (lane === world.targetLane) return;
  world.targetLane = lane;
  world.wheelTurn = direction * 0.34;
}

function spawnWave(world: World) {
  world.waveCount++;
  const safeLane = choose(3) as Lane;
  const otherLanes = ([0, 1, 2] as Lane[]).filter((lane) => lane !== safeLane);
  const roll = Math.random();

  if (roll < 0.18) {
    addItem(world, 'parcel', safeLane, FAR);
    addItem(world, 'parcel', otherLanes[choose(2)], FAR + 12);
    return;
  }

  const hazardLane = otherLanes[choose(2)];
  addItem(world, world.waveCount % 4 === 0 ? 'van' : Math.random() < 0.53 ? 'barrier' : 'cone', hazardLane, FAR);
  addItem(world, 'parcel', safeLane, FAR + 5);

  // Later waves can block two lanes, but always leave a clearly marked route.
  if (world.time > 23 && roll > 0.7) {
    addItem(world, 'barrier', otherLanes.find((lane) => lane !== hazardLane)!, FAR);
  }
}

function perspective(distance: number) {
  return FOCAL / (FOCAL + Math.max(-3, distance));
}

function laneGap(width: number) {
  return clamp(width * 0.255, 92, 238);
}

function point(world: World, width: number, height: number, x: number, distance: number) {
  const scale = perspective(distance);
  const horizon = height * 0.39;
  return {
    x: width / 2 + (x - (world.cameraLane - 1)) * laneGap(width) * scale,
    y: horizon + (height * 0.47) * scale,
    scale,
  };
}

function burst(world: World, x: number, y: number, count: number, colors: string[], force: number) {
  for (let i = 0; i < count && world.particles.length < 145; i++) {
    const duration = random(0.28, 0.75);
    world.particles.push({
      x,
      y,
      vx: random(-force, force),
      vy: random(-force * 1.2, force * 0.25),
      life: duration,
      duration,
      size: random(2, 6),
      color: colors[choose(colors.length)],
      square: Math.random() < 0.6,
    });
  }
}

function updateEffects(world: World, dt: number) {
  world.shake = Math.max(0, world.shake - dt * 34);
  world.flash = Math.max(0, world.flash - dt * 3.1);
  world.wheelTurn *= Math.exp(-dt * 6);

  for (const particle of world.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 390 * dt;
    particle.life -= dt;
  }
  world.particles = world.particles.filter((particle) => particle.life > 0);

  for (const box of world.flyingBoxes) {
    box.x += box.vx * dt;
    box.y += box.vy * dt;
    box.vy += 760 * dt;
    box.angle += box.spin * dt;
    box.life -= dt;
  }
  world.flyingBoxes = world.flyingBoxes.filter((box) => box.life > 0);

  for (const text of world.floatingTexts) {
    text.y -= 48 * dt;
    text.life -= dt;
  }
  world.floatingTexts = world.floatingTexts.filter((text) => text.life > 0);
}

export function updateWorld(world: World, dt: number, width: number, height: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (world.phase === 'paused' || world.phase === 'gameover') return events;

  world.time += dt;
  updateEffects(world, dt);

  if (world.phase === 'start') return events;

  world.cameraLane += (world.targetLane - world.cameraLane) * (1 - Math.exp(-dt * 17));

  if (world.crashTimer > 0) {
    world.crashTimer -= dt;
    if (world.crashTimer <= 0) {
      world.crashTimer = 0;
      world.phase = 'gameover';
      events.push({ type: 'finished' });
    }
    return events;
  }

  world.speed = Math.min(MAX_SPEED, BASE_SPEED + world.time * 0.3);
  world.distance += world.speed * dt;
  world.score += world.speed * dt * 0.57;
  world.immunity = Math.max(0, world.immunity - dt);

  world.nextWave -= dt;
  while (world.nextWave <= 0) {
    spawnWave(world);
    world.nextWave += clamp(1.36 - world.time * 0.004, 0.92, 1.36) * random(0.88, 1.12);
  }

  for (const item of world.items) {
    item.distance -= world.speed * dt;
    if (item.handled || item.distance > HIT_DISTANCE || item.lane !== world.targetLane) continue;
    item.handled = true;
    const at = point(world, width, height, item.lane - 1, HIT_DISTANCE);

    if (item.kind === 'parcel') {
      world.cargo++;
      world.collected++;
      world.score += 125;
      world.shake = Math.max(world.shake, 2);
      world.flash = 0.13;
      world.flashColor = '255, 173, 56';
      burst(world, at.x, at.y - 52, 19, ['#ffffff', '#ffcb74', '#ff8533'], 210);
      world.floatingTexts.push({ x: at.x, y: at.y - 95, text: '+125', color: '#ffd18a', life: 0.85 });
      events.push({ type: 'pickup' });
    } else if (world.immunity <= 0) {
      world.impacts++;
      world.shake = world.impacts === 1 ? 18 : 32;
      world.flash = world.impacts === 1 ? 0.48 : 0.8;
      world.flashColor = world.impacts === 1 ? '255, 160, 65' : '255, 90, 70';
      burst(world, at.x, at.y - 52, 32, ['#ffb264', '#ffffff', '#d86143', '#1d2731'], 330);

      const lost = world.cargo;
      world.cargo = 0;
      for (let i = 0; i < Math.min(lost, 9); i++) {
        world.flyingBoxes.push({
          x: width * 0.78 + random(-24, 24),
          y: height * 0.79 + random(-15, 15),
          vx: random(-420, 90),
          vy: random(-530, -240),
          angle: random(-0.4, 0.4),
          spin: random(-11, 11),
          life: random(0.85, 1.45),
          size: clamp(width * 0.065, 24, 49),
        });
      }

      if (world.impacts === 1) {
        world.immunity = 1.3;
        world.floatingTexts.push({ x: width / 2, y: height * 0.54, text: 'COLIS PERDUS !', color: '#ffe2b4', life: 1.1 });
        events.push({ type: 'impact', lost });
      } else {
        world.crashTimer = 0.8;
        events.push({ type: 'crash' });
      }
    }
  }

  world.items = world.items.filter((item) => item.distance > -12 && !item.handled);
  return events;
}

function polygon(ctx: CanvasRenderingContext2D, coords: number[], color: string | CanvasGradient) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(coords[0], coords[1]);
  for (let i = 2; i < coords.length; i += 2) ctx.lineTo(coords[i], coords[i + 1]);
  ctx.closePath();
  ctx.fill();
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSky(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  const horizon = h * 0.39;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.63);
  sky.addColorStop(0, '#142738');
  sky.addColorStop(0.52, '#416779');
  sky.addColorStop(0.81, '#db956f');
  sky.addColorStop(1, '#f5c28c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  const sunX = w * 0.75 - (world.cameraLane - 1) * 5;
  const sunY = horizon - h * 0.11;
  const sunSize = Math.min(w * 0.095, 76);
  const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunSize * 3.8);
  glow.addColorStop(0, 'rgba(255,241,187,.52)');
  glow.addColorStop(0.28, 'rgba(255,192,115,.21)');
  glow.addColorStop(1, 'rgba(255,172,109,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - sunSize * 4, sunY - sunSize * 4, sunSize * 8, sunSize * 8);
  ctx.fillStyle = '#ffdfae';
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunSize * 0.64, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(240,229,204,.11)';
  for (let i = 0; i < 5; i++) {
    const cloudX = (((i * 0.27 + world.time * 0.00075) % 1.42) - 0.2) * w;
    const cloudY = h * (0.16 + (i % 3) * 0.055);
    ctx.beginPath();
    ctx.ellipse(cloudX, cloudY, 42 + i * 11, 6 + (i % 2) * 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant depots and low hills keep the straight road grounded in a place.
  polygon(ctx, [0, horizon + 14, 0, horizon - 6, w * 0.15, horizon - 24, w * 0.3, horizon + 5, w * 0.49, horizon - 11, w * 0.68, horizon + 12, w, horizon - 15, w, horizon + 25], '#687a74');
  ctx.fillStyle = '#465c5d';
  for (let i = 0; i < 15; i++) {
    const bw = 24 + (i * 17) % 42;
    const bx = (i / 14) * w - bw / 2 - (world.cameraLane - 1) * 2;
    const bh = 11 + (i * 13) % 31;
    ctx.fillRect(bx, horizon - bh + 14, bw, bh);
    if (i % 3 === 0) {
      polygon(ctx, [bx - 5, horizon - bh + 14, bx + bw / 2, horizon - bh + 1, bx + bw + 5, horizon - bh + 14], '#394f51');
    }
  }

  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, '#6f806d');
  ground.addColorStop(0.37, '#475c51');
  ground.addColorStop(1, '#253b3a');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon + 13, w, h - horizon);
}

function drawRoad(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  const leftFar = point(world, w, h, -1.5, 1200);
  const rightFar = point(world, w, h, 1.5, 1200);
  const leftNear = point(world, w, h, -1.5, -3);
  const rightNear = point(world, w, h, 1.5, -3);

  polygon(ctx, [leftFar.x - 3, leftFar.y, rightFar.x + 3, rightFar.y, rightNear.x + 23, h, leftNear.x - 23, h], '#bdb9a7');

  const asphalt = ctx.createLinearGradient(0, h * 0.4, 0, h * 0.9);
  asphalt.addColorStop(0, '#64716e');
  asphalt.addColorStop(0.4, '#4c5b5b');
  asphalt.addColorStop(1, '#293943');
  polygon(ctx, [leftFar.x, leftFar.y, rightFar.x, rightFar.y, rightNear.x, rightNear.y, leftNear.x, leftNear.y], asphalt);

  for (const side of [-1.5, 1.5]) {
    const far = point(world, w, h, side, 1200);
    const near = point(world, w, h, side, -3);
    ctx.strokeStyle = '#f0dfc2';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(near.x, near.y);
    ctx.stroke();
  }

  const dashOffset = world.distance % 22;
  for (const laneBoundary of [-0.5, 0.5]) {
    for (let i = 0; i < 11; i++) {
      const nearD = i * 22 + 2 - dashOffset;
      const farD = nearD + 10;
      if (farD < 0 || nearD > FAR) continue;
      const near = point(world, w, h, laneBoundary, Math.max(0, nearD));
      const far = point(world, w, h, laneBoundary, farD);
      ctx.strokeStyle = 'rgba(252,241,213,.92)';
      ctx.lineWidth = Math.max(1.3, near.scale * 5.2);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(far.x, far.y);
      ctx.lineTo(near.x, near.y);
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';

  // Small streaks on the tarmac make the forward motion readable at a glance.
  ctx.strokeStyle = 'rgba(214,224,215,.12)';
  for (const lane of [-1, 0, 1]) {
    for (let i = 0; i < 5; i++) {
      const d = i * 39 + 6 - (world.distance % 39);
      if (d < 0) continue;
      const a = point(world, w, h, lane + 0.19, d);
      const b = point(world, w, h, lane + 0.19, d + 4);
      ctx.lineWidth = Math.max(1, 2 * a.scale);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}

function drawRoadside(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  const offset = world.distance % 34;
  for (let i = 6; i >= 0; i--) {
    const d = i * 34 + 19 - offset;
    if (d < -2 || d > FAR) continue;
    for (const side of [-1, 1]) {
      const pole = point(world, w, h, side * 2.13, d);
      const tall = (24 + 103 * pole.scale);
      ctx.strokeStyle = '#344a4c';
      ctx.lineWidth = Math.max(1.5, 4 * pole.scale);
      ctx.beginPath();
      ctx.moveTo(pole.x, pole.y);
      ctx.lineTo(pole.x, pole.y - tall);
      ctx.lineTo(pole.x - side * 15 * pole.scale, pole.y - tall);
      ctx.stroke();
      ctx.fillStyle = '#ffe4aa';
      ctx.fillRect(pole.x - side * 19 * pole.scale, pole.y - tall - 2, 9 * pole.scale, 3);

      if (i % 2 === 0) {
        const bush = point(world, w, h, side * 2.65, d + 8);
        const radius = 8 + bush.scale * 20;
        ctx.fillStyle = i % 4 === 0 ? '#31564d' : '#3e6c58';
        ctx.beginPath();
        ctx.arc(bush.x, bush.y - radius * 0.5, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawBox(ctx: CanvasRenderingContext2D, x: number, bottomY: number, size: number, highlighted: boolean) {
  const half = size / 2;
  const top = bottomY - size * 0.92;
  polygon(ctx, [x - half, top, x - half * 0.58, top - size * 0.23, x + half * 0.96, top - size * 0.23, x + half, top], highlighted ? '#ffcd77' : '#daa15e');
  polygon(ctx, [x + half, top, x + half * 0.96, top - size * 0.23, x + half * 0.96, bottomY - size * 0.22, x + half, bottomY], '#a66131');
  ctx.fillStyle = highlighted ? '#f49a42' : '#bd773f';
  ctx.fillRect(x - half, top, size, size * 0.92);
  ctx.fillStyle = '#ffe4a4';
  ctx.fillRect(x - size * 0.085, top, size * 0.17, size * 0.92);
  ctx.fillStyle = '#fce6b8';
  ctx.fillRect(x - size * 0.09, top - size * 0.22, size * 0.18, size * 0.22);
  if (size > 17) {
    ctx.fillStyle = highlighted ? '#fff7dc' : '#e9c79d';
    ctx.fillRect(x - size * 0.36, top + size * 0.48, size * 0.16, size * 0.045);
    ctx.fillRect(x - size * 0.30, top + size * 0.42, size * 0.045, size * 0.16);
  }
}

function drawItem(ctx: CanvasRenderingContext2D, world: World, item: Item, w: number, h: number) {
  const at = point(world, w, h, item.lane - 1, item.distance);
  if (at.y < 0 || at.y > h * 0.97) return;
  const unit = Math.min(w * 0.23, 132) * at.scale;
  const x = at.x;
  const y = at.y;
  ctx.save();

  ctx.fillStyle = 'rgba(13,29,32,.32)';
  ctx.beginPath();
  ctx.ellipse(x + unit * 0.1, y + unit * 0.1, unit * 0.55, unit * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  if (item.kind === 'parcel') {
    const bob = Math.sin(world.time * 4.8 + item.phase) * 3.5 * at.scale;
    const halo = ctx.createRadialGradient(x, y - unit * 0.5, 0, x, y - unit * 0.5, unit * 1.3);
    halo.addColorStop(0, 'rgba(255,204,101,.34)');
    halo.addColorStop(1, 'rgba(255,176,69,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - unit * 1.5, y - unit * 2, unit * 3, unit * 3);
    ctx.strokeStyle = 'rgba(255,222,158,.65)';
    ctx.lineWidth = Math.max(1, 2 * at.scale);
    ctx.beginPath();
    ctx.ellipse(x, y + 2, unit * 0.53, unit * 0.15, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawBox(ctx, x, y - 8 * at.scale + bob, unit * 0.83, true);
  } else if (item.kind === 'cone') {
    const size = unit * 0.82;
    ctx.fillStyle = '#283438';
    rounded(ctx, x - size * 0.5, y - size * 0.1, size, size * 0.17, 2);
    ctx.fill();
    polygon(ctx, [x, y - size * 1.24, x + size * 0.38, y - size * 0.08, x - size * 0.38, y - size * 0.08], '#eb563d');
    polygon(ctx, [x - size * 0.22, y - size * 0.56, x + size * 0.22, y - size * 0.56, x + size * 0.28, y - size * 0.41, x - size * 0.28, y - size * 0.41], '#fff1df');
    polygon(ctx, [x - size * 0.12, y - size * 0.91, x + size * 0.12, y - size * 0.91, x + size * 0.16, y - size * 0.78, x - size * 0.16, y - size * 0.78], '#fff1df');
  } else if (item.kind === 'barrier') {
    const bw = unit * 1.13;
    const bh = unit * 0.63;
    ctx.fillStyle = '#2b343a';
    ctx.fillRect(x - bw * 0.43, y - bh * 0.2, bw * 0.09, bh * 0.4);
    ctx.fillRect(x + bw * 0.34, y - bh * 0.2, bw * 0.09, bh * 0.4);
    ctx.fillStyle = '#f6eadb';
    rounded(ctx, x - bw / 2, y - bh * 1.06, bw, bh * 0.87, Math.max(2, unit * 0.04));
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - bw / 2, y - bh * 1.06, bw, bh * 0.87);
    ctx.clip();
    for (let i = -2; i < 6; i++) {
      polygon(ctx, [x - bw / 2 + i * bw * 0.27, y - bh * 0.19, x - bw / 2 + (i + 0.38) * bw * 0.27, y - bh * 0.19, x - bw / 2 + (i + 1.23) * bw * 0.27, y - bh * 1.06, x - bw / 2 + (i + 0.85) * bw * 0.27, y - bh * 1.06], '#e96c3f');
    }
    ctx.restore();
    ctx.fillStyle = '#2b343a';
    ctx.fillRect(x - bw / 2, y - bh * 0.2, bw, bh * 0.09);
  } else {
    const bw = unit * 0.86;
    const bh = unit * 1.24;
    ctx.fillStyle = '#283741';
    rounded(ctx, x - bw * 0.56, y - bh * 0.79, bw * 1.12, bh * 0.86, bw * 0.1);
    ctx.fill();
    ctx.fillStyle = item.variant % 2 === 0 ? '#d8d9ca' : '#9db1b4';
    rounded(ctx, x - bw / 2, y - bh, bw, bh * 0.94, bw * 0.1);
    ctx.fill();
    ctx.fillStyle = 'rgba(33,58,64,.28)';
    ctx.fillRect(x - bw * 0.04, y - bh * 0.82, bw * 0.08, bh * 0.77);
    ctx.fillStyle = '#425a60';
    ctx.fillRect(x - bw * 0.38, y - bh * 0.87, bw * 0.76, bh * 0.17);
    ctx.fillStyle = '#ec663f';
    ctx.fillRect(x - bw * 0.42, y - bh * 0.25, bw * 0.18, bh * 0.07);
    ctx.fillRect(x + bw * 0.24, y - bh * 0.25, bw * 0.18, bh * 0.07);
    ctx.fillStyle = '#f38d46';
    ctx.fillRect(x - bw * 0.3, y - bh * 0.47, bw * 0.6, bh * 0.06);
  }
  ctx.restore();
}

function drawCockpit(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  const topShade = ctx.createLinearGradient(0, 0, 0, h * 0.23);
  topShade.addColorStop(0, 'rgba(10,20,28,.8)');
  topShade.addColorStop(1, 'rgba(10,20,28,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, w, h * 0.23);

  // Windshield glass reflection and wiper arcs sit in front of the road.
  polygon(ctx, [w * 0.08, h * 0.1, w * 0.22, h * 0.1, w * 0.56, h * 0.78, w * 0.5, h * 0.78], 'rgba(240,255,255,.028)');
  ctx.strokeStyle = 'rgba(15,29,37,.26)';
  ctx.lineWidth = Math.max(2, w * 0.003);
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.78);
  ctx.quadraticCurveTo(w * 0.36, h * 0.62, w * 0.53, h * 0.73);
  ctx.moveTo(w * 0.86, h * 0.78);
  ctx.quadraticCurveTo(w * 0.7, h * 0.63, w * 0.5, h * 0.73);
  ctx.stroke();

  const side = w < 600 ? w * 0.052 : w * 0.038;
  polygon(ctx, [0, 0, side, 0, side * 1.65, h * 0.54, side * 2.28, h * 0.84, 0, h * 0.84], '#13212b');
  polygon(ctx, [w, 0, w - side, 0, w - side * 1.65, h * 0.54, w - side * 2.28, h * 0.84, w, h * 0.84], '#13212b');
  ctx.strokeStyle = 'rgba(242,166,87,.24)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(side, 0);
  ctx.lineTo(side * 1.65, h * 0.54);
  ctx.lineTo(side * 2.28, h * 0.84);
  ctx.moveTo(w - side, 0);
  ctx.lineTo(w - side * 1.65, h * 0.54);
  ctx.lineTo(w - side * 2.28, h * 0.84);
  ctx.stroke();

  // Rear-view mirror and its short mount.
  ctx.fillStyle = '#15212a';
  ctx.fillRect(w * 0.495, 0, w * 0.01, h * 0.073);
  ctx.fillStyle = '#0d1922';
  rounded(ctx, w * 0.437, h * 0.065, w * 0.126, h * 0.037, h * 0.008);
  ctx.fill();
  ctx.fillStyle = '#334b54';
  rounded(ctx, w * 0.447, h * 0.072, w * 0.106, h * 0.023, h * 0.006);
  ctx.fill();

  const dash = ctx.createLinearGradient(0, h * 0.77, 0, h);
  dash.addColorStop(0, '#2c4049');
  dash.addColorStop(0.22, '#162630');
  dash.addColorStop(1, '#0d171f');
  ctx.fillStyle = dash;
  ctx.beginPath();
  ctx.moveTo(0, h * 0.82);
  ctx.quadraticCurveTo(w * 0.5, h * 0.745, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(245,142,66,.83)';
  ctx.lineWidth = Math.max(2, h * 0.003);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.82);
  ctx.quadraticCurveTo(w * 0.5, h * 0.745, w, h * 0.82);
  ctx.stroke();

  // The collected cargo is visible on the passenger side of the cab.
  const size = clamp(w * 0.072, 29, 55);
  const shown = Math.min(world.cargo, 7);
  const cargoX = w * 0.79;
  const cargoY = h * 0.945;
  for (let i = 0; i < shown; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    drawBox(ctx, cargoX + (col - 1) * size * 0.86, cargoY - row * size * 0.83, size * 0.83, false);
  }

  // Instrument panel.
  const panelW = clamp(w * 0.19, 105, 202);
  const panelH = clamp(h * 0.08, 51, 74);
  const panelX = w * 0.50 - panelW * 0.5;
  const panelY = h * 0.866;
  ctx.fillStyle = '#09151c';
  rounded(ctx, panelX, panelY, panelW, panelH, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(114,143,150,.36)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#f2914c';
  ctx.font = `700 ${clamp(w * 0.026, 20, 32)}px Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(String(Math.round(world.speed * 3.2)), w * 0.50, panelY + panelH * 0.58);
  ctx.fillStyle = '#9aaeb0';
  ctx.font = `700 ${clamp(w * 0.009, 8, 11)}px Arial, sans-serif`;
  ctx.fillText('KM/H', w * 0.50, panelY + panelH * 0.83);

  // Left-hand-drive steering wheel; the rotation follows lane changes.
  const wheelX = w * 0.29;
  const wheelY = h * 0.985;
  const radius = w < 600
    ? clamp(Math.min(w * 0.25, h * 0.2), 82, 115)
    : clamp(Math.min(w * 0.165, h * 0.177), 90, 145);
  ctx.save();
  ctx.translate(wheelX, wheelY);
  ctx.rotate(world.wheelTurn);
  ctx.strokeStyle = '#08131a';
  ctx.lineWidth = radius * 0.25;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = '#344650';
  ctx.lineWidth = radius * 0.065;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.94, Math.PI * 1.04, Math.PI * 1.92);
  ctx.stroke();
  ctx.fillStyle = '#162731';
  polygon(ctx, [-radius * 0.84, -radius * 0.38, -radius * 0.76, -radius * 0.21, 0, radius * 0.06, radius * 0.76, -radius * 0.21, radius * 0.84, -radius * 0.38, 0, -radius * 0.09], '#162731');
  polygon(ctx, [-radius * 0.12, 0, radius * 0.12, 0, radius * 0.25, radius * 0.83, -radius * 0.25, radius * 0.83], '#162731');
  ctx.fillStyle = '#253a44';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.29, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ee833a';
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const floorShade = ctx.createLinearGradient(0, h * 0.93, 0, h);
  floorShade.addColorStop(0, 'rgba(8,15,21,0)');
  floorShade.addColorStop(1, 'rgba(8,15,21,.75)');
  ctx.fillStyle = floorShade;
  ctx.fillRect(0, h * 0.93, w, h * 0.07);
}

function drawEffects(ctx: CanvasRenderingContext2D, world: World, w: number) {
  for (const particle of world.particles) {
    ctx.globalAlpha = clamp(particle.life / particle.duration, 0, 1);
    ctx.fillStyle = particle.color;
    if (particle.square) ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    else {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  for (const box of world.flyingBoxes) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, box.life * 1.6);
    ctx.translate(box.x, box.y);
    ctx.rotate(box.angle);
    drawBox(ctx, 0, box.size * 0.5, box.size, false);
    ctx.restore();
  }

  for (const text of world.floatingTexts) {
    ctx.save();
    ctx.globalAlpha = clamp(text.life / 0.5, 0, 1);
    ctx.fillStyle = text.color;
    ctx.shadowColor = 'rgba(10,22,27,.75)';
    ctx.shadowBlur = 16;
    ctx.textAlign = 'center';
    ctx.font = `900 ${clamp(w * 0.034, 20, 43)}px Arial, sans-serif`;
    ctx.fillText(text.text, text.x, text.y);
    ctx.restore();
  }
}

export function renderWorld(ctx: CanvasRenderingContext2D, world: World, w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (world.shake > 0) {
    ctx.translate(random(-world.shake, world.shake), random(-world.shake, world.shake));
  }

  drawSky(ctx, world, w, h);
  drawRoad(ctx, world, w, h);
  drawRoadside(ctx, world, w, h);
  const visible = world.items.filter((item) => !item.handled && item.distance < FAR && item.distance > -8);
  visible.sort((a, b) => b.distance - a.distance);
  for (const item of visible) drawItem(ctx, world, item, w, h);
  drawCockpit(ctx, world, w, h);
  drawEffects(ctx, world, w);
  ctx.restore();

  if (world.flash > 0) {
    ctx.fillStyle = `rgba(${world.flashColor}, ${world.flash * 0.52})`;
    ctx.fillRect(0, 0, w, h);
  }
}