const GAME_DETAILS = {
  TURBO: {
    title: 'TURBO RUSH',
    instructions: 'Dodge oncoming traffic obstacles at high speed! Swerve left (S3) and right (S1) on Row 4. Each obstacle passed scores +10 points.'
  },
  MONSTER: {
    title: 'MONSTER ESCAPE',
    instructions: 'Flee from the roaming monster! Navigate your blinking dot with S1=RIGHT, S2=DOWN, S3=LEFT, S4=UP to reach the sanctuary portal at Row 4, Col 4 before you are caught.'
  },
  TREASURE: {
    title: 'TREASURE HUNT',
    instructions: 'Hunt for the hidden treasure chest across the 5x5 grid using the LCD distance radar readout! Navigate with S1=RIGHT, S2=DOWN, S3=LEFT, S4=UP. Beware of concealed spike traps.'
  },
  REACTION: {
    title: 'REACTION RUSH',
    instructions: 'Match the arrow quickly! ↑=S4, →=S1, ↓=S2, ←=S3.'
  },
  BOSS: {
    title: 'BOSS BATTLE',
    instructions: 'Epic mothership showdown! Dodge falling missile barrages and retaliate with your counter-cannons by pressing S5 (BACK/SHOOT)!'
  }
};

const GAME_GUIDES = {
  TURBO: `OBJECTIVE:
Avoid obstacles.

CONTROLS:
S3 = LEFT
S1 = RIGHT

SCORE:
+10 per obstacle avoided.`,

  MONSTER: `OBJECTIVE:
Reach the sanctuary.

CONTROLS:
S4 = UP
S1 = RIGHT
S2 = DOWN
S3 = LEFT

AVOID:
The chasing monster.`,

  TREASURE: `OBJECTIVE:
Find the hidden treasure.

CONTROLS:
S4 = UP
S1 = RIGHT
S2 = DOWN
S3 = LEFT

WARNING:
Avoid traps.`,

  REACTION: `OBJECTIVE:
Press the correct button quickly.

ARROWS:
↑ = S4
→ = S1
↓ = S2
← = S3

React as fast as possible!`,

  BOSS: `OBJECTIVE:
Destroy the boss.

CONTROLS:
S3 = LEFT
S1 = RIGHT
S5 = SHOOT/BACK

AVOID:
Laser barrages.`
};

/**
 * Manages Web Serial API connections, port opening/closing, and incoming buffer line parsing.
 */
class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.isConnected = false;
    this.inputStream = null;
    this.readLoopPromise = null;

    this.onStatusChange = null;
    this.onTelemetry = null;
    this.onFrame = null;
    this.onMessage = null;
  }

  async connect() {
    if (!('serial' in navigator)) {
      throw new Error('Web Serial API not supported in this browser. Use Google Chrome or Microsoft Edge.');
    }

    try {
      this.port = await navigator.serial.requestPort();
      await this.port.open({ baudRate: 9600 });

      this.isConnected = true;
      if (typeof this.onStatusChange === 'function') {
        this.onStatusChange(true, 'Connected to Arduino Uno');
      }

      this.startReading();
    } catch (err) {
      this.isConnected = false;
      if (typeof this.onStatusChange === 'function') {
        this.onStatusChange(false, err.message);
      }
      throw err;
    }
  }

  async disconnect() {
    try {
      if (this.reader) {
        await this.reader.cancel();
        await this.readLoopPromise;
      }
      if (this.port) {
        await this.port.close();
      }
    } catch (e) {
      console.warn('Error during disconnect', e);
    } finally {
      this.port = null;
      this.reader = null;
      this.isConnected = false;
      if (typeof this.onStatusChange === 'function') {
        this.onStatusChange(false, 'Disconnected by user');
      }
    }
  }

  async sendCommand(cmd) {
    if (!this.port || !this.isConnected) {
      console.warn('Cannot send command: Serial port not connected');
      return false;
    }

    try {
      const textEncoder = new TextEncoder();
      const writer = this.port.writable.getWriter();
      await writer.write(textEncoder.encode(cmd + '\n'));
      writer.releaseLock();
      return true;
    } catch (err) {
      console.error('Failed to write to serial port:', err);
      return false;
    }
  }

  async startReading() {
    const textDecoder = new TextDecoderStream();
    this.inputStream = this.port.readable.pipeTo(textDecoder.writable);
    this.reader = textDecoder.readable.getReader();

    let lineBuffer = '';

    this.readLoopPromise = (async () => {
      try {
        while (true) {
          const { value, done } = await this.reader.read();
          if (done) break;
          
          lineBuffer += value;
          let lineEndIndex;
          while ((lineEndIndex = lineBuffer.indexOf('\n')) >= 0) {
            let line = lineBuffer.substring(0, lineEndIndex);
            lineBuffer = lineBuffer.substring(lineEndIndex + 1);
            line = line.trim();
            if (line) {
              this.handleIncomingLine(line);
            }
          }
        }
      } catch (error) {
        console.error('Serial read loop error:', error);
      } finally {
        if (this.reader) {
          this.reader.releaseLock();
        }
      }
    })();
  }

  handleIncomingLine(line) {
    if (typeof this.onMessage === 'function') {
      this.onMessage(line);
    }

    if (line.startsWith('FRAME:')) {
      const frameData = line.substring(6);
      if (typeof this.onFrame === 'function') {
        this.onFrame(frameData);
      }
      return;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex !== -1) {
      const key = line.substring(0, separatorIndex).trim();
      const val = line.substring(separatorIndex + 1).trim();

      if (typeof this.onTelemetry === 'function') {
        this.onTelemetry(key, val);
      }
    }
  }
}

class ArcadeApp {
  constructor() {
    this.selectedGame = null;
    this.currentScore = 0;
    this.highScores = {
      TURBO: 0,
      MONSTER: 0,
      TREASURE: 0,
      REACTION: 0,
      BOSS: 0
    };
    this.loadHighScores();

    this.screenMenu = document.getElementById('screenMenu');
    this.screenGame = document.getElementById('screenGame');
    this.btnConnect = document.getElementById('btnConnect');
    this.btnDisconnect = document.getElementById('btnDisconnect');
    this.statusDot = document.getElementById('statusDot');
    this.statusText = document.getElementById('statusText');
    this.btnSound = document.getElementById('btnSound');
    this.terminalLogs = document.getElementById('terminalLogs');

    this.activeGameTitle = document.getElementById('activeGameTitle');
    this.activeInstructions = document.getElementById('activeInstructions');
    this.activeScore = document.getElementById('activeScore');
    this.activeBest = document.getElementById('activeBest');
    this.activeState = document.getElementById('activeState');

    this.btnBackToMenu = document.getElementById('btnBackToMenu');
    this.btnActionStart = document.getElementById('btnActionStart');
    this.btnActionPause = document.getElementById('btnActionPause');
    this.btnActionRestart = document.getElementById('btnActionRestart');

    this.matrixGrid = document.getElementById('matrixGrid');
    this.matrixCells = [];

    this.isSimulating = false;
    this.simFrameTimer = null;

    this.initMatrixGrid();
    this.bindEvents();
    this.bindSerialEvents();
    this.updateCardHighScores();
  }

  loadHighScores() {
    try {
      const saved = localStorage.getItem('pixel_arcade_highscores');
      if (saved) {
        this.highScores = Object.assign(this.highScores, JSON.parse(saved));
      }
    } catch (e) {
      console.warn('Could not load high scores', e);
    }
  }

  saveHighScore(game, score) {
    if (score > (this.highScores[game] || 0)) {
      this.highScores[game] = score;
      try {
        localStorage.setItem('pixel_arcade_highscores', JSON.stringify(this.highScores));
      } catch (e) {}
      this.updateCardHighScores();
    }
  }

  updateCardHighScores() {
    for (const [game, score] of Object.entries(this.highScores)) {
      const el = document.getElementById(`cardBest_${game}`);
      if (el) el.textContent = score;
    }
  }

  initMatrixGrid() {
    if (!this.matrixGrid) return;
    this.matrixGrid.innerHTML = '';
    this.matrixCells = [];
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const led = document.createElement('div');
        led.className = 'matrix-led';
        led.dataset.r = r;
        led.dataset.c = c;
        this.matrixGrid.appendChild(led);
        this.matrixCells.push(led);
      }
    }
  }

  renderMatrixFrame(frameStr) {
    if (!frameStr || frameStr.length < 25 || this.matrixCells.length < 25) return;
    for (let i = 0; i < 25; i++) {
      if (frameStr[i] === '1') {
        this.matrixCells[i].classList.add('on');
      } else {
        this.matrixCells[i].classList.remove('on');
      }
    }
  }

  logTerminal(text, type = '') {
    if (!this.terminalLogs) return;
    const p = document.createElement('p');
    if (type) p.className = type;
    p.textContent = `> ${text}`;
    this.terminalLogs.appendChild(p);
    this.terminalLogs.scrollTop = this.terminalLogs.scrollHeight;
  }

  bindEvents() {
    if (this.btnSound) {
      this.btnSound.addEventListener('click', () => {
        const enabled = window.soundEngine ? window.soundEngine.toggle() : false;
        this.btnSound.textContent = enabled ? '🔊' : '🔇';
        this.logTerminal(`Audio ${enabled ? 'enabled' : 'muted'}`);
      });
    }

    if (this.btnConnect) {
      this.btnConnect.addEventListener('click', async () => {
        if (window.soundEngine) window.soundEngine.click();
        try {
          this.logTerminal('Requesting USB Serial Port (9600 Baud)...');
          await window.serialManager.connect();
        } catch (err) {
          this.logTerminal(`Connection error: ${err.message}`, 'warn');
        }
      });
    }

    if (this.btnDisconnect) {
      this.btnDisconnect.addEventListener('click', async () => {
        if (window.soundEngine) window.soundEngine.click();
        await window.serialManager.disconnect();
      });
    }

    document.querySelectorAll('.btn-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const gameKey = e.currentTarget.dataset.game;
        this.openGameView(gameKey);
      });
    });

    if (this.btnBackToMenu) {
      this.btnBackToMenu.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.click();
        if (window.serialManager && window.serialManager.isConnected) {
          window.serialManager.sendCommand('BACK');
        }
        this.showMenuScreen();
      });
    }

    if (this.btnActionStart) {
      this.btnActionStart.addEventListener('click', async () => {
        if (window.soundEngine) window.soundEngine.select();
        if (!this.selectedGame) {
          this.logTerminal('Choose a game card first.', 'warn');
          return;
        }
        if (window.serialManager && window.serialManager.isConnected) {
          this.activeState.textContent = 'STARTING…';
          this.logTerminal(`Sending START:${this.selectedGame} to Arduino…`);
          const sent = await window.serialManager.sendCommand(`START:${this.selectedGame}`);
          if (sent) this.logTerminal('Start command sent. Waiting for Arduino game status…', 'in');
          else {
            this.activeState.textContent = 'START FAILED';
            this.logTerminal('The command could not be written to the serial port.', 'warn');
          }
        } else {
          this.startSimulatedGame();
        }
      });
    }

    if (this.btnActionPause) {
      this.btnActionPause.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.click();
        if (window.serialManager && window.serialManager.isConnected) {
          if (this.activeState.textContent === 'PAUSED') {
            window.serialManager.sendCommand('RESUME');
          } else {
            window.serialManager.sendCommand('PAUSE');
          }
        }
      });
    }

    if (this.btnActionRestart) {
      this.btnActionRestart.addEventListener('click', () => {
        if (window.soundEngine) window.soundEngine.select();
        if (window.serialManager && window.serialManager.isConnected) {
          window.serialManager.sendCommand('RESTART');
        } else {
          this.startSimulatedGame();
        }
      });
    }
  }

  bindSerialEvents() {
    if (!window.serialManager) {
      window.serialManager = new SerialManager();
    }

    window.serialManager.onStatusChange = (connected, message) => {
      if (connected) {
        if (this.statusDot) this.statusDot.classList.add('connected');
        if (this.statusText) this.statusText.textContent = 'Arduino Connected (9600 Baud)';
        if (this.btnConnect) this.btnConnect.style.display = 'none';
        if (this.btnDisconnect) this.btnDisconnect.style.display = 'inline-block';
        this.logTerminal(`Serial Connected: ${message}`, 'in');
        if (window.soundEngine) window.soundEngine.victory();
      } else {
        if (this.statusDot) this.statusDot.classList.remove('connected');
        if (this.statusText) this.statusText.textContent = message || 'Arduino Disconnected';
        if (this.btnConnect) this.btnConnect.style.display = 'inline-block';
        if (this.btnDisconnect) this.btnDisconnect.style.display = 'none';
        this.logTerminal(`Serial Disconnected: ${message}`, 'warn');
      }
    };

    window.serialManager.onTelemetry = (key, val) => {
      if (key === 'STATE') {
        if (this.activeState) this.activeState.textContent = val;
        if (window.soundEngine) {
          if (val === 'GAMEOVER') window.soundEngine.gameOver();
          else if (val === 'WIN') window.soundEngine.victory();
        }
      } else if (key === 'SCORE') {
        if (this.activeScore) this.activeScore.textContent = val;
        this.currentScore = val;
        if (this.selectedGame) this.saveHighScore(this.selectedGame, val);
        if (window.soundEngine) window.soundEngine.score();
      } else if (key === 'BEST') {
        if (this.activeBest) this.activeBest.textContent = val;
      } else if (key === 'GAME') {
        if (val !== 'NONE' && val !== 'MENU') {
          this.selectedGame = val;
        }
      } else if (key === 'MENU') {
        console.log("Menu selection updated from physical button:", val);
      } else if (key === 'LCD1') {
        const l1 = document.getElementById('virtual-lcd-line1');
        if (l1) l1.textContent = val;
      } else if (key === 'LCD2') {
        const l2 = document.getElementById('virtual-lcd-line2');
        if (l2) l2.textContent = val;
      } else if (key === 'MSG') {
        this.logTerminal(val, 'out');
      }
    };

    window.serialManager.onFrame = (frameStr) => {
      this.renderMatrixFrame(frameStr);
    };

    window.serialManager.onMessage = (rawLine) => {
      if (!rawLine.startsWith('FRAME:')) {
        console.log('Serial <<', rawLine);
      }
    };
  }

  openGameView(gameKey) {
    this.selectedGame = gameKey;
    const details = GAME_DETAILS[gameKey];
    if (!details) return;

    if (window.soundEngine) window.soundEngine.select();
    if (this.activeGameTitle) this.activeGameTitle.textContent = details.title;
    if (this.activeInstructions) this.activeInstructions.textContent = details.instructions;
    if (this.activeScore) this.activeScore.textContent = '0';
    if (this.activeBest) this.activeBest.textContent = this.highScores[gameKey] || 0;
    if (this.activeState) this.activeState.textContent = 'READY';

    // NEW: Update the dynamic game guide box
    const guide = document.getElementById('guideText');
    if (guide) {
      guide.innerText = GAME_GUIDES[gameKey] || 'Select a game to see instructions.';
    }

    if (this.screenMenu) this.screenMenu.classList.remove('active');
    if (this.screenGame) this.screenGame.classList.add('active');

    this.logTerminal(`Selected game: ${details.title}`);

    this.stopSimulator();
    if (window.serialManager && window.serialManager.isConnected) {
      if (this.activeState) this.activeState.textContent = 'READY — PRESS START';
      this.logTerminal(`Game selected: ${gameKey}. Press START to send it to the Arduino.`);
    } else {
      if (this.activeState) this.activeState.textContent = 'SIMULATOR READY';
      this.logTerminal('Arduino not connected. Press START to preview browser simulator.', 'warn');
    }
  }

  showMenuScreen() {
    this.selectedGame = null;
    if (this.screenGame) this.screenGame.classList.remove('active');
    if (this.screenMenu) this.screenMenu.classList.add('active');
    this.stopSimulator();
    this.updateCardHighScores();
    
    // Reset guide text when returning to menu
    const guide = document.getElementById('guideText');
    if (guide) {
      guide.innerText = 'Select a game to see instructions.';
    }
  }

  startSimulatedGame() {
    this.stopSimulator();
    this.isSimulating = true;
    if (this.activeState) this.activeState.textContent = 'PLAYING (SIM)';
    if (window.soundEngine) window.soundEngine.gameStart();
    this.logTerminal('Running visual simulator preview on 5x5 matrix...', 'in');

    let t = 0;
    this.simFrameTimer = setInterval(() => {
      t++;
      let frame = '';
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const on = ((r + c + Math.floor(t / 2)) % 3 === 0);
          frame += on ? '1' : '0';
        }
      }
      this.renderMatrixFrame(frame);
    }, 100);
  }

  stopSimulator() {
    if (this.simFrameTimer) {
      clearInterval(this.simFrameTimer);
      this.simFrameTimer = null;
    }
    this.isSimulating = false;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.serialManager = new SerialManager();
  window.app = new ArcadeApp();
});
