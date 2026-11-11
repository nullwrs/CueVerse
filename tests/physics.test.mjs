import test from 'node:test';
import assert from 'node:assert/strict';
import { PhysicsWorld, BALL_R, FIXED_DT } from '../src/physics.js';
import { MAPS } from '../src/maps.js';
const energy = b => .5 * (b.vx ** 2 + b.vy ** 2) + .2 * BALL_R ** 2 * (b.wx ** 2 + b.wy ** 2 + b.wz ** 2);
function pair() {
  const w = new PhysicsWorld();
  w.balls.forEach(b => b.active = false);
  Object.assign(w.balls[0], {active:true, x:300, y:250, vx:500});
  Object.assign(w.balls[1], {active:true, x:327.9, y:250});
  return w;
}
test('head-on contact conserves momentum and loses energy', () => {
  const w = pair(), [a,b] = w.balls;
  const before = energy(a) + energy(b);
  w.resolveBallCollisions();
  assert.ok(Math.abs(a.vx + b.vx - 500) < 1e-9);
  assert.ok(a.vx < 20 && b.vx > 470 && b.vx < 500);
  assert.ok(energy(a) + energy(b) <= before);
});
test('oblique spinning contacts never create energy', () => {
  for (let k = 0; k < 100; k++) {
    const w = pair(), [a,b] = w.balls;
    a.vy = Math.sin(k) * 600; a.wz = Math.cos(k) * 70; b.wz = Math.sin(k * 2) * 50;
    const before = energy(a) + energy(b);
    w.resolveBallCollisions();
    assert.ok(energy(a) + energy(b) <= before + 1e-8);
  }
});
test('rail friction accounts for rotational energy', () => {
  for (let k = 0; k < 100; k++) {
    const w = pair(), b = w.balls[0]; w.balls[1].active = false;
    Object.assign(b, {x:300, y:13.9, vx:Math.sin(k)*500, vy:-300, wz:Math.cos(k)*80});
    const before = energy(b);
    w.resolveRailCollisions();
    assert.ok(b.vy > 0);
    assert.ok(energy(b) <= before + 1e-8);
  }
});
test('cloth reaches rolling without creating energy, including draw', () => {
  for (const spin of [-1, 0, 1]) {
    const w = pair(), b = w.balls[0]; w.balls[1].active = false;
    w.strikeCueBall(0, .6, 0, spin);
    for (let i = 0; i < 12000; i++) {
      const before = energy(b);
      w.integrateMotion(FIXED_DT);
      assert.ok(energy(b) <= before + 1e-7);
    }
    assert.equal(b.vx, 0);
    assert.equal(b.wy, 0);
  }
});
test('draw and follow develop through cloth after contact', () => {
  for (const sign of [-1, 1]) {
    const w = pair(), b = w.balls[0];
    b.wy = sign * 500 / BALL_R;
    w.resolveBallCollisions();
    for (let i = 0; i < 60; i++) w.integrateMotion(FIXED_DT);
    assert.ok(b.vx * sign > 20);
  }
});
test('all club breaks settle, remain finite, and reproduce deterministically', () => {
  for (const map of MAPS) {
    const run = () => {
      const w = new PhysicsWorld(); w.configure(map.physics); w.setupRack(map.mode, 42);
      w.strikeCueBall(0, 1, .3, -.4);
      let i = 0;
      while (w.areBallsMoving() && i++ < 12000) {w.simulateFixedStep(FIXED_DT); w.eventCount = 0;}
      assert.ok(i < 12000, map.id + ' should settle');
      assert.ok(w.balls.every(b => Number.isFinite(b.x) && Number.isFinite(b.y)));
      assert.ok(w.balls.filter(b => b.active).every(b => b.x >= 0 && b.x <= 1000 && b.y >= 0 && b.y <= 500), map.id + ' balls stay on table');
      return w.serializeSnapshot();
    };
    assert.deepEqual(run(), run());
  }
});
