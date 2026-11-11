/* PIXEL ARCADE 5x5 - Web Serial connection manager */
class SerialManager {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readableStreamClosed = null;
    this.writableStreamClosed = null;
    this.isConnected = false;
    this.inputBuffer = '';
    this.onStatusChange = null;
    this.onMessage = null;
    this.onTelemetry = null;
    this.onFrame = null;

    if ('serial' in navigator) {
      navigator.serial.addEventListener('disconnect', (event) => {
        if (this.port && event.port === this.port) {
          this.handleDisconnect('USB device disconnected');
        }
      });
    }
  }

  isSupported() {
    return !!(navigator.serial && window.isSecureContext);
  }

  async connect() {
    // IMPORTANT: requestPort is called immediately from the Connect button's
    // click handler, before any await, so Chrome can show its permission picker.
    if (!window.isSecureContext) {
      throw new Error('Open this website using http://localhost, not a file:// address.');
    }
    if (!('serial' in navigator)) {
      throw new Error('Web Serial is unavailable. Use the latest Google Chrome or Microsoft Edge.');
    }
    if (this.isConnected) return true;

    this.notifyStatus(false, 'CONNECTING');
    this.log('Opening device picker…');

    try {
      // Do not filter by vendor ID: many Uno-compatible CH340/CP210x boards
      // use different USB vendor IDs from official Arduino boards.
      this.port = await navigator.serial.requestPort();
      this.log('USB device selected. Opening at 9600 baud…');
      await this.port.open({ baudRate: 9600 });

      this.isConnected = true;
      this.inputBuffer = '';
      this.notifyStatus(true, 'CONNECTED @ 9600 BAUD');
      this.log('Serial port opened successfully.');

      this.startReadLoop();
      await this.sendCommand('STATUS');
      return true;
    } catch (error) {
      const message = error && error.name === 'NotFoundError'
        ? 'No device selected. Click CONNECT USB and choose your Arduino.'
        : error && error.name === 'SecurityError'
          ? 'Browser blocked serial access. Use Chrome/Edge on localhost.'
          : error && error.name === 'InvalidStateError'
            ? 'The COM port is busy. Close Arduino Serial Monitor and try again.'
            : (error && error.message) || 'Could not connect to the USB device.';
      this.log(message, 'warn');
      this.notifyStatus(false, 'DISCONNECTED');
      this.isConnected = false;
      if (this.port) {
        try { await this.port.close(); } catch (_) {}
      }
      this.port = null;
      throw new Error(message);
    }
  }

  async startReadLoop() {
    if (!this.port || !this.port.readable) return;
    this.reader = this.port.readable.getReader();
    const decoder = new TextDecoder();
    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.handleData(decoder.decode(value, { stream: true }));
      }
    } catch (error) {
      if (this.isConnected) this.log(`Serial read error: ${error.message}`, 'warn');
    } finally {
      try { decoder.decode(); } catch (_) {}
      try { this.reader.releaseLock(); } catch (_) {}
      this.reader = null;
    }
  }

  handleData(chunk) {
    this.inputBuffer += chunk;
    const lines = this.inputBuffer.split(/\r?\n/);
    this.inputBuffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (line) this.parseLine(line);
    }
  }

  parseLine(line) {
    if (this.onMessage) this.onMessage(line);
    if (line.startsWith('FRAME:')) {
      const frame = line.slice(6).trim();
      if (this.onFrame) this.onFrame(frame);
      return;
    }
    const splitAt = line.indexOf(':');
    if (splitAt < 0) return;
    const key = line.slice(0, splitAt).trim();
    let value = line.slice(splitAt + 1).trim();
    if (key === 'SCORE' || key === 'BEST') value = parseInt(value, 10) || 0;
    if (['STATUS', 'GAME', 'STATE', 'SCORE', 'BEST', 'MSG'].includes(key) && this.onTelemetry) {
      this.onTelemetry(key, value);
    }
  }

  async sendCommand(command) {
    if (!this.isConnected || !this.port || !this.port.writable) {
      this.log(`Not connected; command not sent: ${command}`, 'warn');
      return false;
    }
    const encoder = new TextEncoder();
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(encoder.encode(`${command}\n`));
      this.log(`SENT: ${command}`);
      return true;
    } catch (error) {
      this.log(`Command failed: ${error.message}`, 'warn');
      return false;
    } finally {
      try { writer.releaseLock(); } catch (_) {}
    }
  }

  async disconnect() {
    this.isConnected = false;
    try {
      if (this.reader) await this.reader.cancel();
    } catch (_) {}
    try {
      if (this.port) await this.port.close();
    } catch (error) {
      this.log(`Port close warning: ${error.message}`, 'warn');
    }
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.notifyStatus(false, 'DISCONNECTED');
    this.log('USB disconnected.');
  }

  handleDisconnect(reason) {
    this.isConnected = false;
    this.port = null;
    this.reader = null;
    this.notifyStatus(false, reason);
    this.log(reason, 'warn');
  }

  notifyStatus(connected, message) {
    if (this.onStatusChange) this.onStatusChange(connected, message);
  }

  log(message, type = '') {
    if (window.app && typeof window.app.logTerminal === 'function') {
      window.app.logTerminal(message, type);
    } else {
      console.log('[PIXEL ARCADE]', message);
    }
  }
}

window.serialManager = new SerialManager();
