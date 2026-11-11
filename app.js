const GAME_DETAILS = {
  TURBO: {
    title: 'TURBO RUSH',
    instructions: 'Dodge oncoming traffic obstacles at high speed! Swerve left (S4) and right (S2) on Row 4. Each obstacle passed scores +10 points.'
  },
  MONSTER: {
    title: 'MONSTER ESCAPE',
    instructions: 'Flee from the roaming monster! Navigate your blinking dot with S1 (UP), S2 (RIGHT), S3 (DOWN), S4 (LEFT) to reach the sanctuary portal at Row 4, Col 4 before you are caught.'
  },
  TREASURE: {
    title: 'TREASURE HUNT',
    instructions: 'Hunt for the hidden treasure chest across the 5x5 grid using the LCD distance radar readout! Beware of concealed spike traps.'
  },
  REACTION: {
    title: 'REACTION RUSH',
    instructions: 'Match the arrow quickly! S1 = UP, S2 = RIGHT, S3 = DOWN, S4 = LEFT.'
  },
  BOSS: {
    title: 'BOSS BATTLE',
    instructions: 'Epic mothership showdown! Dodge falling missile barrages and retaliate with your counter-cannons by pressing S5 (SELECT)!'
  }
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

    // Callbacks attached by ArcadeApp
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
