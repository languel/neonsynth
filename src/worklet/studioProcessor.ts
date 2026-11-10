/** Independent physical voices, a stereo mixer, sequencer and per-track MIDI on the audio thread. */
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor { readonly port: MessagePort; constructor(options?: unknown); }

type Fn = (...args: number[]) => number;
type Exports = { memory: WebAssembly.Memory } & Record<string, Fn>;
type MixTrack = { id: string; steps: (number | null)[]; level: number; pan: number; expression: number; mute: boolean };
type LoadTrack = MixTrack & { bytes: Uint8Array; basePitch: number; release: number };
type Message =
  | { type: "load"; mode: "audition" | "band"; tracks: LoadTrack[]; bpm: number; playing: boolean }
  | { type: "mix"; tracks: MixTrack[]; bpm: number }
  | { type: "transport"; playing: boolean }
  | { type: "note"; midi: number | null; gate: number }
  | { type: "midi-note"; id: string; note: number | null; velocity: number }
  | { type: "midi-bend"; id: string; amount: number }
  | { type: "stop" };
type Voice = LoadTrack & { handle: number; ptr: number; view: Float32Array; ratio: number; midiNote: number | null; velocity: number; bend: number; mixLevel: number; mixPan: number; mutedFrames: number };

class StudioProcessor extends AudioWorkletProcessor {
  private readonly x: Exports;
  private voices: Voice[] = [];
  private mode: "audition" | "band" | "stopped" = "stopped";
  private playing = false;
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
    this.mode = "stopped"; this.playing = false; this.gate = 0;
  }
  private tempo(bpm: number) { const pos=this.cursor/this.framesPerStep; this.framesPerStep = sampleRate * 60 / Math.max(40, Math.min(220, bpm)) / 4; this.cursor=pos*this.framesPerStep; }
  private handle(m: Message) {
    if (m.type === "stop") { this.clear(); return; }
    if (m.type === "note") { this.note = m.midi; this.gate = m.gate; return; }
    if (m.type === "midi-note") {
      const v=this.voices.find(v=>v.id===m.id);
      if(v) { v.midiNote=m.note; v.velocity=m.velocity; }
      return;
    }
    if (m.type === "midi-bend") {
      const v=this.voices.find(v=>v.id===m.id);
      if(v)v.bend=Math.max(-1,Math.min(1,m.amount));
      return;
    }
    if (m.type === "transport") { if(m.playing && !this.playing)this.cursor=0; this.playing=m.playing; return; }
    if (m.type === "mix") {
      this.tempo(m.bpm);
      for (const t of m.tracks) {
        const v=this.voices.find(v=>v.id===t.id);
        if(v) { v.steps=t.steps; v.level=t.level; v.pan=t.pan; v.expression=t.expression; if(!t.mute)v.mutedFrames=0; v.mute=t.mute; }
      }
      return;
    }
    this.clear();
    this.failed = false; this.cursor = 0; this.tempo(m.bpm);
    for (const track of m.tracks.slice(0, 4)) {
      const p = this.x.chimera_alloc(track.bytes.length);
      new Uint8Array(this.x.memory.buffer, p, track.bytes.length).set(track.bytes);
      const h = this.x.studio_new(sampleRate, p, track.bytes.length);
      this.x.chimera_free(p, track.bytes.length);
      if (!h) throw new Error("The physical engine could not construct this instrument. Check that every part is connected and dimensions are in range.");
      const ptr = this.x.studio_render(h, 0);
      this.voices.push({ ...track, handle: h, ptr, view: new Float32Array(0), ratio: 1, midiNote: null, velocity: 0, bend: 0, mixLevel: track.mute ? 0 : track.level*track.expression, mixPan: track.pan, mutedFrames: track.mute ? Math.ceil((track.release*7+.25)*sampleRate) : 0 });
    }
    // Creation can grow Wasm memory and detach earlier views; create them after the final voice.
    for (const v of this.voices) v.view = new Float32Array(this.x.memory.buffer, v.ptr, 4096);
    this.mode = m.mode; this.playing = m.playing;
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
        // Let a muted voice fade and release before pausing its simulation. Freezing
        // it immediately would replay an old held note when it is later unmuted.
        if (v.mute && v.mutedFrames >= (v.release*7+.25)*sampleRate && v.mixLevel < 1e-5 && this.x.studio_rms(v.handle) < 1e-5) continue;
        const live = this.mode === "band" && v.midiNote !== null;
        const note = this.mode === "band" ? (live ? v.midiNote : this.playing ? v.steps[step] : null) : this.note;
        const gate = v.mute ? 0 : this.mode === "band" ? (live ? v.velocity/127 : this.playing && note !== null && sounding ? 1 : 0) : this.gate;
        if (note !== null && note !== undefined) v.ratio = 440 * Math.pow(2, (note - 69 + (this.mode === "band" ? v.bend * 2 : 0)) / 12) / v.basePitch;
        this.x.studio_set(v.handle, v.ratio, gate);
        this.x.studio_render(v.handle, n);
        if (v.view.buffer !== this.x.memory.buffer) v.view = new Float32Array(this.x.memory.buffer, v.ptr, 4096);
        // Smooth CC/fader changes and interpolate gains inside the render quantum,
        // rather than stepping the signal once per block.
        const smoothing=1-Math.exp(-n/(sampleRate*.02));
        const oldLevel=v.mixLevel, oldPan=v.mixPan;
        v.mixLevel += ((v.mute ? 0 : v.level*v.expression)-v.mixLevel)*smoothing;
        v.mixPan += (v.pan-v.mixPan)*smoothing;
        const oldAngle=(Math.max(-1,Math.min(1,oldPan))+1)*Math.PI/4;
        const angle=(Math.max(-1,Math.min(1,v.mixPan))+1)*Math.PI/4;
        let left=Math.cos(oldAngle)*Math.SQRT2*oldLevel, right=Math.sin(oldAngle)*Math.SQRT2*oldLevel;
        const dLeft=(Math.cos(angle)*Math.SQRT2*v.mixLevel-left)/n, dRight=(Math.sin(angle)*Math.SQRT2*v.mixLevel-right)/n;
        for (let i = 0; i < n; i++) {
          left += dLeft; right += dRight;
          const y = v.view[i];
          channels[0][i] += y * left;
          if(channels.length>1)channels[1][i] += y * right;
        }
        if(v.mute)v.mutedFrames+=n;
      }
      // A bounded mixer prevents several loud physical voices from clipping the browser output.
      for (let c = 0; c < channels.length; c++) for (let i = 0; i < n; i++) channels[c][i] = Math.tanh(channels[c][i]);
      if (this.mode === "band" && this.playing) this.cursor += n;
      const budget = n / sampleRate * 1000;
      this.load += 0.05 * ((Date.now() - started) / budget - this.load);
      if (++this.blocks % 16 === 0) {
        let rms = 0; for (const channel of channels) for (let i = 0; i < n; i++) rms += channel[i] * channel[i];
        this.port.postMessage({ type: "telemetry", step: this.mode === "band" && this.playing ? step : -1, rms: Math.sqrt(rms / (n*channels.length)), voices: this.voices.length, load: this.load,
          meters: this.voices.map(v=>({id:v.id,rms:v.mute ? 0 : this.x.studio_rms(v.handle),note:v.midiNote})) });
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
