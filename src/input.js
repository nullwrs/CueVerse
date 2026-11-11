import { BALL_R } from './physics.js';

export class InputController {
  constructor(canvas, renderer, world, rules, callbacks) {
    this.canvas = canvas;
    this.renderer = renderer;
    this.world = world;
    this.rules = rules;
    this.callbacks = callbacks;

    this.aimAngle = 0;
    this.power = 0;
    this.spinX = 0;
    this.spinY = 0;
    this.canShoot = false;
    this.showAim = true;

    this.draggingTable = false;
    this.draggingCueBall = false;
    this.lastPointerAngle = 0;
    this.fineAimActive = false;

    this.bindCanvasEvents();
    this.bindPowerSlider();
    this.bindFineWheel();
    this.bindSpinPad();
  }

  resetForTurn() {
    this.power = 0;
    this.spinX = 0;
    this.spinY = 0;
    this.draggingTable = false;
    this.draggingCueBall = false;
    this.updateSpinUI();
    this.updatePowerUI();
  }

  resetAllDefaults() {
    this.aimAngle = 0;
    this.power = 0;
    this.spinX = 0;
    this.spinY = 0;
    this.draggingTable = false;
    this.draggingCueBall = false;
    this.fineAimActive = false;
    this.updateSpinUI();
    this.updatePowerUI();
  }

  emitAimChange() {
    if (this.canShoot && this.callbacks.onAimChanged) {
      this.callbacks.onAimChanged({
        angle: this.aimAngle,
        power: this.power,
        spinX: this.spinX,
        spinY: this.spinY,
        cueX: this.world.balls[0].x,
        cueY: this.world.balls[0].y,
        calledPocket: this.rules.calledPocket
      });
    }
  }

  bindCanvasEvents() {
    this.canvas.addEventListener('pointerdown', e => {
      if (!this.canShoot || this.world.areBallsMoving()) return;
      this.canvas.setPointerCapture(e.pointerId);
      const pt = this.renderer.screenToTable(e.clientX, e.clientY);
      const cue = this.world.balls[0];

      if (this.rules.mustCallPocket) {
        for (const pk of this.world.pockets) {
          if (Math.hypot(pt.x - pk.x, pt.y - pk.y) < pk.r + 16) {
            this.rules.calledPocket = pk.id;
            if (this.callbacks.onPocketCalled) this.callbacks.onPocketCalled(pk.id);
            this.emitAimChange();
            return;
          }
        }
      }

      if (this.rules.ballInHand && Math.hypot(pt.x - cue.x, pt.y - cue.y) < BALL_R * 2.2) {
        this.draggingCueBall = true;
        return;
      }

      this.draggingTable = true;
      this.lastPointerAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
    });

    this.canvas.addEventListener('pointermove', e => {
      if (!this.canShoot || this.world.areBallsMoving()) return;
      const pt = this.renderer.screenToTable(e.clientX, e.clientY);
      const cue = this.world.balls[0];

      if (this.draggingCueBall && this.rules.ballInHand) {
        const kitchenOnly = this.rules.ballInHand === 'kitchen';
        if (this.world.canPlaceCueBall(pt.x, pt.y, kitchenOnly)) {
          cue.x = pt.x;
          cue.y = pt.y;
          cue.prevX = pt.x;
          cue.prevY = pt.y;
          this.emitAimChange();
        }
        return;
      }

      if (this.draggingTable) {
        const curAngle = Math.atan2(pt.y - cue.y, pt.x - cue.x);
        let delta = curAngle - this.lastPointerAngle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const sensitivity = e.shiftKey || this.fineAimActive ? 0.07 : 0.32;
        this.aimAngle += delta * sensitivity;
        this.lastPointerAngle = curAngle;
        this.emitAimChange();
      }
    });

    const endDrag = () => {
      this.draggingTable = false;
      this.draggingCueBall = false;
    };
    this.canvas.addEventListener('pointerup', endDrag);
    this.canvas.addEventListener('pointercancel', endDrag);
  }

  bindPowerSlider() {
    const track = document.getElementById('power-track');
    if (!track) return;
    let draggingPower = false;

    const updateFromEvent = e => {
      const rect = track.getBoundingClientRect();
      const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.power = relY;
      this.updatePowerUI();
      this.emitAimChange();
    };

    track.addEventListener('pointerdown', e => {
      if (!this.canShoot || this.world.areBallsMoving()) return;
      draggingPower = true;
      track.setPointerCapture(e.pointerId);
      updateFromEvent(e);
    });

    track.addEventListener('pointermove', e => {
      if (!draggingPower) return;
      updateFromEvent(e);
    });

    const releasePower = () => {
      if (!draggingPower) return;
      draggingPower = false;
      if (this.power > 0.04 && this.canShoot && !this.world.areBallsMoving()) {
        const shotPower = this.power;
        this.power = 0;
        this.updatePowerUI();
        this.callbacks.onFireShot({
          angle: this.aimAngle,
          power: shotPower,
          spinX: this.spinX,
          spinY: this.spinY,
          cueX: this.world.balls[0].x,
          cueY: this.world.balls[0].y,
          calledPocket: this.rules.calledPocket
        });
      } else {
        this.power = 0;
        this.updatePowerUI();
        this.emitAimChange();
      }
    };

    track.addEventListener('pointerup', releasePower);
    track.addEventListener('pointercancel', releasePower);
  }

  bindFineWheel() {
    const wheel = document.getElementById('fine-aim-wheel');
    if (!wheel) return;
    let draggingWheel = false;
    let lastY = 0;

    wheel.addEventListener('pointerdown', e => {
      if (!this.canShoot || this.world.areBallsMoving()) return;
      draggingWheel = true;
      lastY = e.clientY;
      wheel.setPointerCapture(e.pointerId);
    });

    wheel.addEventListener('pointermove', e => {
      if (!draggingWheel) return;
      const dy = e.clientY - lastY;
      lastY = e.clientY;
      this.aimAngle += dy * 0.0006;
      this.emitAimChange();
    });

    const stopWheel = () => { draggingWheel = false; };
    wheel.addEventListener('pointerup', stopWheel);
    wheel.addEventListener('pointercancel', stopWheel);
  }

  bindSpinPad() {
    const pad = document.getElementById('spin-pad-circle');
    if (!pad) return;
    let draggingSpin = false;

    const setSpinFromPointer = e => {
      if (!this.canShoot) return;
      const rect = pad.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const r = rect.width * 0.42;
      let sx = (e.clientX - cx) / r;
      let sy = -(e.clientY - cy) / r;
      const mag = Math.hypot(sx, sy);
      if (mag > 1) {
        sx /= mag;
        sy /= mag;
      }
      this.spinX = sx;
      this.spinY = sy;
      this.updateSpinUI();
      this.emitAimChange();
    };

    pad.addEventListener('pointerdown', e => {
      if (!this.canShoot) return;
      draggingSpin = true;
      pad.setPointerCapture(e.pointerId);
      setSpinFromPointer(e);
    });
    pad.addEventListener('pointermove', e => {
      if (draggingSpin) setSpinFromPointer(e);
    });
    const endSpin = () => { draggingSpin = false; };
    pad.addEventListener('pointerup', endSpin);
    pad.addEventListener('pointercancel', endSpin);
  }

  updatePowerUI() {
    const fill = document.getElementById('power-fill');
    const cueGraphic = document.getElementById('power-cue-indicator');
    if (fill) fill.style.height = `${Math.round(this.power * 100)}%`;
    if (cueGraphic) cueGraphic.style.transform = `translateY(${Math.round(this.power * 145)}px)`;
  }

  updateSpinUI() {
    const dot = document.getElementById('spin-pad-dot');
    const miniDot = document.getElementById('hud-spin-dot');
    if (dot) {
      dot.style.left = `${50 + this.spinX * 38}%`;
      dot.style.top = `${50 - this.spinY * 38}%`;
    }
    if (miniDot) {
      miniDot.style.left = `${50 + this.spinX * 34}%`;
      miniDot.style.top = `${50 - this.spinY * 34}%`;
    }
  }
}