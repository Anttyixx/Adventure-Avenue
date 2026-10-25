/**
 * Sound effects and background music, synthesized with the Web Audio API (no audio files).
 *
 * Browsers only allow audio after the player touches the page, so the audio context is created
 * on the first pointer or key press; music asked for before then starts at that moment.
 * Volumes are saved per device.
 */

export type Sfx =
  | 'click'
  | 'roll'
  | 'step'
  | 'land'
  | 'coin'
  | 'pay'
  | 'buy'
  | 'grow'
  | 'suit'
  | 'promote'
  | 'venture'
  | 'turn'
  | 'round'
  | 'warp'
  | 'bankrupt'
  | 'win'
  | 'deny';

export const SFX_NAMES: Sfx[] = [
  'click',
  'roll',
  'step',
  'land',
  'coin',
  'pay',
  'buy',
  'grow',
  'suit',
  'promote',
  'venture',
  'turn',
  'round',
  'warp',
  'bankrupt',
  'win',
  'deny',
];

export type Track = 'menu' | 'game';
export const TRACK_NAMES: Record<Track, string> = {
  menu: 'Main Street (menu)',
  game: 'Avenue Stroll (game)',
};

interface AudioPrefs {
  music: number;
  sfx: number;
  muted: boolean;
}

const KEY = 'adventure-avenue-audio';

function loadPrefs(): AudioPrefs {
  const d = { music: 0.5, sfx: 0.7, muted: false };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return d;
  }
}

/** Note name (e.g. "C4", "F#3", "Bb5") to frequency in Hz. */
function freq(note: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return 440;
  const semis: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
  const n = semis[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] - 4) * 12;
  return 440 * 2 ** (n / 12);
}

// ------------------------------------------------------------ music

/**
 * A song is a loop of bars. Each part line holds 8 steps per bar (eighth notes): a note name
 * plays, "-" holds the previous note, "." is a rest. Chords give the pad and bass their roots.
 */
interface Song {
  bpm: number;
  chords: string[][];
  lead: string[];
  bass: string[];
  drums: string[];
}

const SONGS: Record<Track, Song> = {
  // Relaxed theme for the menus.
  menu: {
    bpm: 92,
    chords: [
      ['F3', 'A3', 'C4'],
      ['D3', 'F3', 'A3'],
      ['Bb2', 'D3', 'F3'],
      ['C3', 'E3', 'G3'],
      ['F3', 'A3', 'C4'],
      ['D3', 'F3', 'A3'],
      ['G3', 'Bb3', 'D4'],
      ['C3', 'E3', 'G3'],
    ],
    lead: [
      'A4 - C5 - F5 - E5 -',
      'D5 - - - A4 - - -',
      'Bb4 - D5 - F5 - G5 F5',
      'E5 - - - C5 - - -',
      'A4 - C5 - F5 - A5 -',
      'G5 - F5 - D5 - - -',
      'D5 - Bb4 - G4 - Bb4 D5',
      'C5 - - - - - . .',
    ],
    bass: [
      'F2 . . F2 C3 . . .',
      'D2 . . D2 A2 . . .',
      'Bb1 . . Bb1 F2 . . .',
      'C2 . . C2 G2 . . .',
      'F2 . . F2 C3 . . .',
      'D2 . . D2 A2 . . .',
      'G2 . . G2 D3 . . .',
      'C2 . . C2 G2 . E2 .',
    ],
    drums: ['k . h . s . h .'],
  },
  // Bouncy town theme for the board.
  game: {
    bpm: 116,
    chords: [
      ['C4', 'E4', 'G4'],
      ['A3', 'C4', 'E4'],
      ['F3', 'A3', 'C4'],
      ['G3', 'B3', 'D4'],
      ['C4', 'E4', 'G4'],
      ['A3', 'C4', 'E4'],
      ['D4', 'F4', 'A4'],
      ['G3', 'B3', 'D4'],
      ['F3', 'A3', 'C4'],
      ['G3', 'B3', 'D4'],
      ['E3', 'G3', 'B3'],
      ['A3', 'C4', 'E4'],
      ['F3', 'A3', 'C4'],
      ['G3', 'B3', 'D4'],
      ['C4', 'E4', 'G4'],
      ['C4', 'E4', 'G4'],
    ],
    lead: [
      'E5 . G5 . C6 - G5 .',
      'A5 . E5 . C5 - E5 .',
      'F5 . A5 . C6 - A5 .',
      'G5 - - . D5 . B4 .',
      'E5 . G5 . C6 - G5 .',
      'A5 . C6 . E6 - C6 .',
      'D6 . C6 . A5 . F5 .',
      'G5 - - - - . . .',
      'A5 . G5 . F5 . A5 .',
      'G5 . F5 . D5 . G5 .',
      'E5 . D5 . B4 . E5 .',
      'C5 - E5 - A5 - - .',
      'F5 . A5 . C6 . A5 .',
      'G5 . B5 . D6 . B5 .',
      'C6 - G5 - E5 - G5 -',
      'C6 - - - . . . .',
    ],
    bass: [
      'C3 . G2 . C3 . G2 .',
      'A2 . E2 . A2 . E2 .',
      'F2 . C3 . F2 . C3 .',
      'G2 . D3 . G2 . B2 .',
      'C3 . G2 . C3 . G2 .',
      'A2 . E2 . A2 . E2 .',
      'D3 . A2 . D3 . A2 .',
      'G2 . D3 . G2 . B2 .',
      'F2 . C3 . F2 . C3 .',
      'G2 . D3 . G2 . D3 .',
      'E2 . B2 . E2 . B2 .',
      'A2 . E2 . A2 . G2 .',
      'F2 . C3 . F2 . C3 .',
      'G2 . D3 . G2 . D3 .',
      'C3 . G2 . E2 . G2 .',
      'C3 . G2 . C3 . . .',
    ],
    drums: ['k . h k s . h h', 'k . h . s . h s'],
  },
};

type Voice = 'lead' | 'bass' | 'pad';

/** A short silent 8 kHz mono WAV as a data URL. */
function silentWav(): string {
  const samples = 800;
  const bytes = new Uint8Array(44 + samples);
  const v = new DataView(bytes.buffer);
  const text = (at: number, t: string) => [...t].forEach((c, i) => (bytes[at + i] = c.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + samples, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true); // 8-bit: silence is 128
  text(36, 'data');
  v.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

class AudioEngine {
  prefs = loadPrefs();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private track: Track | null = null;
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  /** Last time each effect played, to keep fast CPU turns from stacking sounds. */
  private last = new Map<Sfx, number>();
  private listeners = new Set<() => void>();

  constructor() {
    // Phones only count some events as a user gesture that may start audio (a finger lifting,
    // a click), so listen to all of them and keep listening: iOS can also interrupt audio later
    // (a call, the lock screen) and it needs another tap to come back.
    const unlock = () => {
      this.ensure();
      this.playThroughSilentSwitch();
      const ctx = this.ctx;
      if (ctx && ctx.state !== 'running' && !document.hidden) {
        // Older Safari also wants a sound started inside the gesture before it unlocks.
        const kick = ctx.createBufferSource();
        kick.buffer = ctx.createBuffer(1, 1, 22050);
        kick.connect(ctx.destination);
        kick.start(0);
        void ctx.resume().catch(() => {});
      }
    };
    for (const ev of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'])
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) {
        void this.ctx.suspend();
        this.silent?.pause();
      } else {
        void this.ctx.resume().catch(() => {});
        if (this.silent) void this.silent.play().catch(() => {});
      }
    });
  }

  /** Looping silent clip that makes iOS treat the page as media playback (see below). */
  private silent: HTMLAudioElement | null = null;

  /**
   * iPhones mute Web Audio when the ring/silent switch is on. Asking for the "playback" audio
   * session (iOS 17+), or on older iOS playing a silent media clip, lets the game's sound play
   * like a video's would. Players can still turn it off with the Mute switch.
   */
  private playThroughSilentSwitch() {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session) {
      if (session.type !== 'playback') session.type = 'playback';
      return;
    }
    if (
      !/iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent))
    )
      return;
    if (!this.silent) {
      this.silent = new Audio(silentWav());
      this.silent.loop = true;
      this.silent.setAttribute('playsinline', '');
    }
    if (this.silent.paused) void this.silent.play().catch(() => {});
  }

  /** True once the browser lets the game play sound. */
  get ready() {
    return this.ctx?.state === 'running';
  }

  /** Create the audio graph (only after a user gesture). */
  private ensure() {
    if (this.ctx) return;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    ctx.onstatechange = () => this.listeners.forEach((f) => f());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    if (this.track) this.startLoop();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const m = this.prefs.muted ? 0 : 1;
    // Music sits well under the effects; squares keep the slider feeling even.
    this.musicBus.gain.setTargetAtTime(m * this.prefs.music ** 2 * 1.4, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(m * this.prefs.sfx ** 2 * 1.8, t, 0.05);
  }

  set(p: Partial<AudioPrefs>) {
    this.prefs = { ...this.prefs, ...p };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.prefs));
    } catch {
      /* storage unavailable */
    }
    this.applyVolumes();
    this.listeners.forEach((f) => f());
  }

  /** Called whenever the volume settings change (keeps mute buttons in sync). */
  onChange(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  // ------------------------------------------------------------ building blocks

  private tone(
    bus: AudioNode,
    type: OscillatorType,
    f: number,
    at: number,
    dur: number,
    vol: number,
    opts: { to?: number; attack?: number; cutoff?: number; vibrato?: number; sustain?: boolean } = {},
  ) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f, at);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, at + dur);
    const g = ctx.createGain();
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    if (opts.sustain && dur > attack + 0.1) {
      // Held notes: ease down to a sustain level, then release at the end.
      g.gain.linearRampToValueAtTime(vol * 0.6, at + dur - 0.06);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let out: AudioNode = osc;
    if (opts.cutoff) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = opts.cutoff;
      out.connect(lp);
      out = lp;
    }
    if (opts.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = opts.vibrato;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + dur + 0.05);
    }
    out.connect(g).connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private hiss(bus: AudioNode, at: number, dur: number, vol: number, band: number, q = 1, sweepTo?: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(band, at);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    bp.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(g).connect(bus);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }

  private notes(list: string[], at: number, gap: number, type: OscillatorType, vol: number, len = gap * 1.6) {
    list.forEach((n, i) => this.tone(this.sfxBus, type, freq(n), at + i * gap, len, vol));
  }

  // ------------------------------------------------------------ effects

  play(name: Sfx) {
    this.ensure();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.prefs.muted || this.prefs.sfx === 0) return;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < 0.045) return;
    this.last.set(name, now);
    const t = now + 0.01;
    const bus = this.sfxBus;
    switch (name) {
      case 'click':
        this.tone(bus, 'square', 1320, t, 0.04, 0.08, { cutoff: 3000 });
        break;
      case 'roll':
        // Dice rattling in a cup, then a clack.
        for (let i = 0; i < 9; i++)
          this.hiss(bus, t + i * 0.055 + Math.random() * 0.02, 0.05, 0.5, 2200 + Math.random() * 1800, 6);
        this.tone(bus, 'triangle', 300, t + 0.55, 0.09, 0.4, { to: 160 });
        break;
      case 'step':
        this.tone(bus, 'triangle', 620, t, 0.07, 0.22, { to: 480 });
        this.hiss(bus, t, 0.03, 0.12, 3500, 4);
        break;
      case 'land':
        this.tone(bus, 'triangle', 392, t, 0.12, 0.3);
        this.tone(bus, 'triangle', 523, t + 0.07, 0.16, 0.3);
        break;
      case 'coin':
        this.tone(bus, 'square', 988, t, 0.08, 0.16, { cutoff: 5000 });
        this.tone(bus, 'square', 1319, t + 0.07, 0.28, 0.16, { cutoff: 5000 });
        break;
      case 'pay':
        this.tone(bus, 'square', 784, t, 0.08, 0.13, { cutoff: 3000 });
        this.tone(bus, 'square', 523, t + 0.08, 0.22, 0.13, { cutoff: 2500 });
        break;
      case 'buy':
        this.notes(['C5', 'E5', 'G5', 'C6'], t, 0.07, 'square', 0.13);
        this.tone(bus, 'triangle', freq('C6'), t + 0.28, 0.4, 0.2);
        break;
      case 'grow':
        this.tone(bus, 'sine', 500, t, 0.45, 0.22, { to: 1500 });
        this.notes(['G5', 'B5', 'D6', 'G6'], t + 0.1, 0.06, 'triangle', 0.14);
        break;
      case 'suit':
        this.tone(bus, 'sine', freq('E6'), t, 0.6, 0.22);
        this.tone(bus, 'sine', freq('B6'), t + 0.08, 0.6, 0.14);
        this.tone(bus, 'triangle', freq('E7'), t + 0.16, 0.5, 0.06);
        break;
      case 'promote':
        this.notes(['C5', 'C5', 'C5', 'G5'], t, 0.11, 'square', 0.14, 0.12);
        this.tone(bus, 'square', freq('E5'), t + 0.44, 0.15, 0.14, { cutoff: 4000 });
        this.tone(bus, 'square', freq('C6'), t + 0.58, 0.7, 0.15, { cutoff: 4000, vibrato: 6 });
        this.tone(bus, 'triangle', freq('C4'), t + 0.58, 0.7, 0.25);
        this.tone(bus, 'triangle', freq('G4'), t + 0.58, 0.7, 0.18);
        break;
      case 'venture':
        for (let i = 0; i < 8; i++)
          this.tone(
            bus,
            'sine',
            freq(['C6', 'E6', 'G6', 'B6'][i % 4]) * (i >= 4 ? 2 : 1),
            t + i * 0.045,
            0.3,
            0.09,
          );
        this.hiss(bus, t, 0.5, 0.08, 6000, 2);
        break;
      case 'turn':
        this.tone(bus, 'sine', freq('G5'), t, 0.25, 0.2);
        this.tone(bus, 'sine', freq('C6'), t + 0.12, 0.4, 0.2);
        break;
      case 'round':
        this.tone(bus, 'triangle', freq('C5'), t, 0.5, 0.2);
        this.tone(bus, 'triangle', freq('G5'), t, 0.5, 0.12);
        break;
      case 'warp':
        this.tone(bus, 'sine', 300, t, 0.35, 0.22, { to: 1800 });
        this.hiss(bus, t, 0.35, 0.18, 800, 3, 6000);
        break;
      case 'bankrupt':
        ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) =>
          this.tone(bus, 'sawtooth', freq(n), t + i * 0.3, i === 3 ? 0.9 : 0.3, 0.12, {
            cutoff: 1400,
            vibrato: i === 3 ? 8 : 0,
          }),
        );
        break;
      case 'win':
        this.notes(['G4', 'C5', 'E5', 'G5', 'E5', 'G5'], t, 0.12, 'square', 0.13, 0.14);
        this.tone(bus, 'square', freq('C6'), t + 0.72, 1.2, 0.15, { cutoff: 4000, vibrato: 5 });
        for (const n of ['C4', 'E4', 'G4']) this.tone(bus, 'triangle', freq(n), t + 0.72, 1.2, 0.16);
        break;
      case 'deny':
        this.tone(bus, 'square', 220, t, 0.12, 0.12, { cutoff: 1200 });
        this.tone(bus, 'square', 196, t + 0.12, 0.18, 0.12, { cutoff: 1200 });
        break;
    }
  }

  // ------------------------------------------------------------ music

  /** Switch the background music (null = silence). Safe to call before audio is unlocked. */
  music(track: Track | null) {
    if (track === this.track) return;
    this.track = track;
    clearInterval(this.timer);
    this.timer = 0;
    if (!this.ctx) return;
    // Fade out whatever is playing; the new song starts on a fresh bar.
    const t = this.ctx.currentTime;
    const old = this.musicBus;
    old.gain.setTargetAtTime(0, t, 0.15);
    setTimeout(() => old.disconnect(), 800);
    this.musicBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.applyVolumes();
    if (track) this.startLoop();
  }

  get currentTrack() {
    return this.track;
  }

  private startLoop() {
    if (!this.ctx || !this.track) return;
    clearInterval(this.timer);
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.25;
    this.timer = window.setInterval(() => this.schedule(), 40);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const song = SONGS[this.track];
    const stepDur = 60 / song.bpm / 2;
    const bars = song.chords.length;
    const parse = (line: string) => line.split(/\s+/);
    while (this.nextTime < ctx.currentTime + 0.2) {
      const bar = Math.floor(this.step / 8) % bars;
      const s = this.step % 8;
      const at = this.nextTime;
      const lead = parse(song.lead[bar % song.lead.length]);
      const bass = parse(song.bass[bar % song.bass.length]);
      const drums = parse(song.drums[bar % song.drums.length]);
      const hold = (parts: string[], i: number) => {
        let n = 1;
        while (i + n < parts.length && parts[i + n] === '-') n++;
        return n;
      };
      if (lead[s] && lead[s] !== '.' && lead[s] !== '-')
        this.voice('lead', lead[s], at, hold(lead, s) * stepDur);
      if (bass[s] && bass[s] !== '.' && bass[s] !== '-')
        this.voice('bass', bass[s], at, hold(bass, s) * stepDur);
      if (s === 0) for (const n of song.chords[bar]) this.voice('pad', n, at, stepDur * 8);
      if (s === 4 && this.track === 'game')
        for (const n of song.chords[bar]) this.voice('pad', n, at, stepDur * 3);
      const d = drums[s];
      if (d === 'k') this.tone(this.musicBus, 'sine', 150, at, 0.16, 0.5, { to: 45 });
      if (d === 's') this.hiss(this.musicBus, at, 0.12, 0.22, 1800, 0.8);
      if (d === 'h') this.hiss(this.musicBus, at, 0.04, 0.12, 8000, 1.5);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private voice(v: Voice, note: string, at: number, dur: number) {
    const f = freq(note);
    const bus = this.musicBus;
    if (v === 'lead') {
      this.tone(bus, 'square', f, at, Math.max(0.12, dur * 0.95), 0.07, {
        cutoff: 2600,
        attack: 0.01,
        vibrato: dur > 0.5 ? 4 : 0,
        sustain: true,
      });
      this.tone(bus, 'triangle', f * 2, at, Math.max(0.1, dur * 0.6), 0.03);
    } else if (v === 'bass') {
      this.tone(bus, 'triangle', f, at, Math.max(0.15, dur * 0.9), 0.3, { cutoff: 900, sustain: true });
    } else {
      this.tone(bus, 'sawtooth', f, at, dur, 0.022, { cutoff: 1100, attack: 0.08, sustain: true });
    }
  }
}

export const sound = new AudioEngine();
