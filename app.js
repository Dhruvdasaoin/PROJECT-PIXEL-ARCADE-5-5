const GAME_DETAILS = {
  TURBO: { title: 'TURBO RUSH', instructions: 'Dodge oncoming traffic! Swerve left (S3) and right (S1) on Row 4.' },
  BLOCKS: { title: 'PIXEL BLOCKS', instructions: 'Catch falling pixels with your paddle! Move left (S3) and right (S1) to catch them before they hit the bottom.' },
  MONSTER: { title: 'MONSTER ESCAPE', instructions: 'Flee from the roaming monster! Navigate with S1=RIGHT, S2=DOWN, S3=LEFT, S4=UP to reach the sanctuary.' },
  TREASURE: { title: 'TREASURE HUNT', instructions: 'Hunt for hidden treasure using the LCD radar! Navigate with S1=RIGHT, S2=DOWN, S3=LEFT, S4=UP. Avoid traps.' },
  REACTION: { title: 'REACTION RUSH', instructions: 'Match the arrow quickly! ↑=S4, →=S1, ↓=S2, ←=S3.' },
  NINJA: { title: 'NINJA ESCAPE', instructions: 'Infiltrate enemy territory! Move with S1/S3 and press S5 to dash across laser barriers.' },
  DUNGEON: { title: 'DUNGEON QUEST', instructions: 'RPG Crawler! Move with S1/S2/S3/S4 to find the key. Press S5 to strike down minions.' },
  BOX: { title: 'BOX MASTER', instructions: 'Classic Sokoban puzzle. Push the crate onto the target using S1=RIGHT, S2=DOWN, S3=LEFT, S4=UP.' },
  BOSS: { title: 'BOSS BATTLE', instructions: 'Epic mothership showdown! Dodge missiles and press S5 to fire counter-cannons!' }
};

const GAME_GUIDES = {
  TURBO: `Controls:\nS3 = LEFT\nS1 = RIGHT\n\nAvoid obstacles.`,
  BLOCKS: `Controls:\nS3 = LEFT\nS1 = RIGHT\n\nCatch falling pixels.`,
  MONSTER: `Controls:\nS4 = UP\nS1 = RIGHT\nS2 = DOWN\nS3 = LEFT\n\nReach sanctuary.`,
  TREASURE: `Controls:\nS4 = UP\nS1 = RIGHT\nS2 = DOWN\nS3 = LEFT\n\nFind treasure.\nAvoid traps.`,
  REACTION: `Controls:\n\n↑ = S4\n→ = S1\n↓ = S2\n← = S3\n\nPress matching button quickly.`,
  NINJA: `Controls:\nS1/S3 = MOVE\nS5 = DASH\n\nTime your dash perfectly.`,
  DUNGEON: `Controls:\nS1/S2/S3/S4 = MOVE\nS5 = ATTACK\n\nFind the key and exit.`,
  BOX: `Controls:\nS4 = UP\nS1 = RIGHT\nS2 = DOWN\nS3 = LEFT\n\nPush crate to target.`,
  BOSS: `Controls:\nS3 = LEFT\nS1 = RIGHT\nS5 = FIRE\n\nAvoid lasers.`
};

class SerialManager {
  constructor() {
    this.port = null; this.reader = null; this.isConnected = false;
    this.inputStream = null; this.readLoopPromise = null;
    this.onStatusChange = null; this.onTelemetry = null; this.onFrame = null; this.onMessage = null;
  }
  async connect() {
    if (!('serial' in navigator)) throw new Error('Web Serial API not supported.');
    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });
      this.isConnected = true;
      if (typeof this.onStatusChange === 'function') this.onStatusChange(true, 'Connected to Arduino Uno');
      this.startReading();
    } catch (err) {
      this.isConnected = false;
      if (typeof this.onStatusChange === 'function') this.onStatusChange(false, err.message);
      throw err;
    }
  }
  async disconnect() {
    try { if (this.reader) { await this.reader.cancel(); await this.readLoopPromise; } if (this.port) await this.port.close(); } catch (e) { console.warn('Disconnect error', e); } 
    finally { this.port = null; this.reader = null; this.isConnected = false; if (typeof this.onStatusChange === 'function') this.onStatusChange(false, 'Disconnected'); }
  }
  async sendCommand(cmd) {
    if (!this.port || !this.isConnected) return false;
    try { const w = this.port.writable.getWriter(); await w.write(new TextEncoder().encode(cmd + '\n')); w.releaseLock(); return true; } catch (err) { return false; }
  }
  async startReading() {
    const td = new TextDecoderStream(); this.inputStream = this.port.readable.pipeTo(td.writable); this.reader = td.readable.getReader(); let buf = '';
    this.readLoopPromise = (async () => {
      try {
        while (true) { const { value, done } = await this.reader.read(); if (done) break; buf += value; let idx; while ((idx = buf.indexOf('\n')) >= 0) { let line = buf.substring(0, idx).trim(); buf = buf.substring(idx + 1); if (line) this.handleIncomingLine(line); } }
      } catch (e) { console.error(e); } finally { if (this.reader) this.reader.releaseLock(); }
    })();
  }
  handleIncomingLine(line) {
    if (typeof this.onMessage === 'function') this.onMessage(line);
    if (line.startsWith('FRAME:')) { if (typeof this.onFrame === 'function') this.onFrame(line.substring(6)); return; }
    const sep = line.indexOf(':');
    if (sep !== -1) { if (typeof this.onTelemetry === 'function') this.onTelemetry(line.substring(0, sep).trim(), line.substring(sep + 1).trim()); }
  }
}

class ArcadeApp {
  constructor() {
    this.selectedGame = null; this.currentScore = 0;
    this.highScores = { TURBO: 0, BLOCKS: 0, MONSTER: 0, TREASURE: 0, REACTION: 0, NINJA: 0, DUNGEON: 0, BOX: 0, BOSS: 0 };
    this.loadHighScores();

    this.screenMenu = document.getElementById('screenMenu'); this.screenGame = document.getElementById('screenGame');
    this.btnConnect = document.getElementById('btnConnect'); this.btnDisconnect = document.getElementById('btnDisconnect');
    this.statusDot = document.getElementById('statusDot'); this.statusText = document.getElementById('statusText');
    this.btnSound = document.getElementById('btnSound'); this.terminalLogs = document.getElementById('terminalLogs');
    this.activeGameTitle = document.getElementById('activeGameTitle'); this.activeInstructions = document.getElementById('activeInstructions');
    this.activeScore = document.getElementById('activeScore'); this.activeBest = document.getElementById('activeBest');
    this.activeState = document.getElementById('activeState');
    this.btnBackToMenu = document.getElementById('btnBackToMenu'); this.btnActionStart = document.getElementById('btnActionStart');
    this.btnActionPause = document.getElementById('btnActionPause'); this.btnActionRestart = document.getElementById('btnActionRestart');
    this.matrixGrid = document.getElementById('matrixGrid'); this.matrixCells = [];
    this.isSimulating = false; this.simFrameTimer = null;

    this.initMatrixGrid(); this.bindEvents(); this.bindSerialEvents(); this.updateCardHighScores();
  }
  loadHighScores() { try { const s = localStorage.getItem('pixel_arcade_highscores'); if (s) this.highScores = Object.assign(this.highScores, JSON.parse(s)); } catch (e) {} }
  saveHighScore(game, score) { if (score > (this.highScores[game] || 0)) { this.highScores[game] = score; try { localStorage.setItem('pixel_arcade_highscores', JSON.stringify(this.highScores)); } catch (e) {} this.updateCardHighScores(); } }
  updateCardHighScores() { for (const [g, s] of Object.entries(this.highScores)) { const el = document.getElementById(`cardBest_${g}`); if (el) el.textContent = s; } }
  
  initMatrixGrid() {
    if (!this.matrixGrid) return; this.matrixGrid.innerHTML = ''; this.matrixCells = [];
    for (let r = 0; r < 5; r++) { for (let c = 0; c < 5; c++) { const led = document.createElement('div'); led.className = 'matrix-led'; led.dataset.r = r; led.dataset.c = c; this.matrixGrid.appendChild(led); this.matrixCells.push(led); } }
  }
  renderMatrixFrame(frameStr) {
    if (!frameStr || frameStr.length < 25 || this.matrixCells.length < 25) return;
    for (let i = 0; i < 25; i++) { frameStr[i] === '1' ? this.matrixCells[i].classList.add('on') : this.matrixCells[i].classList.remove('on'); }
  }
  logTerminal(text, type = '') { if (!this.terminalLogs) return; const p = document.createElement('p'); if (type) p.className = type; p.textContent = `> ${text}`; this.terminalLogs.appendChild(p); this.terminalLogs.scrollTop = this.terminalLogs.scrollHeight; }

  bindEvents() {
    if (this.btnSound) this.btnSound.addEventListener('click', () => { const e = window.soundEngine ? window.soundEngine.toggle() : false; this.btnSound.textContent = e ? '🔊' : '🔇'; });
    if (this.btnConnect) this.btnConnect.addEventListener('click', async () => { if (window.soundEngine) window.soundEngine.click(); try { this.logTerminal('Requesting USB...'); await window.serialManager.connect(); } catch (err) { this.logTerminal(`Error: ${err.message}`, 'warn'); } });
    if (this.btnDisconnect) this.btnDisconnect.addEventListener('click', async () => { if (window.soundEngine) window.soundEngine.click(); await window.serialManager.disconnect(); });
    
    document.querySelectorAll('.btn-play').forEach(btn => btn.addEventListener('click', (e) => this.openGameView(e.currentTarget.dataset.game)));
    
    if (this.btnBackToMenu) this.btnBackToMenu.addEventListener('click', () => { if (window.soundEngine) window.soundEngine.click(); if (window.serialManager?.isConnected) window.serialManager.sendCommand('BACK'); this.showMenuScreen(); });
    if (this.btnActionStart) this.btnActionStart.addEventListener('click', async () => { if (window.soundEngine) window.soundEngine.select(); if (!this.selectedGame) { this.logTerminal('Choose a game first.', 'warn'); return; } if (window.serialManager?.isConnected) { this.activeState.textContent = 'STARTING…'; this.logTerminal(`Sending START:${this.selectedGame}…`); const sent = await window.serialManager.sendCommand(`START:${this.selectedGame}`); if (!sent) { this.activeState.textContent = 'START FAILED'; this.logTerminal('Write failed.', 'warn'); } } });
    if (this.btnActionPause) this.btnActionPause.addEventListener('click', () => { if (window.soundEngine) window.soundEngine.click(); if (window.serialManager?.isConnected) window.serialManager.sendCommand(this.activeState.textContent === 'PAUSED' ? 'RESUME' : 'PAUSE'); });
    if (this.btnActionRestart) this.btnActionRestart.addEventListener('click', () => { if (window.soundEngine) window.soundEngine.select(); if (window.serialManager?.isConnected) window.serialManager.sendCommand('RESTART'); });
  }

  bindSerialEvents() {
    if (!window.serialManager) window.serialManager = new SerialManager();
    window.serialManager.onStatusChange = (connected, message) => {
      if (connected) { this.statusDot?.classList.add('connected'); this.statusText.textContent = 'Arduino Connected (9600 Baud)'; this.btnConnect.style.display = 'none'; this.btnDisconnect.style.display = 'inline-block'; this.logTerminal(`Connected: ${message}`, 'in'); if (window.soundEngine) window.soundEngine.victory(); } 
      else { this.statusDot?.classList.remove('connected'); this.statusText.textContent = message || 'Disconnected'; this.btnConnect.style.display = 'inline-block'; this.btnDisconnect.style.display = 'none'; this.logTerminal(`Disconnected: ${message}`, 'warn'); }
    };
    window.serialManager.onTelemetry = (key, val) => {
      if (key === 'STATE') { this.activeState.textContent = val; if (window.soundEngine) { if (val === 'GAMEOVER') window.soundEngine.gameOver(); else if (val === 'WIN') window.soundEngine.victory(); } } 
      else if (key === 'SCORE') { this.activeScore.textContent = val; this.currentScore = val; if (this.selectedGame) this.saveHighScore(this.selectedGame, val); if (window.soundEngine) window.soundEngine.score(); } 
      else if (key === 'BEST') { this.activeBest.textContent = val; } 
      else if (key === 'GAME') { if (val !== 'NONE' && val !== 'MENU') this.selectedGame = val; } 
      else if (key === 'LCD1') { const l1 = document.getElementById('virtual-lcd-line1'); if (l1) l1.textContent = val; } 
      else if (key === 'LCD2') { const l2 = document.getElementById('virtual-lcd-line2'); if (l2) l2.textContent = val; } 
      else if (key === 'MSG') { this.logTerminal(val, 'out'); }
    };
    window.serialManager.onFrame = (f) => this.renderMatrixFrame(f);
    window.serialManager.onMessage = (r) => { if (!r.startsWith('FRAME:')) console.log('Serial <<', r); };
  }

  openGameView(gameKey) {
    this.selectedGame = gameKey; const details = GAME_DETAILS[gameKey]; if (!details) return;
    if (window.soundEngine) window.soundEngine.select();
    this.activeGameTitle.textContent = details.title; this.activeInstructions.textContent = details.instructions;
    this.activeScore.textContent = '0'; this.activeBest.textContent = this.highScores[gameKey] || 0; this.activeState.textContent = 'READY';
    
    const guideBox = document.getElementById('gameGuide'); if (guideBox) guideBox.innerText = GAME_GUIDES[gameKey] || 'Select a game to view controls.';
    
    this.screenMenu.classList.remove('active'); this.screenGame.classList.add('active');
    this.logTerminal(`Selected: ${details.title}`); this.stopSimulator();
    if (window.serialManager?.isConnected) { this.activeState.textContent = 'READY — PRESS START'; this.logTerminal(`Press START to send to Arduino.`); }
  }

  showMenuScreen() {
    this.selectedGame = null; this.screenGame.classList.remove('active'); this.screenMenu.classList.add('active'); this.stopSimulator(); this.updateCardHighScores();
    const guideBox = document.getElementById('gameGuide'); if (guideBox) guideBox.innerText = 'Select a game to view controls.';
  }

  stopSimulator() { if (this.simFrameTimer) { clearInterval(this.simFrameTimer); this.simFrameTimer = null; } this.isSimulating = false; }
}

window.addEventListener('DOMContentLoaded', () => { window.serialManager = new SerialManager(); window.app = new ArcadeApp(); });
