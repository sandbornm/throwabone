import RAPIER from '@dimforge/rapier3d-compat';
import {
  clamp,
  DEFAULT_SETTINGS,
  INITIAL_STATUS,
  type Swing,
  type TennisSettings,
  type TennisStatus,
  type Vec3,
  type RacketMotion,
} from './types';

export const STEP = 1 / 120;
export const BALL_RADIUS = 0.0335;
export const BALL_MASS = 0.057;
export const COURT = {
  halfLength: 11.885,
  singles: 4.115,
  doubles: 5.485,
  service: 6.4,
  netHalfWidth: 6.399,
};
export const netHeight = (x: number) =>
  0.914 +
  0.156 * (Math.min(Math.abs(x), COURT.netHalfWidth) / COURT.netHalfWidth) ** 2;
let initialization: Promise<void> | null = null;
export function initTennisPhysics() {
  return (initialization ??= RAPIER.init());
}

// Drag and Magnus forces are bounded empirical approximations for a felt ball.
export function aerodynamicForce(velocity: Vec3, spin: Vec3): Vec3 {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < 0.001) return { x: 0, y: 0, z: 0 };
  const omega = Math.hypot(spin.x, spin.y, spin.z);
  const area = Math.PI * BALL_RADIUS ** 2;
  const drag = 0.5 * 1.225 * 0.55 * area * speed;
  const cross = {
    x: spin.y * velocity.z - spin.z * velocity.y,
    y: spin.z * velocity.x - spin.x * velocity.z,
    z: spin.x * velocity.y - spin.y * velocity.x,
  };
  const crossLength = Math.hypot(cross.x, cross.y, cross.z);
  const liftCoefficient = Math.min(0.28, (0.6 * BALL_RADIUS * omega) / speed);
  const lift =
    crossLength > 1e-9
      ? (0.5 * 1.225 * area * speed ** 2 * liftCoefficient) / crossLength
      : 0;
  return {
    x: -drag * velocity.x + cross.x * lift,
    y: -drag * velocity.y + cross.y * lift,
    z: -drag * velocity.z + cross.z * lift,
  };
}

export function landingResult(p: Vec3, serve: boolean, serverX: number) {
  if (p.z >= 0) return 'Short';
  if (serve) {
    if (
      p.z < -COURT.service - BALL_RADIUS ||
      Math.abs(p.x) > COURT.singles + BALL_RADIUS ||
      (serverX >= 0 ? p.x > BALL_RADIUS : p.x < -BALL_RADIUS)
    )
      return 'Fault';
    return 'In';
  }
  if (Math.abs(p.x) > COURT.singles + BALL_RADIUS) return 'Wide';
  if (p.z < -COURT.halfLength - BALL_RADIUS) return 'Long';
  return 'In';
}

export type PhysicsEvent = {
  type: 'racket' | 'bounce' | 'net' | 'result';
  strength: number;
  position: Vec3;
};

export class TennisPhysics {
  readonly world: RAPIER.World;
  readonly ball: RAPIER.RigidBody;
  readonly events = new RAPIER.EventQueue(true);
  readonly ground: RAPIER.Collider;
  readonly netHandles = new Set<number>();
  status: TennisStatus = { ...INITIAL_STATUS, shots: [] };
  settings: TennisSettings = { ...DEFAULT_SETTINGS };
  elapsed = 0;
  resultAt = 0;
  serveX = 0.8;
  racket = { x: 0.9, y: 1.05, z: 9.6 };
  racketRoll = 0;
  trace: Vec3[] = [];
  lastLanding: Vec3 | null = null;
  private queued: { swing: Swing; until: number; gestureId?: number } | null =
    null;
  private consumedGesture: number | null = null;
  private bornAt = 0;
  private count = 0;
  private groundBounces = 0;
  private netTouched = false;
  private flightIsServe = false;
  private listener: (event: PhysicsEvent) => void;

  constructor(listener: (event: PhysicsEvent) => void = () => {}) {
    this.listener = listener;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = STEP;
    this.world.numSolverIterations = 8;
    this.ground = this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(40, 0.1, 50)
        .setTranslation(0, -0.1, 0)
        .setRestitution(0.73)
        .setFriction(0.22),
    );
    for (let i = 0; i < 48; i++) {
      const width = (COURT.netHalfWidth * 2) / 48;
      const x = -COURT.netHalfWidth + (i + 0.5) * width;
      const height = netHeight(x);
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(width / 2, height / 2, 0.014)
          .setTranslation(x, height / 2, 0)
          .setRestitution(0.08)
          .setFriction(0.7),
      );
      this.netHandles.add(collider.handle);
    }
    for (const x of [-COURT.netHalfWidth, COURT.netHalfWidth]) {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(0.535, 0.04)
          .setTranslation(x, 0.535, 0)
          .setRestitution(0.3),
      );
      this.netHandles.add(collider.handle);
    }
    this.ball = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0.8, 1.05, 9.6)
        .setCcdEnabled(true)
        .setAngularDamping(0.025)
        .setCanSleep(false),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setMass(BALL_MASS)
        .setRestitution(0.73)
        .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setFriction(0.22)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this.ball,
    );
    this.ball.setEnabled(false);
  }
  configure(settings: TennisSettings) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
  }
  position(x: number, y: number) {
    if (this.status.paused || !Number.isFinite(x) || !Number.isFinite(y))
      return;
    this.racket.x = clamp(x, -4.5, 4.5);
    this.racket.y = clamp(y, 0.25, 3.2);
  }
  motion(input: RacketMotion) {
    if (this.status.paused) {
      if (this.queued?.gestureId !== undefined) this.queued = null;
      return;
    }
    if (input.position) this.position(input.position.x, input.position.y);
    if (input.roll !== undefined && Number.isFinite(input.roll))
      this.racketRoll = clamp(input.roll, -0.9, 0.9);
    const stroke = input.activeSwing;
    if (!stroke) {
      if (this.queued?.gestureId !== undefined) this.queued = null;
      return;
    }
    if (
      stroke.id === this.consumedGesture ||
      (this.status.phase !== 'incoming' && this.status.phase !== 'toss')
    )
      return;
    this.queued = {
      swing: { ...stroke.shot },
      gestureId: stroke.id,
      // Camera updates keep the stroke alive while the hand is moving.
      until: this.elapsed + 0.2 * this.settings.pace,
    };
    this.tryContact();
  }
  private place(position: Vec3, velocity: Vec3) {
    this.ball.setEnabled(true);
    this.ball.setTranslation(position, true);
    this.ball.setLinvel(velocity, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.resetForces(true);
    this.ball.resetTorques(true);
    this.trace = [];
    this.lastLanding = null;
    this.queued = null;
    this.bornAt = this.elapsed;
    this.groundBounces = 0;
    this.netTouched = false;
  }
  feed() {
    if (this.status.paused) return;
    this.count++;
    if (this.settings.drill === 'serve') {
      this.serveX = this.settings.hand === 'right' ? 0.8 : -0.8;
      this.place(
        { x: this.serveX, y: 1.55, z: 10.5 },
        { x: 0, y: 5.6, z: -0.2 },
      );
      this.status.phase = 'toss';
      this.status.message = 'Toss up. Swing at the top.';
    } else {
      const dominant = this.settings.hand === 'right' ? 1 : -1;
      const side =
        this.settings.drill === 'forehand'
          ? dominant
          : this.settings.drill === 'backhand'
            ? -dominant
            : this.count % 2
              ? 1
              : -1;
      this.place({ x: side * 1.3, y: 1.7, z: -9 }, { x: 0, y: 5.2, z: 12 });
      this.status.phase = 'incoming';
      this.status.message = 'Let it bounce, then swing as it reaches you.';
    }
    this.flightIsServe = false;
    this.status.contact = 0;
  }
  requestSwing(swing: Swing) {
    if (this.status.paused) return;
    if (this.status.phase !== 'incoming' && this.status.phase !== 'toss') {
      this.status.message =
        this.status.phase === 'outgoing'
          ? 'Watch the landing. Feed the next ball when you’re ready.'
          : 'Feed a ball to begin.';
      return;
    }
    if (this.queued) return;
    this.queued = {
      swing: { ...swing },
      until: this.elapsed + 0.2 + this.settings.assist * 0.22,
    };
    this.tryContact();
  }
  private tryContact() {
    if (!this.queued) return;
    if (this.elapsed > this.queued.until) {
      this.queued = null;
      this.status.message = 'No contact. Wait until the ball is closer.';
      return;
    }
    const p = this.ball.translation();
    const assist = clamp(this.settings.assist, 0, 1);
    const serving = this.status.phase === 'toss';
    const near = serving
      ? p.y > 2.25 && p.y < 3.35
      : Math.abs(p.z - this.racket.z) < 0.28 + assist * 1.7 &&
        p.y > 0.2 &&
        p.y < 2.8;
    const reach = this.settings.assistPlacement ? assist * 2.5 : 0;
    const close =
      Math.hypot(p.x - this.racket.x, p.y - this.racket.y) <
      0.22 + assist * 0.65 + reach;
    if (!near || !close) return;
    const shot = this.queued.swing;
    if (this.queued.gestureId !== undefined)
      this.consumedGesture = this.queued.gestureId;
    this.queued = null;
    const power = clamp(shot.power, 0.05, 1);
    const speed = serving ? 22 + power * 24 : 13 + power * 17;
    const angle = serving
      ? -0.135 + clamp(shot.lift, 0, 1) * 0.1
      : 0.05 + clamp(shot.lift, 0, 1) * 0.28;
    const aim =
      clamp(shot.aim, -1, 1) * 0.24 +
      (serving ? -Math.sign(this.serveX) * 0.14 : 0);
    const velocity = {
      x: speed * Math.sin(aim) * Math.cos(angle),
      y: speed * Math.sin(angle),
      z: -speed * Math.cos(aim) * Math.cos(angle),
    };
    const spin = clamp(shot.spin, -60, 60);
    this.ball.setLinvel(velocity, true);
    // Negative X angular velocity produces downward Magnus lift on a -Z shot.
    this.ball.setAngvel(
      {
        x: -spin * Math.PI * 2,
        y: clamp(shot.sidespin, -30, 30) * Math.PI * 2,
        z: 0,
      },
      true,
    );
    this.status.phase = 'outgoing';
    this.status.hits++;
    this.status.speed = Math.round(speed * 3.6);
    this.status.spin = spin;
    this.status.stroke = serving ? 'serve' : shot.stroke;
    this.status.message = 'Clean contact';
    this.status.contact = 1;
    this.flightIsServe = serving;
    this.groundBounces = 0;
    this.netTouched = false;
    this.bornAt = this.elapsed;
    this.trace = [{ ...p }];
    this.listener({
      type: 'racket',
      strength: 0.4 + power * 0.6,
      position: { ...p },
    });
  }
  private finish(result: string, p: Vec3) {
    if (this.status.phase === 'result') return;
    if (this.status.phase === 'outgoing') {
      const inside = result === 'In';
      if (inside) this.status.inside++;
      this.status.streak = inside ? this.status.streak + 1 : 0;
      this.status.shots = [
        {
          id: this.status.hits,
          stroke: this.status.stroke ?? 'forehand',
          speed: this.status.speed,
          spin: this.status.spin,
          result,
          x: p.x,
          z: p.z,
        },
        ...this.status.shots,
      ].slice(0, 12);
    } else this.status.streak = 0;
    this.status.phase = 'result';
    this.resultAt = this.elapsed;
    this.status.message =
      result === 'In'
        ? 'In. Nicely placed.'
        : result === 'Miss'
          ? 'Ball passed. Try another.'
          : result === 'Let'
            ? 'Let. Serve again.'
            : result === 'Net'
              ? 'Into the net. Add a little lift.'
              : result === 'Long'
                ? 'Long. Ease the power or add topspin.'
                : result === 'Wide'
                  ? 'Wide. Aim closer to the centre.'
                  : `${result}. Try another.`;
    this.queued = null;
    this.listener({ type: 'result', strength: 0, position: { ...p } });
  }
  step() {
    if (this.status.paused) return;
    this.elapsed += STEP;
    if (this.status.phase === 'ready') return;
    if (
      this.status.phase === 'result' &&
      this.settings.autoFeed &&
      this.elapsed - this.resultAt > this.settings.feedInterval
    ) {
      this.feed();
      return;
    }
    const before = this.ball.translation();
    const velocity = this.ball.linvel();
    const spin = this.ball.angvel();
    this.ball.resetForces(false);
    this.ball.addForce(aerodynamicForce(velocity, spin), true);
    this.world.step(this.events);
    const p = this.ball.translation();
    this.events.drainCollisionEvents((a, b, started) => {
      if (!started) return;
      if (a === this.ground.handle || b === this.ground.handle) {
        this.groundBounces++;
        this.listener({
          type: 'bounce',
          strength: clamp(Math.abs(velocity.y) / 8, 0.1, 1),
          position: { ...p },
        });
        if (this.status.phase === 'outgoing') {
          this.lastLanding = { ...p, y: BALL_RADIUS };
          const result = landingResult(p, this.flightIsServe, this.serveX);
          this.finish(
            this.netTouched && this.flightIsServe && result === 'In'
              ? 'Let'
              : result,
            p,
          );
        } else if (
          this.status.phase === 'toss' ||
          (this.groundBounces > 1 && this.status.phase === 'incoming')
        )
          this.finish('Miss', p);
      } else if (this.netHandles.has(a) || this.netHandles.has(b)) {
        this.netTouched = true;
        this.listener({ type: 'net', strength: 0.7, position: { ...p } });
        if (this.status.phase === 'outgoing' && this.ball.linvel().z >= -1)
          this.finish('Net', p);
      }
    });
    if (this.status.phase === 'incoming' || this.status.phase === 'toss') {
      this.status.contact =
        this.status.phase === 'toss'
          ? clamp(1 - Math.abs(p.y - 2.9), 0, 1)
          : clamp(1 - Math.abs(p.z - this.racket.z) / 4, 0, 1);
      if (this.status.contact > 0.6)
        this.status.message =
          this.status.phase === 'toss'
            ? 'Swing now — meet the toss.'
            : 'Swing now — meet the ball.';
      this.tryContact();
      if (p.z > 13.5 || this.elapsed - this.bornAt > 7) this.finish('Miss', p);
    }
    if (
      this.status.phase === 'outgoing' &&
      (p.y < -0.5 ||
        Math.abs(p.x) > 30 ||
        Math.abs(p.z) > 40 ||
        this.elapsed - this.bornAt > 8)
    )
      this.finish('Out', p);
    if (
      this.status.phase !== 'result' &&
      this.elapsed - this.bornAt > 0.02 &&
      Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z) > 0.0001
    ) {
      this.trace.push({ ...p });
      if (this.trace.length > 720) this.trace.shift();
    }
  }
  reset() {
    this.racketRoll = 0;
    this.racket = {
      x: this.settings.hand === 'right' ? 0.9 : -0.9,
      y: 1.05,
      z: 9.6,
    };
    this.status = { ...INITIAL_STATUS, shots: [] };
    this.trace = [];
    this.lastLanding = null;
    this.queued = null;
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, false);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, false);
    this.ball.setEnabled(false);
    this.ball.setTranslation({ x: 0.8, y: 1.05, z: 9.6 }, false);
  }
  dispose() {
    this.events.free();
    this.world.free();
  }
}
