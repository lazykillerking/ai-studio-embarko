/**
 * 16-bit Chiptune Web Audio Synthesizer for BRAINPRINT
 * Punchy, crisp, audible volume with separate Music & SFX mute toggles.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private musicInterval: any = null;
  private isMusicPlaying = false;
  private musicMuted = false;
  private sfxMuted = false;
  private step = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      this.musicMuted = localStorage.getItem('bp_music_muted') === 'true';
      this.sfxMuted = localStorage.getItem('bp_sfx_muted') === 'true';
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();

      // Master SFX Gain (Clear & punchy volume)
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(this.sfxMuted ? 0 : 0.32, this.ctx.currentTime);
      this.sfxGain.connect(this.ctx.destination);

      // Master Music Filter: 2400Hz for warm retro chiptune without muffling
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(2400, this.ctx.currentTime);
      this.filter.connect(this.ctx.destination);

      // Master Music Gain (Clearly audible, melodic volume)
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(this.musicMuted ? 0 : 0.18, this.ctx.currentTime);
      this.musicGain.connect(this.filter);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public init() {
    this.getContext();
    if (!this.musicMuted) {
      this.startMusic();
    }
  }

  public getMusicMuted(): boolean {
    return this.musicMuted;
  }

  public getSfxMuted(): boolean {
    return this.sfxMuted;
  }

  public toggleMusic(): boolean {
    this.musicMuted = !this.musicMuted;
    localStorage.setItem('bp_music_muted', String(this.musicMuted));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicMuted ? 0 : 0.18, this.ctx.currentTime, 0.05);
    }
    if (!this.musicMuted) {
      this.startMusic();
    }
    return this.musicMuted;
  }

  public toggleSfx(): boolean {
    this.sfxMuted = !this.sfxMuted;
    localStorage.setItem('bp_sfx_muted', String(this.sfxMuted));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setTargetAtTime(this.sfxMuted ? 0 : 0.32, this.ctx.currentTime, 0.05);
    }
    if (!this.sfxMuted) {
      this.playSelect();
    }
    return this.sfxMuted;
  }

  // --- Sound Effects ---

  public playSelect() {
    if (this.sfxMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(960, now + 0.06);

    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playAnswer() {
    if (this.sfxMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playReveal() {
    if (this.sfxMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;

    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      const start = ctx.currentTime + i * 0.06;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.24, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  }

  public playFanfare() {
    if (this.sfxMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;

    const chords = [
      { freq: 523.25, dur: 0.14 }, // C5
      { freq: 659.25, dur: 0.14 }, // E5
      { freq: 783.99, dur: 0.14 }, // G5
      { freq: 1046.5, dur: 0.42 }, // C6
    ];
    let time = ctx.currentTime;
    chords.forEach(({ freq, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(time);
      osc.stop(time + dur);
      time += dur * 0.85;
    });
  }

  public playTick() {
    if (this.sfxMuted) return;
    const ctx = this.getContext();
    if (!ctx || !this.sfxGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(420, now);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // --- Background Arcade Chiptune Music ---

  private startMusic() {
    if (this.isMusicPlaying) return;
    const ctx = this.getContext();
    if (!ctx) return;
    this.isMusicPlaying = true;

    // 16-step nostalgic synthwave bass & arpeggio sequence (Am - F - C - G)
    const melody = [
      220.0, 261.63, 329.63, 440.0,  // Am
      174.61, 220.0, 261.63, 349.23, // F
      130.81, 164.81, 196.0, 261.63, // C
      196.0, 246.94, 293.66, 392.0   // G
    ];

    const bass = [
      110.0, 110.0, 110.0, 110.0,
      87.31, 87.31, 87.31, 87.31,
      65.41, 65.41, 65.41, 65.41,
      98.0, 98.0, 98.0, 98.0
    ];

    const stepDuration = 220; // ms per note

    this.musicInterval = setInterval(() => {
      if (this.musicMuted || !this.ctx || !this.musicGain) return;
      if (this.ctx.state === 'suspended') return;

      const idx = this.step % 16;
      const now = this.ctx.currentTime;

      // Play melody ping with crisp presence
      const mOsc = this.ctx.createOscillator();
      const mGain = this.ctx.createGain();
      mOsc.type = 'triangle';
      mOsc.frequency.setValueAtTime(melody[idx], now);
      mGain.gain.setValueAtTime(0.18, now);
      mGain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
      mOsc.connect(mGain);
      mGain.connect(this.musicGain);
      mOsc.start(now);
      mOsc.stop(now + 0.19);

      // Play punchy bass pulse
      if (idx % 2 === 0) {
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(bass[idx], now);
        bGain.gain.setValueAtTime(0.22, now);
        bGain.gain.exponentialRampToValueAtTime(0.002, now + 0.38);
        bOsc.connect(bGain);
        bGain.connect(this.musicGain);
        bOsc.start(now);
        bOsc.stop(now + 0.38);
      }

      this.step++;
    }, stepDuration);
  }
}

export const sound = new SoundEngine();
