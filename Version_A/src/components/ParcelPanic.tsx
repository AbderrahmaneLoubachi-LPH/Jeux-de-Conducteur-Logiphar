import { useCallback, useEffect, useRef, useState } from "react";
import { Game } from "@/game/engine";
import logo from "@/assets/logiphar-logo.svg";
import { sfx } from "@/game/audio";
import { loadScores, qualifies, submitScore } from "@/game/storage";
import type { ScoreEntry } from "@/game/storage";
import type { Hud, RunResult } from "@/game/types";

/* ------------------------------- icons ------------------------------- */
const Ico = {
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4.4" height="16" />
      <rect x="13.6" y="4" width="4.4" height="16" />
    </svg>
  ),
  sound: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16.5 8.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.8" fill="none" />
      <path d="M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  ),
  mute: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" strokeWidth="1.9" fill="none" />
    </svg>
  ),
  left: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M15 5l-7 7 7 7" strokeLinecap="square" />
    </svg>
  ),
  right: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6">
      <path d="M9 5l7 7-7 7" strokeLinecap="square" />
    </svg>
  ),
  bolt: (ok: boolean) => (
    <svg viewBox="0 0 24 24">
      <path
        d="M12 1.8l8.6 5v10.4L12 22.2 3.4 17.2V6.8z"
        fill={ok ? "#ffb347" : "#39424f"}
        stroke={ok ? "#ffe0a8" : "#232b36"}
        strokeWidth="1.3"
      />
      <circle cx="12" cy="12" r="3.5" fill={ok ? "#2b1a06" : "#2a323d"} />
      {ok && <circle cx="12" cy="12" r="1.5" fill="#ffd07a" />}
    </svg>
  ),
  box: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5L12 12l9-4.5M12 12v9" />
    </svg>
  ),
};

const fmt = (n: number) => Math.floor(n).toLocaleString("fr-FR");

const BAD_WORDS = ["PERDUE", "ACCIDENT", "CHOC", "DÉRAPAGE", "TOMBÉ", "VIDE", "BOULON", "CASSÉ"];
const isBadToast = (t: string) => BAD_WORDS.some((w) => t.includes(w));

const initialHud: Hud = {
  phase: "menu",
  score: 0,
  mult: 1,
  cargo: 0,
  bolts: 2,
  nitro: 1,
  boosting: false,
  braking: false,
  meters: 0,
  kph: 0,
  combo: 0,
  toast: null,
  toastKey: 0,
  demo: true,
  muted: false,
  invuln: false,
};

/* =============================== HUD =============================== */
function HudLayer({
  hud,
  best,
  onPause,
  onMute,
}: {
  hud: Hud;
  best: number;
  onPause: () => void;
  onMute: () => void;
}) {
  const pips = Math.min(hud.cargo, 9);
  return (
    <div className="hud">
      <div className="hud-left">
      <div className="hud-score panel clip-tag">
        <div className="label">Score</div>
        <div className={`value${hud.score >= best && best > 0 ? " best" : ""}`}>{fmt(hud.score)}</div>
        <div className="label" style={{ marginTop: 3, fontSize: 9, letterSpacing: "0.18em" }}>
          Record {fmt(best)}
        </div>
      </div>

      <div key={hud.mult} className={`hud-mult clip-tag${hud.mult > 1 ? " pop" : ""}`}>
        <span style={{ width: 15, height: 15, display: "block" }}>{Ico.box}</span>
        x{hud.mult}
      </div>
      </div>

      <div className={`hud-rig${hud.bolts === 1 ? " warn" : ""}`}>
        <div className="bolts">
          {[0, 1].map((i) => (
            <div key={i} className={`bolt${i < hud.bolts ? "" : " lost"}`}>
              {Ico.bolt(i < hud.bolts)}
            </div>
          ))}
        </div>
        <div className="label" style={{ fontSize: 9 }}>
          {hud.bolts === 2 ? "Camion intact" : hud.bolts === 1 ? "Dernier choc" : "Accidenté"}
        </div>
      </div>

      {hud.combo >= 5 && (
        <div className="hud-chain clip-tag">
          Série {hud.combo}
        </div>
      )}

      <div className="hud-right">
        <div className="hud-stat panel clip-tag">
          <div className="label">Distance</div>
          <div className="value">
            {fmt(hud.meters)} <small>M</small>
          </div>
        </div>
        <div className="hud-stat panel clip-tag">
          <div className="label">Vitesse</div>
          <div className="value" style={{ color: hud.boosting ? "#ffd85e" : undefined }}>
            {hud.kph} <small>KM/H</small>
          </div>
        </div>
        <div className="icon-btns">
          <button
            className="icon-btn clip-tag"
            aria-label={hud.phase === "paused" ? "Reprendre" : "Pause"}
            onPointerDown={(e) => {
              e.stopPropagation();
              onPause();
            }}
          >
            {hud.phase === "paused" ? (
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 4l13 8-13 8z" />
              </svg>
            ) : (
              Ico.pause
            )}
          </button>
          <button
            className="icon-btn clip-tag"
            aria-label="Activer ou couper le son"
            onPointerDown={(e) => {
              e.stopPropagation();
              onMute();
            }}
          >
            {hud.muted ? Ico.mute : Ico.sound}
          </button>
        </div>
      </div>

      <div className="hud-cargo panel clip-tag">
        <div>
          <div className="label">Colis</div>
          <div className="cargo-num">{hud.cargo}</div>
        </div>
        <div className="cargo-stack">
          {Array.from({ length: pips }).map((_, i) => (
            <div
              key={i}
              className="cargo-pip"
              style={{ height: 9 + (i % 3) * 4, marginBottom: (i % 3) * 2 }}
            />
          ))}
        </div>
      </div>

      <div className="hud-nitro panel clip-tag">
        <div className="label" style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Nitro</span>
          <span style={{ color: hud.boosting ? "#ffd85e" : undefined }}>
            {hud.boosting ? "TURBO" : `${Math.round(hud.nitro * 100)}%`}
          </span>
        </div>
        <div className="nitro-track" style={{ marginTop: 5 }}>
          <div
            className={`nitro-fill${hud.boosting ? " hot" : ""}`}
            style={{ width: `${Math.max(0, Math.min(1, hud.nitro)) * 100}%` }}
          />
          <div className="nitro-ticks" />
        </div>
      </div>

      {hud.toast && (
        <div key={hud.toastKey} className={`toast clip-tag${isBadToast(hud.toast) ? " bad" : ""}`}>
          {hud.toast}
        </div>
      )}
    </div>
  );
}

/* =========================== touch controls =========================== */
function TouchCommandes({ game }: { game: Game | null }) {
  const [on, setOn] = useState("");
  const press = (fn: () => void, key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOn(key);
      fn();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      setOn("");
    },
    onPointerLeave: () => setOn(""),
    onPointerCancel: () => setOn(""),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const hold = (down: () => void, up: () => void, key: string) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setOn(key);
      down();
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.stopPropagation();
      setOn("");
      up();
    },
    onPointerLeave: () => {
      setOn("");
      up();
    },
    onPointerCancel: () => {
      setOn("");
      up();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  return (
    <div className="touch-controls">
      <div className="tgroup">
        <button
          className={`tbtn clip-tag${on === "l" ? " on" : ""}`}
          aria-label="Aller à gauche"
          {...press(() => game?.step(-1), "l")}
        >
          {Ico.left}
        </button>
        <button
          className={`tbtn clip-tag${on === "r" ? " on" : ""}`}
          aria-label="Aller à droite"
          {...press(() => game?.step(1), "r")}
        >
          {Ico.right}
        </button>
      </div>
      <div className="tgroup">
        <button
          className={`tbtn brake clip-tag${on === "b" ? " on" : ""}`}
          aria-label="Freiner"
          {...hold(() => game?.setBrake(true), () => game?.setBrake(false), "b")}
        >
          FREIN
        </button>
        <button
          className={`tbtn boost${on === "n" ? " on" : ""}`}
          aria-label="Nitro"
          {...hold(() => game?.setBoost(true), () => game?.setBoost(false), "n")}
        >
          NITRO
        </button>
      </div>
    </div>
  );
}

/* ============================= score table ============================= */
function ScoreTable({ scores, newIdx }: { scores: ScoreEntry[]; newIdx: number }) {
  return (
    <div className="scores">
      {scores.length === 0 && (
        <div className="score-row">
          <span className="meta">Aucun trajet enregistré</span>
        </div>
      )}
      {scores.map((s, i) => (
        <div key={`${s.tag}-${s.score}-${s.date}`} className={`score-row${i === 0 ? " top" : ""}${i === newIdx ? " new" : ""}`}>
          <span className="rank">{i + 1}</span>
          <span className="tag">{s.tag}</span>
          <span className="meta">
            {s.pkgs} colis · {fmt(s.meters)} m
          </span>
          <span className="pts">{fmt(s.score)}</span>
        </div>
      ))}
    </div>
  );
}

/* =============================== screens =============================== */
function StartScreen({
  best,
  scores,
  muted,
  onPlay,
  onMute,
}: {
  best: number;
  scores: ScoreEntry[];
  muted: boolean;
  onPlay: () => void;
  onMute: () => void;
}) {
  return (
    <div className="screen">
      <div className="start-wrap">
        <div className="start-left">
          <span className="kicker clip-tag">
            <span className="dot" /> LOGIPHAR · Livraison de nuit
          </span>
          <h1 className="game-title">
            <img src={logo} className="brand-logo" alt="LOGIPHAR Transport & Distribution" />
            <span className="game-subtitle">La course aux colis</span>
          </h1>
          <p className="blurb">
            Trois voies, une mission : ramasser le maximum de <b>colis</b>. Évitez les obstacles :
            au premier choc, tout le chargement tombe. Au deuxième, la livraison est terminée.
          </p>
          <div className="start-actions">
            <button className="btn btn-play clip-tag" onClick={onPlay}>
              Prendre la route
              <span className="hint">ou appuyez sur Entrée</span>
            </button>
            <div className="panel clip-tag" style={{ padding: "10px 16px" }}>
              <div className="label">Record local</div>
              <div className="value" style={{ fontSize: 24, color: "var(--gold)" }}>
                {fmt(best)}
              </div>
            </div>
            <button className="icon-btn clip-tag" onClick={onMute} aria-label="Activer ou couper le son">
              {muted ? Ico.mute : Ico.sound}
            </button>
          </div>
        </div>

        <div className="start-right">
          <div className="card panel clip-tag">
            <h3>Commandes</h3>
            <div className="legend-row">
              <span className="keys">
                <span className="keycap">←</span>
                <span className="keycap">→</span>
              </span>
              <span className="keycap">A</span>
              <span className="keycap">D</span>
              <span className="what">Changer de voie</span>
            </div>
            <div className="legend-row">
              <span className="keycap">ESPACE</span>
              <span className="what">Activer le turbo</span>
            </div>
            <div className="legend-row">
              <span className="keycap">↓</span>
              <span className="what">Freiner · stabiliser</span>
            </div>
            <div className="legend-row">
              <span className="keycap">P</span>
              <span className="keycap">M</span>
              <span className="what">Pause · son</span>
            </div>
            <div className="legend-row" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", marginTop: 4, paddingTop: 8 }}>
              <span className="keys">
                <span className="keycap">GLISSER</span>
                <span className="keycap">TOUCHER</span>
              </span>
              <span className="what">Direction · turbo</span>
            </div>
          </div>
          <div className="card panel clip-tag">
            <h3>Meilleurs livreurs</h3>
            <ScoreTable scores={scores} newIdx={-1} />
          </div>
        </div>

        <div className="ticker">
          <div className="ticker-track">
            {Array.from({ length: 2 }).map((_, k) => (
              <span key={k} style={{ display: "flex", gap: 42 }}>
                <span><b>Colis</b> : multiplicateur x2 tous les 5 colis</span>
                <span><b>Colis dorés</b> : bonus de 220 points</span>
                <span><b>Boîte à outils</b> : répare le camion</span>
                <span><b>Nitro</b> : se recharge avec les colis</span>
                <span><b>Frôlement</b> : bonus sans collision</span>
                <span><b>Huile</b> : attention au dérapage</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PauseScreen({
  onReprendre,
  onRecommencer,
  onQuit,
}: {
  onReprendre: () => void;
  onRecommencer: () => void;
  onQuit: () => void;
}) {
  return (
    <div className="veil">
      <div className="modal panel clip-tag">
        <div className="hazard" style={{ marginBottom: 16 }} />
        <div className="modal-head">
          <div>
            <div className="label">Moteur au ralenti</div>
            <div className="modal-title ok">En pause</div>
          </div>
          <div className="btn-row">
            <button className="btn btn-play" onClick={onReprendre}>
              Reprendre
            </button>
            <button className="btn btn-ghost clip-tag" onClick={onRecommencer}>
              Recommencer
            </button>
            <button className="btn btn-ghost clip-tag" onClick={onQuit}>
              Accueil
            </button>
          </div>
        </div>
        <div className="legend-row">
          <span className="keycap">P</span>
          <span>reprendre la livraison</span>
        </div>
        <div className="legend-row">
          <span className="keycap">R</span>
          <span>recommencer immédiatement</span>
        </div>
      </div>
    </div>
  );
}

function OverScreen({
  result,
  scores,
  newIdx,
  tag,
  setTag,
  canSave,
  onSave,
  saved,
  onRecommencer,
  onQuit,
}: {
  result: RunResult;
  scores: ScoreEntry[];
  newIdx: number;
  tag: string;
  setTag: (t: string) => void;
  canSave: boolean;
  onSave: () => void;
  saved: boolean;
  onRecommencer: () => void;
  onQuit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (canSave && !saved && inputRef.current) {
      const id = window.setTimeout(() => inputRef.current?.focus(), 420);
      return () => window.clearTimeout(id);
    }
  }, [canSave, saved]);
  return (
    <div className="veil">
      <div className="modal panel clip-tag">
        <div className="hazard" style={{ marginBottom: 16 }} />
        <div className="modal-head">
          <div>
            <div className="label">Deuxième choc · fin de la livraison</div>
            <div className="modal-title">Accidenté</div>
          </div>
          <div className="btn-row">
            <button className="btn btn-rust" onClick={onRecommencer}>
              Réessayer
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--body)",
                  fontSize: 10,
                  letterSpacing: "0.2em",
                  opacity: 0.7,
                }}
              >
                ENTRÉE
              </span>
            </button>
            <button className="btn btn-ghost clip-tag" onClick={onQuit}>
              Accueil
            </button>
          </div>
        </div>

        <div className="over-grid">
          <div>
            <div className="stats">
              <div className="stat">
                <div className="label">Score</div>
                <div className="value amber" style={{ fontSize: "clamp(26px,5vw,40px)" }}>
                  {fmt(result.score)}
                </div>
              </div>
              <div className="stat">
                <div className="label">Colis ramassés</div>
                <div className="value">{result.pkgs}</div>
              </div>
              <div className="stat">
                <div className="label">Distance</div>
                <div className="value">{fmt(result.meters)} m</div>
              </div>
              <div className="stat">
                <div className="label">Meilleure série</div>
                <div className="value mint">{result.bestCombo}</div>
              </div>
              <div className="stat">
                <div className="label">Frôlements</div>
                <div className="value">{result.nearMisses}</div>
              </div>
            </div>

            {canSave && (
              <div className="tag-field">
                <span className="label" style={{ fontSize: 11 }}>
                  Vos initiales
                </span>
                <input
                  ref={inputRef}
                  className="tag-input clip-tag"
                  value={tag}
                  maxLength={3}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={saved}
                  onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      if (!saved) onSave();
                      else onRecommencer();
                    }
                  }}
                  onFocus={() => {
                    const g = (window as unknown as { __game?: Game }).__game;
                    if (g) g.inputLocked = true;
                  }}
                  onBlur={() => {
                    const g = (window as unknown as { __game?: Game }).__game;
                    if (g) g.inputLocked = false;
                  }}
                />
                {!saved ? (
                  <button className="btn btn-ghost clip-tag" onClick={onSave}>
                    Enregistrer
                  </button>
                ) : (
                  <span className="label" style={{ color: "var(--mint)", fontSize: 11 }}>
                    Enregistré au classement
                  </span>
                )}
              </div>
            )}
            {!canSave && (
              <p className="label" style={{ fontSize: 11, lineHeight: 1.7, marginBottom: 12 }}>
                Score insuffisant pour entrer au classement. Dépassez {fmt(scores[scores.length - 1]?.score ?? 0)} points.
              </p>
            )}
          </div>

          <div className="card panel clip-tag" style={{ padding: "12px 14px" }}>
            <h3>Classement local</h3>
            <ScoreTable scores={scores} newIdx={newIdx} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================ root ================================ */
export default function ParcelPanic() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const [hud, setHud] = useState<Hud>(initialHud);
  const [result, setResult] = useState<RunResult | null>(null);
  const resultRef = useRef<RunResult | null>(null);
  const restartRef = useRef<() => void>(() => {});
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [tag, setTag] = useState("YOU");
  const [newIdx, setNewIdx] = useState(-1);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(false);
  const [touch, setTouch] = useState(false);
  const [best, setBest] = useState(() => (loadScores()[0]?.score ?? 0));
  const tagRef = useRef(tag);
  tagRef.current = tag;

  /* ---- boot ---- */
  useEffect(() => {
    const g = new Game();
    gameRef.current = g;
    (window as unknown as { __game?: Game }).__game = g;
    g.onHud = (h) => setHud(h);
    g.onResult = (r) => {
      resultRef.current = r;
      savedRef.current = false;
      setSaved(false);
      setNewIdx(-1);
      setResult(r);
    };
    g.onRestartRequest = () => restartRef.current();
    if (canvasRef.current) g.mount(canvasRef.current);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => g.resize()) : null;
    if (ro && wrapRef.current) ro.observe(wrapRef.current);
    const coarse = window.matchMedia("(pointer: coarse)");
    setTouch(coarse.matches);
    const onCoarse = () => setTouch(coarse.matches);
    coarse.addEventListener?.("change", onCoarse);
    return () => {
      coarse.removeEventListener?.("change", onCoarse);
      ro?.disconnect();
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  /* ---- score commit ---- */
  const commit = useCallback(() => {
    const r = resultRef.current;
    if (!r || savedRef.current) return;
    if (!qualifies(r.score)) return;
    savedRef.current = true;
    const t = (tagRef.current || "YOU").toUpperCase().slice(0, 3);
    const list = submitScore({ tag: t, score: r.score, pkgs: r.pkgs, meters: r.meters, bolts: r.bolts });
    setScores(list);
    setBest(list[0]?.score ?? r.score);
    setSaved(true);
    const idx = list.findIndex((e) => e.score === r.score && e.tag === t);
    setNewIdx(idx);
  }, []);

  /* auto-log after a while so nobody loses a score */
  useEffect(() => {
    if (!result || saved) return;
    const id = window.setTimeout(commit, 14000);
    return () => window.clearTimeout(id);
  }, [result, saved, commit]);

  const restart = useCallback(() => {
    commit();
    setResult(null);
    resultRef.current = null;
    setNewIdx(-1);
    gameRef.current?.restart();
  }, [commit]);
  restartRef.current = restart;

  const toMenu = useCallback(() => {
    commit();
    setResult(null);
    resultRef.current = null;
    gameRef.current?.toMenu();
  }, [commit]);

  const play = useCallback(() => {
    sfx.unlock();
    gameRef.current?.start();
  }, []);

  const toggleMute = useCallback(() => {
    sfx.unlock();
    sfx.setMuted(!sfx.muted);
    setHud((h) => ({ ...h, muted: sfx.muted }));
  }, []);

  /* keyboard: R to restart from pause */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const k = e.key.toLowerCase();
      if (k === "r" && !g.inputLocked && (g.phase === "paused" || g.phase === "over")) {
        e.preventDefault();
        restart();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [restart]);

  /* ---- touch / pointer steering ---- */
  const ptr = useRef({ active: false, sx: 0, sy: 0, lx: 0, moved: false, t: 0, id: -1 });
  const onDown = (e: React.PointerEvent) => {
    const g = gameRef.current;
    if (!g) return;
    if (e.pointerType === "touch" && !touch) setTouch(true);
    if (g.phase !== "playing") return;
    ptr.current = {
      active: true,
      sx: e.clientX,
      sy: e.clientY,
      lx: e.clientX,
      moved: false,
      t: performance.now(),
      id: e.pointerId,
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const g = gameRef.current;
    const p = ptr.current;
    if (!g || !p.active || p.id !== e.pointerId) return;
    const dx = e.clientX - p.lx;
    if (Math.abs(dx) > 26) {
      g.step(dx > 0 ? 1 : -1);
      p.lx = e.clientX;
      p.moved = true;
    }
    const dy = e.clientY - p.sy;
    if (dy > 52) g.setBrake(true);
    else if (dy > 0 && g.brakeHeld && dy < 40) g.setBrake(false);
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gameRef.current;
    const p = ptr.current;
    if (!g || !p.active) return;
    p.active = false;
    g.setBrake(false);
    const dist = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    const dt = performance.now() - p.t;
    if (!p.moved && dist < 18 && dt < 320) g.boostBurst();
  };

  const phase = hud.phase;

  return (
    <div className="app-root" ref={wrapRef}>
      <canvas ref={canvasRef} className="game-canvas" />
      <img src={logo} alt="" aria-hidden="true" className="cockpit-mark" />

      {phase === "playing" && (
        <div
          className="absolute inset-0"
          style={{ zIndex: 15, touchAction: "none" }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}

      {(phase === "playing" || phase === "paused") && (
        <HudLayer hud={hud} best={best} onPause={() => gameRef.current?.togglePause()} onMute={toggleMute} />
      )}

      {touch && phase === "playing" && <TouchCommandes game={gameRef.current} />}

      {phase === "menu" && (
        <StartScreen
          best={best}
          scores={scores}
          muted={hud.muted}
          onPlay={play}
          onMute={toggleMute}
        />
      )}

      {phase === "paused" && (
        <PauseScreen
          onReprendre={() => gameRef.current?.resume()}
          onRecommencer={restart}
          onQuit={toMenu}
        />
      )}

      {phase === "over" && result && (
        <OverScreen
          result={result}
          scores={scores}
          newIdx={newIdx}
          tag={tag}
          setTag={setTag}
          canSave={saved || qualifies(result.score)}
          onSave={commit}
          saved={saved}
          onRecommencer={restart}
          onQuit={toMenu}
        />
      )}

      <div className="corner-tag">LOGIPHAR · livraison express · {phase === "menu" ? "démo" : "en route"}</div>
    </div>
  );
}
