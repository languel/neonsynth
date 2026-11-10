import workletUrl from "../worklet/studioProcessor.ts?worker&url";
import { chimeraModule } from "../wasm/chimera.ts";
import { graphError, type Design, type Track } from "./model.ts";

type Meter = { id: string; rms: number; note: number | null };
type Status = { mode: "stopped" | "audition" | "band"; playing: boolean; step: number; rms: number; voices: number; load: number; meters: Meter[]; error: string | null };
const structure = (tracks: Track[]) => JSON.stringify(tracks.map(t=>[t.id,t.design]));
const mixer = (tracks: Track[]) => {
  const hasSolo=tracks.some(t=>t.solo);
  return tracks.map(t=>({id:t.id,steps:t.steps,level:t.level,pan:t.pan,expression:t.expression,mute:t.mute || hasSolo && !t.solo}));
};
class StudioAudio {
  private node: AudioWorkletNode | null = null;
  private epoch = 0;
  get revision() { return this.epoch; }
  get ready() { return this.node !== null; }
  private graphKey = "";
  private gain: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private starting: Promise<void> | null = null;
  private listeners = new Set<(s: Status) => void>();
  status: Status = { mode: "stopped", playing: false, step: -1, rms: 0, voices: 0, load: 0, meters: [], error: null };
  private emit(patch: Partial<Status>) { this.status = { ...this.status, ...patch }; for (const f of this.listeners) f(this.status); }
  subscribe(f: (s: Status) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  async start(ctx: AudioContext): Promise<void> {
    if (this.node && this.ctx === ctx) { await ctx.resume(); return; }
    if (this.starting) return this.starting;
    this.starting = (async () => {
      await ctx.audioWorklet.addModule(workletUrl);
      const node = new AudioWorkletNode(ctx, "chimera-studio", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { module: chimeraModule() } });
      const gain = ctx.createGain(); gain.gain.value = .8;
      node.connect(gain).connect(ctx.destination);
      node.port.onmessage = (e) => {
        const m = e.data;
        if (m.type === "error") this.emit({ mode: "stopped", playing: false, error: m.message, rms: 0, voices: 0, meters: [], step: -1 });
        else if (m.type === "telemetry" && this.status.mode !== "stopped") this.emit({ step: m.step, rms: m.rms, voices: m.voices, load: m.load, meters: m.meters });
      };
      node.onprocessorerror = () => this.emit({ mode: "stopped", playing: false, error: "The audio processor stopped. Reload to try again." });
      this.node = node; this.ctx = ctx; this.gain = gain;
      await ctx.resume();
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  setVolume(v: number) { if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, .02); }
  private load(mode: "audition" | "band", tracks: Track[], bpm: number, playing: boolean) {
    for (const track of tracks) { const error = graphError(track.design); if (error) throw new Error(`${track.name}: ${error}`); }
    if (!this.node) throw new Error("Start audio first.");
    const enc = new TextEncoder(), mix=mixer(tracks);
    this.node.port.postMessage({ type: "load", mode, bpm, playing, tracks: tracks.map((t,i) => ({ ...mix[i], bytes: enc.encode(JSON.stringify(t.design)), basePitch: t.design.basePitch, release: t.design.release })) });
    this.graphKey=mode==="band" ? structure(tracks) : "";
    this.emit({ mode, playing, step: -1, rms: 0, voices: tracks.length, meters: [], error: null });
  }
  audition(design: Design) {
    this.load("audition", [{ id: design.id, name: design.name, design, channel: 1, level: .8, pan: 0, expression: 1, mute: false, solo: false, steps: Array(16).fill(null) }], 100, false);
  }
  band(tracks: Track[], bpm: number, playing = true) { if (!tracks.length) throw new Error("Add a voice to the band first."); this.load("band", tracks, bpm, playing); }
  /** Update mixer/pattern live; only a change of physical graphs rebuilds the voices. */
  updateBand(tracks: Track[], bpm: number): boolean {
    if (this.status.mode!=="band") return false;
    if (!tracks.length) { this.stop(); return true; }
    if (structure(tracks)!==this.graphKey) { this.band(tracks,bpm,this.status.playing); return true; }
    this.node?.port.postMessage({type:"mix",tracks:mixer(tracks),bpm});
    return false;
  }
  transport(playing: boolean) { if(this.status.mode!=="band")return; this.node?.port.postMessage({type:"transport",playing}); this.emit({playing,step:-1}); }
  note(midi: number | null, gate: number) { this.node?.port.postMessage({ type: "note", midi, gate }); }
  midiNote(id: string, note: number | null, velocity: number) { if(this.status.mode==="band")this.node?.port.postMessage({type:"midi-note",id,note,velocity}); }
  midiBend(id: string, amount: number) { if(this.status.mode==="band")this.node?.port.postMessage({type:"midi-bend",id,amount}); }
  stop() { this.epoch++; this.graphKey=""; this.node?.port.postMessage({ type: "stop" }); this.emit({ mode: "stopped", playing: false, step: -1, rms: 0, voices: 0, load: 0, meters: [] }); }
}
export const studioAudio = new StudioAudio();
(window as unknown as { __studioAudio: StudioAudio }).__studioAudio = studioAudio;
