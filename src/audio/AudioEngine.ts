import workletUrl from './worklet.js?worker&url';
import { makeId, type Instrument } from '../model/types';

/** One worklet mixes independent physical graphs for the keyboard and the band. */
export class AudioEngine {
  context: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  private node: AudioWorkletNode | null = null;
  private starting: Promise<void> | null = null;

  async start(): Promise<void> {
    if (this.context && this.node) { await this.context.resume(); return; }
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const context = new AudioContext({ latencyHint: 'interactive' });
      try {
        await context.audioWorklet.addModule(workletUrl);
        const node = new AudioWorkletNode(context, 'neonsynth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        const master = context.createGain(); master.gain.value = 0.8;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -8; compressor.knee.value = 6; compressor.ratio.value = 8;
        const analyser = context.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.78;
        node.connect(master).connect(compressor).connect(analyser).connect(context.destination);
        await context.resume();
        this.context = context; this.node = node; this.analyser = analyser;
      } catch (error) {
        await context.close();
        throw error;
      }
    })().finally(() => { this.starting = null; });
    return this.starting;
  }

  get running(): boolean { return this.context?.state === 'running'; }
  note(instrument: Instrument, midi: number, duration = Infinity, when = this.context?.currentTime ?? 0, velocity = 0.8): string {
    const id = makeId('note');
    this.node?.port.postMessage({ type: 'note', instrument, midi, duration, when, velocity, id });
    return id;
  }
  release(id: string): void { this.node?.port.postMessage({ type: 'release', id }); }
  stop(): void { this.node?.port.postMessage({ type: 'stop' }); }
}
export const audio = new AudioEngine();
