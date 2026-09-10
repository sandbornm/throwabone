'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Target,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  DEFAULT_SETTINGS,
  INITIAL_STATUS,
  type TennisController,
  type TennisSettings,
} from './types';
import { TennisCamera } from './camera';
import { TennisSettingsPanel } from './settings';
import './tennis.css';

export default function TennisApp() {
  const host = useRef<HTMLDivElement>(null);
  const game = useRef<TennisController | null>(null);
  const [settings, setSettings] = useState<TennisSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [status, setStatus] = useState({ ...INITIAL_STATUS });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [controller, setController] = useState<TennisController | null>(null);
  useEffect(() => {
    let cancelled = false;
    let owned: TennisController | null = null;
    const element = host.current;
    if (element)
      void import('./scene')
        .then((m) =>
          m.createTennisScene(element, (next) => {
            if (!cancelled) setStatus(next);
          }),
        )
        .then((controller) => {
          if (cancelled) {
            controller.dispose();
            return;
          }
          owned = controller;
          game.current = controller;
          setController(controller);
          setReady(true);
        })
        .catch(() => {
          if (!cancelled)
            setError(
              'The 3D court couldn’t start. Enable hardware acceleration and reload.',
            );
        });
    return () => {
      cancelled = true;
      owned?.dispose();
      game.current = null;
    };
  }, []);
  useEffect(() => {
    game.current?.configure(settings);
  }, [settings, ready]);
  const change = <K extends keyof TennisSettings>(
    key: K,
    value: TennisSettings[K],
  ) => setSettings((s) => ({ ...s, [key]: value }));
  const courtAction = (action: () => void) => {
    action();
    host.current?.querySelector('canvas')?.focus({ preventScroll: true });
  };
  return (
    <main className="tn-app">
      <header className="tn-header">
        <Link className="tn-brand" href="/tennis">
          <span className="tn-brand-mark">b.</span>baseline
          <span className="tn-brand-caption">THE HOME COURT</span>
        </Link>
        <div className="tn-header-right">
          <span className="tn-private">
            <i /> PRIVATE PRACTICE
          </span>
          <Link href="/">
            Throwabone <ArrowUpRight size={16} />
          </Link>
        </div>
      </header>
      <div className="tn-workspace">
        <section className="tn-play">
          <div className="tn-court">
            <div
              className="tn-canvas"
              ref={host}
              role="application"
              aria-label="Tennis court. Space feeds a ball. F forehand, B backhand, P pause. When paused, drag to orbit, pinch to zoom, WASD to move, Q and E to move down and up."
            />
            <div className="tn-court-top">
              <div>
                <span className="tn-eyebrow">COURT 01 · HARD COURT</span>
                <h1>Night session</h1>
                <p>Make room for your game.</p>
              </div>
              <div className="tn-score">
                <div>
                  <strong>{String(status.hits).padStart(2, '0')}</strong>
                  <span>CONTACTS</span>
                </div>
                <div>
                  <strong>{String(status.inside).padStart(2, '0')}</strong>
                  <span>IN COURT</span>
                </div>
              </div>
            </div>
            {(!ready || error) && (
              <output className="tn-loading">
                {error || 'Preparing your court…'}
              </output>
            )}
            <div className="tn-court-bottom">
              <span className="tn-venue">
                <i /> BLUE HOUR / 23.77 × 10.97 M
              </span>
              <div className="tn-camera-views">
                {(['player', 'broadcast', 'overhead'] as const).map((view) => (
                  <button
                    key={view}
                    className={settings.view === view ? 'active' : ''}
                    onClick={() => change('view', view)}
                  >
                    {view === 'player'
                      ? 'Courtside'
                      : view === 'broadcast'
                        ? 'Broadcast'
                        : 'Above'}
                  </button>
                ))}
              </div>
            </div>
            {status.paused && (
              <div className="tn-inspect">
                <span className="tn-eyebrow">TIME IS PAUSED</span>
                <strong>Explore the shot</strong>
                <p>
                  Drag to orbit · Right-drag to pan
                  <br />
                  Scroll or pinch to zoom · WASD + Q/E to fly
                </p>
                <div className="tn-inspect-actions">
                  <button
                    onClick={() => courtAction(() => game.current?.focusBall())}
                  >
                    <Target size={16} /> Focus ball
                  </button>
                  <button
                    onClick={() => courtAction(() => game.current?.advance())}
                  >
                    Step 1/60 s
                  </button>
                </div>
                <p className="tn-axis-legend">
                  <span>●</span> Spin axis <span>●</span> Travel direction
                </p>
              </div>
            )}
          </div>
          <div className="tn-control-deck">
            <div className="tn-shot-status">
              <span className="tn-eyebrow">
                {status.paused
                  ? 'INSPECTING'
                  : status.phase === 'incoming'
                    ? 'BALL INCOMING'
                    : 'PRACTICE AT YOUR PACE'}
              </span>
              <strong aria-live="polite">{status.message}</strong>
              <div className="tn-timing">
                <span style={{ width: `${status.contact * 100}%` }} />
              </div>
            </div>
            <div className="tn-play-buttons">
              <button
                className="tn-secondary"
                disabled={!ready || status.paused}
                onClick={() => courtAction(() => game.current?.feed())}
              >
                Feed ball <kbd>SPACE</kbd>
              </button>
              <button
                className="tn-primary"
                disabled={!ready || status.paused}
                onClick={() =>
                  courtAction(() => game.current?.swing('forehand'))
                }
              >
                Forehand <kbd>F</kbd>
              </button>
              <button
                className="tn-secondary"
                disabled={!ready || status.paused}
                onClick={() =>
                  courtAction(() => game.current?.swing('backhand'))
                }
              >
                Backhand <kbd>B</kbd>
              </button>
            </div>
            <div className="tn-utilities">
              <button
                title={status.paused ? 'Resume' : 'Pause and inspect'}
                aria-label={status.paused ? 'Resume' : 'Pause and inspect'}
                onClick={() => courtAction(() => game.current?.pause())}
              >
                {status.paused ? <Play /> : <Pause />}
              </button>
              <button
                title="Focus ball"
                aria-label="Focus ball"
                onClick={() => courtAction(() => game.current?.focusBall())}
              >
                <Maximize2 />
              </button>
              <button
                title="Reset practice"
                aria-label="Reset practice"
                onClick={() => courtAction(() => game.current?.reset())}
              >
                <RotateCcw />
              </button>
              <button
                title="Toggle sound"
                aria-label={settings.sound ? 'Mute sound' : 'Enable sound'}
                onClick={() => change('sound', !settings.sound)}
              >
                {settings.sound ? <Volume2 /> : <VolumeX />}
              </button>
            </div>
          </div>
          <div className="tn-stats">
            <div>
              <span>{status.paused ? 'BALL SPEED NOW' : 'LAST BALL'}</span>
              <strong>
                {(status.paused
                  ? Math.round(status.liveSpeed)
                  : status.speed) || '—'}{' '}
                <small>km/h</small>
              </strong>
            </div>
            <div>
              <span>{status.paused ? 'SPIN NOW' : 'SPIN AT CONTACT'}</span>
              <strong>
                {(status.paused
                  ? status.liveSpin
                  : Math.abs(status.spin)
                ).toFixed(1)}{' '}
                <small>rev/s</small>
              </strong>
            </div>
            <div>
              <span>IN A ROW</span>
              <strong>{status.streak.toString().padStart(2, '0')}</strong>
            </div>
            <div className="tn-stats-note">
              A little lift. A clean contact.
              <br />
              One more ball.
            </div>
          </div>
          {status.shots.length > 0 && (
            <div className="tn-shot-log">
              <div className="tn-log-heading">
                <span className="tn-eyebrow">THIS SESSION</span>
                <span>
                  Last {status.shots.length}{' '}
                  {status.shots.length === 1 ? 'shot' : 'shots'}
                </span>
              </div>
              <div className="tn-log-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Shot</th>
                      <th>Stroke</th>
                      <th>Speed</th>
                      <th>Spin</th>
                      <th>Landing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {status.shots.slice(0, 6).map((shot) => (
                      <tr key={shot.id}>
                        <td>{String(shot.id).padStart(2, '0')}</td>
                        <td>{shot.stroke}</td>
                        <td>{shot.speed} km/h</td>
                        <td>
                          {Math.abs(shot.spin).toFixed(0)} r/s{' '}
                          {shot.spin < 0
                            ? 'slice'
                            : shot.spin > 0
                              ? 'top'
                              : 'flat'}
                        </td>
                        <td className={shot.result === 'In' ? 'tn-in' : ''}>
                          {shot.result}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
        <aside className="tn-sidebar">
          <div className="tn-panel-heading">
            <span className="tn-eyebrow">MAKE IT YOURS</span>
            <h2>Your practice</h2>
          </div>
          <TennisSettingsPanel
            settings={settings}
            onChange={setSettings}
            camera={
              <TennisCamera
                settings={settings}
                status={status}
                controller={controller}
              />
            }
          />
        </aside>
      </div>
      <footer className="tn-footer">
        <span>BASELINE / DIRECT HAND CONTROL</span>
        <span>On-device motion · Empty-hand play · No account needed</span>
      </footer>
    </main>
  );
}
