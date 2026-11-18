export interface ScoreEntry {
  tag: string;
  score: number;
  pkgs: number;
  meters: number;
  bolts: number;
  date: number;
}

const KEY = "parcel-panic.scores.v1";
const MAX = 8;

function safeGet(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function safeSet(v: string) {
  try {
    window.localStorage.setItem(KEY, v);
  } catch {
    /* storage blocked — scores stay in memory */
  }
}

let memory: ScoreEntry[] | null = null;

export function loadScores(): ScoreEntry[] {
  if (memory) return memory;
  const raw = safeGet();
  if (!raw) {
    memory = [];
    return memory;
  }
  try {
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) {
      memory = [];
      return memory;
    }
    memory = parsed
      .filter((e) => e && typeof e.score === "number")
      .map((e) => ({
        tag: String(e.tag || "YOU").slice(0, 3).toUpperCase(),
        score: Math.max(0, Math.floor(e.score)),
        pkgs: Math.max(0, Math.floor(e.pkgs || 0)),
        meters: Math.max(0, Math.floor(e.meters || 0)),
        bolts: Math.max(0, Math.floor(e.bolts ?? 2)),
        date: Number(e.date) || Date.now(),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX);
    return memory;
  } catch {
    memory = [];
    return memory;
  }
}

export function bestScore(): number {
  const s = loadScores();
  return s.length ? s[0].score : 0;
}

export function qualifies(score: number): boolean {
  const s = loadScores();
  return s.length < MAX || score > s[s.length - 1].score;
}

export function submitScore(entry: Omit<ScoreEntry, "date">): ScoreEntry[] {
  const list = loadScores().slice();
  list.push({ ...entry, tag: (entry.tag || "YOU").slice(0, 3).toUpperCase(), date: Date.now() });
  list.sort((a, b) => b.score - a.score);
  memory = list.slice(0, MAX);
  safeSet(JSON.stringify(memory));
  return memory;
}

export function rankOf(score: number): number {
  const s = loadScores();
  const i = s.findIndex((e) => e.score === score);
  return i < 0 ? s.length : i;
}
