class DatePCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new ArrayBuffer(640);
    this.view = new DataView(this.frame);
    this.offset = 0;
    this.phase = 0;
    this.sum = 0;
    this.samples = 0;
  }

  process(inputs) {
    const mono = inputs[0]?.[0];
    if (!mono) return true;
    for (const sample of mono) {
      this.sum += sample;
      this.samples++;
      this.phase += 16000;
      if (this.phase < sampleRate) continue;
      this.phase -= sampleRate;
      const value = Math.max(-1, Math.min(1, this.sum / this.samples));
      this.view.setInt16(this.offset, value * (value < 0 ? 32768 : 32767), true);
      this.sum = 0;
      this.samples = 0;
      this.offset += 2;
      if (this.offset === this.frame.byteLength) {
        this.port.postMessage(this.frame, [this.frame]);
        this.frame = new ArrayBuffer(640);
        this.view = new DataView(this.frame);
        this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('date-pcm', DatePCMProcessor);
