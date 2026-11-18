export type Phase = "menu" | "playing" | "paused" | "over";

export type EntKind =
  | "cone"
  | "barrier"
  | "car"
  | "hauler"
  | "slick"
  | "box"
  | "gold"
  | "nitro"
  | "tools";

export interface Ent {
  kind: EntKind;
  lane: number;
  x: number;
  dz: number;
  vz: number;
  w: number;
  h: number;
  len: number;
  seed: number;
  hit: boolean;
  scored: boolean;
  dead: boolean;
  spin: number;
}

export interface Part {
  x: number;
  y: number;
  dz: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  kind: number; // 0 spark | 1 box | 2 smoke | 3 dust | 4 shard | 5 flame
  color: string;
  rot: number;
  vr: number;
  delay: number;
  grav: number;
}

export interface Float {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
}

export interface Prop {
  kind: "lamp" | "pine" | "rock" | "billboard" | "sign";
  side: number;
  dz: number;
  off: number;
  seed: number;
  dead: boolean;
}

export interface Hud {
  phase: Phase;
  score: number;
  mult: number;
  cargo: number;
  bolts: number;
  nitro: number;
  boosting: boolean;
  braking: boolean;
  meters: number;
  kph: number;
  combo: number;
  toast: string | null;
  toastKey: number;
  demo: boolean;
  muted: boolean;
  invuln: boolean;
}

export interface RunResult {
  score: number;
  pkgs: number;
  meters: number;
  bestCombo: number;
  nearMisses: number;
  bolts: number;
}
