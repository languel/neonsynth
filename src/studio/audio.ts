import workletUrl from "../worklet/studioProcessor.ts?worker&url";
import { chimeraModule } from "../wasm/chimera.ts";
import { graphError, type Design, type Track } from "./model.ts";

type Status = { mode: "stopped" | "audition" | "band"; step: number; rms: number; voices: number; load: number; error: string | null };
class StudioAudio {
  private node: AudioWorkletNode | null = null;
  private epoch = 0;
  get revision() { return this.epoch; }
  private gain: GainNode | null = null;
  private ctx: AudioContext | null = null;
  private starting: Promise<void> | null = null;
  private listeners = new Set<(s: Status) => void>();
  status: Status = { mode: "stopped", step: -1, rms: 0, voices: 0, load: 0, error: null };
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
        if (m.type === "error") this.emit({ mode: "stopped", error: m.message, rms: 0, voices: 0, step: -1 });
        else if (m.type === "telemetry" && this.status.mode !== "stopped") this.emit({ step: m.step, rms: m.rms, voices: m.voices, load: m.load });
      };
      node.onprocessorerror = () => this.emit({ mode: "stopped", error: "The audio processor stopped. Reload to try again." });
      this.node = node; this.ctx = ctx; this.gain = gain;
      await ctx.resume();
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  setVolume(v: number) { if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, .02); }
  private load(mode: "audition" | "band", tracks: Track[], bpm: number) {
    for (const track of tracks) { const error = graphError(track.design); if (error) throw new Error(`${track.name}: ${error}`); }
    if (!this.node) throw new Error("Start audio first.");
    const enc = new TextEncoder();
    this.node.port.postMessage({ type: "load", mode, bpm, tracks: tracks.map(t => ({ bytes: enc.encode(JSON.stringify(t.design)), basePitch: t.design.basePitch, steps: t.steps, level: t.level, mute: t.mute })) });
    this.emit({ mode, step: -1, rms: 0, voices: tracks.length, error: null });
  }
  audition(design: Design) {
    this.load("audition", [{ id: design.id, name: design.name, design, level: .8, mute: false, steps: Array(16).fill(null) }], 100);
  }
  band(tracks: Track[], bpm: number) { if (!tracks.length) throw new Error("Add a voice to the band first."); this.load("band", tracks, bpm); }
  note(midi: number | null, gate: number) { this.node?.port.postMessage({ type: "note", midi, gate }); }
  stop() { this.epoch++; this.node?.port.postMessage({ type: "stop" }); this.emit({ mode: "stopped", step: -1, rms: 0, voices: 0, load: 0 }); }
}
export const studioAudio = new StudioAudio();
(window as unknown as { __studioAudio: StudioAudio }).__studioAudio = studioAudio;
