'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Crosshair, Hand } from 'lucide-react';
import {
  beginCameraRequest,
  type CameraRequest,
} from '../lib/game/camera-access';
import {
  InspectionMotion,
  TennisMotion,
  type MotionFeedback,
  type MotionFrame,
} from './motion';
import type { TennisController, TennisSettings, TennisStatus } from './types';
import { applyCameraFeedback } from './input';

type Props = {
  settings: TennisSettings;
  status: TennisStatus;
  controller: TennisController | null;
};
export function TennisCamera(props: Props) {
  const [request, setRequest] = useState<CameraRequest | null>(null);
  const [state, setState] = useState<'off' | 'loading' | 'live' | 'error'>(
    'off',
  );
  const [message, setMessage] = useState(
    'Use a relaxed, empty hand. Video stays on this device.',
  );
  const [feedback, setFeedback] = useState<MotionFeedback | null>(null);
  const [handWarning, setHandWarning] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tracker = useRef(new TennisMotion());
  const inspection = useRef(new InspectionMotion());
  const modeRequest = useRef<(mode: TennisSettings['mode']) => void>(() => {});
  const current = useRef(props);
  useEffect(() => {
    current.current = props;
  }, [props]);
  useEffect(() => {
    tracker.current.calibrate();
    modeRequest.current(props.settings.mode);
  }, [props.settings.mode, props.settings.hand]);
  const start = () => {
    props.controller?.unlockAudio();
    request?.cancel();
    tracker.current.calibrate();
    setFeedback(null);
    setHandWarning(false);
    setState('loading');
    setMessage('Allow camera access, then hold your hand still.');
    setRequest(
      beginCameraRequest({
        secure: window.isSecureContext,
        getUserMedia: navigator.mediaDevices?.getUserMedia.bind(
          navigator.mediaDevices,
        ),
      }),
    );
  };
  const stop = () => {
    request?.cancel();
    setRequest(null);
    setState('off');
    setFeedback(null);
    setMessage('Camera off. Your mouse and keyboard still work.');
  };
  useEffect(() => {
    if (!request) return;
    let ended = false,
      worker: Worker | null = null,
      animation = 0,
      workerReady = false,
      busy = false;
    let lastSent = 0,
      lastFrame = -1,
      deadline = performance.now() + 30000,
      modelStarted = false;
    const capturedVideo = video.current;
    const cleanup = () => {
      if (ended) return;
      ended = true;
      cancelAnimationFrame(animation);
      request.cancel();
      worker?.terminate();
      worker = null;
      modeRequest.current = () => {};
      tracker.current.resetMotion();
      current.current.controller?.motion({});
      inspection.current.reset();
      if (capturedVideo) capturedVideo.srcObject = null;
    };
    const fail = (text: string) => {
      cleanup();
      setState('error');
      setMessage(text);
      setFeedback(null);
    };
    const draw = (frame: MotionFrame) => {
      const target = canvas.current;
      if (!target) return;
      target.width = frame.width;
      target.height = frame.height;
      const ctx = target.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#d5ec86';
      ctx.fillStyle = '#effbc8';
      const point = (p: { x: number; y: number }) => ({
        x: (1 - p.x) * target.width,
        y: p.y * target.height,
      });
      for (const [a, b] of [
        [11, 12],
        [11, 13],
        [13, 15],
        [12, 14],
        [14, 16],
      ]) {
        const pa = frame.points[a],
          pb = frame.points[b];
        if (
          pa &&
          pb &&
          (pa.visibility ?? 0) > 0.6 &&
          (pb.visibility ?? 0) > 0.6
        ) {
          const p = point(pa),
            q = point(pb);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
      for (const index of [11, 12, 13, 14, 15, 16]) {
        const p = frame.points[index];
        if (p && (p.visibility ?? 0) > 0.6) {
          const q = point(p);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.strokeStyle = '#85dcf3';
      ctx.lineWidth = 2;
      for (const hand of frame.hands) {
        if (hand.points.length !== 21) continue;
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
            const p = point(hand.points[index]);
            if (i) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
          });
          ctx.stroke();
        }
      }
    };
    const tick = async (now: number) => {
      if (ended) return;
      animation = requestAnimationFrame(tick);
      if (now > deadline) {
        fail(
          modelStarted
            ? 'Tracking timed out. Restart the camera to try again.'
            : 'Camera permission is still pending. Allow access, then restart.',
        );
        return;
      }
      const v = video.current;
      if (
        !v ||
        !workerReady ||
        busy ||
        now - lastSent < 45 ||
        v.readyState < 2 ||
        lastFrame === v.currentTime ||
        document.hidden
      )
        return;
      busy = true;
      lastSent = now;
      lastFrame = v.currentTime;
      deadline = now + 5000;
      try {
        const bitmap = await createImageBitmap(v);
        if (ended || !worker) {
          bitmap.close();
          return;
        }
        worker.postMessage({ type: 'frame', frame: bitmap, time: now }, [
          bitmap,
        ]);
      } catch {
        fail('Couldn’t read camera frames. Restart the camera.');
      }
    };
    animation = requestAnimationFrame(tick);
    void request.result
      .then(async (result) => {
        if (ended || !result) return;
        if ('issue' in result) {
          fail(result.issue.message);
          return;
        }
        if (!video.current) {
          cleanup();
          return;
        }
        video.current.srcObject = result.stream;
        result.stream.getVideoTracks().forEach((track) =>
          track.addEventListener('ended', () => {
            if (!ended)
              fail('Camera disconnected. Reconnect it and try again.');
          }),
        );
        await video.current.play();
        if (ended) return;
        modelStarted = true;
        deadline = performance.now() + 25000;
        setMessage('Loading local hand and arm tracking…');
        worker = new Worker('/tennis/vision-worker.js');
        worker.onmessage = ({ data }) => {
          if (ended) return;
          if (data.type === 'hands-unavailable') setHandWarning(true);
          if (data.type === 'ready') {
            workerReady = true;
            deadline = performance.now() + 5000;
            setState('live');
            modeRequest.current = (mode) =>
              worker?.postMessage({ type: 'mode', mode });
            modeRequest.current(current.current.settings.mode);
          } else if (data.type === 'error')
            fail(
              'Tracking stopped. Restart the camera or use manual controls.',
            );
          else if (data.type === 'pose') {
            busy = false;
            deadline = performance.now() + 5000;
            const latest = current.current;
            const result = tracker.current.update(
              data,
              latest.settings,
              latest.status.paused,
            );
            draw(data);
            setFeedback(result);
            setMessage(result.message);
            if (latest.status.paused && latest.settings.handNavigation) {
              const navigation = inspection.current.update(data);
              if (navigation)
                latest.controller?.inspect(
                  navigation.panX,
                  navigation.panY,
                  navigation.zoom,
                );
              setMessage(
                'Pinch and move to pan. Pinch both hands and spread them to zoom in.',
              );
            } else inspection.current.reset();
            if (latest.controller)
              applyCameraFeedback(latest.controller, result, latest.status);
          }
        };
        worker.onerror = () =>
          fail('The tracking model couldn’t load. Restart the camera.');
        worker.postMessage({
          type: 'init',
          mode: current.current.settings.mode,
        });
      })
      .catch(() => fail('Camera mode couldn’t start. Restart the camera.'));
    const visibility = () => {
      if (document.hidden && !ended)
        fail(
          'Camera stopped while this tab was hidden. Restart when you return.',
        );
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cleanup();
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [request]);
  return (
    <div className="tn-camera-panel">
      <p className="tn-camera-framing">
        {props.settings.mode === 'swat'
          ? 'Hand-only play. Show one open hand; your elbow and shoulder can stay out of frame.'
          : props.settings.mode === 'dual'
            ? 'Show both hands. Your off hand positions the racket; your playing hand swings.'
            : 'Show your shoulder, elbow and wrist. Leave room for a relaxed arm swing.'}
      </p>
      <div className="tn-camera-preview">
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          aria-label="Mirrored camera preview"
          className={state === 'live' ? '' : 'tn-camera-hidden'}
        />
        <canvas
          ref={canvas}
          aria-hidden="true"
          className={state === 'live' ? '' : 'tn-camera-hidden'}
        />
        {state !== 'live' && (
          <div className="tn-camera-empty">
            {props.settings.mode === 'swat' ? (
              <Hand size={32} />
            ) : (
              <Camera size={28} />
            )}
            <span>
              {state === 'loading'
                ? 'Connecting camera…'
                : props.settings.mode === 'swat'
                  ? 'Just your hand is enough'
                  : 'Your motion, on court'}
            </span>
          </div>
        )}
        {state === 'live' && (
          <div className="tn-camera-badge">
            <i />{' '}
            {feedback?.confidence
              ? feedback.calibrated
                ? 'HAND LINKED'
                : 'CALIBRATING'
              : 'FINDING HAND'}
          </div>
        )}
        {state === 'live' && !feedback?.calibrated && (
          <div className="tn-camera-guide">
            {feedback?.confidence
              ? 'Hand found · hold still to fill the bar'
              : props.settings.mode === 'swat'
                ? 'Show one open hand in this frame'
                : 'Bring the selected hand into view'}
          </div>
        )}
      </div>
      {props.settings.mode === 'swat' && (
        <ol className="tn-setup-steps">
          <li className={feedback?.confidence ? 'done' : ''}>
            <span>1</span> Show hand
          </li>
          <li className={feedback?.calibrated ? 'done' : ''}>
            <span>2</span> Hold still
          </li>
          <li className={feedback?.calibrated ? 'done' : ''}>
            <span>3</span> Swat
          </li>
        </ol>
      )}
      <output className="tn-camera-message">{message}</output>
      {state === 'live' && feedback?.calibrated && (
        <p className="tn-camera-framing">
          Before feeding, move your hand left, right, up and down. The racket
          follows your hand. Swat to hit.
        </p>
      )}
      {state === 'live' && feedback && (
        <>
          <div className="tn-calibration-bar">
            <span style={{ width: `${feedback.progress * 100}%` }} />
          </div>
          <div className="tn-tracking-readings">
            {props.settings.mode === 'arm' && (
              <span>
                Elbow{' '}
                <b>
                  {feedback.elbow === null
                    ? '—'
                    : `${Math.round(feedback.elbow)}°`}
                </b>
              </span>
            )}
            <span>
              Wrist{' '}
              <b>
                {feedback.spin === null
                  ? '—'
                  : `${feedback.spin.toFixed(1)} r/s`}
              </b>
            </span>
          </div>
        </>
      )}
      {handWarning && (
        <p className="tn-camera-message">
          Fine hand tracking is unavailable. Arm controls still work; spin uses
          the brush direction and your setting.
        </p>
      )}
      <div className="tn-camera-actions">
        {state === 'live' || state === 'loading' ? (
          <>
            <button className="tn-secondary" onClick={stop}>
              <CameraOff size={15} /> Stop camera
            </button>
            {state === 'live' && (
              <button
                className="tn-secondary"
                onClick={() => tracker.current.calibrate()}
                aria-label="Recalibrate hand"
              >
                <Crosshair size={17} /> Recalibrate
              </button>
            )}
          </>
        ) : (
          <button className="tn-primary" onClick={start}>
            <Camera size={16} />{' '}
            {state === 'error'
              ? 'Restart camera'
              : props.settings.mode === 'swat'
                ? 'Enable hand tracking'
                : 'Enable camera'}
          </button>
        )}
      </div>
    </div>
  );
}
