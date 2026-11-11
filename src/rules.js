export class RulesEngine {
  constructor() {
    this.reset('8ball', 'standard');
  }

  reset(mode = '8ball', ballInHandRule = 'standard') {
    this.mode = mode;
    this.ballInHandRule = ballInHandRule;
    this.currentTurn = 0;
    this.groups = [null, null];
    this.tableOpen = true;
    this.isBreakShot = true;
    this.ballInHand = 'kitchen';
    this.calledPocket = 0;
    this.mustCallPocket = false;
    this.winner = -1;
    this.winReason = '';
    this.lastFoul = '';

    this.firstHitBallId = -1;
    this.railContactsAfterHit = 0;
    this.pottedThisShot = [];
  }

  getBallGroup(id) {
    if (id >= 1 && id <= 7) return 'solids';
    if (id >= 9 && id <= 15) return 'stripes';
    if (id === 8) return 'eight';
    return 'cue';
  }

  getLowestActiveBall(balls) {
    for (let i = 1; i <= 15; i++) {
      if (balls[i] && balls[i].active) return i;
    }
    return -1;
  }

  hasGroupRemaining(playerIdx, balls) {
    const grp = this.groups[playerIdx];
    if (!grp) return true;
    const start = grp === 'solids' ? 1 : 9;
    const end = grp === 'solids' ? 7 : 15;
    for (let i = start; i <= end; i++) {
      if (balls[i].active) return true;
    }
    return false;
  }

  updateMustCallState(balls) {
    if (this.mode === '9ball') {
      this.mustCallPocket = false;
      return;
    }
    const grp = this.groups[this.currentTurn];
    this.mustCallPocket = grp !== null && !this.hasGroupRemaining(this.currentTurn, balls);
  }

  isBallLegalTarget(ballId, balls) {
    if (ballId <= 0) return false;
    if (this.mode === '9ball') {
      return ballId === this.getLowestActiveBall(balls);
    }
    if (this.tableOpen) {
      return ballId !== 8;
    }
    const grp = this.groups[this.currentTurn];
    if (this.hasGroupRemaining(this.currentTurn, balls)) {
      return this.getBallGroup(ballId) === grp;
    }
    return ballId === 8;
  }

  beginShot(calledPocket = 0) {
    this.calledPocket = calledPocket;
    this.firstHitBallId = -1;
    this.railContactsAfterHit = 0;
    this.pottedThisShot.length = 0;
    this.lastFoul = '';
  }

  processPhysicsEvents(eventQueue, eventCount) {
    for (let i = 0; i < eventCount; i++) {
      const ev = eventQueue[i];
      if (ev.type === 'ball') {
        if (this.firstHitBallId === -1 && (ev.a === 0 || ev.b === 0)) {
          this.firstHitBallId = ev.a === 0 ? ev.b : ev.a;
        }
      } else if (ev.type === 'rail') {
        if (this.firstHitBallId !== -1) {
          this.railContactsAfterHit++;
        }
      } else if (ev.type === 'pocket') {
        this.pottedThisShot.push({ id: ev.a, pocketId: ev.pocketId });
      }
    }
  }

  evaluateTurnEnd(balls) {
    if (this.mode === '9ball') {
      return this.evaluate9Ball(balls);
    }
    return this.evaluate8Ball(balls);
  }

  evaluate9Ball(balls) {
    const lowestBefore = this.getLowestActiveBall(balls);
    const cuePotted = this.pottedThisShot.some(p => p.id === 0);
    const ninePotted = this.pottedThisShot.some(p => p.id === 9);

    let foul = '';
    if (cuePotted) {
      foul = 'scratch';
    } else if (this.firstHitBallId === -1) {
      foul = 'no_hit';
    } else if (this.firstHitBallId !== lowestBefore && !this.pottedThisShot.some(p => p.id === this.firstHitBallId)) {
      foul = 'wrong_ball';
    } else if (this.pottedThisShot.length === 0 && this.railContactsAfterHit === 0) {
      foul = 'no_rail';
    }

    this.isBreakShot = false;

    if (ninePotted) {
      if (!foul) {
        this.winner = this.currentTurn;
        this.winReason = 'nine_potted';
        return { turnChanged: false, foul: '', gameOver: true };
      } else {
        balls[9].active = true;
        balls[9].inChute = false;
        balls[9].x = 730;
        balls[9].y = 250;
        balls[9].prevX = 730;
        balls[9].prevY = 250;
      }
    }

    if (foul) {
      this.lastFoul = foul;
      this.respawnCueBallIfNeeded(balls);
      this.currentTurn = 1 - this.currentTurn;
      this.ballInHand = 'anywhere';
      return { turnChanged: true, foul, gameOver: false };
    }

    this.ballInHand = false;
    const legalPot = this.pottedThisShot.some(p => p.id > 0);
    if (!legalPot) {
      this.currentTurn = 1 - this.currentTurn;
      return { turnChanged: true, foul: '', gameOver: false };
    }
    return { turnChanged: false, foul: '', gameOver: false };
  }

  evaluate8Ball(balls) {
    const player = this.currentTurn;
    const opponent = 1 - player;
    const shootingAtEight = !this.tableOpen && !this.hasGroupRemaining(player, balls) && !this.pottedThisShot.some(p => this.getBallGroup(p.id) === this.groups[player]);

    const cuePotted = this.pottedThisShot.some(p => p.id === 0);
    const eightPotEntry = this.pottedThisShot.find(p => p.id === 8);

    let foul = '';
    if (cuePotted) {
      foul = 'scratch';
    } else if (this.firstHitBallId === -1) {
      foul = 'no_hit';
    } else if (!this.tableOpen) {
      const hitGrp = this.getBallGroup(this.firstHitBallId);
      if (shootingAtEight && this.firstHitBallId !== 8) {
        foul = 'wrong_ball';
      } else if (!shootingAtEight && hitGrp !== this.groups[player]) {
        foul = 'wrong_ball';
      }
    } else if (this.tableOpen && this.firstHitBallId === 8 && !this.isBreakShot) {
      foul = 'wrong_ball';
    }

    if (!foul && this.pottedThisShot.length === 0 && this.railContactsAfterHit === 0) {
      foul = 'no_rail';
    }

    if (eightPotEntry) {
      if (this.isBreakShot) {
        balls[8].active = true;
        balls[8].inChute = false;
        balls[8].x = 730;
        balls[8].y = 250;
        balls[8].prevX = 730;
        balls[8].prevY = 250;
      } else if (!shootingAtEight) {
        this.winner = opponent;
        this.winReason = 'early_eight';
        return { turnChanged: false, foul: 'early_eight', gameOver: true };
      } else if (foul) {
        this.winner = opponent;
        this.winReason = 'foul_on_eight';
        return { turnChanged: false, foul, gameOver: true };
      } else if (eightPotEntry.pocketId !== this.calledPocket) {
        this.winner = opponent;
        this.winReason = 'wrong_pocket';
        return { turnChanged: false, foul: 'wrong_pocket', gameOver: true };
      } else {
        this.winner = player;
        this.winReason = 'eight_potted';
        return { turnChanged: false, foul: '', gameOver: true };
      }
    }

    const wasBreak = this.isBreakShot;
    this.isBreakShot = false;

    if (foul) {
      this.lastFoul = foul;
      this.respawnCueBallIfNeeded(balls);
      this.currentTurn = opponent;
      this.ballInHand = this.ballInHandRule === 'kitchen' ? 'kitchen' : 'anywhere';
      this.updateMustCallState(balls);
      return { turnChanged: true, foul, gameOver: false };
    }

    this.ballInHand = false;
    const pottedSolids = this.pottedThisShot.filter(p => p.id >= 1 && p.id <= 7);
    const pottedStripes = this.pottedThisShot.filter(p => p.id >= 9 && p.id <= 15);

    if (this.tableOpen && !wasBreak && (pottedSolids.length > 0 || pottedStripes.length > 0)) {
      const assigned = pottedSolids.length >= pottedStripes.length ? 'solids' : 'stripes';
      this.groups[player] = assigned;
      this.groups[opponent] = assigned === 'solids' ? 'stripes' : 'solids';
      this.tableOpen = false;
    }

    let keepTurn = false;
    if (this.tableOpen) {
      keepTurn = pottedSolids.length > 0 || pottedStripes.length > 0;
    } else {
      const myGrp = this.groups[player];
      keepTurn = (myGrp === 'solids' && pottedSolids.length > 0) || (myGrp === 'stripes' && pottedStripes.length > 0);
    }

    if (!keepTurn) {
      this.currentTurn = opponent;
    }
    this.updateMustCallState(balls);
    return { turnChanged: !keepTurn, foul: '', gameOver: false };
  }

  respawnCueBallIfNeeded(balls) {
    const cue = balls[0];
    if (!cue.active) {
      cue.active = true;
      cue.vx = 0; cue.vy = 0;
      cue.wx = 0; cue.wy = 0; cue.wz = 0;
      cue.x = 250;
      cue.y = 250;
      cue.prevX = 250;
      cue.prevY = 250;
    }
  }
}