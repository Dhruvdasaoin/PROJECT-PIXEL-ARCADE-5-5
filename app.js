const GAME_DETAILS = {
  TURBO: {
    title: 'TURBO RUSH',
    instructions: 'Dodge oncoming traffic obstacles at high speed! Swerve left (S4/ArrowLeft) and right (S2/ArrowRight) on Row 4. Each obstacle passed scores +10 points.'
  },
  BLOCKS: {
    title: 'PIXEL BLOCKS',
    instructions: 'Catch falling pixel blocks with your catcher basket on Row 4! Controls: S4/Left, S2/Right. Fall speed ramps up with every catch!'
  },
  MONSTER: {
    title: 'MONSTER ESCAPE',
    instructions: 'Flee from the roaming monster! Navigate your blinking dot with S1..S4 to reach the sanctuary portal at Row 4, Col 4 before you are caught.'
  },
  TREASURE: {
    title: 'TREASURE HUNT',
    instructions: 'Hunt for the hidden treasure chest across the 5x5 grid using the LCD distance radar readout! Beware of concealed spike traps.'
  },
  REACTION: {
    title: 'REACTION RUSH',
    instructions: 'Wait for the sudden arrow prompt and press the matching directional button (S1=UP, S2=RIGHT, S3=DOWN, S4=LEFT) with lightning reflexes!'
  },
  NINJA: {
    title: 'NINJA ESCAPE',
    instructions: 'Infiltrate enemy territory! Dodge across pulsing laser barrier rows without getting hit. Reach Row 0 to complete extraction.'
  },
  DUNGEON: {
    title: 'DUNGEON QUEST',
    instructions: 'Explore the dungeon! Locate the key at (0,4), slay the dungeon minion using S5 (SELECT), and unlock the exit door at (4,4).'
  },
  BOX: {
    title: 'BOX MASTER',
    instructions: 'Sokoban-style puzzle! Move your player with S1..S4 and push the solid crate onto the pulsing target switch at (0,4).'
  },
  BOSS: {
    title: 'BOSS BATTLE',
    instructions: 'Epic mothership showdown! Dodge falling missile barrages and retaliate with your counter-cannons by pressing S5 (SELECT)!'
  }
};

class ArcadeApp {
  constructor() {
    this.selectedGame = null;
    this.currentScore = 0;
    this.highScores = {
      TURBO: 0,
      BLOCKS: 0,
      MONSTER: 0,
      TREASURE: 0,
      REACTION: 0,
      NINJA: 0,
      DUNGEON: 0,
      BOX: 0,
      BOSS: 0
    };
    this.loadHighScores();

    // DOM Elements
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

    // Simulator State (fallback if not connected to hardware)
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
    // Expecting 25 chars of 0s and 1s
    if (!frameStr || frameStr.length < 25) return;
    for (let i = 0; i < 25; i++) {
      if (frameStr[i] === '1') {
        this.matrixCells[i].classList.add('on');
      } else {
        this.matrixCells[i].classList.remove('on');
      }
    }
  }

  logTerminal(text, type = '') {
    const p = document.createElement('p');
    if (type) p.className = type;
    p.textContent = `> ${text}`;
    this.terminalLogs.appendChild(p);
    this.terminalLogs.scrollTop = this.terminalLogs.scrollHeight;
  }

  bindEvents() {
    // Sound Toggle
    this.btnSound.addEventListener('click', () => {
      const enabled = window.soundEngine.toggle();
      this.btnSound.textContent = enabled ? '🔊' : '🔇';
      this.logTerminal(`Audio ${enabled ? 'enabled' : 'muted'}`);
    });

    // USB Connect
    this.btnConnect.addEventListener('click', async () => {
      window.soundEngine.click();
      try {
        this.logTerminal('Requesting USB Serial Port (9600 Baud)...');
        await window.serialManager.connect();
      } catch (err) {
        this.logTerminal(`Connection error: ${err.message}`, 'warn');
      }
    });

    // USB Disconnect
    if (this.btnDisconnect) {
      this.btnDisconnect.addEventListener('click', async () => {
        window.soundEngine.click();
        await window.serialManager.disconnect();
      });
    }

    // Game Selection from Cards
    document.querySelectorAll('.btn-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const gameKey = e.currentTarget.dataset.game;
        this.openGameView(gameKey);
      });
    });

    // Back to Menu
    this.btnBackToMenu.addEventListener('click', () => {
      window.soundEngine.click();
      if (window.serialManager.isConnected) {
        window.serialManager.sendCommand('BACK');
      }
      this.showMenuScreen();
    });

    // Control Bar Buttons
    this.btnActionStart.addEventListener('click', async () => {
      window.soundEngine.select();
      if (!this.selectedGame) {
        this.logTerminal('Choose a game card first.', 'warn');
        return;
      }
      if (window.serialManager.isConnected) {
        this.activeState.textContent = 'STARTING…';
        this.logTerminal(`Sending START:${this.selectedGame} to Arduino…`);
        const sent = await window.serialManager.sendCommand(`START:${this.selectedGame}`);
        if (sent) this.logTerminal('Start command sent. Waiting for Arduino game status…', 'in');
        else {
          this.activeState.textContent = 'START FAILED';
          this.logTerminal('The command could not be written to the serial port. Check the connection.', 'warn');
        }
      } else {
        this.startSimulatedGame();
      }
    });

    this.btnActionPause.addEventListener('click', () => {
      window.soundEngine.click();
      if (window.serialManager.isConnected) {
        if (this.activeState.textContent === 'PAUSED') {
          window.serialManager.sendCommand('RESUME');
        } else {
          window.serialManager.sendCommand('PAUSE');
        }
      }
    });

    this.btnActionRestart.addEventListener('click', () => {
      window.soundEngine.select();
      if (window.serialManager.isConnected) {
        window.serialManager.sendCommand('RESTART');
      } else {
        this.startSimulatedGame();
      }
    });

    // Virtual D-Pad / Buttons
    const triggerVirtual = (key) => {
      window.soundEngine.click();
      if (window.serialManager.isConnected) {
        // Send simulated input if needed or log
        this.logTerminal(`Virtual button pressed: ${key}`);
      }
    };

    document.getElementById('vbtnUp').addEventListener('click', () => triggerVirtual('UP'));
    document.getElementById('vbtnRight').addEventListener('click', () => triggerVirtual('RIGHT'));
    document.getElementById('vbtnDown').addEventListener('click', () => triggerVirtual('DOWN'));
    document.getElementById('vbtnLeft').addEventListener('click', () => triggerVirtual('LEFT'));
    document.getElementById('vbtnSelect').addEventListener('click', () => triggerVirtual('SELECT'));
    document.getElementById('vbtnBack').addEventListener('click', () => triggerVirtual('BACK'));

    // Keyboard bindings for testing
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowUp') { e.preventDefault(); document.getElementById('vbtnUp').click(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); document.getElementById('vbtnRight').click(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); document.getElementById('vbtnDown').click(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); document.getElementById('vbtnLeft').click(); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('vbtnSelect').click(); }
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') { e.preventDefault(); document.getElementById('vbtnBack').click(); }
    });
  }

  bindSerialEvents() {
    window.serialManager.onStatusChange = (connected, message) => {
      if (connected) {
        // Connected state
        this.statusDot.classList.add('connected');
        this.statusText.textContent = 'Arduino Connected (9600 Baud)';
        // Show disconnect button, hide connect
        if (this.btnConnect) this.btnConnect.style.display = 'none';
        if (this.btnDisconnect) this.btnDisconnect.style.display = 'inline-block';
        this.logTerminal(`Serial Connected: ${message}`, 'in');
        window.soundEngine.victory();
      } else {
        // Disconnected or error state
        this.statusDot.classList.remove('connected');
        this.statusText.textContent = message || 'Arduino Disconnected';
        if (this.btnConnect) this.btnConnect.style.display = 'inline-block';
        if (this.btnDisconnect) this.btnDisconnect.style.display = 'none';
        this.logTerminal(`Serial Disconnected: ${message}`, 'warn');
      }
    };

    window.serialManager.onTelemetry = (key, val) => {
      if (key === 'STATE') {
        this.activeState.textContent = val;
        if (val === 'GAMEOVER') window.soundEngine.gameOver();
        else if (val === 'WIN') window.soundEngine.victory();
      } else if (key === 'SCORE') {
        this.activeScore.textContent = val;
        this.currentScore = val;
        if (this.selectedGame) this.saveHighScore(this.selectedGame, val);
        window.soundEngine.score();
      } else if (key === 'BEST') {
        this.activeBest.textContent = val;
      } else if (key === 'GAME') {
        if (val !== 'NONE' && val !== 'MENU') {
          this.selectedGame = val;
        }
      } else if (key === 'STATUS') {
        if (val === 'PLAYING') this.activeState.textContent = 'PLAYING';
        else if (val === 'PAUSED') this.activeState.textContent = 'PAUSED';
        else if (val === 'GAMEOVER') this.activeState.textContent = 'GAME OVER';
        else if (val === 'WIN') this.activeState.textContent = 'VICTORY';
      } else if (key === 'MSG') {
        this.logTerminal(val, 'out');
      }
    };

    window.serialManager.onFrame = (frameStr) => {
      this.renderMatrixFrame(frameStr);
    };

    window.serialManager.onMessage = (rawLine) => {
      // Raw serial line logged
      if (!rawLine.startsWith('FRAME:')) {
        console.log('Serial <<', rawLine);
      }
    };
  }

  openGameView(gameKey) {
    this.selectedGame = gameKey;
    const details = GAME_DETAILS[gameKey];
    if (!details) return;

    window.soundEngine.select();
    this.activeGameTitle.textContent = details.title;
    this.activeInstructions.textContent = details.instructions;
    this.activeScore.textContent = '0';
    this.activeBest.textContent = this.highScores[gameKey] || 0;
    this.activeState.textContent = 'READY';

    this.screenMenu.classList.remove('active');
    this.screenGame.classList.add('active');

    this.logTerminal(`Selected game: ${details.title}`);

    // Selecting a card only opens its details. The START button sends the
    // command, making the selection/start sequence explicit and predictable.
    this.stopSimulator();
    if (window.serialManager.isConnected) {
      this.activeState.textContent = 'READY — PRESS START';
      this.logTerminal(`Game selected: ${gameKey}. Press START to send it to the Arduino.`);
    } else {
      this.activeState.textContent = 'SIMULATOR READY';
      this.logTerminal('Arduino is not connected. Press START to preview the browser simulator.', 'warn');
    }
  }

  showMenuScreen() {
    this.selectedGame = null;
    this.screenGame.classList.remove('active');
    this.screenMenu.classList.add('active');
    this.stopSimulator();
    this.updateCardHighScores();
  }

  // Built-in Browser Simulator Mode (allows immediate visual verification without hardware)
  startSimulatedGame() {
    this.stopSimulator();
    this.isSimulating = true;
    this.activeState.textContent = 'PLAYING (SIM)';
    window.soundEngine.gameStart();
    this.logTerminal('Running visual simulator preview on 5x5 matrix...', 'in');

    let t = 0;
    this.simFrameTimer = setInterval(() => {
      t++;
      let frame = '';
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          // Dynamic retro test pattern
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

// Initialize Application once DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ArcadeApp();
});
