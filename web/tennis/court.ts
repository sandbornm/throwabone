import * as THREE from 'three';
import { BALL_RADIUS, COURT, netHeight } from './physics';

function grainTexture(color: string, size = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  let seed = 19;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < (size * size) / 2; i++) {
    ctx.fillStyle =
      random() > 0.5
        ? `rgba(255,255,255,${random() * 0.11})`
        : `rgba(0,0,0,${random() * 0.1})`;
    ctx.fillRect(random() * size, random() * size, 1, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function mesh(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function tube(
  parent: THREE.Object3D,
  points: THREE.Vector3[],
  radius: number,
  material: THREE.Material,
  closed = false,
) {
  return mesh(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points, closed),
      Math.max(12, points.length * 3),
      radius,
      6,
      closed,
    ),
    material,
  );
}

function labelTexture(text: string, color = '#e9f1e8', background = '#081d2c') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1024, 128);
  ctx.fillStyle = color;
  ctx.font = '500 52px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 512, 68);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildCourt(scene: THREE.Scene) {
  scene.background = new THREE.Color('#101e32');
  scene.fog = new THREE.FogExp2('#172d43', 0.012);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(160, 32, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color('#061125') },
        bottom: { value: new THREE.Color('#79929e') },
      },
      vertexShader:
        'varying vec3 vPosition; void main(){vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vPosition; void main(){float h=clamp(normalize(vPosition).y,0.,1.); gl_FragColor=vec4(mix(bottom,top,pow(h,.45)),1.);}',
    }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight('#c9e0ff', '#2d434b', 2.1));
  const key = new THREE.DirectionalLight('#fff4df', 3.2);
  key.position.set(-11, 20, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 25;
  key.shadow.camera.bottom = -25;
  key.shadow.normalBias = 0.015;
  key.shadow.bias = -0.0001;
  scene.add(key);
  const fill = new THREE.DirectionalLight('#b5d7ff', 1.5);
  fill.position.set(12, 16, -14);
  scene.add(fill);

  const green = grainTexture('#285e61');
  green.repeat.set(22, 36);
  mesh(
    scene,
    new THREE.BoxGeometry(36, 0.18, 52),
    new THREE.MeshStandardMaterial({
      map: green,
      roughness: 0.94,
      bumpMap: green,
      bumpScale: 0.025,
    }),
    0,
    -0.1,
    0,
  );
  const blue = grainTexture('#216390');
  blue.repeat.set(12, 24);
  const surface = new THREE.MeshStandardMaterial({
    map: blue,
    roughness: 0.91,
    bumpMap: blue,
    bumpScale: 0.012,
  });
  const court = mesh(
    scene,
    new THREE.PlaneGeometry(COURT.doubles * 2, COURT.halfLength * 2),
    surface,
    0,
    0.002,
    0,
  );
  court.rotation.x = -Math.PI / 2;
  const lineMat = new THREE.MeshStandardMaterial({
    color: '#f0f3e9',
    roughness: 0.88,
  });
  const line = (x: number, z: number, w: number, d: number) => {
    const object = mesh(
      scene,
      new THREE.PlaneGeometry(w, d),
      lineMat,
      x,
      0.006,
      z,
    );
    object.rotation.x = -Math.PI / 2;
    object.castShadow = false;
  };
  for (const x of [
    -COURT.doubles,
    -COURT.singles,
    COURT.singles,
    COURT.doubles,
  ])
    line(x, 0, 0.05, COURT.halfLength * 2);
  for (const z of [-COURT.halfLength, COURT.halfLength]) {
    line(0, z, COURT.doubles * 2 + 0.05, 0.1);
    line(0, z - Math.sign(z) * 0.12, 0.05, 0.24);
  }
  for (const z of [-COURT.service, COURT.service])
    line(0, z, COURT.singles * 2, 0.05);
  line(0, 0, 0.05, COURT.service * 2);

  const net = new THREE.Group();
  scene.add(net);
  const cords: number[] = [];
  const add = (a: number[], b: number[]) => cords.push(...a, ...b);
  for (let x = -COURT.netHalfWidth; x <= COURT.netHalfWidth; x += 0.048)
    add([x, 0.025, 0], [x, netHeight(x), 0]);
  for (let y = 0.03; y < 1; y += 0.046) {
    for (let x = -COURT.netHalfWidth; x < COURT.netHalfWidth; x += 0.25) {
      const x2 = Math.min(x + 0.25, COURT.netHalfWidth);
      add([x, y * netHeight(x), 0], [x2, y * netHeight(x2), 0]);
    }
  }
  const netGeometry = new THREE.BufferGeometry();
  netGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(cords, 3),
  );
  net.add(
    new THREE.LineSegments(
      netGeometry,
      new THREE.LineBasicMaterial({
        color: '#0b161c',
        transparent: true,
        opacity: 0.85,
      }),
    ),
  );
  const tapeMaterial = new THREE.MeshStandardMaterial({
    color: '#fff8e5',
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const tapePoints: number[] = [];
  const tapeIndices: number[] = [];
  for (let i = 0; i <= 64; i++) {
    const x = -COURT.netHalfWidth + (i / 64) * COURT.netHalfWidth * 2;
    const h = netHeight(x);
    tapePoints.push(x, h, 0.005, x, h - 0.06, 0.005);
    if (i < 64)
      tapeIndices.push(
        i * 2,
        i * 2 + 1,
        i * 2 + 2,
        i * 2 + 1,
        i * 2 + 3,
        i * 2 + 2,
      );
  }
  const tape = new THREE.BufferGeometry();
  tape.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(tapePoints, 3),
  );
  tape.setIndex(tapeIndices);
  tape.computeVertexNormals();
  mesh(net, tape, tapeMaterial);
  mesh(
    net,
    new THREE.BoxGeometry(0.045, 0.94, 0.036),
    tapeMaterial,
    0,
    0.47,
    0,
  );
  const metal = new THREE.MeshStandardMaterial({
    color: '#193b45',
    roughness: 0.45,
    metalness: 0.7,
  });
  for (const x of [-COURT.netHalfWidth, COURT.netHalfWidth]) {
    mesh(
      net,
      new THREE.CylinderGeometry(0.043, 0.05, 1.1, 16),
      metal,
      x,
      0.55,
      0,
    );
    mesh(net, new THREE.SphereGeometry(0.046, 12, 8), metal, x, 1.1, 0);
  }

  const wallMat = new THREE.MeshStandardMaterial({
    color: '#0e293e',
    roughness: 0.87,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: '#344858',
    roughness: 0.95,
  });
  for (const z of [-20, 21]) {
    mesh(scene, new THREE.BoxGeometry(34, 1.3, 0.3), wallMat, 0, 0.65, z);
    const banner = mesh(
      scene,
      new THREE.PlaneGeometry(9, 1.125),
      new THREE.MeshStandardMaterial({
        map: labelTexture('BASELINE     /     NIGHT SESSION'),
        roughness: 0.8,
      }),
      0,
      0.7,
      z + (z < 0 ? 0.16 : -0.16),
    );
    if (z > 0) banner.rotation.y = Math.PI;
  }
  for (const x of [-17, 17])
    mesh(scene, new THREE.BoxGeometry(0.3, 1.3, 41), wallMat, x, 0.65, 0);
  const seatGeometry = new THREE.BoxGeometry(0.46, 0.16, 0.48);
  const seatMaterial = new THREE.MeshStandardMaterial({
    color: '#22567c',
    roughness: 0.64,
  });
  const seats = new THREE.InstancedMesh(seatGeometry, seatMaterial, 2800);
  let index = 0;
  const dummy = new THREE.Object3D();
  for (const side of [-1, 1])
    for (let row = 0; row < 9; row++) {
      const z = side * (22 + row * 0.92);
      const y = 0.5 + row * 0.57;
      mesh(
        scene,
        new THREE.BoxGeometry(36, 0.58, 1.02),
        concrete,
        0,
        y - 0.35,
        z,
      );
      for (let col = 0; col < 57; col++) {
        if (col % 19 === 0) continue;
        dummy.position.set((col - 28) * 0.6, y + 0.12, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        seats.setMatrixAt(index, dummy.matrix);
        seats.setColorAt(
          index++,
          new THREE.Color().setHSL(
            0.57,
            0.43,
            0.14 + ((col * 7 + row * 3) % 9) * 0.018,
          ),
        );
      }
    }
  for (const side of [-1, 1])
    for (let row = 0; row < 7; row++) {
      const x = side * (18.3 + row * 0.9);
      const y = 0.5 + row * 0.57;
      mesh(
        scene,
        new THREE.BoxGeometry(1.02, 0.58, 44),
        concrete,
        x,
        y - 0.35,
        0,
      );
      for (let col = 0; col < 68; col++) {
        if (col % 17 === 0) continue;
        dummy.position.set(x, y + 0.12, (col - 34) * 0.6);
        dummy.rotation.set(0, Math.PI / 2, 0);
        dummy.updateMatrix();
        seats.setMatrixAt(index, dummy.matrix);
        seats.setColorAt(
          index++,
          new THREE.Color().setHSL(0.57, 0.4, 0.15 + (col % 7) * 0.015),
        );
      }
    }
  seats.count = index;
  scene.add(seats);
  const lampMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    emissive: '#e7f2ff',
    emissiveIntensity: 5,
  });
  for (const x of [-15, 15])
    for (const z of [-16, 16]) {
      mesh(
        scene,
        new THREE.CylinderGeometry(0.09, 0.15, 15, 10),
        metal,
        x,
        7.5,
        z,
      );
      const panel = mesh(
        scene,
        new THREE.BoxGeometry(2.5, 0.7, 0.18),
        metal,
        x,
        14.8,
        z,
      );
      panel.rotation.y = z > 0 ? Math.PI : 0;
      for (let i = 0; i < 6; i++)
        mesh(
          panel,
          new THREE.PlaneGeometry(0.32, 0.43),
          lampMaterial,
          (i - 2.5) * 0.39,
          0,
          0.1,
        );
    }
  const benchMat = new THREE.MeshStandardMaterial({
    color: '#e0e5df',
    roughness: 0.7,
  });
  for (const x of [-8.5, 8.5]) {
    mesh(scene, new THREE.BoxGeometry(0.65, 0.12, 2.3), benchMat, x, 0.5, 2.8);
    mesh(
      scene,
      new THREE.BoxGeometry(0.12, 0.65, 2.3),
      benchMat,
      x + Math.sign(x) * 0.28,
      0.78,
      2.8,
    );
    for (const z of [2, 3.6])
      mesh(scene, new THREE.BoxGeometry(0.5, 0.45, 0.08), metal, x, 0.23, z);
  }
  return { key, net };
}

export function buildRacket() {
  const racket = new THREE.Group();
  const carbon = grainTexture('#161e23');
  carbon.repeat.set(6, 12);
  const frameMat = new THREE.MeshPhysicalMaterial({
    map: carbon,
    color: '#5c6b71',
    roughness: 0.28,
    metalness: 0.5,
    clearcoat: 0.9,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: '#d3f264',
    roughness: 0.3,
    metalness: 0.3,
  });
  const white = new THREE.MeshStandardMaterial({
    color: '#e2e7da',
    roughness: 0.65,
  });
  const points = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    return new THREE.Vector3(
      Math.sin(a) * 0.133,
      0.475 + Math.cos(a) * 0.177,
      0,
    );
  });
  tube(racket, points, 0.012, frameMat, true);
  tube(
    racket,
    points.map(
      (p) => new THREE.Vector3(p.x * 1.02, 0.475 + (p.y - 0.475) * 1.01, 0.01),
    ),
    0.003,
    accent,
    true,
  );
  for (const side of [-1, 1])
    tube(
      racket,
      [
        new THREE.Vector3(side * 0.08, 0.334, 0),
        new THREE.Vector3(side * 0.037, 0.24, 0),
        new THREE.Vector3(0, 0.175, 0),
      ],
      0.011,
      frameMat,
    );
  mesh(
    racket,
    new THREE.CylinderGeometry(0.015, 0.019, 0.1, 8),
    frameMat,
    0,
    0.18,
    0,
  );
  const grip = grainTexture('#d7d5c6');
  grip.repeat.set(3, 5);
  mesh(
    racket,
    new THREE.CylinderGeometry(0.019, 0.023, 0.16, 8),
    new THREE.MeshStandardMaterial({
      map: grip,
      roughness: 0.98,
      bumpMap: grip,
      bumpScale: 0.004,
    }),
    0,
    0.075,
    0,
  );
  const wrap = Array.from({ length: 200 }, (_, i) => {
    const a = (i / 199) * Math.PI * 2 * 10;
    return new THREE.Vector3(
      Math.sin(a) * 0.022,
      (i / 199) * 0.155,
      Math.cos(a) * 0.022,
    );
  });
  tube(racket, wrap, 0.0008, white);
  mesh(
    racket,
    new THREE.CylinderGeometry(0.024, 0.025, 0.013, 8),
    accent,
    0,
    -0.01,
    0,
  );
  const strings: number[] = [];
  for (let i = -8; i <= 8; i++) {
    const x = i * 0.014;
    const dy = 0.164 * Math.sqrt(1 - (x / 0.127) ** 2);
    strings.push(x, 0.475 - dy, 0, x, 0.475 + dy, 0);
  }
  for (let i = -10; i <= 10; i++) {
    const y = i * 0.014;
    const dx = 0.123 * Math.sqrt(1 - (y / 0.168) ** 2);
    strings.push(-dx, 0.475 + y, 0, dx, 0.475 + y, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(strings, 3),
  );
  racket.add(
    new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: '#e1e2c4',
        transparent: true,
        opacity: 0.78,
      }),
    ),
  );
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    mesh(
      racket,
      new THREE.SphereGeometry(0.003, 6, 4),
      white,
      Math.sin(a) * 0.125,
      0.475 + Math.cos(a) * 0.167,
      0,
    );
  }
  return racket;
}

export function buildBall() {
  const ball = new THREE.Group();
  const felt = grainTexture('#d2e838', 256);
  felt.repeat.set(3, 2);
  mesh(
    ball,
    new THREE.SphereGeometry(BALL_RADIUS, 48, 32),
    new THREE.MeshPhysicalMaterial({
      map: felt,
      roughness: 0.97,
      bumpMap: felt,
      bumpScale: 0.0007,
      sheen: 0.9,
      sheenRoughness: 1,
      sheenColor: new THREE.Color('#e7f68b'),
    }),
  );
  const seam = Array.from({ length: 160 }, (_, i) => {
    const a = (i / 160) * Math.PI * 2;
    const latitude = 0.55 * Math.sin(2 * a);
    return new THREE.Vector3(
      Math.cos(a) * Math.cos(latitude),
      Math.sin(latitude),
      Math.sin(a) * Math.cos(latitude),
    ).multiplyScalar(BALL_RADIUS + 0.0001);
  });
  tube(
    ball,
    seam,
    0.00065,
    new THREE.MeshStandardMaterial({ color: '#f5f1c8', roughness: 1 }),
    true,
  );
  return ball;
}

export function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const item = object as THREE.Mesh;
    if (item.geometry) geometries.add(item.geometry);
    if (item.material)
      for (const material of Array.isArray(item.material)
        ? item.material
        : [item.material])
        materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const texture of textures) texture.dispose();
  for (const geometry of geometries) geometry.dispose();
}
