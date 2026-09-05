'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, VideoOff } from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  beginCameraRequest,
  cameraIssue,
  type CameraIssue,
  type CameraRequest,
} from '@/lib/game/camera-access';
import {
  HandMotionTracker,
  applyHandSpin,
  visibleHandLandmarks,
  type HandObservation,
} from '@/lib/game/hand-motion';
import {
  CameraThrowTracker,
  assessCameraSetup,
  type Landmark,
} from '@/lib/game/motion';
import type { ShotSettings } from '@/lib/game/types';
export default function CameraThrow({
  feedbackHost,
  ready,
  shot,
  onPreview,
  onThrow,
  onClose,
}: {
  feedbackHost: HTMLElement | null;
  ready: boolean;
  shot: ShotSettings;
  onPreview: (shot: ShotSettings) => void;
  onThrow: (shot: ShotSettings) => void;
  onClose: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    overlay = useRef<HTMLCanvasElement>(null),
    tracker = useRef(new CameraThrowTracker()),
    handTracker = useRef(new HandMotionTracker()),
    activeRequest = useRef<CameraRequest | null>(null),
    requestBusy = useRef(false),
    requestHands = useRef<(enabled: boolean) => void>(() => {}),
    settings = useRef({
      ready,
      shot,
      onThrow,
      onPreview,
      hand: 'right' as 'left' | 'right',
      handTracking: true,
      wristSpin: true,
    });
  const [message, setMessage] = useState(
      'Enable the camera to start tracking your throw.',
    ),
    [permissionOpen, setPermissionOpen] = useState(true),
    [request, setRequest] = useState<CameraRequest | null>(null),
    [access, setAccess] = useState<
      'idle' | 'requesting' | 'loading' | 'ready' | 'paused' | 'error'
    >('idle'),
    [issue, setIssue] = useState<CameraIssue | null>(null),
    [origin, setOrigin] = useState(''),
    [running, setRunning] = useState(false),
    [armed, setArmed] = useState(false),
    [armProgress, setArmProgress] = useState(0),
    [handTracking, setHandTracking] = useState(true),
    [wristSpin, setWristSpin] = useState(true),
    [liveShot, setLiveShot] = useState<ShotSettings | null>(null),
    [visibleHands, setVisibleHands] = useState(0),
    [handModel, setHandModel] = useState('off'),
    [handObservation, setHandObservation] = useState<HandObservation | null>(
      null,
    ),
    [hand, setHand] = useState<'left' | 'right'>('right'),
    [error, setError] = useState(''),
    [setup, setSetup] = useState(assessCameraSetup([], 'right'));
  settings.current = {
    ready,
    shot,
    onThrow,
    onPreview,
    hand,
    handTracking,
    wristSpin,
  };
  const startCamera = () => {
    if (requestBusy.current) return;
    requestBusy.current = true;
    activeRequest.current?.cancel();
    const next = beginCameraRequest({
      secure: window.isSecureContext,
      getUserMedia: navigator.mediaDevices?.getUserMedia?.bind(
        navigator.mediaDevices,
      ),
    });
    activeRequest.current = next;
    setRequest(next);
    setError('');
    setIssue(null);
    setAccess('requesting');
    setPermissionOpen(true);
    setMessage('Choose Allow in your browser’s camera prompt.');
  };
  useEffect(() => {
    setOrigin(window.location.origin);
    return () => activeRequest.current?.cancel();
  }, []);
  useEffect(() => {
    requestHands.current(handTracking);
    handTracker.current.reset();
    setHandObservation(null);
    setVisibleHands(0);
  }, [handTracking]);
  useEffect(() => {
    if (!request) return;
    let closed = false,
      stopped = false,
      worker: Worker | null = null,
      frame = 0,
      busy = false,
      workerReady = false,
      lastSent = 0,
      lastVideo = -1;
    const stop = () => {
      stopped = true;
      workerReady = false;
      request.cancel();
      if (activeRequest.current === request) requestBusy.current = false;
      if (video.current) video.current.srcObject = null;
      const canvas = overlay.current;
      if (canvas)
        canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
      worker?.terminate();
      worker = null;
      cancelAnimationFrame(frame);
      tracker.current.cancel();
      handTracker.current.reset();
      requestHands.current = () => {};
      setRunning(false);
      setArmed(false);
      setArmProgress(0);
      setHandObservation(null);
      setVisibleHands(0);
      setLiveShot(null);
      setHandModel('off');
      setSetup(assessCameraSetup([], settings.current.hand));
    };
    const showIssue = (problem: CameraIssue) => {
      if (closed || stopped) return;
      stop();
      setError(problem.message);
      setIssue(problem);
      setAccess('error');
      setPermissionOpen(true);
    };
    const fail = (e: unknown) => showIssue(cameraIssue(e));
    const draw = (points: Landmark[], hands: Landmark[][]) => {
      const c = overlay.current,
        ctx = c?.getContext('2d');
      if (!ctx || !c) return;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.strokeStyle = '#ffc791';
      ctx.fillStyle = '#ffb98a';
      ctx.lineWidth = 4;
      const indices =
        settings.current.hand === 'right' ? [12, 14, 16, 24] : [11, 13, 15, 23];
      const map = (i: number) => ({
        x: (1 - points[i].x) * c.width,
        y: points[i].y * c.height,
      });
      for (const [a, b] of [
        [indices[0], indices[1]],
        [indices[1], indices[2]],
        [indices[0], indices[3]],
      ])
        if (
          points[a] &&
          points[b] &&
          (points[a].visibility ?? 0) > 0.65 &&
          (points[b].visibility ?? 0) > 0.65
        ) {
          const p = map(a),
            q = map(b);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      for (const i of indices)
        if (points[i] && (points[i].visibility ?? 0) > 0.65) {
          const p = map(i);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      for (const handPoints of hands) {
        ctx.strokeStyle = '#67f1ef';
        ctx.fillStyle = '#e1ffff';
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#061f27';
        ctx.shadowBlur = 3;
        for (const chain of [
          [0, 1, 2, 3, 4],
          [0, 5, 6, 7, 8],
          [5, 9, 10, 11, 12],
          [9, 13, 14, 15, 16],
          [13, 17, 18, 19, 20],
          [0, 17],
        ]) {
          ctx.beginPath();
          chain.forEach((index, i) => {
            const p = handPoints[index],
              x = (1 - p.x) * c.width,
              y = p.y * c.height;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });
          ctx.stroke();
        }
        for (const p of handPoints) {
          ctx.beginPath();
          ctx.arc((1 - p.x) * c.width, p.y * c.height, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.shadowBlur = 0;
    };
    const tick = async (now: number) => {
      if (closed || stopped) return;
      frame = requestAnimationFrame(tick);
      const v = video.current;
      if (
        !v ||
        !workerReady ||
        busy ||
        now - lastSent < (tracker.current.armed ? 45 : 90) ||
        v.readyState < 2 ||
        lastVideo === v.currentTime ||
        document.hidden
      )
        return;
      lastSent = now;
      lastVideo = v.currentTime;
      busy = true;
      try {
        const bitmap = await createImageBitmap(v);
        if (closed || stopped || !worker) {
          bitmap.close();
          busy = false;
          return;
        }
        worker.postMessage({ type: 'frame', frame: bitmap, time: now }, [
          bitmap,
        ]);
      } catch (e) {
        busy = false;
        fail(e);
      }
    };
    const start = async () => {
      try {
        if (document.hidden) {
          stop();
          setAccess('paused');
          setMessage(
            'Camera paused. Return to this tab and choose Restart camera.',
          );
          return;
        }
        const result = await request.result;
        if (closed || stopped || !result) return;
        if ('issue' in result) {
          showIssue(result.issue);
          return;
        }
        const stream = result.stream;
        if (!video.current) {
          stop();
          return;
        }
        stream
          .getVideoTracks()
          .forEach((track) =>
            track.addEventListener('ended', () =>
              fail(
                new DOMException(
                  'The camera disconnected.',
                  'NotReadableError',
                ),
              ),
            ),
          );
        video.current.srcObject = stream;
        await video.current.play();
        if (closed || stopped) return;
        setAccess('loading');
        setMessage('Loading on-device arm tracking…');
        worker = new Worker('/pose-worker.js?v=hand-overlay-2');
        requestHands.current = (enabled) => {
          if (!closed && !stopped && workerReady)
            worker?.postMessage({ type: 'hands', enabled });
        };
        worker.onmessage = ({ data }) => {
          if (closed || stopped) return;
          if (data.type === 'ready') {
            workerReady = true;
            setRunning(true);
            setAccess('ready');
            setPermissionOpen(false);
            setMessage('Stand back so your upper body and hips are visible.');
            requestHands.current(settings.current.handTracking);
          } else if (data.type === 'hands') {
            setHandModel(data.status);
          } else if (data.type === 'error')
            fail(
              new Error(
                'Arm tracking is unavailable in this browser. The throw pad still works.',
              ),
            );
          else if (data.type === 'pose') {
            busy = false;
            const handPoints = settings.current.handTracking
              ? visibleHandLandmarks(data.hands || [])
              : [];
            const observation = settings.current.handTracking
              ? handTracker.current.update(
                  data.points,
                  data.hands || [],
                  settings.current.hand,
                  data.time,
                  data.width,
                  data.height,
                )
              : null;
            setHandObservation(observation);
            setVisibleHands(handPoints.length);
            draw(data.points, handPoints);
            const framing = assessCameraSetup(
              data.points,
              settings.current.hand,
            );
            setSetup(framing);
            const result = tracker.current.update(
              data.points,
              data.time,
              settings.current.hand,
              settings.current.shot,
              settings.current.ready,
            );
            setMessage(result.message);
            setArmed(tracker.current.armed);
            setArmProgress(result.armProgress);
            if (result.shot) {
              const released = applyHandSpin(
                result.shot,
                observation,
                settings.current.wristSpin,
              );
              setArmed(false);
              setLiveShot(released);
              settings.current.onThrow(released);
            } else if (result.preview) {
              setLiveShot(
                applyHandSpin(
                  result.preview,
                  observation,
                  settings.current.wristSpin,
                ),
              );
              settings.current.onPreview(result.preview);
            } else if (settings.current.ready) {
              setLiveShot(null);
            }
          }
        };
        worker.onerror = () =>
          fail(
            new Error(
              'Arm tracking could not load. Try a current Chrome or Safari browser.',
            ),
          );
        worker.postMessage({ type: 'init' });
        frame = requestAnimationFrame(tick);
      } catch (e) {
        fail(e);
      }
    };
    void start();
    const visibility = () => {
      if (document.hidden && !stopped) {
        stop();
        setAccess('paused');
        setMessage(
          'Camera stopped while this tab was hidden. Choose Restart camera to continue.',
        );
      }
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      closed = true;
      stop();
      document.removeEventListener('visibilitychange', visibility);
      if (video.current) video.current.srcObject = null;
    };
  }, [request]);
  return (
    <>
      <Dialog
        open={permissionOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="camera-access-dialog">
          <DialogTitle className="dialog-title">
            {issue?.title ||
              (access === 'paused'
                ? 'Restart your camera'
                : 'Enable camera throwing')}
          </DialogTitle>
          <DialogDescription>
            Use your camera to aim and throw with your arm. Video stays on this
            device and is not saved. Microphone access is not requested.
          </DialogDescription>
          {origin && (
            <p className="camera-access-origin">
              Camera access for <strong>{origin}</strong>
            </p>
          )}
          <p className="camera-access-status" role="status">
            {issue?.message ||
              (access === 'requesting'
                ? 'Look beside the address bar for your browser’s camera request and choose Allow.'
                : access === 'loading'
                  ? 'Camera allowed. Loading arm and hand tracking…'
                  : access === 'paused'
                    ? 'The camera stopped when you left this tab. Restart it when you’re ready.'
                    : 'Choose Enable camera, then accept your browser’s camera prompt if it appears.')}
          </p>
          {(issue?.kind === 'permission' ||
            issue?.kind === 'busy' ||
            access === 'requesting') && (
            <details className="camera-permission-help" open={!!issue}>
              <summary>No prompt, or access blocked?</summary>
              <ol>
                <li>
                  In Chrome, click the site controls icon to the left of the
                  address. Open <strong>Site settings</strong> and set{' '}
                  <strong>Camera → Allow</strong> for this address.
                </li>
                <li>
                  On a Mac, open{' '}
                  <strong>
                    System Settings → Privacy &amp; Security → Camera
                  </strong>{' '}
                  and enable <strong>Google Chrome</strong>. Restart Chrome if
                  prompted.
                </li>
                <li>
                  Return to this tab and choose <strong>Try again</strong>.
                  Reload the page if Chrome asks you to.
                </li>
              </ol>
              <p>
                Localhost and 127.0.0.1 have separate site permissions. Allow
                the address shown above. On other devices, also check the
                browser’s camera permission in system settings.
              </p>
              <a
                href="https://support.google.com/chrome/answer/2693767"
                target="_blank"
                rel="noreferrer"
              >
                Chrome camera help
              </a>
            </details>
          )}
          <div className="camera-access-actions">
            <button
              className="throw-button"
              onClick={startCamera}
              disabled={access === 'requesting' || access === 'loading'}
            >
              {access === 'requesting'
                ? 'Waiting for permission…'
                : access === 'loading'
                  ? 'Starting camera…'
                  : issue
                    ? 'Try again'
                    : access === 'paused'
                      ? 'Restart camera'
                      : 'Enable camera'}
            </button>
            <button className="text-button" onClick={onClose}>
              Use keyboard
            </button>
          </div>
        </DialogContent>
      </Dialog>
      {feedbackHost &&
        createPortal(
          <div className={'camera-gesture-cue' + (armed ? ' armed' : '')}>
            <strong>
              {error
                ? 'Camera paused'
                : !running
                  ? 'Camera setup'
                  : !setup.ready
                    ? 'Get in frame'
                    : !ready
                      ? 'Let it settle'
                      : armed
                        ? 'Armed'
                        : armProgress > 0
                          ? 'Hold your hand up…'
                          : 'Raise to arm'}
            </strong>
            <p aria-live="polite">{error || message}</p>
            <Progress
              value={armed ? 100 : armProgress * 100}
              aria-label="Hold your hand up to arm a throw"
              className="gesture-arm-progress"
            />
            {liveShot && (
              <div className="camera-throw-feedback">
                <div
                  className="camera-aim-meter"
                  role="img"
                  aria-label={`Aim ${Math.abs(liveShot.aim).toFixed(2)} metres ${liveShot.aim < 0 ? 'left' : 'right'}`}
                >
                  <span className="aim-centre" />
                  <span
                    className="aim-pointer"
                    style={{ left: `${50 + (liveShot.aim / 1.65) * 50}%` }}
                  />
                </div>
                <div className="camera-throw-readings">
                  <span>
                    Aim{' '}
                    {Math.abs(liveShot.aim) < 0.04
                      ? 'centre'
                      : `${Math.abs(liveShot.aim).toFixed(2)} m ${liveShot.aim < 0 ? 'left' : 'right'}`}
                  </span>
                  <span>
                    Spin {liveShot.spin.toFixed(1)} rps ·{' '}
                    {liveShot.spinSource === 'hand' ? 'wrist' : 'setting'}
                  </span>
                </div>
              </div>
            )}
          </div>,
          feedbackHost,
        )}
      <aside className="camera-panel" aria-label="Experimental camera throwing">
        <div className="camera-title">
          <span>
            <Camera size={16} />
            CAMERA THROW <small>EXPERIMENTAL</small>
          </span>
          <button
            className="trace-button"
            aria-label="Stop camera and close"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="hand-overlay-controls">
          <label htmlFor="track-fingers">
            <span>Show hand joints</span>
            <Switch
              id="track-fingers"
              checked={handTracking}
              onCheckedChange={setHandTracking}
            />
          </label>
          <p aria-live="polite">
            {!handTracking
              ? 'Hand joints off'
              : !running
                ? 'Hand tracking starts with the camera'
                : handModel === 'error'
                  ? 'Hand model could not start. Arm tracking still works.'
                  : handModel !== 'ready'
                    ? 'Loading hand tracking…'
                    : visibleHands > 0
                      ? `${visibleHands * 21} hand joints visible in cyan`
                      : 'Looking for hands. Show an open palm to the camera.'}
          </p>
        </div>
        <div className="camera-setup-copy">
          <strong>Set up your space</strong>
          <p>
            Place the camera level at waist-to-chest height on a stable counter
            or stand. A secure chair back can work. Step back until your hips
            and full throwing arm fit.
          </p>
        </div>
        <div className="camera-video">
          <video ref={video} muted playsInline autoPlay />
          <canvas ref={overlay} width={640} height={480} />
          <div className={'framing-guide ' + (setup.ready ? 'framed' : '')} />
          <span className="framing-label">
            {setup.ready ? 'GOOD FRAMING' : 'SHOULDERS + HIPS + HAND'}
          </span>
          <span
            className={'hand-overlay-badge' + (visibleHands ? ' detected' : '')}
          >
            {!handTracking
              ? 'HAND JOINTS OFF'
              : visibleHands
                ? `${visibleHands * 21} HAND JOINTS`
                : handModel === 'ready'
                  ? 'LOOKING FOR HANDS'
                  : handModel === 'error'
                    ? 'HAND TRACKING UNAVAILABLE'
                    : 'LOADING HAND JOINTS'}
          </span>
          {error && (
            <div className="camera-error">
              <VideoOff size={25} />
              <p>{error}</p>
            </div>
          )}
        </div>
        <div className="setup-checks">
          {setup.checks.map((c) => (
            <span key={c.label} className={c.ok ? 'ok' : ''}>
              {c.ok ? '✓' : '○'} {c.label}
            </span>
          ))}
        </div>
        <p className="camera-status" aria-live="polite">
          {error ? 'Open camera setup to check access and try again.' : message}
        </p>
        {!running && (
          <button
            className="text-button camera-retry"
            onClick={() => setPermissionOpen(true)}
          >
            {access === 'paused'
              ? 'Restart camera'
              : 'Camera permission & setup'}
          </button>
        )}
        <p className="camera-hands-free">
          <strong>No keyboard needed</strong>
          Raise your throwing hand above your shoulder for one second to arm.
          Lower it beside your hip, pause, then swing underhand. Move your hand
          left or right to steer the orange aim marker.
        </p>
        <RadioGroup
          className="hand-options"
          aria-label="Throwing hand"
          value={hand}
          onValueChange={(v) => {
            setHand(v as 'left' | 'right');
            tracker.current.cancel();
            handTracker.current.reset();
            setArmed(false);
            setArmProgress(0);
            setHandObservation(null);
          }}
        >
          {(['left', 'right'] as const).map((h) => (
            <label key={h}>
              <RadioGroupItem value={h} />
              {h === 'left' ? 'Left hand' : 'Right hand'}
            </label>
          ))}
        </RadioGroup>
        <button
          className="throw-button"
          disabled={!running || !ready || !setup.ready}
          onClick={() => {
            if (armed) {
              tracker.current.cancel();
              setArmed(false);
              setMessage('Cancelled. Lower your hand before arming again.');
            } else {
              tracker.current.arm();
              setArmed(true);
              setMessage(
                'Armed. Lower your hand beside your hip, then swing underhand.',
              );
            }
            setArmProgress(0);
          }}
        >
          {armed ? 'Cancel armed throw' : 'Arm one throw'}
        </button>
        <div className="hand-tracking-controls">
          <label htmlFor="wrist-spin">
            <span>
              Wrist controls spin <small>EXPERIMENTAL</small>
            </span>
            <Switch
              id="wrist-spin"
              checked={wristSpin}
              onCheckedChange={setWristSpin}
            />
          </label>
          {handTracking && (
            <p aria-live="polite">
              {handModel === 'error'
                ? 'Hand tracking is unavailable. Arm tracking still works.'
                : handModel !== 'ready'
                  ? 'Loading the hand model…'
                  : handObservation
                    ? `21 joints tracked · ${
                        handObservation.openFingers >= 3
                          ? 'Open hand'
                          : handObservation.openFingers === 0
                            ? 'Curled fingers'
                            : 'Partly open'
                      }`
                    : visibleHands > 0
                      ? 'Joints visible. Keep your throwing wrist and arm in view for motion readings.'
                      : 'No hand motion reading yet.'}
            </p>
          )}
          {handTracking && handObservation && (
            <p className="hand-turn-reading">
              Palm turn estimate:{' '}
              {handObservation.palmTurn === null
                ? 'watching…'
                : `${Math.round(handObservation.palmTurn)}°/s`}
            </p>
          )}
          <p>
            Tracked wrist rotation sets spin and its axis. If tracking is
            unavailable, your throw style supplies spin. Finger opening is shown
            for reference.
          </p>
        </div>
        <p className="camera-note">
          Use an empty hand. Aim and wrist spin are game-control estimates.
          Video is processed on this device and is not saved or uploaded.
        </p>
      </aside>
    </>
  );
}
