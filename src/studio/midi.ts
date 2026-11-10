import { studioAudio } from "./audio.ts";
import { MidiRouter } from "./midiRouter.ts";
import { useStudio } from "./store.ts";
import type { Track } from "./model.ts";

type Device = { id: string; name: string };
export type MidiState = { status: "off" | "connecting" | "on" | "unsupported" | "denied"; inputs: Device[]; selected: string | null; error: string | null };
const ALL = null;

/** Web MIDI is input-only, asks for no SysEx permission, and releases notes on unplug/disconnect. */
class BandMidi {
  private access: MIDIAccess | null = null;
  private pending: Promise<boolean> | null = null;
  private generation = 0;
  private attached = new Map<string, { input: MIDIInput; listener: EventListener }>();
  private stateListener: EventListener | null = null;
  private routeKey = "";
  private listeners = new Set<(s: MidiState) => void>();
  state: MidiState = { status: "off", inputs: [], selected: ALL, error: null };
  private router = new MidiRouter({
    note: (id,note,velocity) => studioAudio.midiNote(id,note,velocity),
    bend: (id,amount) => studioAudio.midiBend(id,amount),
    control: (id,cc,value) => {
      const track = useStudio.getState().band.tracks.find(t=>t.id===id);
      if (!track) return;
      const patch = cc===7 ? {level:value/127} : cc===10 ? {pan:value<=64 ? (value-64)/64 : (value-64)/63} : cc===11 ? {expression:value/127} : cc===80 ? {mute:value>=64} : cc===81 ? {solo:value>=64} : cc===121 ? {expression:1} : {};
      useStudio.getState().patchTrack(id,patch);
    },
  });
  subscribe(f: (s: MidiState) => void) { this.listeners.add(f); return () => { this.listeners.delete(f); }; }
  private emit(p: Partial<MidiState>) { this.state = { ...this.state, ...p }; for(const f of this.listeners)f(this.state); }
  setRoutes(tracks: Track[]) {
    const routes=tracks.map(t=>({id:t.id,channel:t.channel}));
    const key=JSON.stringify(routes);
    if (key!==this.routeKey) { this.routeKey=key; this.router.setRoutes(routes); }
  }
  sync() { this.router.sync(); }
  panic() { this.router.panic(); }
  select(id: string | null) {
    if (id!==ALL && !this.state.inputs.some(d=>d.id===id)) return;
    if (id!==this.state.selected) { this.router.panic(); this.emit({selected:id}); }
  }
  private releasePort(input: MIDIInput, listener: EventListener) {
    input.removeEventListener("midimessage",listener);
    // A port can already be gone; closing it must never block cleanup.
    try { void input.close().catch(()=>{}); } catch { /* port disconnected */ }
  }
  private detach() {
    if(this.access && this.stateListener)this.access.removeEventListener("statechange",this.stateListener);
    const attached=[...this.attached.values()];
    this.attached.clear(); this.access=null; this.stateListener=null;
    for(const {input,listener} of attached)this.releasePort(input,listener);
  }
  private attach(access: MIDIAccess) {
    const live=new Map<string,MIDIInput>();
    access.inputs.forEach(input=>{if(input.state!=="disconnected")live.set(input.id,input);});
    for (const [id, old] of this.attached) if(!live.has(id) || live.get(id)!==old.input) {
      this.attached.delete(id); this.releasePort(old.input,old.listener); this.router.removeInput(id);
    }
    for (const [id,input] of live) if(!this.attached.has(id)) {
      const listener: EventListener = event => {
        const data=(event as MIDIMessageEvent).data;
        if(data && (this.state.selected===ALL || this.state.selected===id))this.router.message(id,data);
      };
      input.addEventListener("midimessage",listener);
      this.attached.set(id,{input,listener});
      const failed = (e: unknown) => {
        if(this.attached.get(id)?.input !== input)return;
        this.emit({error:`Could not open ${input.name || "MIDI input"}: ${e instanceof Error ? e.message : String(e)}`});
      };
      try { void input.open().catch(failed); } catch(e) { failed(e); }
    }
    const inputs=[...live.values()].map(input=>({id:input.id,name:input.name || "MIDI input"}));
    const selected=this.state.selected!==ALL && !live.has(this.state.selected) ? ALL : this.state.selected;
    this.emit({inputs,selected});
  }
  connect(): Promise<boolean> {
    if (this.access) return Promise.resolve(true);
    if (this.pending) return this.pending;
    if (typeof navigator === "undefined" || typeof navigator.requestMIDIAccess !== "function") {
      this.emit({status:"unsupported",error:"Web MIDI is not available in this browser. Use a compatible browser over HTTPS or localhost."});
      return Promise.resolve(false);
    }
    const gen=this.generation;
    this.emit({status:"connecting",error:null});
    let request: Promise<MIDIAccess>;
    try { request=navigator.requestMIDIAccess({sysex:false}); }
    catch(e) {
      this.emit({status:"denied",error:`MIDI access could not be enabled: ${e instanceof Error ? e.message : String(e)}`});
      return Promise.resolve(false);
    }
    const pending=request.then(access=>{
      if(gen!==this.generation)return false;
      this.access=access;
      this.stateListener=()=>this.attach(access);
      access.addEventListener("statechange",this.stateListener);
      this.attach(access); this.emit({status:"on"}); return true;
    }).catch((e:unknown)=>{
      if(gen===this.generation) {
        this.detach(); this.router.panic();
        this.emit({status:"denied",inputs:[],error:`MIDI access could not be enabled: ${e instanceof Error ? e.message : String(e)}`});
      }
      return false;
    }).finally(()=>{if(this.pending===pending)this.pending=null;});
    this.pending=pending;
    return pending;
  }
  disconnect() {
    this.generation++; this.pending=null;
    this.detach(); this.router.panic();
    this.emit({status:"off",inputs:[],selected:ALL,error:null});
  }
}
export const bandMidi = new BandMidi();
