export class TennisAudio {
  private context: AudioContext | null = null;
  unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended')
        void this.context.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  play(kind: 'racket' | 'bounce' | 'net', strength: number, volume: number) {
    const ctx = this.context;
    if (!ctx || ctx.state !== 'running' || volume <= 0) return;
    const now = ctx.currentTime;
    const bounce = kind === 'bounce';
    const duration = bounce ? 0.055 : kind === 'racket' ? 0.095 : 0.045;
    const gain = ctx.createGain();
    const amplitude =
      volume *
      Math.max(0.1, strength) *
      (bounce ? 0.4 : kind === 'racket' ? 0.55 : 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(amplitude, now + 0.0015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(ctx.destination);
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(
      bounce ? 185 + strength * 30 : kind === 'racket' ? 610 : 130,
      now,
    );
    tone.frequency.exponentialRampToValueAtTime(
      bounce ? 105 : kind === 'racket' ? 270 : 80,
      now + duration * 0.75,
    );
    tone.connect(gain);
    // Court bounce is a short hollow tone, with no snare-like noise layer.
    let noise: AudioBufferSourceNode | null = null;
    let filter: BiquadFilterNode | null = null;
    let transient: GainNode | null = null;
    if (kind === 'racket') {
      const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * 0.009),
        ctx.sampleRate,
      );
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++)
        samples[i] =
          (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.0015));
      noise = ctx.createBufferSource();
      noise.buffer = buffer;
      filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1400;
      transient = ctx.createGain();
      transient.gain.value = 0.7;
      noise.connect(filter).connect(transient).connect(gain);
      noise.start(now);
    }
    tone.start(now);
    tone.stop(now + duration);
    tone.onended = () => {
      tone.disconnect();
      gain.disconnect();
      noise?.disconnect();
      filter?.disconnect();
      transient?.disconnect();
    };
  }
  dispose() {
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }
}
