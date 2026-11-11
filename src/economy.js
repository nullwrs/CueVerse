import { STARTING_BALANCE } from './maps.js';

const STORAGE_KEY = 'cueverse_wallet_v1';

class LocalWalletAdapter {
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  save(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }
}

export class Wallet {
  constructor(adapter = new LocalWalletAdapter()) {
    this.adapter = adapter;
    const saved = this.adapter.load();
    this.state = saved && typeof saved.balance === 'number'
      ? saved
      : {
          name: 'Player 1',
          balance: STARTING_BALANCE,
          wins: 0,
          games: 0
        };
    this.persist();
  }

  persist() {
    this.adapter.save(this.state);
  }

  getBalance() {
    return this.state.balance;
  }

  getName() {
    return this.state.name;
  }

  setName(name) {
    this.state.name = (name || 'Player 1').slice(0, 18);
    this.persist();
  }

  canAfford(bet) {
    return this.state.balance >= bet;
  }

  deductBet(bet) {
    if (!this.canAfford(bet)) return false;
    this.state.balance -= bet;
    this.state.games++;
    this.persist();
    return true;
  }

  creditPot(potAmount) {
    this.state.balance += potAmount;
    this.state.wins++;
    this.persist();
  }

  resetDemoBalance() {
    this.state.balance = STARTING_BALANCE;
    this.persist();
  }
}