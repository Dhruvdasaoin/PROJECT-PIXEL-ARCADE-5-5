class RetroAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  playTone(freq, type, duration, delay = 0, gainLevel = 0.15) {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const startTime = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(gainLevel, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  click() {
    this.playTone(800, 'square', 0.04, 0, 0.08);
  }

  select() {
    this.playTone(440, 'square', 0.08, 0, 0.12);
    this.playTone(880, 'square', 0.12, 0.06, 0.12);
  }

  gameStart() {
    this.playTone(330, 'square', 0.09, 0, 0.15);
    this.playTone(440, 'square', 0.09, 0.08, 0.15);
    this.playTone(550, 'square', 0.09, 0.16, 0.15);
    this.playTone(660, 'square', 0.22, 0.24, 0.18);
  }

  score() {
    this.playTone(523.25, 'triangle', 0.07, 0, 0.2);
    this.playTone(659.25, 'triangle', 0.07, 0.06, 0.2);
    this.playTone(783.99, 'triangle', 0.15, 0.12, 0.22);
  }

  gameOver() {
    this.playTone(300, 'sawtooth', 0.15, 0, 0.2);
    this.playTone(240, 'sawtooth', 0.18, 0.12, 0.2);
    this.playTone(180, 'sawtooth', 0.25, 0.26, 0.22);
    this.playTone(120, 'sawtooth', 0.45, 0.45, 0.25);
  }

  victory() {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      this.playTone(freq, 'triangle', 0.14, idx * 0.11, 0.2);
    });
    this.playTone(1108.73, 'triangle', 0.35, 0.44, 0.25);
  }

  simonBeep(dir) {
    const freqs = [329.63, 440.0, 523.25, 659.25]; // UP, RIGHT, DOWN, LEFT
    const f = freqs[dir] || 440;
    this.playTone(f, 'sine', 0.22, 0, 0.25);
  }

  miss() {
    this.playTone(160, 'sawtooth', 0.2, 0, 0.25);
  }
}

window.soundEngine = new RetroAudio();
