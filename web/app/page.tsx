'use client';
import { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  Bone,
  ArrowUpRight,
  RotateCcw,
  Volume2,
  VolumeX,
  HelpCircle,
  SlidersHorizontal,
  MoveUpRight,
  Target,
  ArrowRightToLine,
  Scan,
  Eye,
  Lightbulb,
  UserRound,
  ArrowDown,
  Camera,
  Keyboard,
  ChevronDown,
} from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { registerRangeTools } from '@/lib/game/webmcp';
import { ThrowPad } from '@/components/game/throw-pad';
const ThrowJournal = lazy(() => import('@/components/game/throw-journal'));
const CameraThrow = lazy(() => import('@/components/game/camera-throw'));
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DEFAULT_SHOT,
  INITIAL_STATUS,
  SURFACE_INFO,
  THROW_STYLES,
  type RangeControls,
  type ViewId,
  type SurfaceId,
} from '@/lib/game/types';

export default function Home() {
  const host = useRef<HTMLDivElement>(null),
    range = useRef<RangeControls | null>(null),
    statusRef = useRef(INITIAL_STATUS);
  const [status, setStatus] = useState(INITIAL_STATUS),
    [shot, setShot] = useState(DEFAULT_SHOT);
  const manualShot = useRef(shot);
  manualShot.current = shot;
  const [nickname, setNickname] = useState(''),
    [draft, setDraft] = useState(''),
    [nameOpen, setNameOpen] = useState(false);
  useEffect(() => {
    try {
      const n = localStorage.getItem('throwabone.nickname') || '';
      setNickname(n.slice(0, 24));
      setDraft(n.slice(0, 24));
    } catch {}
  }, []);
  const [surface, setSurface] = useState<SurfaceId>('gravel'),
    [view, setView] = useState<ViewId>('player'),
    [follow, setFollow] = useState(false),
    [slow, setSlow] = useState(false),
    [sound, setSound] = useState(false),
    [error, setError] = useState(''),
    [cameraOpen, setCameraOpen] = useState(false);
  useEffect(() => {
    if (!cameraOpen && status.ready) range.current?.setShot(manualShot.current);
  }, [cameraOpen, status.ready]);
  useEffect(() => {
    let disposed = false;
    let unregister = () => {};
    import('@/lib/game/scene')
      .then(async ({ mountRange }) => {
        if (!host.current || disposed) return;
        const api = await mountRange(host.current, (s) => {
          if (!disposed) {
            statusRef.current = s;
            setStatus(s);
            setShot((p) => ({ ...p, aim: s.aim, power: s.power }));
          }
        });
        if (disposed) api.dispose();
        else {
          range.current = api;
          unregister = registerRangeTools(
            api,
            () => statusRef.current,
            setShot,
          );
        }
      })
      .catch((e) => {
        if (!disposed)
          setError(
            e instanceof Error ? e.message : 'The 3D court could not start.',
          );
      });
    return () => {
      disposed = true;
      unregister();
      range.current?.dispose();
      range.current = null;
    };
  }, []);
  const changeShot = (key: keyof typeof shot, value: number) => {
    const next = { ...shot, [key]: value };
    setShot(next);
    range.current?.setShot(next);
  };
  const changeView = (id: ViewId) => {
    setView(id);
    range.current?.setView(id);
  };
  const changeSurface = (id: SurfaceId) => {
    setSurface(id);
    range.current?.setSurface(id);
  };
  const reset = () => range.current?.reset();
  const disabled = !status.ready;
  return (
    <main className="game-app">
      <header className="topbar">
        <div className="brand">
          <Bone size={30} strokeWidth={2} />
          <strong>
            throwabone<span className="brand-period">.</span>
          </strong>
          <span>FIND YOUR THROW</span>
        </div>
        <div className="top-actions">
          <div className="badge">
            <i className="live-dot" />
            PRACTICE RANGE
          </div>
          <Dialog open={nameOpen} onOpenChange={setNameOpen}>
            <DialogTrigger className="text-button nickname-button">
              <UserRound size={16} />
              {nickname || 'Player'}
            </DialogTrigger>
            <DialogContent className="help-modal">
              <DialogTitle className="dialog-title">
                What should we call you?
              </DialogTitle>
              <DialogDescription>
                A nickname is optional. It stays on this device. No account
                needed.
              </DialogDescription>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = draft.trim().slice(0, 24);
                  setNickname(n);
                  try {
                    localStorage.setItem('throwabone.nickname', n);
                  } catch {}
                  setNameOpen(false);
                }}
              >
                <label htmlFor="nickname" className="control-label">
                  Nickname
                </label>
                <Input
                  id="nickname"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={24}
                  placeholder="Player"
                  autoComplete="off"
                />
                <button
                  className="throw-button"
                  type="submit"
                  style={{ marginTop: 18, width: '100%' }}
                >
                  Back to throwing
                  <ArrowUpRight size={17} />
                </button>
              </form>
            </DialogContent>
          </Dialog>
          <button
            className="icon-button"
            aria-label={sound ? 'Mute sound' : 'Enable sound'}
            aria-pressed={sound}
            onClick={() => {
              setSound(!sound);
              range.current?.setSound(!sound);
            }}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <Dialog>
            <DialogTrigger className="text-button">
              <HelpCircle size={17} />
              How to play
            </DialogTrigger>
            <DialogContent className="help-modal">
              <DialogTitle className="dialog-title">
                One bone. A good throw.
              </DialogTitle>
              <DialogDescription>
                Learn the throw in an open practice range.
              </DialogDescription>
              <div className="dialog-copy">
                <h3>
                  <span className="step-number">01</span>Find your line
                </h3>
                <p>
                  Drag sideways on the throw pad or the court. The orange line
                  shows the airborne path; it ends at the first ground contact.
                </p>
                <h3>
                  <span className="step-number">02</span>Pull back and release
                </h3>
                <p>
                  Drag down on the court to set power, then let go. You can also
                  use the small aim and power buttons, then press Throw bone.
                  Start with a low arc so the bone lands short and slides into
                  the row.
                </p>
                <h3>
                  <span className="step-number">03</span>Work the row
                </h3>
                <p>
                  In the traditional game, both black guards come down before
                  the white soldiers. Soldiers knocked down too soon glow amber
                  and reset after the throw settles: inside the nearest standing
                  guard first, outside on the second early knockdown, then
                  upright where they landed on later repeats. This range does
                  not include alternating teams or the hammer.
                </p>
                <h3>Make the ground your own</h3>
                <p>
                  Each surface changes grip, bounce, and small ground
                  irregularities. Changing surfaces resets the range. Slow
                  motion lets you see the contact that turns a throw.
                </p>
                <h3>Keyboard</h3>
                <p>
                  <kbd>←</kbd> <kbd>→</kbd> aim · <kbd>↑</kbd> <kbd>↓</kbd>{' '}
                  power · <kbd>Space</kbd> throw · <kbd>R</kbd> reset. Focus the
                  court to use these shortcuts.
                </p>
                <h3>About this range</h3>
                <p>
                  Original Blender bone geometry, a 10 m court, 20 soldiers and
                  two guards. Layout and playing guidance follow the supplied
                  Bunnock instruction sheet. Bone mass and ground response are
                  starting estimates for tuning against real throws.
                </p>
              </div>
            </DialogContent>
          </Dialog>
          <button
            className="icon-button"
            aria-label="Reset practice range"
            title="Reset range"
            disabled={status.phase === 'loading'}
            onClick={reset}
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <section className="play-column" aria-label="Throwabone practice range">
          <div className={'arena' + (cameraOpen ? ' camera-active' : '')}>
            <div
              className="canvas-host"
              ref={host}
              tabIndex={0}
              role="application"
              aria-label="3D throwing court. Drag sideways to aim, pull down for power and release to throw. Arrow keys aim and adjust power; Space throws; R resets."
            />
            <div className="arena-heading">
              <div className="eyebrow">A LITTLE SKILL. A LITTLE LUCK.</div>
              <h1>Find your throw.</h1>
              <p>Two guards first. Then the whole row.</p>
            </div>
            <div className="scoreboard">
              <div>
                <div className="score-number">
                  {String(status.down).padStart(2, '0')}
                  <small> / 22</small>
                </div>
                <div className="score-label">BONES DOWN</div>
              </div>
              <div>
                <div className="score-number">
                  {status.guards}
                  <small> / 2</small>
                </div>
                <div className="score-label">GUARDS</div>
              </div>
              <div className="throw-score">
                <div className="score-number">
                  {String(status.throws).padStart(2, '0')}
                </div>
                <div className="score-label">THROWS</div>
              </div>
            </div>
            {slow && <div className="slow-badge">¼ SPEED</div>}
            {status.pendingResets > 0 && (
              <div className="penalty-banner" role="status">
                <RotateCcw size={15} />
                {status.phase === 'resetting'
                  ? `${status.pendingResets} early soldiers reset`
                  : `${status.pendingResets} early soldiers will reset`}
                <span>Both guards first</span>
              </div>
            )}
            <div className="target-monitor">
              <div className="monitor-label">
                <span>THE TARGET LINE</span>
                <span>10 M</span>
              </div>
              <div className="monitor-legend">
                ● Black guards &nbsp; ○ White soldiers
              </div>
            </div>
            <fieldset className="camera-controls" aria-label="Camera view">
              {(
                [
                  { id: 'player', label: 'First person', icon: Eye },
                  { id: 'target', label: 'Target', icon: Target },
                  { id: 'side', label: 'Side', icon: ArrowRightToLine },
                  { id: 'overhead', label: 'Above', icon: Scan },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  className={'camera-view' + (view === v.id ? ' active' : '')}
                  aria-pressed={view === v.id}
                  onClick={() => changeView(v.id)}
                >
                  <v.icon size={14} />
                  {v.label}
                </button>
              ))}
              <label
                className={'camera-follow' + (follow ? ' active' : '')}
                htmlFor="follow-throw"
                title="Follow the bone after release, then return to your selected view"
              >
                <span>Follow</span>
                <Switch
                  id="follow-throw"
                  size="sm"
                  aria-label="Follow the throw"
                  checked={follow}
                  disabled={status.phase === 'loading'}
                  onCheckedChange={(v) => {
                    setFollow(v);
                    range.current?.setFollow(v);
                  }}
                />
              </label>
            </fieldset>
            <div className="gesture-hint" aria-live="polite">
              {status.message}
            </div>
            {(error || status.phase === 'loading') && (
              <div className="arena-note">
                <Bone
                  size={29}
                  style={{ margin: '0 auto 10px', color: '#ff986f' }}
                />
                <strong>
                  {error ? 'The court couldn’t open' : 'Setting up the bones'}
                </strong>
                <p>{error || 'Loading your bone model and physics.'}</p>
                {error && (
                  <button
                    className="text-button"
                    onClick={() => window.location.reload()}
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="input-mode-bar">
            <span>PLAY WITH</span>
            <RadioGroup
              className="input-modes"
              aria-label="Control mode"
              value={cameraOpen ? 'camera' : 'keyboard'}
              onValueChange={(v) => {
                if (v !== 'camera') range.current?.setShot(shot);
                setCameraOpen(v === 'camera');
              }}
            >
              <label>
                <RadioGroupItem value="keyboard" />
                <Keyboard size={15} />
                <span>Keyboard / touch</span>
              </label>
              <label>
                <RadioGroupItem value="camera" />
                <Camera size={15} />
                <span>Camera</span>
                <small>EXPERIMENTAL</small>
              </label>
            </RadioGroup>
          </div>
          <ThrowPad
            shot={shot}
            disabled={disabled}
            onChange={(s) => {
              setShot(s);
              range.current?.setShot(s);
            }}
            onThrow={() => range.current?.throwBone()}
          />
        </section>
        <aside className="sidebar" aria-label="Ground and throw settings">
          <div className="sidebar-top">
            <div className="sidebar-heading">
              <h2>Your conditions</h2>
              <SlidersHorizontal />
            </div>
            <p>A different surface. A different throw.</p>
          </div>
          <div className="section-label">GROUND SURFACE</div>
          <RadioGroup
            className="surface-options"
            aria-label="Ground surface"
            value={surface}
            onValueChange={(v) => changeSurface(v as SurfaceId)}
            disabled={status.phase === 'loading'}
          >
            {SURFACE_INFO.map((s) => (
              <label className="surface-option" key={s.id}>
                <span className={'surface-swatch ' + s.id} />
                <span>
                  <strong>{s.name}</strong>
                  <small>{s.note}</small>
                </span>
                <RadioGroupItem value={s.id} aria-label={s.name} />
              </label>
            ))}
          </RadioGroup>
          <div className="settings-divider" />
          <div className="style-picker">
            <div className="section-label">THROW STYLE</div>
            <RadioGroup
              className="throw-styles"
              aria-label="Throw style"
              disabled={disabled}
              value={
                THROW_STYLES.find(
                  (s) => s.loft === shot.loft && s.spin === shot.spin,
                )?.id ?? 'custom'
              }
              onValueChange={(id) => {
                const style = THROW_STYLES.find((s) => s.id === id);
                if (style) {
                  const next = { ...shot, loft: style.loft, spin: style.spin };
                  setShot(next);
                  range.current?.setShot(next);
                }
              }}
            >
              {THROW_STYLES.map((style) => (
                <label key={style.id} title={style.description}>
                  <RadioGroupItem value={style.id} />
                  <span>{style.name}</span>
                </label>
              ))}
            </RadioGroup>
            <p className="style-note">
              {THROW_STYLES.find(
                (s) => s.loft === shot.loft && s.spin === shot.spin,
              )?.description ?? 'Custom arc and spin'}
            </p>
          </div>
          <Collapsible className="advanced-throw">
            <CollapsibleTrigger className="advanced-trigger">
              Fine-tune arc & spin
              <ChevronDown size={14} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mini-control">
                <label className="control-label" htmlFor="loft">
                  <span>RELEASE ANGLE</span>
                  <strong>{shot.loft}°</strong>
                </label>
                <Slider
                  id="loft"
                  aria-label="Release angle in degrees"
                  value={[shot.loft]}
                  min={8}
                  max={45}
                  step={1}
                  disabled={disabled}
                  onValueChange={(v) =>
                    changeShot('loft', Array.isArray(v) ? v[0] : v)
                  }
                />
                <div className="control-foot">
                  <span>LOW SKIM</span>
                  <span>HIGH ARC</span>
                </div>
              </div>
              <div className="mini-control">
                <label className="control-label" htmlFor="spin">
                  <span>END-OVER-END SPIN</span>
                  <strong>{shot.spin.toFixed(1)} rps</strong>
                </label>
                <Slider
                  id="spin"
                  aria-label="End-over-end spin in revolutions per second"
                  value={[shot.spin]}
                  min={0}
                  max={5}
                  step={0.1}
                  disabled={disabled}
                  onValueChange={(v) =>
                    changeShot('spin', Array.isArray(v) ? v[0] : v)
                  }
                />
                <div className="control-foot">
                  <span>GENTLE</span>
                  <span>FAST</span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          <label className="toggle-row" htmlFor="slow">
            <span>Slow motion</span>
            <Switch
              id="slow"
              checked={slow}
              onCheckedChange={(v) => {
                setSlow(v);
                range.current?.setSlow(v);
              }}
            />
          </label>
          <div className="range-tip">
            {status.history.length > 0 ? (
              <>
                <div>
                  <Target size={15} /> LAST THROW
                </div>
                <div className="last-result">
                  <strong>{status.history.at(-1)!.down}</strong>
                  <span>bones down</span>
                </div>
                <p>
                  {status.history.at(-1)!.spin.toFixed(1)} rps ·{' '}
                  {status.history.at(-1)!.loft}° release
                </p>
                <a className="journal-link" href="#throw-journal">
                  See your throw journal
                  <ArrowDown size={14} />
                </a>
              </>
            ) : (
              <>
                <div>
                  <Lightbulb size={15} /> A GOOD PLACE TO START
                </div>
                <p>
                  Land just before a guard. Let the spin and the slide do the
                  rest.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
      {status.history.length > 0 && (
        <Suspense
          fallback={
            <p className="journal-loading">Opening your throw journal…</p>
          }
        >
          <ThrowJournal
            history={status.history}
            nickname={nickname}
            onTrace={(r) => {
              range.current?.showTrace(r);
              setView('overhead');
              host.current?.scrollIntoView({
                behavior: matchMedia('(prefers-reduced-motion:reduce)').matches
                  ? 'instant'
                  : 'smooth',
                block: 'center',
              });
            }}
          />
        </Suspense>
      )}
      {cameraOpen && (
        <Suspense
          fallback={
            <div className="camera-panel">Preparing camera control…</div>
          }
        >
          <CameraThrow
            feedbackHost={host.current}
            ready={status.ready}
            shot={shot}
            onPreview={(s) => {
              if (statusRef.current.ready) range.current?.setShot(s);
            }}
            onThrow={(s) => {
              if (!statusRef.current.ready) return;
              setShot((p) => ({ ...p, aim: s.aim, power: s.power }));
              range.current?.setShot(s);
              range.current?.throwBone();
            }}
            onClose={() => {
              range.current?.setShot(shot);
              setCameraOpen(false);
            }}
          />
        </Suspense>
      )}
      <footer className="statusbar">
        <span>
          <MoveUpRight size={13} /> UNDERHAND THROWS · UNLIMITED PRACTICE
        </span>
        <span>10 M × 3.66 M COURT</span>
        <span>THROWABONE / PRACTICE, EXPLORE, REPEAT</span>
      </footer>
      <div className="attribution">
        Inspired by the traditional game of Bunnock. Not affiliated with or
        endorsed by Bunnock.com.
      </div>
    </main>
  );
}
