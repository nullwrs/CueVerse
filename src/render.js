import { TABLE_W, TABLE_H, BALL_R } from './physics.js';

const BALL_COLORS = [
  '#F7F7F2',
  '#F5B700',
  '#1E56DF',
  '#E02828',
  '#6E2594',
  '#F26419',
  '#1B994B',
  '#7B1E22',
  '#16181D',
  '#F5B700',
  '#1E56DF',
  '#E02828',
  '#6E2594',
  '#F26419',
  '#1B994B',
  '#7B1E22'
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tableCache = document.createElement('canvas');
    this.tableCtx = this.tableCache.getContext('2d');

    this.padX = 76;
    this.padY = 66;
    this.chuteWidth = 58;
    this.logicalW = TABLE_W + this.padX * 2 + this.chuteWidth;
    this.logicalH = TABLE_H + this.padY * 2;

    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dpr = 1;
    this.quality = 'high';
    this.flipped = false;
    this.debugMode = false;
    this.fps = 60;
    this.currentMap = null;

    this.particles = [];
    for (let i = 0; i < 48; i++) {
      this.particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', r: 3 });
    }

    this.resize();
  }

  setQuality(level) {
    this.quality = level;
    if (this.currentMap) {
      this.bakeTable(this.currentMap, this.lastPockets);
    }
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dprCap = this.quality === 'low' ? 1 : (this.quality === 'medium' ? 1.5 : 2);
    this.dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));

    const scaleX = this.canvas.width / this.logicalW;
    const scaleY = this.canvas.height / this.logicalH;
    this.scale = Math.min(scaleX, scaleY) * 0.96;
    this.offsetX = (this.canvas.width - this.logicalW * this.scale) * 0.5 + this.padX * this.scale;
    this.offsetY = (this.canvas.height - this.logicalH * this.scale) * 0.5 + this.padY * this.scale;
  }

  screenToTable(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * this.dpr;
    const py = (clientY - rect.top) * this.dpr;
    let tx = (px - this.offsetX) / this.scale;
    let ty = (py - this.offsetY) / this.scale;
    if (this.flipped) {
      tx = TABLE_W - tx;
      ty = TABLE_H - ty;
    }
    return { x: tx, y: ty };
  }

  bakeTable(mapConfig, pockets) {
    this.currentMap = mapConfig;
    this.lastPockets = pockets;
    const w = this.logicalW;
    const h = this.logicalH;
    this.tableCache.width = w;
    this.tableCache.height = h;
    const ctx = this.tableCtx;
    const ox = this.padX;
    const oy = this.padY;
    const th = mapConfig.theme;

    ctx.clearRect(0, 0, w, h);

    const frameX = ox - 52;
    const frameY = oy - 52;
    const frameW = TABLE_W + 104;
    const frameH = TABLE_H + 104;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 32;
    ctx.shadowOffsetY = 14;
    this.roundRect(ctx, frameX, frameY, frameW, frameH, 34);
    const railGrad = ctx.createLinearGradient(frameX, frameY, frameX, frameY + frameH);
    railGrad.addColorStop(0, th.railColor);
    railGrad.addColorStop(0.5, th.railSecondary || '#1d140f');
    railGrad.addColorStop(1, th.railColor);
    ctx.fillStyle = railGrad;
    ctx.fill();
    ctx.restore();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = th.railTrim;
    this.roundRect(ctx, frameX + 4, frameY + 4, frameW - 8, frameH - 8, 30);
    ctx.stroke();

    ctx.fillStyle = th.cushionColor || th.clothAccent;
    this.roundRect(ctx, ox - 18, oy - 18, TABLE_W + 36, TABLE_H + 36, 16);
    ctx.fill();

    const clothGrad = ctx.createRadialGradient(
      ox + TABLE_W * 0.5, oy + TABLE_H * 0.5, 40,
      ox + TABLE_W * 0.5, oy + TABLE_H * 0.5, TABLE_W * 0.65
    );
    clothGrad.addColorStop(0, th.clothColor);
    clothGrad.addColorStop(1, th.clothAccent);
    ctx.fillStyle = clothGrad;
    ctx.fillRect(ox, oy, TABLE_W, TABLE_H);

    if (this.quality !== 'low') {
      ctx.fillStyle = 'rgba(255,255,255,0.018)';
      for (let y = oy; y < oy + TABLE_H; y += 4) {
        for (let x = ox + ((y % 8) ? 2 : 0); x < ox + TABLE_W; x += 6) {
          ctx.fillRect(x, y, 2, 2);
        }
      }
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ox + TABLE_W * 0.25, oy);
    ctx.lineTo(ox + TABLE_W * 0.25, oy + TABLE_H);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.arc(ox + TABLE_W * 0.73, oy + TABLE_H * 0.5, 3.5, 0, Math.PI * 2);
    ctx.fill();

    this.drawMapEmblem(ctx, ox + TABLE_W * 0.52, oy + TABLE_H * 0.5, th.emblemType, th.railTrim);

    ctx.strokeStyle = 'rgba(0,0,0,0.48)';
    ctx.lineWidth = 10;
    ctx.strokeRect(ox + 3, oy + 3, TABLE_W - 6, TABLE_H - 6);

    ctx.fillStyle = th.railTrim;
    const sightsX = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875];
    for (const sx of sightsX) {
      this.drawDiamond(ctx, ox + TABLE_W * sx, oy - 34, 5);
      this.drawDiamond(ctx, ox + TABLE_W * sx, oy + TABLE_H + 34, 5);
    }
    const sightsY = [0.25, 0.5, 0.75];
    for (const sy of sightsY) {
      this.drawDiamond(ctx, ox - 34, oy + TABLE_H * sy, 5);
      this.drawDiamond(ctx, ox + TABLE_W + 34, oy + TABLE_H * sy, 5);
    }

    if (pockets) {
      for (const pk of pockets) {
        const px = ox + pk.x;
        const py = oy + pk.y;
        ctx.beginPath();
        ctx.arc(px, py, pk.r + 7, 0, Math.PI * 2);
        ctx.fillStyle = '#272a33';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = th.railTrim;
        ctx.stroke();

        const pGrad = ctx.createRadialGradient(px - 3, py - 3, 4, px, py, pk.r + 2);
        pGrad.addColorStop(0, '#040507');
        pGrad.addColorStop(0.75, '#0b0e14');
        pGrad.addColorStop(1, '#1b1f29');
        ctx.beginPath();
        ctx.arc(px, py, pk.r + 1, 0, Math.PI * 2);
        ctx.fillStyle = pGrad;
        ctx.fill();
      }
    }

    const chuteX = ox + TABLE_W + 66;
    const chuteTop = oy + 70;
    const chuteBot = oy + TABLE_H - 18;
    ctx.strokeStyle = '#3b4254';
    ctx.lineWidth = 34;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox + TABLE_W + 34, chuteTop);
    ctx.lineTo(chuteX, chuteTop);
    ctx.lineTo(chuteX, chuteBot);
    ctx.stroke();

    ctx.strokeStyle = '#0d1017';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(ox + TABLE_W + 34, chuteTop);
    ctx.lineTo(chuteX, chuteTop);
    ctx.lineTo(chuteX, chuteBot);
    ctx.stroke();
  }

  drawMapEmblem(ctx, cx, cy, type, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.035;
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(0, 0, 92, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 82, 0, Math.PI * 2);
    ctx.stroke();

    if (type === 'crown') {
      ctx.beginPath();
      ctx.moveTo(-45, 28);
      ctx.lineTo(-52, -22);
      ctx.lineTo(-22, 4);
      ctx.lineTo(0, -36);
      ctx.lineTo(22, 4);
      ctx.lineTo(52, -22);
      ctx.lineTo(45, 28);
      ctx.closePath();
      ctx.stroke();
    } else if (type === 'torii') {
      ctx.fillRect(-56, -34, 112, 8);
      ctx.fillRect(-44, -14, 88, 6);
      ctx.fillRect(-32, -28, 8, 72);
      ctx.fillRect(24, -28, 8, 72);
    } else if (type === 'pyramid') {
      ctx.beginPath();
      ctx.moveTo(0, -46);
      ctx.lineTo(54, 36);
      ctx.lineTo(-54, 36);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 4, 14, 0, Math.PI * 2);
      ctx.stroke();
    } else if (type === 'star') {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 52 : 22;
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -48);
      ctx.bezierCurveTo(48, -10, 48, 28, 0, 22);
      ctx.bezierCurveTo(-48, 28, -48, -10, 0, -48);
      ctx.stroke();
      ctx.fillRect(-8, 18, 16, 26);
    }
    ctx.restore();
  }

  drawDiamond(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
    ctx.fill();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  render(world, rules, inputState, dt) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    if (this.flipped) {
      ctx.translate(TABLE_W * 0.5, TABLE_H * 0.5);
      ctx.rotate(Math.PI);
      ctx.translate(-TABLE_W * 0.5, -TABLE_H * 0.5);
    }

    ctx.drawImage(this.tableCache, -this.padX, -this.padY);

    if (rules.mustCallPocket && inputState.canShoot) {
      for (const pk of world.pockets) {
        const isSelected = pk.id === rules.calledPocket;
        ctx.save();
        ctx.beginPath();
        ctx.arc(pk.x, pk.y, pk.r + 5, 0, Math.PI * 2);
        ctx.lineWidth = isSelected ? 4 : 2;
        ctx.strokeStyle = isSelected ? '#00f5a0' : 'rgba(255, 215, 0, 0.45)';
        ctx.stroke();
        if (isSelected) {
          ctx.fillStyle = 'rgba(0, 245, 160, 0.22)';
          ctx.fill();
        }
        ctx.restore();
      }
    }

    if (rules.ballInHand && inputState.canShoot) {
      const maxX = rules.ballInHand === 'kitchen' ? TABLE_W * 0.25 : TABLE_W;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.07)';
      ctx.fillRect(0, 0, maxX, TABLE_H);
    }

    const alpha = world.alpha;
    if (this.quality !== 'low') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      for (let i = 0; i < 16; i++) {
        const b = world.balls[i];
        if (!b.active) continue;
        const bx = b.prevX + (b.x - b.prevX) * alpha;
        const by = b.prevY + (b.y - b.prevY) * alpha;
        ctx.beginPath();
        ctx.arc(bx + 3.5, by + 4.5, BALL_R * 0.98, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = 0; i < 16; i++) {
      const b = world.balls[i];
      if (b.active) {
        const bx = b.prevX + (b.x - b.prevX) * alpha;
        const by = b.prevY + (b.y - b.prevY) * alpha;
        this.drawBall(ctx, b, bx, by);
      } else if (b.inChute) {
        const chuteX = TABLE_W + 66;
        const startY = 75;
        const cy = startY + (b.chuteTargetY - startY) * b.chuteProgress;
        this.drawBall(ctx, b, chuteX, cy);
      }
    }

    this.updateAndDrawParticles(ctx, dt);

    if (inputState.canShoot && !world.areBallsMoving() && world.balls[0].active) {
      this.drawAimAndCue(ctx, world, rules, inputState);
    }

    if (this.debugMode) {
      this.drawDebugOverlay(ctx, world);
    }

    ctx.restore();
  }

  drawBall(ctx, b, x, y) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, BALL_R, 0, Math.PI * 2);
    ctx.clip();

    const color = BALL_COLORS[b.id];
    const isStripe = b.id >= 9;

    if (isStripe) {
      ctx.fillStyle = '#F5F5F0';
      ctx.fillRect(x - BALL_R, y - BALL_R, BALL_R * 2, BALL_R * 2);

      const uzx = b.rot[2];
      const uzy = b.rot[5];
      const bandAngle = Math.atan2(uzy, uzx);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(bandAngle);
      ctx.fillStyle = color;
      ctx.fillRect(-BALL_R * 1.2, -BALL_R * 0.56, BALL_R * 2.4, BALL_R * 1.12);
      ctx.restore();
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x - BALL_R, y - BALL_R, BALL_R * 2, BALL_R * 2);
    }

    if (b.id === 0) {
      const rx = b.rot[6];
      const ry = b.rot[7];
      const rz = b.rot[8];
      if (rz > 0) {
        ctx.fillStyle = '#D92626';
        ctx.beginPath();
        ctx.arc(x + rx * BALL_R * 0.68, y + ry * BALL_R * 0.68, 2.6 * rz, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const sign = b.rot[8] >= 0 ? 1 : -1;
      const spotX = x + b.rot[6] * sign * BALL_R * 0.62;
      const spotY = y + b.rot[7] * sign * BALL_R * 0.62;
      const spotZ = Math.abs(b.rot[8]);

      if (spotZ > 0.15) {
        ctx.save();
        ctx.translate(spotX, spotY);
        ctx.beginPath();
        ctx.arc(0, 0, BALL_R * 0.44, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();

        ctx.fillStyle = '#111318';
        ctx.font = `bold ${Math.round(BALL_R * 0.56)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(b.id), 0, 0.5);
        ctx.restore();
      }
    }

    const shade = ctx.createRadialGradient(
      x - BALL_R * 0.35, y - BALL_R * 0.35, BALL_R * 0.1,
      x, y, BALL_R
    );
    shade.addColorStop(0, 'rgba(255,255,255,0.42)');
    shade.addColorStop(0.32, 'rgba(255,255,255,0.0)');
    shade.addColorStop(0.75, 'rgba(0,0,0,0.18)');
    shade.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - BALL_R, y - BALL_R, BALL_R * 2, BALL_R * 2);

    ctx.restore();
  }

  drawAimAndCue(ctx, world, rules, inputState) {
    const cue = world.balls[0];
    const angle = inputState.aimAngle;
    const ray = world.raycastAim(angle, inputState.spinX, inputState.spinY);

    let targetLegal = true;
    if (ray.hitBallId !== -1) {
      targetLegal = rules.isBallLegalTarget(ray.hitBallId, world.balls);
    }

    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = targetLegal ? 'rgba(255, 255, 255, 0.88)' : 'rgba(2ef, 68, 68, 0.9)';
    if (!targetLegal) ctx.strokeStyle = 'rgba(248, 113, 113, 0.92)';

    ctx.beginPath();
    ctx.moveTo(cue.x, cue.y);
    ctx.lineTo(ray.hitX, ray.hitY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(ray.hitX, ray.hitY, BALL_R, 0, Math.PI * 2);
    ctx.stroke();

    if (ray.hitBallId !== -1 && targetLegal) {
      const targetBall = world.balls[ray.hitBallId];
      ctx.beginPath();
      ctx.moveTo(targetBall.x, targetBall.y);
      ctx.lineTo(targetBall.x + ray.objDirX * 95, targetBall.y + ray.objDirY * 95);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(ray.hitX, ray.hitY);
      ctx.lineTo(ray.hitX + ray.cueDeflectX * 52, ray.hitY + ray.cueDeflectY * 52);
      ctx.stroke();
    }

    const pullOffset = 22 + inputState.power * 88;
    const cueLength = 340;
    ctx.translate(cue.x, cue.y);
    ctx.rotate(angle + Math.PI);

    ctx.shadowColor = 'rgba(0,0,0,0.65)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 5;

    const stickGrad = ctx.createLinearGradient(pullOffset, 0, pullOffset + cueLength, 0);
    stickGrad.addColorStop(0, '#38bdf8');
    stickGrad.addColorStop(0.02, '#f8fafc');
    stickGrad.addColorStop(0.04, '#eab308');
    stickGrad.addColorStop(0.45, '#78350f');
    stickGrad.addColorStop(0.48, '#f59e0b');
    stickGrad.addColorStop(1, '#1e1b18');

    ctx.fillStyle = stickGrad;
    ctx.beginPath();
    ctx.moveTo(pullOffset, -2.6);
    ctx.lineTo(pullOffset + cueLength, -6.2);
    ctx.lineTo(pullOffset + cueLength, 6.2);
    ctx.lineTo(pullOffset, 2.6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  updateAndDrawParticles(ctx, dt) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = 1 - p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawDebugOverlay(ctx, world) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(10, 10, 250, 95);
    ctx.fillStyle = '#00f5a0';
    ctx.font = '12px monospace';
    const cueV = Math.hypot(world.balls[0].vx, world.balls[0].vy).toFixed(1);
    ctx.fillText(`FPS: ${Math.round(this.fps)} | Substeps: ${world.lastStepCount}`, 18, 28);
    ctx.fillText(`Collisions: ${world.collisionCount} | CueSpd: ${cueV}`, 18, 46);
    ctx.fillText(`CueSpin: (${world.balls[0].wx.toFixed(1)}, ${world.balls[0].wy.toFixed(1)}, ${world.balls[0].wz.toFixed(1)})`, 18, 64);
    ctx.fillText(`CuePos: (${world.balls[0].x.toFixed(1)}, ${world.balls[0].y.toFixed(1)})`, 18, 82);

    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 1;
    for (const seg of world.segments) {
      ctx.beginPath();
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
      ctx.stroke();
    }
    ctx.restore();
  }
}