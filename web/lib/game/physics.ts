import RAPIER from '@dimforge/rapier3d-compat';
import {
  DEFAULT_SHOT,
  type BoneAsset,
  type ShotSettings,
  type SurfaceId,
} from './types';
export const DT = 1 / 120;
export const COURT = { width: 3.66, distance: 10, guardGap: 0.4 };
// Provisional material tuning; ground choice must not change bone-on-bone bounce.
const BONE_RESTITUTION = 0.04;
export const SURFACES: Record<
  SurfaceId,
  { friction: number; restitution: number; unevenness: number; color: string }
> = {
  gravel: {
    friction: 0.52,
    restitution: 0.06,
    unevenness: 0.0004,
    color: '#aaa68c',
  },
  dirt: {
    friction: 0.4,
    restitution: 0.04,
    unevenness: 0.0007,
    color: '#a08767',
  },
  grass: {
    friction: 0.86,
    restitution: 0.01,
    unevenness: 0.0016,
    color: '#76874e',
  },
  indoor: {
    friction: 0.27,
    restitution: 0.12,
    unevenness: 0,
    color: '#bc9f73',
  },
};
export type BoneBody = {
  id: number;
  kind: 'soldier' | 'guard' | 'thrower';
  body: RAPIER.RigidBody;
  colliders: RAPIER.Collider[];
  initial: { x: number; y: number; z: number };
};
let initialized: Promise<void> | undefined;
export function initPhysics() {
  return (initialized ??= RAPIER.init());
}
export function launchVelocity(shot: ShotSettings) {
  const power = Math.max(0.15, Math.min(1, shot.power)),
    speed = 5 + 7 * power,
    angle = (Math.max(8, Math.min(45, shot.loft)) * Math.PI) / 180,
    dx = Math.max(-1.65, Math.min(1.65, shot.aim)),
    dz = -10.12,
    n = Math.hypot(dx, dz);
  return {
    x: (dx / n) * speed * Math.cos(angle),
    y: speed * Math.sin(angle),
    z: (dz / n) * speed * Math.cos(angle),
  };
}
export function launchSpin(shot: ShotSettings) {
  const vector = shot.spinVector;
  if (vector && [vector.x, vector.y, vector.z].every(Number.isFinite)) {
    const speed = Math.hypot(vector.x, vector.y, vector.z);
    const scale = Math.PI * 2 * (speed > 5 ? 5 / speed : 1);
    return { x: vector.x * scale, y: vector.y * scale, z: vector.z * scale };
  }
  return { x: -Math.max(0, Math.min(5, shot.spin)) * Math.PI * 2, y: 0, z: 0 };
}
export function ballisticPath(shot: ShotSettings) {
  const v = launchVelocity(shot),
    out: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < 300; i++) {
    const t = i * 0.015,
      y = 0.75 + v.y * t - 4.905 * t * t;
    if (y < 0.04) break;
    out.push({ x: v.x * t, y, z: 10.12 + v.z * t });
  }
  return out;
}
export function surfaceHeight(id: SurfaceId, x: number, z: number) {
  const a = SURFACES[id].unevenness;
  return (
    a *
    (Math.sin(x * 39 + z * 27) * 0.45 +
      Math.sin(z * 53 - x * 21) * 0.3 +
      Math.sin(x * 81 + z * 69) * 0.25)
  );
}
export function terrainData(id: SurfaceId) {
  const nx = 48,
    nz = 156,
    w = 3.66,
    d = 13,
    z0 = -1.5,
    vertices: number[] = [],
    indices: number[] = [],
    uv: number[] = [];
  for (let z = 0; z <= nz; z++)
    for (let x = 0; x <= nx; x++) {
      const px = -w / 2 + (x / nx) * w,
        pz = z0 + (z / nz) * d;
      vertices.push(px, surfaceHeight(id, px, pz), pz);
      uv.push(x / nx, z / nz);
    }
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const a = z * (nx + 1) + x,
        b = a + 1,
        c = a + nx + 1,
        e = c + 1;
      indices.push(a, c, b, b, c, e);
    }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    uv: new Float32Array(uv),
  };
}
export class BunnockPhysics {
  world: RAPIER.World;
  ground: RAPIER.Collider;
  firstLanding: { x: number; y: number; z: number } | null = null;
  targets: BoneBody[] = [];
  throwers: BoneBody[] = [];
  surface: SurfaceId;
  terrain: ReturnType<typeof terrainData>;
  elapsed = 0;
  shotElapsed = 0;
  active: BoneBody | null = null;
  settledFor = 0;
  private nextId = 0;
  private asset: BoneAsset;
  pendingResets = new Map<number, number>();
  penaltyCounts = new Map<number, number>();
  private priorDown = new Set<number>();
  private shotResolved = true;
  constructor(asset: BoneAsset, surface: SurfaceId = 'gravel') {
    this.asset = asset;
    this.surface = surface;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.world.lengthUnit = 0.1;
    this.world.numSolverIterations = 8;
    this.world.maxCcdSubsteps = 4;
    this.world.integrationParameters.normalizedAllowedLinearError = 0.001;
    const s = SURFACES[surface];
    this.terrain = terrainData(surface);
    this.ground = this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        this.terrain.vertices,
        this.terrain.indices,
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
      )
        .setFriction(s.friction)
        .setRestitution(s.restitution)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(40, 0.5, 40)
        .setTranslation(0, -0.53, 5)
        .setFriction(s.friction)
        .setRestitution(s.restitution)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average),
    );
    const width = asset.standingWidth;
    for (let i = 0; i < 20; i++)
      this.targets.push(
        this.createBone('soldier', (i - 9.5) * (width + 0.00015), 0),
      );
    const guardX = (width + 0.00015) * 9.5 + width + COURT.guardGap;
    for (const x of [-guardX, guardX])
      this.targets.push(this.createBone('guard', x, 0));
  }
  private createBone(kind: BoneBody['kind'], x: number, z: number, y?: number) {
    const low = Math.min(
        ...this.asset.colliders.flatMap((c) => c.vertices.map((v) => v[1])),
      ),
      sy =
        y ??
        this.asset.standingHeight + surfaceHeight(this.surface, x, z) + 0.0002;
    const desc = RAPIER.RigidBodyDesc.dynamic()
        .setRotation(this.asset.standingRotation)
        .setTranslation(x, sy, z)
        .setCcdEnabled(true)
        .setCanSleep(true)
        .setLinearDamping(0.025)
        .setAngularDamping(0.06),
      body = this.world.createRigidBody(desc),
      totalVolume = this.asset.colliders.reduce((n, c) => n + c.volume, 0),
      mass = kind === 'thrower' ? 0.3 : 0.25;
    const colliders = this.asset.colliders.map((part) => {
      const c = RAPIER.ColliderDesc.convexHull(
        new Float32Array(part.vertices.flat()),
      );
      if (!c) throw new Error('The bone collision geometry is invalid.');
      c.setMass((mass * part.volume) / totalVolume)
        .setFriction(SURFACES[this.surface].friction)
        .setRestitution(BONE_RESTITUTION)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Average)
        .setContactSkin(0.00003);
      return this.world.createCollider(c, body);
    });
    return {
      id: this.nextId++,
      kind,
      body,
      colliders,
      initial: { x, y: sy, z },
    };
  }
  throw(shot: ShotSettings = { ...DEFAULT_SHOT }) {
    if (this.active && !this.isSettled())
      throw new Error('Wait for the current throw to settle.');
    if (this.throwers.length >= 12) {
      const first = this.throwers.shift()!;
      this.world.removeRigidBody(first.body);
    }
    const bone = this.createBone('thrower', 0, 10.12, 0.75);
    const half = -Math.PI / 4;
    bone.body.setRotation(
      { x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) },
      true,
    );
    bone.body.setLinvel(launchVelocity(shot), true);
    bone.body.setAngvel(launchSpin(shot), true);
    this.throwers.push(bone);
    this.active = bone;
    this.firstLanding = null;
    this.shotElapsed = 0;
    this.settledFor = 0;
    this.pendingResets.clear();
    this.priorDown = new Set(
      this.targets.filter((b) => this.isDown(b)).map((b) => b.id),
    );
    this.shotResolved = false;
    return bone;
  }
  step() {
    this.world.step();
    if (!this.shotResolved) this.observeGuardRule();
    if (this.active && !this.firstLanding) {
      let touches = false;
      for (const c of this.active.colliders)
        this.world.contactPair(c, this.ground, (m) => {
          if (m.numSolverContacts() > 0) touches = true;
        });
      if (touches) {
        const p = this.active.body.translation();
        this.firstLanding = {
          x: p.x,
          y: surfaceHeight(this.surface, p.x, p.z),
          z: p.z,
        };
      }
    }
    this.elapsed += DT;
    if (this.active) this.shotElapsed += DT;
    const bodies = [...this.targets, ...this.throwers];
    const moving = bodies.some((b) => {
      if (b.body.isSleeping()) return false;
      const v = b.body.linvel(),
        a = b.body.angvel();
      return (
        Math.hypot(v.x, v.y, v.z) > 0.025 || Math.hypot(a.x, a.y, a.z) > 0.2
      );
    });
    this.settledFor = moving ? 0 : this.settledFor + DT;
    for (const b of this.throwers) {
      const p = b.body.translation();
      if (
        (p.y < -2 || Math.abs(p.x) > 35 || Math.abs(p.z) > 35) &&
        !b.body.isSleeping()
      ) {
        b.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        b.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        b.body.sleep();
      }
    }
  }
  isSettled() {
    return !this.active || (this.shotElapsed > 0.9 && this.settledFor > 0.4);
  }
  private observeGuardRule() {
    const standingGuards = this.targets.filter(
      (b) => b.kind === 'guard' && !this.isDown(b),
    );
    for (const soldier of this.targets.filter((b) => b.kind === 'soldier')) {
      const down = this.isDown(soldier);
      if (down && !this.priorDown.has(soldier.id) && standingGuards.length) {
        const x = soldier.body.translation().x;
        const nearest = [...standingGuards].sort(
          (a, b) =>
            Math.abs(a.body.translation().x - x) -
            Math.abs(b.body.translation().x - x),
        )[0];
        if (!this.pendingResets.has(soldier.id))
          this.pendingResets.set(soldier.id, nearest.id);
      }
      if (down) this.priorDown.add(soldier.id);
      else this.priorDown.delete(soldier.id);
    }
  }
  resolvePenalties() {
    this.shotResolved = true;
    const reset: { id: number; count: number; x: number; z: number }[] = [];
    const width = this.asset.standingWidth;
    for (const [id, anchorId] of this.pendingResets) {
      const soldier = this.targets.find((b) => b.id === id)!;
      if (!this.isDown(soldier)) continue;
      const count = (this.penaltyCounts.get(id) ?? 0) + 1;
      this.penaltyCounts.set(id, count);
      const p = soldier.body.translation(),
        q = soldier.body.rotation();
      const standingGuards = this.targets.filter(
        (b) => b.kind === 'guard' && !this.isDown(b),
      );
      const guard =
        [...standingGuards].sort(
          (a, b) =>
            Math.abs(a.body.translation().x - p.x) -
            Math.abs(b.body.translation().x - p.x),
        )[0] ?? this.targets.find((b) => b.id === anchorId)!;
      const gp = guard.body.translation();
      const side = gp.x < 0 ? -1 : 1;
      let x = p.x,
        z = p.z;
      if (count < 3) {
        const direction = count === 1 ? -side : side;
        // One bone-width gap, then additional columns; overflow goes behind the row.
        const columns =
          count === 1 ? Math.max(1, Math.floor(COURT.guardGap / width) - 2) : 4;
        let placed = false;
        for (let row = 0; row < 50 && !placed; row++)
          for (let col = 0; col < columns; col++) {
            const cx = gp.x + direction * width * (2 + col),
              cz = gp.z - row * width * 1.25;
            const occupied = [...this.targets, ...this.throwers].some((b) => {
              if (b.id === id) return false;
              const at = b.body.translation();
              return (
                Math.abs(at.x - cx) < width * 1.06 &&
                Math.abs(at.z - cz) < width * 1.06
              );
            });
            if (!occupied) {
              x = cx;
              z = cz;
              placed = true;
              break;
            }
          }
      }
      const yaw =
        count >= 3
          ? Math.atan2(
              2 * (q.x * q.z + q.w * q.y),
              1 - 2 * (q.x * q.x + q.y * q.y),
            )
          : 0;
      const sy = Math.sin(yaw / 2),
        cy = Math.cos(yaw / 2),
        r = this.asset.standingRotation;
      soldier.body.setRotation(
        {
          x: cy * r.x + sy * r.z,
          y: cy * r.y + sy * r.w,
          z: cy * r.z - sy * r.x,
          w: cy * r.w - sy * r.y,
        },
        true,
      );
      const floor =
        Math.abs(x) <= COURT.width / 2 && z >= -1.5 && z <= 11.5
          ? surfaceHeight(this.surface, x, z)
          : -0.03;
      soldier.body.setTranslation(
        { x, y: this.asset.standingHeight + floor + 0.0002, z },
        true,
      );
      soldier.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      soldier.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      reset.push({ id, count, x, z });
    }
    this.pendingResets.clear();
    this.settledFor = 0;
    return reset;
  }
  isDown(b: BoneBody) {
    const q = b.body.rotation(),
      upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    return upY < Math.cos(Math.PI / 4);
  }
  score() {
    return {
      down: this.targets.filter((b) => this.isDown(b)).length,
      guards: this.targets.filter((b) => b.kind === 'guard' && this.isDown(b))
        .length,
    };
  }
  dispose() {
    this.world.free();
  }
}
