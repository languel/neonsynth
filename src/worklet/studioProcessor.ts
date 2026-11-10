/** Multiple independent custom Chimera airway voices, mixed and sequenced on the audio thread. */
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; constructor(options?: unknown); }

type Fn = (...args: number[]) => number;
type Exports = { memory: WebAssembly.Memory } & Record<string, Fn>;
type LoadTrack = { bytes: Uint8Array; basePitch: number; steps: (number | null)[]; level: number; mute: boolean };
type Message =
  | { type: "load"; mode: "audition" | "band"; tracks: LoadTrack[]; bpm: number }
  | { type: "note"; midi: number | null; gate: number }
  | { type: "stop" };
type Voice = LoadTrack & { handle: number; ptr: number; view: Float32Array; ratio: number };

class StudioProcessor extends AudioWorkletProcessor {
  private readonly x: Exports;
  private voices: Voice[] = [];
  private mode: "audition" | "band" | "stopped" = "stopped";
  private cursor = 0;
  private framesPerStep = 6000;
  private note: number | null = null;
  private gate = 0;
  private blocks = 0;
  private load = 0;
  private failed = false;
  constructor(options: { processorOptions: { module: WebAssembly.Module } }) {
    super();
    this.x = new WebAssembly.Instance(options.processorOptions.module, {}).exports as unknown as Exports;
    this.port.onmessage = (e: MessageEvent<Message>) => {
      try { this.handle(e.data); }
      catch (error) { this.clear(); this.port.postMessage({ type: "error", message: String(error) }); }
    };
  }
  private clear() {
    for (const v of this.voices) this.x.studio_free(v.handle);
    this.voices = [];
    this.mode = "stopped";
    this.gate = 0;
  }
  private handle(m: Message) {
    if (m.type === "stop") { this.clear(); return; }
    if (m.type === "note") { this.note = m.midi; this.gate = m.gate; return; }
    this.clear();
    this.failed = false;
    this.cursor = 0;
    this.framesPerStep = sampleRate * 60 / Math.max(40, Math.min(220, m.bpm)) / 4;
    for (const track of m.tracks.slice(0, 4)) {
      const p = this.x.chimera_alloc(track.bytes.length);
      new Uint8Array(this.x.memory.buffer, p, track.bytes.length).set(track.bytes);
      const h = this.x.studio_new(sampleRate, p, track.bytes.length);
      this.x.chimera_free(p, track.bytes.length);
      if (!h) throw new Error("The physical engine could not construct this instrument. Check that every part is connected and dimensions are in range.");
      const ptr = this.x.studio_render(h, 0);
      this.voices.push({ ...track, handle: h, ptr, view: new Float32Array(0), ratio: 1 });
    }
    // Creation can grow Wasm memory and detach earlier views; create them after the final voice.
    for (const v of this.voices) v.view = new Float32Array(this.x.memory.buffer, v.ptr, 4096);
    this.mode = m.mode;
    this.port.postMessage({ type: "ready", voices: this.voices.length, mode: this.mode });
  }
  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const channels = outputs[0];
    if (!channels?.length || this.failed || this.mode === "stopped") return true;
    try {
      const started = Date.now();
      const n = channels[0].length;
      const position = this.cursor / this.framesPerStep;
      const step = Math.floor(position) % 16;
      const sounding = position - Math.floor(position) < 0.78;
      for (const v of this.voices) {
        // A muted part is not advanced until the band is rebuilt; muting also saves CPU.
        if (v.mute) continue;
        const note = this.mode === "band" ? v.steps[step] : this.note;
        const gate = this.mode === "band" ? (note !== null && sounding && !v.mute ? 1 : 0) : this.gate;
        if (note !== null && note !== undefined) v.ratio = 440 * Math.pow(2, (note - 69) / 12) / v.basePitch;
        this.x.studio_set(v.handle, v.ratio, gate);
        this.x.studio_render(v.handle, n);
        if (v.view.buffer !== this.x.memory.buffer) v.view = new Float32Array(this.x.memory.buffer, v.ptr, 4096);
        const level = v.mute ? 0 : v.level;
        for (let i = 0; i < n; i++) {
          const y = v.view[i] * level;
          for (let c = 0; c < channels.length; c++) channels[c][i] += y;
        }
      }
      // A bounded mixer prevents several loud physical voices from clipping the browser output.
      for (let c = 0; c < channels.length; c++) for (let i = 0; i < n; i++) channels[c][i] = Math.tanh(channels[c][i]);
      if (this.mode === "band") this.cursor += n;
      const budget = n / sampleRate * 1000;
      this.load += 0.05 * ((Date.now() - started) / budget - this.load);
      if (++this.blocks % 16 === 0) {
        let rms = 0; for (let i = 0; i < n; i++) rms += channels[0][i] * channels[0][i];
        this.port.postMessage({ type: "telemetry", step: this.mode === "band" ? step : -1, rms: Math.sqrt(rms / n), voices: this.voices.length, load: this.load });
      }
    } catch (error) {
      this.failed = true;
      this.port.postMessage({ type: "error", message: `Studio engine stopped: ${String(error)}` });
    }
    return true;
  }
}
registerProcessor("chimera-studio", StudioProcessor);
export {};
