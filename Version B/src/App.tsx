import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createWorld, renderWorld, steer, updateWorld } from './game/engine';
import type { Phase, World } from './game/engine';

type ScoreEntry = {
  score: number;
  collected: number;
  distance: number;
  date: string;
};

type HUD = {
  score: number;
  cargo: number;
  impacts: number;
  distance: number;
};

type Notice = { id: number; text: string; warning: boolean };

const STORAGE_KEY = 'logiphar-course-scores-v1';
const numberFormat = new Intl.NumberFormat('fr-FR');

function getHUD(world: World): HUD {
  return {
    score: Math.floor(world.score),
    cargo: world.cargo,
    impacts: world.impacts,
    distance: Math.floor(world.distance),
  };
}

function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const legacy = !raw ? localStorage.getItem('packageRushHighScores') : null;
    const parsed: unknown = JSON.parse(raw || legacy || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && Number.isFinite(entry.score))
      .map((entry) => ({
        score: Number(entry.score),
        collected: Number(entry.collected ?? entry.packages ?? 0),
        distance: Number(entry.distance ?? 0),
        date: String(entry.date ?? ''),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function ArrowIcon({ left = false }: { left?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {left ? <path d="M19 12H5m7 7-7-7 7-7" /> : <path d="M5 12h14m-7-7 7 7-7 7" />}
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z" />
      <path d="m3 7 9 4 9-4M12 11v10M8 5l9 4v4" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="4" width="5" height="16" rx="1.2" />
      <rect x="14" y="4" width="5" height="16" rx="1.2" />
    </svg>
  );
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" />
      {muted ? <path d="m17 9 5 6m0-6-5 6" /> : <><path d="M17 9a4 4 0 0 1 0 6" /><path d="M20 6a8 8 0 0 1 0 12" /></>}
    </svg>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<World>(createWorld());
  const frameTimeRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);
  const soundOnRef = useRef(true);
  const pointerRef = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<Phase>('start');
  const [hud, setHud] = useState<HUD>(() => getHUD(worldRef.current));
  const [scores, setScores] = useState<ScoreEntry[]>(loadScores);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<ScoreEntry | null>(null);

  const unlockAudio = useCallback(() => {
    if (!soundOnRef.current) return;
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      if (audioRef.current.state === 'suspended') void audioRef.current.resume();
    } catch {
      // The game remains playable if Web Audio is unavailable.
    }
  }, []);

  const playSound = useCallback((kind: 'start' | 'move' | 'pickup' | 'impact' | 'crash') => {
    const audio = audioRef.current;
    if (!audio || !soundOnRef.current) return;
    const now = audio.currentTime;
    const note = (from: number, to: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine') => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const at = now + delay;
      osc.type = type;
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + duration);
      gain.gain.setValueAtTime(0.001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      osc.connect(gain);
      gain.connect(audio.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    };

    if (kind === 'start') {
      note(250, 340, 0.12, 0.045);
      note(390, 620, 0.18, 0.045, 0.1);
    } else if (kind === 'move') {
      note(190, 270, 0.075, 0.024, 0, 'triangle');
    } else if (kind === 'pickup') {
      note(490, 760, 0.12, 0.065, 0, 'triangle');
      note(790, 1120, 0.19, 0.052, 0.085, 'sine');
    } else if (kind === 'impact') {
      note(190, 55, 0.34, 0.12, 0, 'sawtooth');
      note(120, 46, 0.42, 0.07, 0.04, 'triangle');
    } else {
      note(260, 43, 0.58, 0.14, 0, 'sawtooth');
      note(95, 32, 0.7, 0.09, 0.055, 'triangle');
    }
  }, []);

  const showNotice = useCallback((text: string, warning: boolean) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice({ id: performance.now(), text, warning });
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 1100);
  }, []);

  const finishRun = useCallback(() => {
    const world = worldRef.current;
    const entry: ScoreEntry = {
      score: Math.floor(world.score),
      collected: world.collected,
      distance: Math.floor(world.distance),
      date: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }),
    };
    setResult(entry);
    setScores((previous) => {
      const updated = [...previous, entry].sort((a, b) => b.score - a.score).slice(0, 5);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Private browsing may prevent storage; the current session still works.
      }
      return updated;
    });
    setPhase('gameover');
  }, []);

  const startRun = useCallback(() => {
    const world = createWorld('playing');
    worldRef.current = world;
    frameTimeRef.current = performance.now();
    setHud(getHUD(world));
    setResult(null);
    setNotice(null);
    setScoresOpen(false);
    setPhase('playing');
    unlockAudio();
    playSound('start');
  }, [playSound, unlockAudio]);

  const pauseRun = useCallback(() => {
    const world = worldRef.current;
    if (world.phase !== 'playing' || world.crashTimer > 0) return;
    world.phase = 'paused';
    setPhase('paused');
  }, []);

  const resumeRun = useCallback(() => {
    const world = worldRef.current;
    if (world.phase !== 'paused') return;
    world.phase = 'playing';
    frameTimeRef.current = performance.now();
    setPhase('playing');
    unlockAudio();
  }, [unlockAudio]);

  const menu = useCallback(() => {
    const world = createWorld();
    worldRef.current = world;
    setHud(getHUD(world));
    setScoresOpen(false);
    setNotice(null);
    setPhase('start');
  }, []);

  const move = useCallback((direction: -1 | 1) => {
    const world = worldRef.current;
    const previous = world.targetLane;
    steer(world, direction);
    if (world.targetLane !== previous) playSound('move');
  }, [playSound]);

  const toggleSound = useCallback(() => {
    const next = !soundOnRef.current;
    soundOnRef.current = next;
    setSoundOn(next);
    if (next) unlockAudio();
  }, [unlockAudio]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    let animationFrame = 0;
    let width = 1;
    let height = 1;
    let lastHUD = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, width < 700 ? 1.75 : 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const frame = (now: number) => {
      const dt = frameTimeRef.current ? Math.min(0.045, (now - frameTimeRef.current) / 1000) : 0;
      frameTimeRef.current = now;
      const world = worldRef.current;
      const events = updateWorld(world, dt, width, height);

      for (const event of events) {
        if (event.type === 'pickup') {
          playSound('pickup');
          showNotice('COLIS +1', false);
        } else if (event.type === 'impact') {
          playSound('impact');
          showNotice(event.lost > 0 ? 'CHOC ! COLIS PERDUS' : 'CHOC ! ATTENTION', true);
        } else if (event.type === 'crash') {
          playSound('crash');
          showNotice('DEUXIÈME CHOC !', true);
        } else if (event.type === 'finished') {
          finishRun();
        }
      }

      renderWorld(ctx, world, width, height);
      if (world.phase === 'playing' && now - lastHUD > 80) {
        setHud(getHUD(world));
        lastHUD = now;
      }
      animationFrame = requestAnimationFrame(frame);
    };

    resize();
    animationFrame = requestAnimationFrame(frame);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
    };
  }, [finishRun, playSound, showNotice]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const code = event.code;
      if (['ArrowLeft', 'ArrowRight', 'Space', 'ArrowUp', 'ArrowDown'].includes(code)) event.preventDefault();
      if (event.repeat) return;

      const current = worldRef.current.phase;
      if (scoresOpen && code === 'Escape') {
        setScoresOpen(false);
      } else if (current === 'playing') {
        if (code === 'ArrowLeft' || code === 'KeyA' || code === 'KeyQ') move(-1);
        if (code === 'ArrowRight' || code === 'KeyD') move(1);
        if (code === 'Escape' || code === 'KeyP' || code === 'Space') pauseRun();
      } else if (current === 'paused') {
        if (code === 'Escape' || code === 'KeyP' || code === 'Space' || code === 'Enter') resumeRun();
      } else if (code === 'Space' || code === 'Enter' || (current === 'gameover' && code === 'KeyR')) {
        if (!scoresOpen) startRun();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [move, pauseRun, resumeRun, scoresOpen, startRun]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pauseRun();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [pauseRun]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    void audioRef.current?.close();
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (worldRef.current.phase !== 'playing') return;
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (Math.abs(dx) > 27 && Math.abs(dx) > Math.abs(dy) * 0.65) {
      move(dx > 0 ? 1 : -1);
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.moved = true;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (!pointer.moved) {
      const dx = event.clientX - pointer.x;
      if (Math.abs(dx) > 27) move(dx > 0 ? 1 : -1);
      else move(event.clientX < window.innerWidth / 2 ? -1 : 1);
    }
    pointerRef.current = null;
  };

  const newRecord = !!result && result.score > 0 && scores[0]?.score === result.score
    && scores.filter((entry) => entry.score === result.score).length === 1;

  return (
    <main className="game-shell">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        aria-label="Vue depuis la cabine du camion Logiphar. Esquivez les obstacles et ramassez les colis."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointerRef.current = null; }}
      />

      {(phase === 'playing' || phase === 'paused') && (
        <>
          <div className="hud" aria-live="off">
            <div className="hud-brand">
              <img src="./images/logiphar-logo.png" alt="Logiphar" draggable="false" />
              <span>LA COURSE AUX COLIS</span>
            </div>
            <div className="hud-score">
              <span className="hud-label">SCORE</span>
              <strong>{numberFormat.format(hud.score)}</strong>
              <small>{numberFormat.format(hud.distance)} M PARCOURUS</small>
            </div>
            <div className="hud-actions">
              <button type="button" className="icon-button" onClick={toggleSound} aria-label={soundOn ? 'Couper le son' : 'Activer le son'} title={soundOn ? 'Couper le son' : 'Activer le son'}>
                <SoundIcon muted={!soundOn} />
              </button>
              <button type="button" className="icon-button pause-button" onClick={phase === 'paused' ? resumeRun : pauseRun} aria-label={phase === 'paused' ? 'Reprendre' : 'Mettre en pause'} title={phase === 'paused' ? 'Reprendre' : 'Mettre en pause'}>
                {phase === 'paused' ? <ArrowIcon /> : <PauseIcon />}
              </button>
            </div>
          </div>

          <div className="run-status">
            <div className="status-cargo" key={`cargo-${hud.cargo}`}>
              <PackageIcon />
              <span><strong>{hud.cargo}</strong><small>COLIS À BORD</small></span>
            </div>
            <div className={`status-hits ${hud.impacts > 0 ? 'is-warning' : ''}`}>
              <span className="hit-bars" aria-hidden="true"><i className={hud.impacts >= 1 ? 'used' : ''} /><i className={hud.impacts >= 2 ? 'used' : ''} /></span>
              <span><strong>{hud.impacts} / 2</strong><small>CHOCS</small></span>
            </div>
          </div>

          {notice && phase === 'playing' && (
            <div key={notice.id} className={`game-notice ${notice.warning ? 'danger' : ''}`} role="status">{notice.text}</div>
          )}

          {phase === 'playing' && (
            <div className="mobile-steering" aria-label="Commandes tactiles">
              <button type="button" onPointerDown={(event) => { event.preventDefault(); move(-1); }} aria-label="Changer de voie à gauche"><ArrowIcon left /></button>
              <button type="button" onPointerDown={(event) => { event.preventDefault(); move(1); }} aria-label="Changer de voie à droite"><ArrowIcon /></button>
            </div>
          )}
        </>
      )}

      {phase === 'start' && (
        <section className="screen start-screen" aria-labelledby="game-title">
          <div className="intro-content">
            <img className="hero-logo" src="./images/logiphar-logo.png" alt="LOGIPHAR, Transport & Distribution" draggable="false" />
            <p className="intro-eyebrow"><span className="eyebrow-rule" /> LE JEU DE LIVRAISON</p>
            <h1 id="game-title"><span className="sr-only">LOGIPHAR : </span>LA COURSE<br /><em>AUX COLIS.</em></h1>
            <p className="intro-description">Ramassez les colis. Évitez les obstacles.<br />Au premier choc, le chargement s'envole. Au second, la tournée s'arrête.</p>
            <div className="intro-buttons">
              <button type="button" className="primary-button" onClick={startRun}>PRENDRE LE VOLANT <span><ArrowIcon /></span></button>
              <button type="button" className="text-button" onClick={() => setScoresOpen(true)}>VOIR LES MEILLEURS SCORES <span aria-hidden="true">↗</span></button>
            </div>
          </div>
          <div className="intro-footer">
            <span><b>CLAVIER</b> ← → OU A / D / Q</span>
            <span className="footer-divider" />
            <span><b>TACTILE</b> GLISSEZ OU TOUCHEZ LES CÔTÉS</span>
          </div>
        </section>
      )}

      {phase === 'paused' && (
        <section className="screen modal-screen" aria-label="Jeu en pause">
          <div className="modal-content">
            <p className="modal-eyebrow">LA TOURNÉE ATTEND</p>
            <h2>EN <em>PAUSE.</em></h2>
            <p>Un petit arrêt avant de reprendre la route ?</p>
            <button type="button" className="primary-button" onClick={resumeRun}>REPRENDRE <span><ArrowIcon /></span></button>
            <button type="button" className="text-button" onClick={startRun}>RECOMMENCER</button>
            <button type="button" className="subtle-button" onClick={menu}>RETOUR AU MENU</button>
            <span className="shortcut-hint">ESPACE OU ÉCHAP POUR REPRENDRE</span>
          </div>
        </section>
      )}

      {phase === 'gameover' && result && (
        <section className="screen modal-screen result-screen" aria-label="Fin de la tournée">
          <div className="modal-content result-content">
            <img className="result-logo" src="./images/logiphar-logo.png" alt="Logiphar" draggable="false" />
            <p className="modal-eyebrow">DEUX CHOCS. FIN DU TRAJET.</p>
            <h2>FIN DE <em>TOURNÉE.</em></h2>
            <div className="result-score">
              <span>VOTRE SCORE</span>
              <strong>{numberFormat.format(result.score)}</strong>
              {newRecord && <small>NOUVEAU RECORD !</small>}
            </div>
            <div className="result-details">
              <span><b>{result.collected}</b> COLIS RAMASSÉS</span>
              <span><b>{numberFormat.format(result.distance)} M</b> PARCOURUS</span>
            </div>
            <button type="button" className="primary-button" onClick={startRun}>REPRENDRE LA ROUTE <span><ArrowIcon /></span></button>
            <button type="button" className="text-button" onClick={() => setScoresOpen(true)}>VOIR LE CLASSEMENT <span aria-hidden="true">↗</span></button>
            <button type="button" className="subtle-button" onClick={menu}>RETOUR AU MENU</button>
          </div>
        </section>
      )}

      {scoresOpen && (phase === 'start' || phase === 'gameover') && (
        <section className="scores-backdrop" role="dialog" aria-modal="true" aria-labelledby="scores-title">
          <div className="scores-panel">
            <button type="button" className="close-scores" onClick={() => setScoresOpen(false)} aria-label="Fermer le classement">×</button>
            <p className="modal-eyebrow">LES MEILLEURES TOURNÉES</p>
            <h2 id="scores-title">LE <em>CLASSEMENT.</em></h2>
            {scores.length > 0 ? (
              <div className="scores-list">
                {scores.map((entry, index) => (
                  <div className="score-row" key={`${entry.score}-${entry.date}-${index}`}>
                    <span className="rank">{String(index + 1).padStart(2, '0')}</span>
                    <strong>{numberFormat.format(entry.score)}</strong>
                    <span className="row-meta">{entry.collected} COLIS <i /> {entry.date}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-scores">Aucun trajet enregistré.<br />À vous d'ouvrir la voie !</p>
            )}
            <p className="scores-footnote">Scores enregistrés sur cet appareil.</p>
            <button type="button" className="primary-button" onClick={() => setScoresOpen(false)}>FERMER <span><ArrowIcon /></span></button>
          </div>
        </section>
      )}
    </main>
  );
}