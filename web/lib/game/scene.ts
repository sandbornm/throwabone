import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import {
  BunnockPhysics,
  DT,
  initPhysics,
  SURFACES,
  ballisticPath,
  launchVelocity,
  COURT,
  surfaceHeight,
} from './physics';
import { rangeView } from './view';
import {
  DEFAULT_SHOT,
  dragShot,
  clamp,
  type BoneAsset,
  type RangeControls,
  type RangeStatus,
  type ShotSettings,
  type SurfaceId,
  type ViewId,
  type ThrowRecord,
} from './types';

export async function mountRange(
  host: HTMLDivElement,
  onStatus: (s: RangeStatus) => void,
): Promise<RangeControls> {
  const [response] = await Promise.all([
    fetch('/models/bone.json'),
    initPhysics(),
  ]);
  if (!response.ok)
    throw new Error('The bone model could not be loaded. Please reload.');
  const asset = (await response.json()) as BoneAsset;
  const mobile = matchMedia('(pointer:coarse)').matches,
    reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#6caca3');
  scene.fog = new THREE.Fog('#6caca3', 22, 65);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.025, 120),
    closeCamera = new THREE.PerspectiveCamera(32, 1, 0.01, 50);
  closeCamera.position.set(0, 0.45, 2.9);
  closeCamera.lookAt(0, 0.015, 0);
  let currentView: ViewId = 'player',
    surface: SurfaceId = 'gravel',
    follow = false,
    slow = false,
    sound = false;
  const cameraPos = new THREE.Vector3(),
    cameraLook = new THREE.Vector3(),
    smoothLook = new THREE.Vector3(0, 0, 3),
    tempQuat = new THREE.Quaternion();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(asset.vertices.flat(), 3),
  );
  geo.setIndex(asset.faces.flat());
  geo.computeVertexNormals();
  const white = new THREE.MeshStandardMaterial({
      color: '#fff3d7',
      roughness: 0.86,
    }),
    black = new THREE.MeshStandardMaterial({
      color: '#253331',
      roughness: 0.72,
    }),
    orange = new THREE.MeshStandardMaterial({
      color: '#ff582d',
      roughness: 0.62,
    });
  scene.add(new THREE.HemisphereLight('#e7f0df', '#526753', 3));
  const sun = new THREE.DirectionalLight('#fff0d5', 3.5);
  sun.position.set(-4, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, {
    left: -7,
    right: 7,
    top: 14,
    bottom: -6,
    near: 0.1,
    far: 30,
  });
  const penaltyMaterial = new THREE.MeshStandardMaterial({
    color: '#ffc55f',
    emissive: '#a55100',
    emissiveIntensity: 0.3,
    roughness: 0.75,
  });
  let resetCountdown = 0;
  const resetFlashIds = new Set<number>();
  sun.shadow.bias = -0.00008;
  sun.shadow.normalBias = 0.002;
  sun.target.position.set(0, 0, 3);
  scene.add(sun, sun.target);
  const terrainMat = new THREE.MeshStandardMaterial({
    color: '#528752',
    roughness: 1,
  });
  const landscape = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 150),
    terrainMat,
  );
  landscape.rotation.x = -Math.PI / 2;
  landscape.position.y = -0.028;
  landscape.receiveShadow = true;
  scene.add(landscape);
  function texture(id: SurfaceId) {
    const size = 256,
      data = new Uint8Array(size * size * 4);
    let seed = 71;
    for (let i = 0; i < size * size; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = i % size,
        y = Math.floor(i / size),
        noise = seed / 4294967296;
      let v = 180 + noise * 70;
      if (id === 'grass')
        v = 155 + noise * 85 + Math.sin(x * 1.7 + y * 0.15) * 18;
      if (id === 'indoor')
        v =
          210 +
          Math.sin(y * 0.85 + noise) * 12 +
          (y % 64 === 0 ? -48 : noise * 20);
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(id === 'indoor' ? 3 : 14, id === 'indoor' ? 8 : 48);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  }
  const groundMat = new THREE.MeshStandardMaterial({
    color: SURFACES.gravel.color,
    roughness: 0.96,
    map: texture('gravel'),
  });
  const ground = new THREE.Mesh(new THREE.BufferGeometry(), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#ede9cc' }),
    edgeMat = new THREE.MeshStandardMaterial({
      color: '#465744',
      roughness: 1,
    });
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material,
  ) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    scene.add(m);
    return m;
  }
  for (const x of [-1.84, 1.84]) box(0.028, 0.012, 13, x, -0.014, 5, edgeMat);
  for (const z of [0, 10]) box(3.66, 0.001, 0.025, 0, 0.0008, z, stripeMat);
  for (const x of [-1.93, 1.93])
    for (const z of [0, 5, 10]) {
      const marker = box(0.06, 0.2, 0.05, x, 0.073, z, edgeMat);
      marker.castShadow = true;
      box(0.065, 0.025, 0.055, x, 0.15, z, orange);
    }
  // Court markings are geometry only; raised decorative boards cannot alter a throw.
  function groundText(text: string, z: number) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#e9e6cb';
    ctx.font = '500 68px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, 256, 85);
    const tx = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1.05, 0.26),
      new THREE.MeshBasicMaterial({
        map: tx,
        transparent: true,
        depthWrite: false,
      }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, 0.004, z);
    scene.add(m);
  }
  groundText('THROW LINE', 10.3);
  groundText('10 M', -0.32);
  let physics = new BunnockPhysics(asset, surface);
  const homeRow = new THREE.Group();
  for (const target of physics.targets) {
    const bone = new THREE.Mesh(geo, target.kind === 'guard' ? black : white);
    bone.position.set(target.initial.x, target.initial.y, COURT.distance);
    bone.quaternion.copy(target.body.rotation());
    bone.castShadow = bone.receiveShadow = true;
    homeRow.add(bone);
  }
  scene.add(homeRow);
  const meshes = new Map<
    number,
    { mesh: THREE.Mesh; previous: THREE.Vector3; previousQ: THREE.Quaternion }
  >();
  function syncBodies() {
    const all = [...physics.targets, ...physics.throwers],
      ids = new Set(all.map((b) => b.id));
    for (const [id, m] of meshes)
      if (!ids.has(id)) {
        scene.remove(m.mesh);
        meshes.delete(id);
      }
    for (const b of all)
      if (!meshes.has(b.id)) {
        const m = new THREE.Mesh(
          geo,
          b.kind === 'soldier' ? white : b.kind === 'guard' ? black : orange,
        );
        m.castShadow = true;
        m.receiveShadow = true;
        m.position.copy(b.body.translation());
        m.quaternion.copy(b.body.rotation());
        scene.add(m);
        meshes.set(b.id, {
          mesh: m,
          previous: m.position.clone(),
          previousQ: m.quaternion.clone(),
        });
      }
  }
  function syncTerrain() {
    for (const bone of homeRow.children)
      bone.position.y =
        asset.standingHeight +
        surfaceHeight(surface, bone.position.x, COURT.distance) +
        0.0002;
    ground.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.BufferAttribute(physics.terrain.vertices, 3),
    );
    g.setAttribute('uv', new THREE.BufferAttribute(physics.terrain.uv, 2));
    g.setIndex(new THREE.BufferAttribute(physics.terrain.indices, 1));
    g.computeVertexNormals();
    ground.geometry = g;
    groundMat.color.set(SURFACES[surface].color);
    groundMat.map?.dispose();
    groundMat.map = texture(surface);
    groundMat.needsUpdate = true;
  }
  syncBodies();
  syncTerrain();
  const held = new THREE.Mesh(geo, orange);
  held.position.set(0, 0.75, 10.12);
  held.rotation.x = -Math.PI / 2;
  held.castShadow = true;
  scene.add(held);
  const aimMaterial = new LineMaterial({
    color: '#ff9a30',
    linewidth: 3.2,
    dashed: true,
    dashSize: 0.1,
    gapSize: 0.055,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  aimMaterial.toneMapped = false;
  const aim = new Line2(new LineGeometry(), aimMaterial);
  scene.add(aim);
  const landing = new THREE.Mesh(
    new THREE.RingGeometry(0.055, 0.069, 40),
    new THREE.MeshBasicMaterial({
      color: '#ffbf3e',
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    }),
  );
  landing.rotation.x = -Math.PI / 2;
  scene.add(landing);
  landing.scale.setScalar(1.8);
  const aimMarker = new THREE.Group();
  const aimMarkerMaterial = new THREE.MeshBasicMaterial({
    color: '#ffb63e',
    transparent: true,
    opacity: 0.95,
    depthTest: false,
  });
  const aimRing = new THREE.Mesh(
    new THREE.RingGeometry(0.105, 0.125, 48),
    aimMarkerMaterial,
  );
  aimRing.rotation.x = -Math.PI / 2;
  aimMarker.add(aimRing);
  for (const angle of [0, Math.PI / 2]) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.31, 0.002, 0.008),
      aimMarkerMaterial,
    );
    bar.rotation.y = angle;
    aimMarker.add(bar);
  }
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.0025, 0.0025, 0.3, 8),
    aimMarkerMaterial,
  );
  beacon.position.y = 0.15;
  aimMarker.add(beacon);
  scene.add(aimMarker);
  const aimGuide = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({
      color: '#ff9a30',
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
  );
  scene.add(aimGuide);
  const trailMaterial = new LineMaterial({
    color: '#40f0ff',
    linewidth: 4.5,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });
  trailMaterial.toneMapped = false;
  const trail = new Line2(new LineGeometry(), trailMaterial);
  trail.visible = false;
  scene.add(trail);
  let shot = { ...DEFAULT_SHOT },
    history: ThrowRecord[] = [];
  try {
    const saved = JSON.parse(
      localStorage.getItem('throwabone.throws.v1') || '[]',
    );
    if (Array.isArray(saved))
      history = saved
        .filter(
          (r: ThrowRecord) =>
            r &&
            Array.isArray(r.path) &&
            r.path.every(
              (p) =>
                Number.isFinite(p.x) &&
                Number.isFinite(p.y) &&
                Number.isFinite(p.z),
            ) &&
            Number.isFinite(r.id) &&
            Number.isFinite(r.spin) &&
            Number.isFinite(r.down) &&
            Object.hasOwn(SURFACES, r.surface),
        )
        .slice(-30);
  } catch {}
  const status: RangeStatus = {
    ready: true,
    phase: 'aim',
    throws: 0,
    down: 0,
    guards: 0,
    message: 'Move sideways to aim. Pull back, then let fly.',
    power: shot.power,
    aim: shot.aim,
    history,
    pendingResets: 0,
  };
  const emit = () => {
    status.power = shot.power;
    status.aim = shot.aim;
    status.history = history;
    onStatus({ ...status, history: [...history] });
  };
  function refreshAim() {
    const pts = ballisticPath(shot);
    aim.geometry.dispose();
    aim.geometry = new LineGeometry().setPositions(
      pts.flatMap((p) => [p.x, p.y, p.z]),
    );
    aim.computeLineDistances();
    aimMarker.position.set(shot.aim, 0.014, 0);
    aimGuide.geometry.dispose();
    aimGuide.geometry = new THREE.TubeGeometry(
      new THREE.LineCurve3(
        new THREE.Vector3(0, 0.012, 10.12),
        new THREE.Vector3(shot.aim, 0.012, 0),
      ),
      1,
      0.007,
      5,
      false,
    );
    if (pts.length) {
      const p = pts.at(-1)!;
      landing.position.set(p.x, 0.007, p.z);
    }
  }
  refreshAim();
  emit();
  let tracePoints: THREE.Vector3[] = [],
    traceStep = 0,
    baseline = { down: 0, guards: 0 },
    shotTime = 0,
    recorded = false,
    lastGround = false,
    lastDown = 0,
    viewTrace = false;
  let audio: AudioContext | undefined;
  function unlockAudio() {
    if (!sound) return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  }
  function clack(strength = 0.5) {
    if (!sound || !audio || audio.state !== 'running') return;
    const t = audio.currentTime,
      o = audio.createOscillator(),
      gain = audio.createGain(),
      filter = audio.createBiquadFilter();
    o.type = 'triangle';
    o.frequency.setValueAtTime(520 + Math.random() * 220, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.065);
    filter.type = 'lowpass';
    filter.frequency.value = 2300;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.005, strength * 0.09),
      t + 0.002,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    o.start(t);
    o.stop(t + 0.12);
  }
  function updateTrail(points: THREE.Vector3[]) {
    trail.geometry.dispose();
    trail.geometry = new LineGeometry().setPositions(
      points.length > 1
        ? points.flatMap((p) => [p.x, p.y, p.z])
        : [0, 0, 0, 0, 0, 0],
    );
    trail.visible = points.length > 1;
  }
  function throwBone() {
    if (!status.ready) return;
    unlockAudio();
    baseline = physics.score();
    physics.throw(shot);
    syncBodies();
    tracePoints = [];
    traceStep = 0;
    shotTime = Date.now();
    recorded = false;
    lastGround = false;
    lastDown = baseline.down;
    viewTrace = false;
    updateTrail([]);
    status.throws++;
    status.ready = false;
    status.phase = 'flight';
    status.message = 'In the air…';
    held.visible = aim.visible = landing.visible = false;
    emit();
  }
  function finishThrow() {
    if (recorded) return;
    recorded = true;
    const resets = physics.resolvePenalties();
    resetFlashIds.clear();
    resets.forEach((r) => resetFlashIds.add(r.id));
    const score = physics.score(),
      v = launchVelocity(shot);
    const record: ThrowRecord = {
      ...shot,
      id: shotTime,
      surface,
      path: tracePoints.map((p) => ({ x: p.x, y: p.y, z: p.z })),
      landing: physics.firstLanding ? { ...physics.firstLanding } : null,
      down: Math.max(0, score.down - baseline.down),
      totalDown: score.down,
      guards: Math.max(0, score.guards - baseline.guards),
      speed: Math.hypot(v.x, v.y, v.z),
      time: shotTime,
      duration: physics.shotElapsed,
      resetCount: resets.length,
    };
    history = [...history, record].slice(-30);
    try {
      localStorage.setItem('throwabone.throws.v1', JSON.stringify(history));
    } catch {}
    status.ready = score.down < 22;
    status.phase = score.down === 22 ? 'complete' : 'aim';
    if (resets.length) {
      status.ready = false;
      status.phase = 'resetting';
      resetCountdown = 1.4;
    }
    status.pendingResets = resets.length;
    status.down = score.down;
    status.guards = score.guards;
    status.message = resets.length
      ? `${resets.length} early ${resets.length === 1 ? 'soldier reset' : 'soldiers reset'}. Both guards must fall first.`
      : score.down === 22
        ? 'Clean sweep. Reset the range for another go.'
        : record.down
          ? `${record.down} ${record.down === 1 ? 'bone' : 'bones'} down. Find your next line.`
          : 'A little adjustment. Give it another throw.';
    held.visible = aim.visible = landing.visible = status.ready;
    emit();
  }
  function reset() {
    physics.dispose();
    for (const m of meshes.values()) scene.remove(m.mesh);
    meshes.clear();
    physics = new BunnockPhysics(asset, surface);
    syncBodies();
    syncTerrain();
    held.visible = aim.visible = landing.visible = true;
    status.ready = true;
    status.phase = 'aim';
    status.throws = status.down = status.guards = 0;
    status.pendingResets = 0;
    resetCountdown = 0;
    resetFlashIds.clear();
    status.message = 'Fresh row. Make this one count.';
    recorded = true;
    tracePoints = [];
    viewTrace = false;
    updateTrail([]);
    refreshAim();
    accumulator = 0;
    emit();
  }
  let drag: { x: number; y: number; shot: ShotSettings } | null = null;
  const pointerDown = (e: PointerEvent) => {
    if (!status.ready || e.button !== 0) return;
    host.focus({ preventScroll: true });
    host.setPointerCapture(e.pointerId);
    unlockAudio();
    drag = { x: e.clientX, y: e.clientY, shot: { ...shot } };
    status.message = 'Aim sideways · pull down for power · release to throw';
    emit();
  };
  const pointerMove = (e: PointerEvent) => {
    if (!drag) return;
    shot = dragShot(
      drag.shot,
      e.clientX - drag.x,
      e.clientY - drag.y,
      host.clientWidth,
    );
    refreshAim();
    emit();
  };
  const pointerUp = (e: PointerEvent) => {
    if (!drag) return;
    const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 9;
    drag = null;
    if (host.hasPointerCapture(e.pointerId))
      host.releasePointerCapture(e.pointerId);
    if (moved) throwBone();
    else {
      status.message = 'Pull back on the court, then release.';
      emit();
    }
  };
  const pointerCancel = () => {
    if (drag) {
      shot = { ...drag.shot };
      drag = null;
      refreshAim();
      status.message = 'Throw cancelled. Ready when you are.';
      emit();
    }
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      reset();
      return;
    }
    if (!status.ready) return;
    if (e.code === 'Space') {
      e.preventDefault();
      throwBone();
      return;
    }
    let used = true;
    if (e.key === 'ArrowLeft') shot.aim = clamp(shot.aim - 0.025, -1.65, 1.65);
    else if (e.key === 'ArrowRight')
      shot.aim = clamp(shot.aim + 0.025, -1.65, 1.65);
    else if (e.key === 'ArrowUp')
      shot.power = clamp(shot.power + 0.01, 0.15, 1);
    else if (e.key === 'ArrowDown')
      shot.power = clamp(shot.power - 0.01, 0.15, 1);
    else used = false;
    if (used) {
      e.preventDefault();
      refreshAim();
      emit();
    }
  };
  host.addEventListener('pointerdown', pointerDown);
  host.addEventListener('pointermove', pointerMove);
  host.addEventListener('pointerup', pointerUp);
  host.addEventListener('pointercancel', pointerCancel);
  host.addEventListener('keydown', keyDown);
  let w = 1,
    h = 1,
    frame = 0,
    disposed = false,
    accumulator = 0,
    last = performance.now(),
    lastEmit = 0,
    monitorRect = { x: 0, y: 0, w: 0, h: 0 };
  const monitor = host.parentElement?.querySelector(
    '.target-monitor',
  ) as HTMLElement | null;
  const resize = () => {
    w = host.clientWidth;
    h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (monitor) {
      const r = monitor.getBoundingClientRect(),
        p = host.getBoundingClientRect();
      monitorRect = {
        x: r.left - p.left,
        y: h - (r.top - p.top) - r.height,
        w: r.width,
        h: r.height,
      };
      closeCamera.aspect = r.width / r.height;
      closeCamera.updateProjectionMatrix();
    }
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  if (monitor) observer.observe(monitor);
  resize();
  function updateCamera(delta: number) {
    const tracked =
      follow && physics.active && !recorded
        ? (meshes.get(physics.active.id)?.mesh.position ?? null)
        : null;
    const pose = rangeView(currentView, camera.aspect, tracked);
    cameraPos.fromArray(pose.position);
    cameraLook.fromArray(pose.look);
    const a = reduced ? 1 : 1 - Math.exp(-delta * (tracked ? 8 : 4));
    if (camera.fov !== pose.fov) {
      camera.fov += (pose.fov - camera.fov) * a;
      if (Math.abs(camera.fov - pose.fov) < 0.01) camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    camera.position.lerp(cameraPos, a);
    smoothLook.lerp(cameraLook, a);
    camera.lookAt(smoothLook);
  }
  const initialView = rangeView(currentView, camera.aspect);
  camera.position.fromArray(initialView.position);
  smoothLook.fromArray(initialView.look);
  camera.fov = initialView.fov;
  camera.updateProjectionMatrix();
  updateCamera(0);
  function render(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(render);
    const delta = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (document.hidden) {
      accumulator = 0;
      return;
    }
    accumulator += delta * (slow ? 0.25 : 1);
    if (resetCountdown > 0) {
      resetCountdown = Math.max(0, resetCountdown - delta);
      if (resetCountdown === 0) {
        status.ready = true;
        status.phase = 'aim';
        status.pendingResets = 0;
        held.visible = aim.visible = landing.visible = true;
        resetFlashIds.clear();
        emit();
      }
    }
    let steps = 0;
    while (accumulator >= DT && steps < 12) {
      for (const b of [...physics.targets, ...physics.throwers]) {
        const m = meshes.get(b.id);
        if (m) {
          m.previous.copy(b.body.translation());
          m.previousQ.copy(b.body.rotation());
        }
      }
      physics.step();
      accumulator -= DT;
      steps++;
      if (physics.active && !recorded) {
        traceStep++;
        if (traceStep % 4 === 0) {
          const p = physics.active.body.translation();
          tracePoints.push(new THREE.Vector3(p.x, p.y, p.z));
          if (tracePoints.length > 1200) tracePoints.shift();
        }
        if (!lastGround && physics.firstLanding) {
          lastGround = true;
          status.phase = 'settling';
          status.message = 'Let it roll…';
          clack(0.5);
          emit();
        }
        const score = physics.score();
        if (score.down > lastDown) {
          clack(Math.min(1, (score.down - lastDown) * 0.3));
          lastDown = score.down;
        }
        if (physics.isSettled()) finishThrow();
      }
    }
    const alpha = clamp(accumulator / DT, 0, 1);
    for (const b of [...physics.targets, ...physics.throwers]) {
      const m = meshes.get(b.id);
      if (!m) continue;
      if (b.kind === 'soldier')
        m.mesh.material =
          physics.pendingResets.has(b.id) || resetFlashIds.has(b.id)
            ? penaltyMaterial
            : white;
      m.mesh.position
        .copy(m.previous)
        .lerp(b.body.translation() as THREE.Vector3, alpha);
      tempQuat.copy(b.body.rotation());
      m.mesh.quaternion.copy(m.previousQ).slerp(tempQuat, alpha);
    }
    if (physics.active && !recorded) {
      if (traceStep % 4 === 0) updateTrail(tracePoints);
      if (now - lastEmit > 200) {
        const score = physics.score();
        status.down = score.down;
        status.guards = score.guards;
        status.pendingResets = physics.pendingResets.size;
        emit();
        lastEmit = now;
      }
    } else if (!viewTrace) trail.material.opacity = 0.9;
    updateCamera(delta);
    aimMarker.visible = aimGuide.visible = status.ready;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    aimMaterial.resolution.set(w, h);
    trailMaterial.resolution.set(w, h);
    aimMaterial.linewidth = 3.2;
    trailMaterial.linewidth = 4.5;
    renderer.render(scene, camera);
    if (monitorRect.w) {
      renderer.setScissorTest(true);
      renderer.setScissor(
        monitorRect.x,
        monitorRect.y,
        monitorRect.w,
        monitorRect.h,
      );
      renderer.setViewport(
        monitorRect.x,
        monitorRect.y,
        monitorRect.w,
        monitorRect.h,
      );
      aimMaterial.resolution.set(monitorRect.w, monitorRect.h);
      trailMaterial.resolution.set(monitorRect.w, monitorRect.h);
      aimMaterial.linewidth = 1.7;
      trailMaterial.linewidth = 2.3;
      renderer.render(scene, closeCamera);
      renderer.setScissorTest(false);
    }
  }
  frame = requestAnimationFrame(render);
  const onVisibility = () => {
    last = performance.now();
    accumulator = 0;
  };
  document.addEventListener('visibilitychange', onVisibility);
  return {
    setShot(s) {
      if (!status.ready) return;
      shot = { ...s };
      refreshAim();
      emit();
    },
    throwBone,
    reset,
    setSurface(id) {
      if (!Object.hasOwn(SURFACES, id)) return;
      surface = id;
      reset();
    },
    setView(id) {
      currentView = id;
    },
    setFollow(v) {
      follow = v;
    },
    setSlow(v) {
      slow = v;
    },
    setSound(v) {
      sound = v;
      unlockAudio();
    },
    showTrace(record) {
      if (!status.ready && status.phase !== 'complete') return;
      viewTrace = !!record;
      updateTrail(
        record ? record.path.map((p) => new THREE.Vector3(p.x, p.y, p.z)) : [],
      );
      trail.material.opacity = 1;
      if (record) currentView = 'overhead';
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      host.removeEventListener('pointerdown', pointerDown);
      host.removeEventListener('pointermove', pointerMove);
      host.removeEventListener('pointerup', pointerUp);
      host.removeEventListener('pointercancel', pointerCancel);
      host.removeEventListener('keydown', keyDown);
      document.removeEventListener('visibilitychange', onVisibility);
      physics.dispose();
      audio?.close();
      const geometries = new Set<THREE.BufferGeometry>(),
        materials = new Set<THREE.Material>(),
        textures = new Set<THREE.Texture>();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          geometries.add(o.geometry);
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            materials.add(m);
            if ('map' in m && m.map instanceof THREE.Texture)
              textures.add(m.map);
          });
        }
      });
      geometries.forEach((g) => g.dispose());
      textures.forEach((t) => t.dispose());
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
