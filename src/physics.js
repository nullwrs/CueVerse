export const TABLE_W = 1000;
export const TABLE_H = 500;
export const BALL_R = 14;
export const FIXED_DT = 1 / 240;
export const MAX_SPEED = 1600;
// Table units use a standard 57.15 mm pool ball.
const GRAVITY = 9.81 * (BALL_R * 2 / 0.05715);
const STOP_EPS = 2.0;
const SPIN_EPS = 0.2;

export class SeededRNG {
  constructor(seed = 123456789) {
    this.state = seed >>> 0;
  }
  setSeed(seed) {
    this.state = (seed >>> 0) || 123456789;
  }
  next() {
    let t = (this.state += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
}

function createIdentityMat3() {
  const m = new Float64Array(9);
  m[0] = 1; m[4] = 1; m[8] = 1;
  return m;
}

function rotateMat3(m, wx, wy, wz, dt) {
  const wMag = Math.hypot(wx, wy, wz);
  if (wMag < 1e-6) return;
  const angle = wMag * dt;
  const ax = wx / wMag;
  const ay = wy / wMag;
  const az = wz / wMag;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;

  const r00 = c + ax * ax * t;
  const r01 = ax * ay * t - az * s;
  const r02 = ax * az * t + ay * s;
  const r10 = ay * ax * t + az * s;
  const r11 = c + ay * ay * t;
  const r12 = ay * az * t - ax * s;
  const r20 = az * ax * t - ay * s;
  const r21 = az * ay * t + ax * s;
  const r22 = c + az * az * t;

  const m0 = m[0], m1 = m[1], m2 = m[2];
  const m3 = m[3], m4 = m[4], m5 = m[5];
  const m6 = m[6], m7 = m[7], m8 = m[8];

  m[0] = r00 * m0 + r01 * m3 + r02 * m6;
  m[1] = r00 * m1 + r01 * m4 + r02 * m7;
  m[2] = r00 * m2 + r01 * m5 + r02 * m8;
  m[3] = r10 * m0 + r11 * m3 + r12 * m6;
  m[4] = r10 * m1 + r11 * m4 + r12 * m7;
  m[5] = r10 * m2 + r11 * m5 + r12 * m8;
  m[6] = r20 * m0 + r21 * m3 + r22 * m6;
  m[7] = r20 * m1 + r21 * m4 + r22 * m7;
  m[8] = r20 * m2 + r21 * m5 + r22 * m8;
}

export class PhysicsWorld {
  constructor() {
    this.rng = new SeededRNG(987654321);
    this.balls = [];
    for (let i = 0; i < 16; i++) {
      this.balls.push({
        id: i,
        x: 0,
        y: 0,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        wx: 0,
        wy: 0,
        wz: 0,
        topSpin: 0,
        slidingTime: 0,
        active: true,
        inChute: false,
        chuteProgress: 0,
        chuteTargetY: 0,
        pocketId: -1,
        rot: createIdentityMat3()
      });
    }

    this.params = {
      slideFriction: 0.20,
      rollFriction: 0.016,
      spinDecay: 2.8,
      restitutionBall: 0.95,
      restitutionRail: 0.78,
      pocketRadiusScale: 1.0
    };

    this.pockets = [];
    this.segments = [];
    this.buildTableGeometry(1.0);

    this.accumulator = 0;
    this.alpha = 1;
    this.lastStepCount = 0;
    this.collisionCount = 0;

    this.eventQueue = [];
    this.eventCount = 0;
    for (let i = 0; i < 128; i++) {
      this.eventQueue.push({ type: '', a: 0, b: 0, speed: 0, pocketId: 0 });
    }

    this.rayResult = {
      hitX: 0,
      hitY: 0,
      hitBallId: -1,
      objDirX: 0,
      objDirY: 0,
      cueDeflectX: 0,
      cueDeflectY: 0
    };
  }

  configure(physicsConfig) {
    Object.assign(this.params, physicsConfig);
    this.buildTableGeometry(this.params.pocketRadiusScale || 1.0);
  }

  buildTableGeometry(scale) {
    const cornerR = 30 * scale;
    const sideR = 26 * scale;
    this.pockets = [
      { id: 0, x: 8, y: 8, r: cornerR },
      { id: 1, x: TABLE_W / 2, y: -4, r: sideR },
      { id: 2, x: TABLE_W - 8, y: 8, r: cornerR },
      { id: 3, x: 8, y: TABLE_H - 8, r: cornerR },
      { id: 4, x: TABLE_W / 2, y: TABLE_H + 4, r: sideR },
      { id: 5, x: TABLE_W - 8, y: TABLE_H - 8, r: cornerR }
    ];

    const cGap = 36 * scale;
    const sGap = 28 * scale;
    const jawDepth = 16;

    this.segments = [
      { x1: cGap, y1: 0, x2: TABLE_W / 2 - sGap, y2: 0 },
      { x1: cGap - jawDepth, y1: -jawDepth, x2: cGap, y2: 0 },
      { x1: TABLE_W / 2 - sGap, y1: 0, x2: TABLE_W / 2 - sGap + 8, y2: -jawDepth },

      { x1: TABLE_W / 2 + sGap, y1: 0, x2: TABLE_W - cGap, y2: 0 },
      { x1: TABLE_W / 2 + sGap - 8, y1: -jawDepth, x2: TABLE_W / 2 + sGap, y2: 0 },
      { x1: TABLE_W - cGap, y1: 0, x2: TABLE_W - cGap + jawDepth, y2: -jawDepth },

      { x1: TABLE_W, y1: cGap, x2: TABLE_W, y2: TABLE_H - cGap },
      { x1: TABLE_W + jawDepth, y1: cGap - jawDepth, x2: TABLE_W, y2: cGap },
      { x1: TABLE_W, y1: TABLE_H - cGap, x2: TABLE_W + jawDepth, y2: TABLE_H - cGap + jawDepth },

      { x1: TABLE_W - cGap, y1: TABLE_H, x2: TABLE_W / 2 + sGap, y2: TABLE_H },
      { x1: TABLE_W - cGap + jawDepth, y1: TABLE_H + jawDepth, x2: TABLE_W - cGap, y2: TABLE_H },
      { x1: TABLE_W / 2 + sGap, y1: TABLE_H, x2: TABLE_W / 2 + sGap - 8, y2: TABLE_H + jawDepth },

      { x1: TABLE_W / 2 - sGap, y1: TABLE_H, x2: cGap, y2: TABLE_H },
      { x1: TABLE_W / 2 - sGap + 8, y1: TABLE_H + jawDepth, x2: TABLE_W / 2 - sGap, y2: TABLE_H },
      { x1: cGap, y1: TABLE_H, x2: cGap - jawDepth, y2: TABLE_H + jawDepth },

      { x1: 0, y1: TABLE_H - cGap, x2: 0, y2: cGap },
      { x1: -jawDepth, y1: TABLE_H - cGap + jawDepth, x2: 0, y2: TABLE_H - cGap },
      { x1: 0, y1: cGap, x2: -jawDepth, y2: cGap - jawDepth }
    ];

    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i];
      const dx = s.x2 - s.x1;
      const dy = s.y2 - s.y1;
      const len = Math.hypot(dx, dy) || 1;
      s.tx = dx / len;
      s.ty = dy / len;
      s.nx = -s.ty;
      s.ny = s.tx;
      s.len = len;
    }
  }

  pushEvent(type, a, b, speed, pocketId = -1) {
    if (this.eventCount >= this.eventQueue.length) return;
    const ev = this.eventQueue[this.eventCount++];
    ev.type = type;
    ev.a = a;
    ev.b = b;
    ev.speed = speed;
    ev.pocketId = pocketId;
  }

  setupRack(mode = '8ball', seed = 20261111) {
    this.rng.setSeed(seed);
    this.accumulator = 0;
    this.eventCount = 0;

    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      b.vx = 0; b.vy = 0;
      b.wx = 0; b.wy = 0; b.wz = 0;
      b.topSpin = 0;
      b.slidingTime = 0;
      b.inChute = false;
      b.chuteProgress = 0;
      b.pocketId = -1;
      b.rot.fill(0);
      b.rot[0] = 1; b.rot[4] = 1; b.rot[8] = 1;
      rotateMat3(b.rot, this.rng.range(-2, 2), this.rng.range(-2, 2), this.rng.range(-2, 2), 0.35);
    }

    const cue = this.balls[0];
    cue.active = true;
    cue.x = TABLE_W * 0.25;
    cue.y = TABLE_H * 0.5;
    cue.prevX = cue.x;
    cue.prevY = cue.y;

    const apexX = TABLE_W * 0.73;
    const apexY = TABLE_H * 0.5;
    const rowDx = Math.sqrt(3) * (BALL_R + 0.15);
    const colDy = (BALL_R + 0.15) * 2;

    if (mode === '9ball') {
      for (let i = 1; i < 16; i++) this.balls[i].active = i <= 9;
      const diamondCoords = [
        [0, 0],
        [1, -0.5], [1, 0.5],
        [2, -1], [2, 0], [2, 1],
        [3, -0.5], [3, 0.5],
        [4, 0]
      ];
      const order = [1, 2, 3, 4, 9, 5, 6, 7, 8];
      for (let idx = 0; idx < 9; idx++) {
        const b = this.balls[order[idx]];
        const [r, c] = diamondCoords[idx];
        b.x = apexX + r * rowDx + this.rng.range(-0.08, 0.08);
        b.y = apexY + c * colDy + this.rng.range(-0.08, 0.08);
        b.prevX = b.x;
        b.prevY = b.y;
      }
      return;
    }

    for (let i = 1; i < 16; i++) this.balls[i].active = true;
    const rackIds = [
      1,
      9, 2,
      3, 8, 10,
      11, 4, 12, 5,
      6, 13, 14, 15, 7
    ];
    let k = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col <= row; col++) {
        const id = rackIds[k++];
        const b = this.balls[id];
        const offsetY = (col - row * 0.5) * colDy;
        b.x = apexX + row * rowDx + this.rng.range(-0.08, 0.08);
        b.y = apexY + offsetY + this.rng.range(-0.08, 0.08);
        b.prevX = b.x;
        b.prevY = b.y;
      }
    }
  }

  strikeCueBall(angle, power, spinX, spinY) {
    const cue = this.balls[0];
    if (!cue.active) return;
    const clampedPower = Math.max(0.03, Math.min(1, power));
    const speed = Math.pow(clampedPower, 1.65) * MAX_SPEED;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    cue.vx = dirX * speed;
    cue.vy = dirY * speed;
    // A center strike starts sliding; cloth friction creates natural roll.
    const spinLength = Math.max(1, Math.hypot(spinX, spinY));
    const follow = spinY / spinLength * 1.25;
    cue.topSpin = 0;
    cue.wz = spinX / spinLength * speed / BALL_R * 0.8;
    cue.wx = -dirY * speed / BALL_R * follow;
    cue.wy = dirX * speed / BALL_R * follow;
  }

  areBallsMoving() {
    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      if (Math.hypot(b.vx, b.vy) > STOP_EPS * 0.5 || Math.hypot(b.wx, b.wy) * BALL_R > STOP_EPS) {
        return true;
      }
    }
    return false;
  }

  step(frameDt) {
    const clampedDt = Math.min(frameDt, 0.05);
    this.accumulator += clampedDt;
    this.lastStepCount = 0;
    this.collisionCount = 0;

    while (this.accumulator >= FIXED_DT) {
      this.savePreviousPositions();
      this.simulateFixedStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
      this.lastStepCount++;
    }
    this.alpha = this.accumulator / FIXED_DT;
    this.updateChuteAnimations(clampedDt);
  }

  savePreviousPositions() {
    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      b.prevX = b.x;
      b.prevY = b.y;
    }
  }

  simulateFixedStep(dt) {
    let maxVel = 0;
    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      const v = Math.hypot(b.vx, b.vy);
      if (v > maxVel) maxVel = v;
    }

    const maxStepDist = BALL_R * 0.35;
    const subSteps = Math.max(1, Math.min(8, Math.ceil((maxVel * dt) / maxStepDist)));
    const subDt = dt / subSteps;

    for (let s = 0; s < subSteps; s++) {
      this.integrateMotion(subDt);
      this.resolveBallCollisions();
      this.resolveRailCollisions();
      this.checkPockets();
    }
  }

  integrateMotion(dt) {
    const muS = this.params.slideFriction;
    const muR = this.params.rollFriction;
    const spinDecay = this.params.spinDecay;

    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // Contact velocity at the cloth; I = 2/5 m r² for a solid sphere.
      const slipX = b.vx - BALL_R * b.wy;
      const slipY = b.vy + BALL_R * b.wx;
      const slip = Math.hypot(slipX, slipY);
      if (slip > 1e-6) {
        // Cap friction at the impulse that reaches rolling, avoiding overshoot.
        const impulse = Math.min(muS * GRAVITY * dt, slip / 3.5);
        const jx = -slipX / slip * impulse;
        const jy = -slipY / slip * impulse;
        b.vx += jx;
        b.vy += jy;
        b.wx += 2.5 * jy / BALL_R;
        b.wy -= 2.5 * jx / BALL_R;
      }
      if (slip <= 3.5 * muS * GRAVITY * dt + 1e-6) {
        const speed = Math.hypot(b.vx, b.vy);
        const nextSpeed = Math.max(0, speed - muR * GRAVITY * dt);
        const ratio = speed > STOP_EPS ? nextSpeed / speed : 0;
        b.vx *= ratio;
        b.vy *= ratio;
        b.wx = -b.vy / BALL_R;
        b.wy = b.vx / BALL_R;
      }
      rotateMat3(b.rot, b.wx, b.wy, b.wz, dt);

      if (Math.abs(b.wz) > SPIN_EPS) {
        const sign = b.wz > 0 ? 1 : -1;
        b.wz -= sign * spinDecay * 14 * dt;
        if (b.wz * sign < 0) b.wz = 0;
      } else {
        b.wz = 0;
      }
    }
  }

  resolveBallCollisions() {
    const minDist = BALL_R * 2;
    const minDistSq = minDist * minDist;
    const e = this.params.restitutionBall;
    const throwMu = 0.03;

    for (let i = 0; i < 16; i++) {
      const a = this.balls[i];
      if (!a.active) continue;

      for (let j = i + 1; j < 16; j++) {
        const b = this.balls[j];
        if (!b.active) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < minDistSq && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          const overlap = minDist - dist;
          a.x -= nx * overlap * 0.5;
          a.y -= ny * overlap * 0.5;
          b.x += nx * overlap * 0.5;
          b.y += ny * overlap * 0.5;

          const rvx = a.vx - b.vx;
          const rvy = a.vy - b.vy;
          const velAlongNormal = rvx * nx + rvy * ny;

          if (velAlongNormal > 0) {
            const jNorm = (1 + e) * 0.5 * velAlongNormal;
            a.vx -= jNorm * nx;
            a.vy -= jNorm * ny;
            b.vx += jNorm * nx;
            b.vy += jNorm * ny;

            const tx = -ny;
            const ty = nx;
            const relTan = rvx * tx + rvy * ty + BALL_R * (a.wz + b.wz);
            const jTan = Math.max(-throwMu * jNorm, Math.min(throwMu * jNorm, -relTan / 7));

            a.vx += jTan * tx;
            a.vy += jTan * ty;
            b.vx -= jTan * tx;
            b.vy -= jTan * ty;

            // Equal tangential impulses also change both contact spins.
            a.wz += 2.5 * jTan / BALL_R;
            b.wz += 2.5 * jTan / BALL_R;

            this.collisionCount++;
            this.pushEvent('ball', a.id, b.id, velAlongNormal);
          }
        }
      }
    }
  }

  resolveRailCollisions() {
    const eRail = this.params.restitutionRail;

    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;

      let nearPocket = false;
      for (let p = 0; p < 6; p++) {
        const pk = this.pockets[p];
        if (Math.hypot(b.x - pk.x, b.y - pk.y) < pk.r * 0.92) {
          nearPocket = true;
          break;
        }
      }
      if (nearPocket) continue;

      for (let s = 0; s < this.segments.length; s++) {
        const seg = this.segments[s];
        const relX = b.x - seg.x1;
        const relY = b.y - seg.y1;
        const proj = Math.max(0, Math.min(seg.len, relX * seg.tx + relY * seg.ty));
        const closestX = seg.x1 + seg.tx * proj;
        const closestY = seg.y1 + seg.ty * proj;

        const dx = b.x - closestX;
        const dy = b.y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < BALL_R * BALL_R && distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          b.x = closestX + nx * BALL_R;
          b.y = closestY + ny * BALL_R;

          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            const tx = -ny;
            const ty = nx;
            const vt = b.vx * tx + b.vy * ty;

            const normalImpulse = -(1 + eRail) * vn;
            const slip = vt - b.wz * BALL_R;
            const tangentImpulse = Math.max(-0.14 * normalImpulse,
              Math.min(0.14 * normalImpulse, -slip / 3.5));
            b.vx += nx * normalImpulse + tx * tangentImpulse;
            b.vy += ny * normalImpulse + ty * tangentImpulse;
            b.wz -= 2.5 * tangentImpulse / BALL_R;

            this.collisionCount++;
            this.pushEvent('rail', b.id, s, Math.abs(vn));
          }
        }
      }
    }
  }

  checkPockets() {
    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;

      for (let p = 0; p < 6; p++) {
        const pk = this.pockets[p];
        const dist = Math.hypot(b.x - pk.x, b.y - pk.y);
        if (dist < pk.r) {
          b.active = false;
          b.vx = 0; b.vy = 0;
          b.wx = 0; b.wy = 0; b.wz = 0;
          b.topSpin = 0;
          b.pocketId = pk.id;
          if (b.id !== 0) {
            this.enqueueBallIntoChute(b);
          }
          this.pushEvent('pocket', b.id, pk.id, 0, pk.id);
          break;
        }
      }
    }
  }

  enqueueBallIntoChute(ball) {
    let countInChute = 0;
    for (let i = 1; i < 16; i++) {
      if (this.balls[i].inChute) countInChute++;
    }
    ball.inChute = true;
    ball.chuteProgress = 0;
    ball.chuteTargetY = 455 - countInChute * (BALL_R * 2.05);
  }

  updateChuteAnimations(dt) {
    for (let i = 1; i < 16; i++) {
      const b = this.balls[i];
      if (!b.inChute) continue;
      if (b.chuteProgress < 1) {
        b.chuteProgress = Math.min(1, b.chuteProgress + dt * 1.45);
        rotateMat3(b.rot, 14, 0, 0, dt);
      }
    }
  }

  canPlaceCueBall(x, y, kitchenOnly = false) {
    const margin = BALL_R + 4;
    const maxX = kitchenOnly ? TABLE_W * 0.25 : TABLE_W - margin;
    if (x < margin || x > maxX || y < margin || y > TABLE_H - margin) {
      return false;
    }
    for (let p = 0; p < 6; p++) {
      const pk = this.pockets[p];
      if (Math.hypot(x - pk.x, y - pk.y) < pk.r + BALL_R * 0.6) {
        return false;
      }
    }
    for (let i = 1; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      if (Math.hypot(x - b.x, y - b.y) < BALL_R * 2.08) {
        return false;
      }
    }
    return true;
  }

  raycastAim(angle, spinX = 0, spinY = 0) {
    const cue = this.balls[0];
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const res = this.rayResult;

    let minT = Infinity;
    let hitBall = null;
    const twoR = BALL_R * 2;

    for (let i = 1; i < 16; i++) {
      const b = this.balls[i];
      if (!b.active) continue;
      const fx = cue.x - b.x;
      const fy = cue.y - b.y;
      const proj = fx * dirX + fy * dirY;
      if (proj >= 0) continue;
      const c = fx * fx + fy * fy - twoR * twoR;
      const disc = proj * proj - c;
      if (disc >= 0) {
        const t = -proj - Math.sqrt(disc);
        if (t >= 0 && t < minT) {
          minT = t;
          hitBall = b;
        }
      }
    }

    let railT = Infinity;
    let railNx = 0;
    let railNy = 0;
    if (dirX < -1e-6) {
      const t = (BALL_R - cue.x) / dirX;
      if (t > 0 && t < railT) { railT = t; railNx = 1; railNy = 0; }
    } else if (dirX > 1e-6) {
      const t = (TABLE_W - BALL_R - cue.x) / dirX;
      if (t > 0 && t < railT) { railT = t; railNx = -1; railNy = 0; }
    }
    if (dirY < -1e-6) {
      const t = (BALL_R - cue.y) / dirY;
      if (t > 0 && t < railT) { railT = t; railNx = 0; railNy = 1; }
    } else if (dirY > 1e-6) {
      const t = (TABLE_H - BALL_R - cue.y) / dirY;
      if (t > 0 && t < railT) { railT = t; railNx = 0; railNy = -1; }
    }

    if (hitBall && minT < railT) {
      res.hitX = cue.x + dirX * minT;
      res.hitY = cue.y + dirY * minT;
      res.hitBallId = hitBall.id;
      const nx = (hitBall.x - res.hitX) / twoR;
      const ny = (hitBall.y - res.hitY) / twoR;
      res.objDirX = nx;
      res.objDirY = ny;

      const dot = dirX * nx + dirY * ny;
      let tx = dirX - dot * nx;
      let ty = dirY - dot * ny;
      const tLen = Math.hypot(tx, ty);
      if (tLen > 1e-4) {
        tx /= tLen;
        ty /= tLen;
      }
      res.cueDeflectX = tx + nx * spinY * 0.55 - ny * spinX * 0.15;
      res.cueDeflectY = ty + ny * spinY * 0.55 + nx * spinX * 0.15;
    } else {
      res.hitX = cue.x + dirX * railT;
      res.hitY = cue.y + dirY * railT;
      res.hitBallId = -1;
      res.objDirX = 0;
      res.objDirY = 0;
      const dot = dirX * railNx + dirY * railNy;
      res.cueDeflectX = dirX - 2 * dot * railNx;
      res.cueDeflectY = dirY - 2 * dot * railNy;
    }

    return res;
  }

  serializeSnapshot() {
    const out = [];
    for (let i = 0; i < 16; i++) {
      const b = this.balls[i];
      out.push({
        id: b.id,
        x: Math.round(b.x * 1000) / 1000,
        y: Math.round(b.y * 1000) / 1000,
        active: b.active,
        inChute: b.inChute,
        chuteTargetY: b.chuteTargetY
      });
    }
    return out;
  }

  applySnapshot(snap) {
    if (!Array.isArray(snap)) return;
    for (let i = 0; i < snap.length; i++) {
      const s = snap[i];
      const b = this.balls[s.id];
      if (!b) continue;
      b.x = s.x;
      b.y = s.y;
      b.prevX = s.x;
      b.prevY = s.y;
      b.vx = 0; b.vy = 0;
      b.wx = 0; b.wy = 0; b.wz = 0;
      b.topSpin = 0;
      b.slidingTime = 0;
      b.active = s.active;
      b.inChute = s.inChute;
      b.chuteTargetY = s.chuteTargetY;
      if (b.inChute) b.chuteProgress = 1;
    }
  }
}