/**
 * Procedural Web Audio API sound synthesis for 4-rotor UAV flight dynamics.
 * 100% offline, zero network requests, zero sound file dependencies.
 */

class UavAudioSynthesizer {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private isInitialized: boolean = false;

  // Motor oscillators & audio nodes
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private osc3: OscillatorNode | null = null;
  private osc4: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;

  // Warning beeper state
  private alertOsc: OscillatorNode | null = null;
  private alertGain: GainNode | null = null;
  private lastAlertTime: number = 0;

  constructor() {
    try {
      const saved = localStorage.getItem("uav_smart_audio_enabled");
      this.isMuted = saved === "false";
    } catch {
      this.isMuted = false;
    }
  }

  public getEnabled(): boolean {
    return !this.isMuted;
  }

  public setEnabled(enabled: boolean): void {
    this.isMuted = !enabled;
    try {
      localStorage.setItem("uav_smart_audio_enabled", String(enabled));
    } catch {
      // ignore
    }
    if (this.isMuted && this.motorGain && this.ctx) {
      this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.setEnabled(this.isMuted);
    return !this.isMuted;
  }

  public init(): void {
    if (this.isInitialized) return;
    try {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Master motor filter & gain
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = "lowpass";
      this.filter.frequency.setValueAtTime(650, this.ctx.currentTime);

      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);

      // 4 rotor harmonic oscillators
      this.osc1 = this.ctx.createOscillator();
      this.osc1.type = "sawtooth";
      this.osc1.frequency.setValueAtTime(110, this.ctx.currentTime);

      this.osc2 = this.ctx.createOscillator();
      this.osc2.type = "sawtooth";
      this.osc2.frequency.setValueAtTime(112, this.ctx.currentTime); // Slight detune for rotor beating

      this.osc3 = this.ctx.createOscillator();
      this.osc3.type = "triangle";
      this.osc3.frequency.setValueAtTime(220, this.ctx.currentTime); // 2nd harmonic

      this.osc4 = this.ctx.createOscillator();
      this.osc4.type = "triangle";
      this.osc4.frequency.setValueAtTime(224, this.ctx.currentTime);

      this.osc1.connect(this.filter);
      this.osc2.connect(this.filter);
      this.osc3.connect(this.filter);
      this.osc4.connect(this.filter);

      this.filter.connect(this.motorGain);
      this.motorGain.connect(this.ctx.destination);

      this.osc1.start();
      this.osc2.start();
      this.osc3.start();
      this.osc4.start();

      // Warning beep generator
      this.alertOsc = this.ctx.createOscillator();
      this.alertOsc.type = "sine";
      this.alertOsc.frequency.setValueAtTime(880, this.ctx.currentTime);

      this.alertGain = this.ctx.createGain();
      this.alertGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.alertOsc.connect(this.alertGain);
      this.alertGain.connect(this.ctx.destination);
      this.alertOsc.start();

      this.isInitialized = true;
    } catch {
      // AudioContext unavailable
    }
  }

  public updateMotorAudio(
    throttle: number,
    armed: boolean,
    onGround: boolean,
    failsafe: boolean = false,
    obstacleAlert: boolean = false
  ): void {
    if (!this.isInitialized) {
      if (armed && throttle > 0.05) {
        this.init();
      } else {
        return;
      }
    }

    if (!this.ctx || !this.motorGain || !this.filter || !this.osc1 || !this.osc2 || !this.osc3 || !this.osc4) {
      return;
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    const now = this.ctx.currentTime;

    if (this.isMuted || !armed) {
      this.motorGain.gain.setTargetAtTime(0.0, now, 0.08);
      return;
    }

    // Base RPM calculation: Idle at ground = 90Hz, Full throttle = 440Hz
    const clampedTh = Math.max(0.0, Math.min(1.0, throttle));
    const baseFreq = onGround && clampedTh < 0.1 ? 85 : 120 + clampedTh * 320;
    const targetGain = onGround && clampedTh < 0.1 ? 0.04 : 0.08 + clampedTh * 0.14;
    const filterFreq = 450 + clampedTh * 1400;

    this.osc1.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.osc2.frequency.setTargetAtTime(baseFreq * 1.025, now, 0.06);
    this.osc3.frequency.setTargetAtTime(baseFreq * 2.0, now, 0.06);
    this.osc4.frequency.setTargetAtTime(baseFreq * 2.04, now, 0.06);

    this.filter.frequency.setTargetAtTime(filterFreq, now, 0.08);
    this.motorGain.gain.setTargetAtTime(targetGain, now, 0.08);

    // Periodic warning beep for Failsafe / Obstacle proximity
    if ((failsafe || obstacleAlert) && this.alertGain) {
      const nowMs = performance.now();
      if (nowMs - this.lastAlertTime > (failsafe ? 450 : 700)) {
        this.lastAlertTime = nowMs;
        this.alertGain.gain.cancelScheduledValues(now);
        this.alertGain.gain.setValueAtTime(0.12, now);
        this.alertGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      }
    }
  }

  public stop(): void {
    if (this.motorGain && this.ctx) {
      this.motorGain.gain.setValueAtTime(0, this.ctx.currentTime);
    }
  }
}

export const uavAudio = new UavAudioSynthesizer();
