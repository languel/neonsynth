import { PhysicalVoice } from './dsp.js';

class NeonsynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voices = [];
    this.port.onmessage = ({ data }) => {
      if (data.type === 'note') {
        const start = Math.max(currentFrame, Math.round(data.when * sampleRate));
        const end = Number.isFinite(data.duration) ? start + Math.max(1, Math.round(data.duration * sampleRate)) : Infinity;
        if (this.voices.length >= 24) this.voices.shift();
        this.voices.push(new PhysicalVoice(data.instrument, data.midi, sampleRate, data.velocity, start, end, data.id));
      } else if (data.type === 'release') {
        for (const voice of this.voices) if (voice.id === data.id) voice.release(currentFrame);
      } else if (data.type === 'stop') {
        for (const voice of this.voices) voice.release(currentFrame, true);
      }
    };
    this.port.postMessage({ type: 'ready' });
  }
  process(_inputs, outputs) {
    const channels = outputs[0];
    if (!channels?.length) return true;
    const left = channels[0], right = channels[1];
    for (let i = 0; i < left.length; i++) {
      let sample = 0;
      for (const voice of this.voices) sample += voice.next(currentFrame + i);
      sample = Math.tanh(sample * .9);
      left[i] = sample;
      if (right) right[i] = sample;
    }
    this.voices = this.voices.filter((voice) => !voice.done(currentFrame + left.length));
    return true;
  }
}
registerProcessor('neonsynth', NeonsynthProcessor);
