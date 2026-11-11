import { PhysicsWorld } from './physics.js';
import { Renderer } from './render.js';
import { RulesEngine } from './rules.js';
import { InputController } from './input.js';
import { NetManager } from './net.js';
import { MAPS, getMapById } from './maps.js';
import { Wallet } from './economy.js';
import { SoundEngine } from './audio.js';
import { I18N, formatCoins } from './ui.js';

class CueVerseApp {
  constructor() {
    this.lang = 'ru';
    this.wallet = new Wallet();
    this.sound = new SoundEngine();
    this.world = new PhysicsWorld();
    this.rules = new RulesEngine();

    this.canvas = document.getElementById('pool-canvas');
    this.renderer = new Renderer(this.canvas);

    this.gameMode = 'local';
    this.selectedMap = MAPS[0];
    this.players = ['Player 1', 'Player 2'];
    this.myPlayerIndex = 0;
    this.localFlipEnabled = false;
    this.timerEnabled = true;
    this.turnTimeLeft = 45;
    this.turnDuration = 45;
    this.matchActive = false;
    this.simulatingShot = false;
    this.tabHidden = false;

    this.input = new InputController(
      this.canvas,
      this.renderer,
      this.world,
      this.rules,
      {
        onFireShot: shot => this.handleLocalShotInput(shot),
        onPocketCalled: pkId => {
          if (this.gameMode === 'online') {
            this.net.send({ type: 'POCKET_CALL', pocketId: pkId });
          }
        }
      }
    );

    this.net = new NetManager({
      onRoomCreated: code => {
        document.getElementById('host-room-code').textContent = code;
      },
      onConnected: () => {
        if (this.net.isHost) {
          this.net.send({
            type: 'LOBBY_INFO',
            hostName: this.wallet.getName(),
            mapId: this.selectedMap.id
          });
        }
      },
      onGuestJoined: name => {
        this.players[1] = name;
        document.getElementById('host-guest-status').textContent = `${this.t('guestConnected')}: ${name}`;
      },
      onLobbyInfo: info => {
        this.selectedMap = getMapById(info.mapId);
        this.players[0] = info.hostName;
        this.players[1] = this.wallet.getName();
        const card = document.getElementById('guest-lobby-details');
        card.innerHTML = `<strong>${this.selectedMap.name[this.lang]}</strong> - ${this.t('betLabel')}: ${formatCoins(this.selectedMap.bet)}<br>Host: ${info.hostName}`;
        document.getElementById('btn-guest-ready').disabled = false;
      },
      onGuestReady: ready => {
        const startBtn = document.getElementById('btn-host-start');
        startBtn.disabled = !ready;
      },
      onMatchStart: payload => {
        this.startOnlineMatchClient(payload);
      },
      onClientShotRequest: shot => {
        if (this.rules.currentTurn !== 1 || this.simulatingShot) return;
        const cleanShot = this.net.validateShotPayload(shot);
        if (!cleanShot) return;
        this.broadcastAndExecuteShot(cleanShot);
      },
      onExecuteShot: shot => {
        this.executeDeterministicShot(shot);
      },
      onRemotePocketCall: pkId => {
        this.rules.calledPocket = pkId;
      },
      onSyncState: sync => {
        this.world.applySnapshot(sync.balls);
        this.rules.currentTurn = sync.currentTurn;
        this.rules.groups = sync.groups;
        this.rules.tableOpen = sync.tableOpen;
        this.rules.ballInHand = sync.ballInHand;
        this.rules.mustCallPocket = sync.mustCallPocket;
        this.rules.winner = sync.winner;
        this.rules.winReason = sync.winReason;
        this.simulatingShot = false;
        if (sync.gameOver) {
          this.finishMatch();
        } else {
          this.prepareNextTurn(sync.foul);
        }
      },
      onPingUpdate: rtt => {
        const el = document.getElementById('hud-ping');
        if (el) el.textContent = `${rtt} ms`;
      },
      onDisconnectStart: sec => {
        document.getElementById('reconnect-overlay').classList.remove('hidden');
        document.getElementById('reconnect-timer').textContent = String(sec);
      },
      onDisconnectTick: sec => {
        document.getElementById('reconnect-timer').textContent = String(sec);
      },
      onDisconnectTimeout: () => {
        document.getElementById('reconnect-overlay').classList.add('hidden');
        if (this.matchActive) {
          this.rules.winner = this.myPlayerIndex;
          this.finishMatch();
        }
      },
      onRematchRequest: () => {
        if (this.net.isHost && this.matchActive === false) {
          this.launchOnlineMatchFromHost();
        }
      },
      onError: errKey => {
        const msg = this.t(`err_${errKey}`) || errKey;
        this.showToast(msg);
      }
    });

    this.initUI();
    this.startLoop();
  }

  t(key) {
    return I18N[this.lang][key] || key;
  }

  initUI() {
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', e => {
      if (e.code === 'KeyD' && document.activeElement.tagName !== 'INPUT') {
        this.renderer.debugMode = !this.renderer.debugMode;
      }
    });

    document.addEventListener('visibilitychange', () => {
      this.tabHidden = document.hidden;
    });

    this.renderMapSelector('host-map-list');
    this.renderMapSelector('local-map-list');
    this.refreshWalletHUD();
    this.applyTranslations();

    document.getElementById('profile-name-input').value = this.wallet.getName();
    document.getElementById('profile-name-input').addEventListener('change', e => {
      this.wallet.setName(e.target.value);
    });

    document.getElementById('btn-refill-coins').addEventListener('click', () => {
      this.wallet.resetDemoBalance();
      this.refreshWalletHUD();
    });

    document.getElementById('btn-open-create').addEventListener('click', () => {
      this.sound.unlock();
      this.showScreen('screen-create');
      this.players[0] = this.wallet.getName();
      this.net.createRoom(this.players[0], this.selectedMap.id);
    });

    document.getElementById('btn-open-join').addEventListener('click', () => {
      this.sound.unlock();
      this.showScreen('screen-join');
    });

    document.getElementById('btn-open-local').addEventListener('click', () => {
      this.sound.unlock();
      this.showScreen('screen-local');
    });

    document.querySelectorAll('[data-back-menu]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.net.cleanup();
        this.matchActive = false;
        this.showScreen('screen-menu');
      });
    });

    document.getElementById('btn-connect-code').addEventListener('click', () => {
      const code = document.getElementById('join-code-input').value.trim();
      if (code.length < 4) return;
      this.net.joinRoom(code, this.wallet.getName());
    });

    document.getElementById('btn-guest-ready').addEventListener('click', () => {
      if (!this.wallet.canAfford(this.selectedMap.bet)) {
        this.showToast(this.t('err_no_funds'));
        return;
      }
      this.net.send({ type: 'GUEST_READY', ready: true });
      document.getElementById('btn-guest-ready').textContent = '✓';
      document.getElementById('btn-guest-ready').disabled = true;
    });

    document.getElementById('btn-host-start').addEventListener('click', () => {
      this.launchOnlineMatchFromHost();
    });

    document.getElementById('btn-start-local').addEventListener('click', () => {
      const p1 = document.getElementById('local-p1-input').value.trim() || 'Player 1';
      const p2 = document.getElementById('local-p2-input').value.trim() || 'Player 2';
      this.players = [p1, p2];
      this.timerEnabled = document.getElementById('local-timer-check').checked;
      this.localFlipEnabled = document.getElementById('local-flip-check').checked;
      this.startLocalMatch();
    });

    document.getElementById('hud-spin-btn').addEventListener('click', () => {
      document.getElementById('spin-modal').classList.toggle('hidden');
    });

    document.getElementById('btn-close-spin').addEventListener('click', () => {
      document.getElementById('spin-modal').classList.add('hidden');
    });

    document.getElementById('btn-hud-menu').addEventListener('click', () => {
      this.net.cleanup();
      this.matchActive = false;
      this.showScreen('screen-menu');
    });

    document.getElementById('btn-result-menu').addEventListener('click', () => {
      document.getElementById('result-modal').classList.add('hidden');
      this.net.cleanup();
      this.matchActive = false;
      this.showScreen('screen-menu');
    });

    document.getElementById('btn-result-rematch').addEventListener('click', () => {
      document.getElementById('result-modal').classList.add('hidden');
      if (this.gameMode === 'local') {
        this.startLocalMatch();
      } else if (this.net.isHost) {
        this.launchOnlineMatchFromHost();
      } else {
        this.net.send({ type: 'REMATCH' });
      }
    });

    document.getElementById('setting-lang').addEventListener('change', e => {
      this.lang = e.target.value;
      this.applyTranslations();
      this.renderMapSelector('host-map-list');
      this.renderMapSelector('local-map-list');
    });

    document.getElementById('setting-quality').addEventListener('change', e => {
      this.renderer.setQuality(e.target.value);
      this.renderer.resize();
    });

    document.getElementById('setting-sound').addEventListener('change', e => {
      this.sound.setEnabled(e.target.checked);
    });
  }

  renderMapSelector(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const isLocal = containerId === 'local-map-list';

    MAPS.forEach(m => {
      const card = document.createElement('div');
      card.className = `map-card ${this.selectedMap.id === m.id ? 'active' : ''}`;
      card.style.borderColor = m.theme.railTrim;
      card.innerHTML = `
        <div class="map-card-title">${m.name[this.lang]}</div>
        <div class="map-card-sub">${m.subtitle[this.lang]}</div>
        <div class="map-card-bet">${isLocal ? 'FREE' : formatCoins(m.bet)}</div>
      `;
      card.addEventListener('click', () => {
        this.selectedMap = m;
        this.renderMapSelector('host-map-list');
        this.renderMapSelector('local-map-list');
        if (this.net.isHost && this.net.connected) {
          this.net.send({
            type: 'LOBBY_INFO',
            hostName: this.wallet.getName(),
            mapId: this.selectedMap.id
          });
        }
      });
      container.appendChild(card);
    });
  }

  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = this.t(key);
    });
  }

  refreshWalletHUD() {
    document.getElementById('menu-balance').textContent = this.wallet.getBalance().toLocaleString();
  }

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(screenId).classList.remove('hidden');
    if (screenId === 'screen-game') {
      this.renderer.resize();
    }
  }

  launchOnlineMatchFromHost() {
    if (!this.wallet.canAfford(this.selectedMap.bet)) {
      this.showToast(this.t('err_no_funds'));
      return;
    }
    const seed = (Date.now() & 0x7fffffff) || 1337;
    this.net.send({
      type: 'START_MATCH',
      mapId: this.selectedMap.id,
      seed,
      players: this.players
    });
    this.startOnlineMatchHost(seed);
  }

  startOnlineMatchHost(seed) {
    this.gameMode = 'online';
    this.myPlayerIndex = 0;
    this.wallet.deductBet(this.selectedMap.bet);
    this.refreshWalletHUD();
    this.setupMatchCommon(seed, false);
  }

  startOnlineMatchClient(payload) {
    this.gameMode = 'online';
    this.myPlayerIndex = 1;
    this.selectedMap = getMapById(payload.mapId);
    this.players = payload.players;
    this.wallet.deductBet(this.selectedMap.bet);
    this.refreshWalletHUD();
    this.setupMatchCommon(payload.seed, false);
  }

  startLocalMatch() {
    this.gameMode = 'local';
    this.myPlayerIndex = 0;
    const seed = (Date.now() & 0x7fffffff) || 4242;
    this.setupMatchCommon(seed, true);
  }

  setupMatchCommon(seed, isLocal) {
    this.showScreen('screen-game');
    this.world.configure(this.selectedMap.physics);
    this.renderer.bakeTable(this.selectedMap, this.world.pockets);
    this.world.setupRack(this.selectedMap.mode, seed);
    this.rules.reset(this.selectedMap.mode, this.selectedMap.ballInHandRule);

    this.turnDuration = this.selectedMap.turnTime;
    this.turnTimeLeft = this.turnDuration;
    this.matchActive = true;
    this.simulatingShot = false;
    this.renderer.flipped = false;

    document.getElementById('hud-p1-name').textContent = this.players[0];
    document.getElementById('hud-p2-name').textContent = this.players[1];
    document.getElementById('hud-pot-value').textContent = isLocal
      ? this.selectedMap.name[this.lang]
      : formatCoins(this.selectedMap.bet * 2);

    this.prepareNextTurn('');
  }

  handleLocalShotInput(shot) {
    if (!this.matchActive || this.simulatingShot) return;
    if (this.gameMode === 'local') {
      shot.seed = (Date.now() & 0x7fffffff) || 999;
      this.executeDeterministicShot(shot);
    } else if (this.net.isHost) {
      if (this.rules.currentTurn !== 0) return;
      this.broadcastAndExecuteShot(shot);
    } else {
      if (this.rules.currentTurn !== 1) return;
      this.net.send({ type: 'REQ_SHOT', shot });
    }
  }

  broadcastAndExecuteShot(shot) {
    const clean = this.net.validateShotPayload(shot);
    clean.seed = (Date.now() & 0x7fffffff) || 777;
    this.net.send({ type: 'EXEC_SHOT', shot: clean });
    this.executeDeterministicShot(clean);
  }

  executeDeterministicShot(shot) {
    this.simulatingShot = true;
    this.input.canShoot = false;
    this.world.rng.setSeed(shot.seed || 12345);

    if (this.rules.ballInHand) {
      const cue = this.world.balls[0];
      cue.x = shot.cueX;
      cue.y = shot.cueY;
      cue.prevX = shot.cueX;
      cue.prevY = shot.cueY;
      this.rules.ballInHand = false;
    }

    this.rules.beginShot(shot.calledPocket);
    this.world.eventCount = 0;
    this.world.strikeCueBall(shot.angle, shot.power, shot.spinX, shot.spinY);
    this.sound.playCueHit(shot.power);
  }

  onBallsStopped() {
    this.simulatingShot = false;
    if (this.gameMode === 'online' && !this.net.isHost) {
      return;
    }

    const res = this.rules.evaluateTurnEnd(this.world.balls);

    if (this.gameMode === 'online' && this.net.isHost) {
      this.net.send({
        type: 'SYNC_STATE',
        balls: this.world.serializeSnapshot(),
        currentTurn: this.rules.currentTurn,
        groups: this.rules.groups,
        tableOpen: this.rules.tableOpen,
        ballInHand: this.rules.ballInHand,
        mustCallPocket: this.rules.mustCallPocket,
        winner: this.rules.winner,
        winReason: this.rules.winReason,
        foul: res.foul,
        gameOver: res.gameOver
      });
    }

    if (res.gameOver) {
      this.finishMatch();
    } else {
      this.prepareNextTurn(res.foul, res.turnChanged);
    }
  }

  prepareNextTurn(foulCode = '', turnChanged = false) {
    this.turnTimeLeft = this.turnDuration;
    this.input.resetForTurn();

    const isMyTurn = this.gameMode === 'local' || this.rules.currentTurn === this.myPlayerIndex;
    this.input.canShoot = isMyTurn;

    if (this.gameMode === 'local') {
      this.renderer.flipped = this.localFlipEnabled && this.rules.currentTurn === 1;
      if (turnChanged) {
        this.showTurnBanner(this.players[this.rules.currentTurn]);
      }
    }

    if (foulCode) {
      this.showToast(this.t(`foul_${foulCode}`));
    } else if (this.rules.mustCallPocket && isMyTurn) {
      this.showToast(this.t('callPocketToast'));
    } else if (this.rules.ballInHand && isMyTurn) {
      this.showToast(this.t('ballInHandToast'));
    }

    this.updateHUD();
  }

  updateHUD() {
    const p1Card = document.getElementById('hud-p1-card');
    const p2Card = document.getElementById('hud-p2-card');
    p1Card.classList.toggle('active-turn', this.rules.currentTurn === 0);
    p2Card.classList.toggle('active-turn', this.rules.currentTurn === 1);

    const g0 = this.rules.groups[0];
    const g1 = this.rules.groups[1];
    document.getElementById('hud-p1-group').textContent = this.selectedMap.mode === '9ball'
      ? this.t('nineBallTarget')
      : (g0 ? this.t(g0) : this.t('openTable'));
    document.getElementById('hud-p2-group').textContent = this.selectedMap.mode === '9ball'
      ? this.t('nineBallTarget')
      : (g1 ? this.t(g1) : this.t('openTable'));

    this.renderPlayerBallSlots(0, 'hud-p1-balls');
    this.renderPlayerBallSlots(1, 'hud-p2-balls');
  }

  renderPlayerBallSlots(playerIdx, containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    if (this.selectedMap.mode === '9ball') {
      for (let i = 1; i <= 9; i++) {
        if (this.world.balls[i].active) {
          const badge = document.createElement('span');
          badge.className = `mini-ball b-${i}`;
          badge.textContent = String(i);
          el.appendChild(badge);
        }
      }
      return;
    }

    const grp = this.rules.groups[playerIdx];
    for (let slot = 0; slot < 7; slot++) {
      const badge = document.createElement('span');
      if (!grp) {
        badge.className = 'mini-ball empty';
      } else {
        const ballId = grp === 'solids' ? slot + 1 : slot + 9;
        const active = this.world.balls[ballId].active;
        badge.className = active ? `mini-ball b-${ballId} ${grp}` : 'mini-ball empty';
        if (active) badge.textContent = String(ballId);
      }
      el.appendChild(badge);
    }
  }

  finishMatch() {
    this.matchActive = false;
    this.input.canShoot = false;
    this.sound.playWin();

    const winnerIdx = this.rules.winner;
    const winnerName = this.players[winnerIdx] || 'Winner';
    let balanceDeltaText = '';

    if (this.gameMode === 'online') {
      const pot = this.selectedMap.bet * 2;
      if (winnerIdx === this.myPlayerIndex) {
        this.wallet.creditPot(pot);
        balanceDeltaText = `+${pot.toLocaleString()} coins`;
      } else {
        balanceDeltaText = `-${this.selectedMap.bet.toLocaleString()} coins`;
      }
      this.refreshWalletHUD();
    }

    document.getElementById('result-winner-name').textContent = `${this.t('victory')} ${winnerName}`;
    document.getElementById('result-reason').textContent = balanceDeltaText;
    document.getElementById('result-modal').classList.remove('hidden');
  }

  showTurnBanner(playerName) {
    const banner = document.getElementById('turn-banner');
    document.getElementById('turn-banner-name').textContent = playerName;
    banner.classList.remove('hidden');
    clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.add('hidden');
    }, 1350);
  }

  showToast(text) {
    const toast = document.getElementById('game-toast');
    toast.textContent = text;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2600);
  }

   drainWorldAudioAndEvents() {
    if (this.world.eventCount === 0) return;
    this.rules.processPhysicsEvents(this.world.eventQueue, this.world.eventCount);

    for (let i = 0; i < this.world.eventCount; i++) {
      const ev = this.world.eventQueue[i];
      if (ev.type === 'ball') {
        this.sound.playBallHit(ev.speed);
      } else if (ev.type === 'rail') {
        this.sound.playRailHit(ev.speed);
      } else if (ev.type === 'pocket') {
        this.sound.playPocket();
        const pk = this.world.pockets[ev.pocketId];
        if (pk) {
          this.renderer.spawnPocketParticles(pk.x, pk.y, '#00f5a0');
        }
      }
    }
    this.world.eventCount = 0;
  }

  startLoop() {
    let lastTime = performance.now();

    const loop = now => {
      requestAnimationFrame(loop);
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      if (this.tabHidden) return;

      if (dt > 0) {
        this.renderer.fps = this.renderer.fps * 0.9 + (1 / dt) * 0.1;
      }

      if (this.matchActive) {
        this.world.step(dt);
        this.drainWorldAudioAndEvents();

        if (this.simulatingShot && !this.world.areBallsMoving()) {
          this.onBallsStopped();
        }

        if (!this.simulatingShot && (this.gameMode === 'online' || this.timerEnabled)) {
          this.turnTimeLeft = Math.max(0, this.turnTimeLeft - dt);
          const ratio = (this.turnTimeLeft / this.turnDuration) * 100;
          const barId = this.rules.currentTurn === 0 ? 'hud-p1-timer' : 'hud-p2-timer';
          const otherId = this.rules.currentTurn === 0 ? 'hud-p2-timer' : 'hud-p1-timer';
          document.getElementById(barId).style.width = `${ratio}%`;
          document.getElementById(otherId).style.width = '0%';

          if (this.turnTimeLeft <= 0 && (this.gameMode === 'local' || this.net.isHost)) {
            this.rules.currentTurn = 1 - this.rules.currentTurn;
            this.rules.ballInHand = 'anywhere';
            this.prepareNextTurn('timeout', true);
          }
        }

        this.renderer.render(this.world, this.rules, this.input, dt);
      }
    };

    requestAnimationFrame(loop);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new CueVerseApp();
});