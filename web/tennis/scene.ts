import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildBall, buildCourt, buildRacket, disposeScene } from './court';
import { initTennisPhysics, STEP, TennisPhysics } from './physics';
import { TennisAudio } from './audio';
import {
  clamp,
  DEFAULT_SETTINGS,
  type Stroke,
  type Swing,
  type TennisController,
  type TennisStatus,
  type RacketMotion,
} from './types';

export async function createTennisScene(
  host: HTMLDivElement,
  onStatus: (status: TennisStatus) => void,
): Promise<TennisController> {
  await initTennisPhysics();
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Tennis court: Space feeds, F forehand, B backhand, P pauses. When paused: drag to orbit, pinch to zoom, WASD moves, Q and E lower and raise the camera.',
  );
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const { key } = buildCourt(scene);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.006, 220);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minDistance = 0.09;
  controls.maxDistance = 85;
  controls.maxPolarAngle = Math.PI * 0.98;
  controls.zoomSpeed = 0.8;
  const ball = buildBall();
  scene.add(ball);
  const racket = new THREE.Group();
  const racketModel = buildRacket();
  racketModel.position.y = -0.475;
  racket.add(racketModel);
  racket.position.set(0.9, 1.05, 9.6);
  scene.add(racket);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.09, 24),
    new THREE.MeshBasicMaterial({
      color: '#06141c',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.052, 16, 12),
    new THREE.MeshBasicMaterial({
      color: '#e7ff84',
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    }),
  );
  scene.add(halo);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.18, 48),
    new THREE.MeshBasicMaterial({
      color: '#dcf77b',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.visible = false;
  scene.add(marker);
  const trailGeometry = new THREE.BufferGeometry();
  const trailArray = new Float32Array(720 * 3);
  trailGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(trailArray, 3),
  );
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color: '#e5f59a',
      transparent: true,
      opacity: 0.48,
    }),
  );
  trail.frustumCulled = false;
  scene.add(trail);
  const axis = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(),
    0.15,
    '#f7ac74',
    0.025,
    0.012,
  );
  scene.add(axis);
  const velocityAxis = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(),
    0.15,
    '#91d8fb',
    0.025,
    0.012,
  );
  scene.add(velocityAxis);
  const audio = new TennisAudio();
  let settings = { ...DEFAULT_SETTINGS };
  let swingAt = -10;
  let swingSide = 1;
  let disposed = false;
  let ballFocused = false;
  let lastContact = -10;
  let animatedGesture: number | null = null;
  const contactPoint = new THREE.Vector3();
  const physics = new TennisPhysics((event) => {
    if (settings.sound && event.type !== 'result')
      audio.play(event.type, event.strength, settings.volume);
    if (event.type === 'racket') {
      swingAt = physics.elapsed;
      lastContact = physics.elapsed;
      contactPoint.copy(event.position);
      racket.position.copy(contactPoint);
    }
    if (event.type === 'bounce' && physics.lastLanding) {
      marker.position.set(event.position.x, 0.012, event.position.z);
      marker.visible = true;
    }
  });
  const emit = () => {
    const v = physics.ball.linvel(),
      w = physics.ball.angvel();
    onStatus({
      ...physics.status,
      liveSpeed: Math.hypot(v.x, v.y, v.z) * 3.6,
      liveSpin: Math.hypot(w.x, w.y, w.z) / (Math.PI * 2),
      shots: [...physics.status.shots],
    });
  };
  const setView = () => {
    ballFocused = false;
    if (settings.view === 'broadcast') {
      camera.position.set(16, 11, 21);
      controls.target.set(0, 0.8, 1);
    } else if (settings.view === 'overhead') {
      camera.position.set(0, 31, 0.01);
      controls.target.set(0, 0, 0);
    } else {
      camera.position.set(0, 2.8, 16.6);
      controls.target.set(0, 0.8, -2.5);
    }
    camera.lookAt(controls.target);
    controls.update();
  };
  setView();
  const resize = () => {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const feed = () => {
    audio.unlock();
    physics.feed();
    marker.visible = false;
    emit();
  };
  const swing = (stroke: Stroke = 'forehand', gesture?: Swing) => {
    audio.unlock();
    if (physics.status.paused) return;
    const actual = physics.status.phase === 'toss' ? 'serve' : stroke;
    swingSide = actual === 'backhand' ? -1 : 1;
    if (settings.hand === 'left') swingSide *= -1;
    swingAt = physics.elapsed;
    physics.requestSwing(
      gesture ?? {
        stroke: actual,
        power: settings.power,
        aim: settings.aim,
        spin: settings.spin,
        sidespin: 0,
        lift: settings.lift,
      },
    );
    emit();
  };
  const pause = () => {
    ballFocused = false;
    physics.status.paused = !physics.status.paused;
    physics.motion({});
    controls.enabled = physics.status.paused;
    if (physics.status.paused) controls.target.copy(ball.position);
    else setView();
    controls.update();
    emit();
  };
  const focusBall = () => {
    if (!physics.status.paused) pause();
    const p = ball.position;
    camera.position.copy(p).add(new THREE.Vector3(0.13, 0.08, 0.22));
    controls.target.copy(p);
    controls.update();
    ballFocused = true;
  };
  const advance = () => {
    if (!physics.status.paused) return;
    const before = new THREE.Vector3().copy(physics.ball.translation());
    physics.status.paused = false;
    physics.step();
    physics.step();
    physics.status.paused = true;
    if (ballFocused) {
      const change = new THREE.Vector3()
        .copy(physics.ball.translation())
        .sub(before);
      camera.position.add(change);
      controls.target.add(change);
      controls.update();
    }
    emit();
  };
  const keys = new Set<string>();
  const interactive = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        'input,button,select,textarea,[role="slider"],[role="switch"],[role="tab"]',
      ),
    );
  const down = (e: KeyboardEvent) => {
    if (interactive(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (
      [
        ' ',
        'f',
        'b',
        't',
        'p',
        'r',
        'w',
        'a',
        's',
        'd',
        'q',
        'e',
        'arrowleft',
        'arrowright',
      ].includes(key)
    )
      e.preventDefault();
    keys.add(key);
    if (e.repeat) return;
    if (key === 'p') pause();
    else if (key === 'f' && physics.status.paused) focusBall();
    else if (key === ' ' || key === 't') feed();
    else if (key === 'f') swing('forehand');
    else if (key === 'b') swing('backhand');
    else if (key === 'r') {
      physics.reset();
      controls.enabled = false;
      setView();
      emit();
    }
  };
  const up = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const blur = () => keys.clear();
  host.addEventListener('keydown', down);
  host.addEventListener('keyup', up);
  host.addEventListener('focusout', blur);
  let pointer: { x: number; y: number; time: number; id: number } | null = null;
  const pointerDown = (e: PointerEvent) => {
    if (physics.status.paused || e.button !== 0) return;
    renderer.domElement.focus();
    audio.unlock();
    pointer = {
      x: e.clientX,
      y: e.clientY,
      time: performance.now(),
      id: e.pointerId,
    };
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  const pointerMove = (e: PointerEvent) => {
    if (physics.status.paused) return;
    const rect = host.getBoundingClientRect();
    const x = clamp(
      ((e.clientX - rect.left) / rect.width - 0.5) * 10,
      -4.5,
      4.5,
    );
    const y = clamp((1 - (e.clientY - rect.top) / rect.height) * 3, 0.25, 3.2);
    physics.position(x, y);
  };
  const pointerUp = (e: PointerEvent) => {
    if (!pointer || pointer.id !== e.pointerId || physics.status.paused) {
      pointer = null;
      return;
    }
    const start = pointer;
    pointer = null;
    if (physics.status.phase === 'ready' || physics.status.phase === 'result') {
      feed();
      return;
    }
    const dx = e.clientX - start.x,
      dy = start.y - e.clientY;
    const distance = Math.hypot(dx, dy);
    const duration = Math.max(40, performance.now() - start.time);
    const stroke =
      dx * (settings.hand === 'right' ? 1 : -1) < -10 ? 'backhand' : 'forehand';
    if (distance < 12) {
      swing(stroke);
      return;
    }
    swing(stroke, {
      stroke,
      power: clamp(0.2 + (distance / duration) * 0.4, 0.1, 1),
      aim: settings.aim,
      spin: clamp(settings.spin + (dy / Math.max(distance, 1)) * 20, -60, 60),
      sidespin: 0,
      lift: settings.lift,
    });
  };
  const cancel = () => {
    pointer = null;
  };
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointermove', pointerMove);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  renderer.domElement.addEventListener('pointercancel', cancel);
  const visibility = () => {
    if (document.hidden) {
      keys.clear();
      pointer = null;
      if (!physics.status.paused) pause();
    }
  };
  document.addEventListener('visibilitychange', visibility);
  let frame = 0,
    previous = performance.now(),
    accumulator = 0,
    lastStatus = 0;
  const forward = new THREE.Vector3(),
    right = new THREE.Vector3(),
    translation = new THREE.Vector3();
  const racketTarget = new THREE.Vector3();
  const tick = (now: number) => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    const delta = Math.min((now - previous) / 1000, 0.075);
    previous = now;
    if (!physics.status.paused) {
      accumulator += delta * settings.pace;
      while (accumulator >= STEP) {
        physics.step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      camera.getWorldDirection(forward);
      right.crossVectors(forward, camera.up).normalize();
      const speed =
        Math.max(0.15, camera.position.distanceTo(controls.target) * 0.7) *
        delta;
      translation.set(0, 0, 0);
      if (keys.has('w')) translation.addScaledVector(forward, speed);
      if (keys.has('s')) translation.addScaledVector(forward, -speed);
      if (keys.has('a')) translation.addScaledVector(right, -speed);
      if (keys.has('d')) translation.addScaledVector(right, speed);
      if (keys.has('q')) translation.y -= speed;
      if (keys.has('e')) translation.y += speed;
      camera.position.add(translation);
      controls.target.add(translation);
      if (translation.lengthSq() > 0) ballFocused = false;
      controls.update();
    }
    const p = physics.ball.translation();
    const rotation = physics.ball.rotation();
    ball.position.copy(p);
    ball.quaternion.copy(rotation);
    halo.position.copy(p);
    halo.visible = !physics.status.paused;
    shadow.position.set(p.x, 0.009, p.z);
    shadow.scale.setScalar(1 + Math.max(0, p.y) * 0.1);
    shadow.material.opacity = Math.max(0.08, 0.4 - p.y * 0.045);
    const age = physics.elapsed - swingAt;
    const swinging = age >= 0 && age < 0.38;
    const swingAngle = swinging
      ? Math.sin((age / 0.38) * Math.PI) * 0.5 * swingSide
      : 0;
    const afterContact = physics.elapsed - lastContact;
    racketTarget.set(
      physics.racket.x,
      physics.racket.y,
      physics.status.phase === 'toss' ? 10.5 : physics.racket.z,
    );
    if (afterContact >= 0 && afterContact < 0.45) {
      const follow = Math.sin((afterContact / 0.45) * Math.PI);
      racketTarget
        .copy(contactPoint)
        .add(
          new THREE.Vector3(
            -follow * swingSide * 0.5,
            follow * 0.14,
            -follow * 0.22,
          ),
        );
    }
    if (!physics.status.paused)
      racket.position.lerp(racketTarget, 1 - Math.exp(-delta * 22));
    racket.rotation.set(
      -0.06,
      -swingAngle * 0.65,
      settings.gripAngle * (settings.hand === 'right' ? 1 : -1) +
        physics.racketRoll -
        swingAngle,
    );
    if (physics.lastLanding) {
      marker.position.set(physics.lastLanding.x, 0.012, physics.lastLanding.z);
      marker.visible = true;
    }
    const trace = physics.trace;
    for (let i = 0; i < trace.length; i++) {
      trailArray[i * 3] = trace[i].x;
      trailArray[i * 3 + 1] = trace[i].y;
      trailArray[i * 3 + 2] = trace[i].z;
    }
    trailGeometry.attributes.position.needsUpdate = true;
    trailGeometry.setDrawRange(0, trace.length);
    trail.visible = settings.trail;
    const angular = new THREE.Vector3().copy(physics.ball.angvel());
    const velocity = new THREE.Vector3().copy(physics.ball.linvel());
    axis.visible = physics.status.paused && angular.length() > 0.1;
    velocityAxis.visible = physics.status.paused && velocity.length() > 0.1;
    axis.position.copy(p);
    velocityAxis.position.copy(p);
    if (axis.visible) axis.setDirection(angular.normalize());
    if (velocityAxis.visible) velocityAxis.setDirection(velocity.normalize());
    renderer.render(scene, camera);
    if (now - lastStatus > 90) {
      emit();
      lastStatus = now;
    }
  };
  frame = requestAnimationFrame(tick);
  emit();
  return {
    unlockAudio() {
      audio.unlock();
    },
    configure(next) {
      const viewChanged = next.view !== settings.view,
        qualityChanged = next.quality !== settings.quality;
      settings = { ...DEFAULT_SETTINGS, ...next };
      physics.configure(settings);
      if (viewChanged) setView();
      if (qualityChanged) {
        renderer.setPixelRatio(
          Math.min(window.devicePixelRatio, next.quality === 'high' ? 1.75 : 1),
        );
        renderer.shadowMap.enabled = next.quality === 'high';
        key.castShadow = next.quality === 'high';
        resize();
      }
    },
    feed,
    swing,
    pause,
    focusBall,
    advance,
    inspect(panX, panY, zoom) {
      if (!physics.status.paused) return;
      if (Math.abs(panX) + Math.abs(panY) > 0.001) ballFocused = false;
      const offset = camera.position.clone().sub(controls.target);
      const distance = offset.length();
      const scale = clamp(zoom, 0.9, 1.1);
      offset.setLength(
        clamp(distance * scale, controls.minDistance, controls.maxDistance),
      );
      const move = new THREE.Vector3()
        .setFromMatrixColumn(camera.matrix, 0)
        .multiplyScalar(-panX * distance * 1.6);
      move.addScaledVector(
        new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1),
        -panY * distance * 1.6,
      );
      controls.target.add(move);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    },
    position(x, y) {
      physics.position(x, y);
    },
    motion(input: RacketMotion) {
      physics.motion(input);
      const stroke = input.activeSwing;
      if (!physics.status.paused && stroke && stroke.id !== animatedGesture) {
        animatedGesture = stroke.id;
        swingAt = physics.elapsed;
        swingSide =
          (stroke.shot.stroke === 'backhand' ? -1 : 1) *
          (settings.hand === 'right' ? 1 : -1);
      }
    },
    reset() {
      physics.reset();
      marker.visible = false;
      controls.enabled = false;
      setView();
      emit();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('keydown', down);
      host.removeEventListener('keyup', up);
      host.removeEventListener('focusout', blur);
      document.removeEventListener('visibilitychange', visibility);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointermove', pointerMove);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('pointercancel', cancel);
      controls.dispose();
      audio.dispose();
      physics.dispose();
      disposeScene(scene);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
