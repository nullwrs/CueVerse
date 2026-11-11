const SAFE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PEER_PREFIX = 'CVP8B-';

export class NetManager {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomCode = '';
    this.connected = false;
    this.rtt = 0;

    this.pingTimer = null;
    this.reconnectTimer = null;
    this.reconnectSecondsLeft = 30;
  }

  generateRoomCode(len = 5) {
    let out = '';
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) {
      out += SAFE_CHARS[arr[i] % SAFE_CHARS.length];
    }
    return out;
  }

  createRoom(hostName, mapId) {
    this.cleanup();
    this.isHost = true;
    this.roomCode = this.generateRoomCode(5);

    if (typeof window.Peer === 'undefined') {
      this.callbacks.onError('peerjs_unavailable');
      return;
    }

    this.peer = new window.Peer(PEER_PREFIX + this.roomCode);
    this.peer.on('open', () => {
      this.callbacks.onRoomCreated(this.roomCode);
    });

    this.peer.on('connection', conn => {
      if (this.conn && this.connected) {
        conn.on('open', () => {
          conn.send({ type: 'ROOM_FULL' });
          setTimeout(() => conn.close(), 300);
        });
        return;
      }
      this.setupConnection(conn);
    });

    this.peer.on('error', err => {
      this.callbacks.onError(err.type || 'network_error');
    });
  }

  joinRoom(code, guestName) {
    this.cleanup();
    this.isHost = false;
    this.roomCode = code.trim().toUpperCase();

    if (typeof window.Peer === 'undefined') {
      this.callbacks.onError('peerjs_unavailable');
      return;
    }

    this.peer = new window.Peer();
    this.peer.on('open', () => {
      const conn = this.peer.connect(PEER_PREFIX + this.roomCode, { reliable: true });
      this.setupConnection(conn, guestName);
    });

    this.peer.on('error', err => {
      this.callbacks.onError(err.type === 'peer-unavailable' ? 'invalid_code' : err.type);
    });
  }

  setupConnection(conn, guestName = '') {
    this.conn = conn;

    conn.on('open', () => {
      this.connected = true;
      this.clearReconnectCountdown();
      this.startHeartbeat();
      if (!this.isHost) {
        this.send({ type: 'HELLO', name: guestName });
      }
      this.callbacks.onConnected();
    });

    conn.on('data', data => {
      this.handleMessage(data);
    });

    conn.on('close', () => {
      this.handleDisconnect();
    });

    conn.on('error', () => {
      this.handleDisconnect();
    });
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'ROOM_FULL':
        this.callbacks.onError('room_full');
        this.cleanup();
        break;
      case 'PING':
        this.send({ type: 'PONG', t: msg.t });
        break;
      case 'PONG':
        this.rtt = Math.max(1, Math.round(performance.now() - msg.t));
        this.callbacks.onPingUpdate(this.rtt);
        break;
      case 'HELLO':
        if (this.isHost) {
          this.callbacks.onGuestJoined(msg.name || 'Player 2');
        }
        break;
      case 'LOBBY_INFO':
        if (!this.isHost) {
          this.callbacks.onLobbyInfo(msg);
        }
        break;
      case 'GUEST_READY':
        if (this.isHost) {
          this.callbacks.onGuestReady(Boolean(msg.ready));
        }
        break;
      case 'START_MATCH':
        if (!this.isHost) {
          this.callbacks.onMatchStart(msg);
        }
        break;
      case 'REQ_SHOT':
        if (this.isHost) {
          this.callbacks.onClientShotRequest(msg.shot);
        }
        break;
      case 'EXEC_SHOT':
        this.callbacks.onExecuteShot(msg.shot);
        break;
      case 'POCKET_CALL':
        this.callbacks.onRemotePocketCall(msg.pocketId);
        break;
      case 'SYNC_STATE':
        if (!this.isHost) {
          this.callbacks.onSyncState(msg);
        }
        break;
      case 'REMATCH':
        this.callbacks.onRematchRequest();
        break;
    }
  }

  validateShotPayload(shot) {
    if (!shot || typeof shot !== 'object') return null;
    const angle = Number(shot.angle) || 0;
    const power = Math.max(0.03, Math.min(1, Number(shot.power) || 0.1));
    let spinX = Number(shot.spinX) || 0;
    let spinY = Number(shot.spinY) || 0;
    const mag = Math.hypot(spinX, spinY);
    if (mag > 1) {
      spinX /= mag;
      spinY /= mag;
    }
    const cueX = Math.max(14, Math.min(986, Number(shot.cueX) || 250));
    const cueY = Math.max(14, Math.min(486, Number(shot.cueY) || 250));
    const calledPocket = Math.max(0, Math.min(5, Number(shot.calledPocket) || 0));

    return { angle, power, spinX, spinY, cueX, cueY, calledPocket };
  }

  send(payload) {
    if (this.conn && this.connected) {
      this.conn.send(payload);
    }
  }

  startHeartbeat() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (this.connected) {
        this.send({ type: 'PING', t: performance.now() });
      }
    }, 2000);
  }

  handleDisconnect() {
    if (!this.connected) return;
    this.connected = false;
    clearInterval(this.pingTimer);
    this.reconnectSecondsLeft = 30;
    this.callbacks.onDisconnectStart(this.reconnectSecondsLeft);

    clearInterval(this.reconnectTimer);
    this.reconnectTimer = setInterval(() => {
      this.reconnectSecondsLeft--;
      this.callbacks.onDisconnectTick(this.reconnectSecondsLeft);
      if (this.reconnectSecondsLeft <= 0) {
        this.clearReconnectCountdown();
        this.callbacks.onDisconnectTimeout();
      }
    }, 1000);
  }

  clearReconnectCountdown() {
    clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  cleanup() {
    clearInterval(this.pingTimer);
    this.clearReconnectCountdown();
    this.connected = false;
    if (this.conn) {
      this.conn.close();
      this.conn = null;
    }
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
  }
}