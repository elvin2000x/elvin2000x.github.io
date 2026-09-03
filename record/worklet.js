/**
 * pcm-capture — AudioWorklet that turns the mic stream into 16 kHz mono
 * 16-bit PCM frames (100 ms each) for the live transcription engine.
 * Downsampling is linear interpolation with a fractional read head, which is
 * plenty for speech and costs nothing.
 */
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.targetRate = opts.targetRate || 16000;
    this.frameSamples = Math.round(this.targetRate / 10); // 100 ms
    this.ratio = sampleRate / this.targetRate;
    this.pos = 0;            // fractional read position into the carry buffer
    this.carry = new Float32Array(0);
    this.out = new Int16Array(this.frameSamples);
    this.outLen = 0;
    this.peak = 0;
    this.peakFrames = 0;
    this.enabled = true;
    this.port.onmessage = (e) => { if (e.data && e.data.type === 'enable') this.enabled = !!e.data.value; };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input.length || !this.enabled) return true;
    // Mix down to mono if the device gives us more than one channel.
    const ch0 = input[0];
    let mono = ch0;
    if (input.length > 1) {
      mono = new Float32Array(ch0.length);
      for (let c = 0; c < input.length; c++) { const ch = input[c]; for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / input.length; }
    }
    // Append to carry.
    const merged = new Float32Array(this.carry.length + mono.length);
    merged.set(this.carry, 0);
    merged.set(mono, this.carry.length);

    let pos = this.pos;
    const ratio = this.ratio;
    while (pos + 1 < merged.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const s = merged[i] + (merged[i + 1] - merged[i]) * frac;
      const a = Math.abs(s);
      if (a > this.peak) this.peak = a;
      const v = Math.max(-1, Math.min(1, s));
      this.out[this.outLen++] = v < 0 ? v * 0x8000 : v * 0x7fff;
      if (this.outLen === this.frameSamples) {
        const buf = this.out.buffer.slice(0);
        this.port.postMessage({ type: 'pcm', buffer: buf, peak: this.peak }, [buf]);
        this.outLen = 0;
        this.peak = 0;
      }
      pos += ratio;
    }
    const keepFrom = Math.floor(pos);
    this.carry = merged.subarray(keepFrom);
    this.pos = pos - keepFrom;
    return true;
  }
}

registerProcessor('pcm-capture', PcmCapture);
