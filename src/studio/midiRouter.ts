/** Channel-aware, monophonic MIDI routing. Multiple devices may hold the same note; the most
 * recently played note wins per channel, and releasing it falls back to the previous held note. */
export type MidiRoute = { id: string; channel: number };
export type MidiCallbacks = {
  note: (trackId: string, note: number | null, velocity: number) => void;
  bend: (trackId: string, amount: number) => void;
  control: (trackId: string, controller: number, value: number) => void;
};
type Held = { input: string; channel: number; note: number; velocity: number; released: boolean };
const owner = (input: string, channel: number) => JSON.stringify([input,channel]);

export class MidiRouter {
  private routes: MidiRoute[] = [];
  private held: Held[] = [];
  private sustain = new Set<string>();
  // Last controller on a channel wins, but retain other devices so unplugging the
  // most recent controller falls back to a bend that is still physically applied.
  private bends: { channel: number; input: string; value: number }[] = [];
  constructor(private readonly cb: MidiCallbacks) {}
  setRoutes(routes: MidiRoute[]) {
    // Release voices removed or moved to a different channel before sending the new mapping.
    for (const old of this.routes) if (!routes.some(r=>r.id===old.id && r.channel===old.channel)) {
      this.cb.note(old.id,null,0); this.cb.bend(old.id,0);
    }
    this.routes = routes.map(r=>({...r}));
    this.sync();
  }
  sync() {
    for (const route of this.routes) {
      this.emitRoute(route);
      this.cb.bend(route.id,this.bendFor(route.channel));
    }
  }
  private emitRoute(route: MidiRoute) {
    let note: Held | undefined;
    for (let i=this.held.length-1; i>=0; i--) if(this.held[i].channel===route.channel) { note=this.held[i]; break; }
    this.cb.note(route.id,note?.note ?? null,note?.velocity ?? 0);
  }
  private emitChannel(channel: number) { for (const r of this.routes) if(r.channel===channel)this.emitRoute(r); }
  private bendFor(channel: number) {
    for (let i=this.bends.length-1; i>=0; i--) if(this.bends[i].channel===channel) return this.bends[i].value;
    return 0;
  }
  private emitBend(channel: number) {
    const value=this.bendFor(channel);
    for (const r of this.routes) if(r.channel===channel)this.cb.bend(r.id,value);
  }
  private bend(channel: number, input: string, value: number) {
    this.bends=this.bends.filter(b=>b.channel!==channel || b.input!==input);
    this.bends.push({channel,input,value});
    this.emitBend(channel);
  }
  message(input: string, data: ArrayLike<number>) {
    // Every supported channel message has three bytes. Ignore realtime, SysEx,
    // incomplete, and malformed data rather than treating it as a note-off.
    if (data.length < 3) return;
    const status=data[0], d1=data[1], d2=data[2];
    if (!Number.isInteger(status) || status < 0x80 || status >= 0xf0 || !Number.isInteger(d1) || !Number.isInteger(d2) || d1 > 127 || d2 > 127 || d1 < 0 || d2 < 0) return;
    const type=status & 0xf0, channel=(status & 0x0f)+1;
    const key=owner(input,channel);
    if (type === 0x90 && d2>0) {
      this.held=this.held.filter(h=>!(h.input===input && h.channel===channel && h.note===d1));
      this.held.push({input,channel,note:d1,velocity:d2,released:false});
      this.emitChannel(channel);
    } else if (type === 0x80 || type === 0x90 && d2===0) {
      const i=this.held.findIndex(h=>h.input===input && h.channel===channel && h.note===d1);
      if (i<0) return;
      if (this.sustain.has(key)) this.held[i].released=true;
      else this.held.splice(i,1);
      this.emitChannel(channel);
    } else if (type === 0xe0) {
      const raw=d1 + d2*128;
      this.bend(channel,input,raw<8192 ? (raw-8192)/8192 : (raw-8192)/8191);
    } else if (type === 0xb0) {
      if (d1 === 64) {
        if (d2 >= 64) this.sustain.add(key);
        else { this.sustain.delete(key); this.held=this.held.filter(h=>!(h.input===input && h.channel===channel && h.released)); this.emitChannel(channel); }
      } else if (d1 === 120 || d1 === 123) {
        // All sound off is immediate; all notes off behaves like lifting the keys,
        // so a depressed sustain pedal keeps the notes until it is released.
        if (d1 === 123 && this.sustain.has(key)) {
          for (const h of this.held) if(h.input===input && h.channel===channel) h.released=true;
        } else this.held=this.held.filter(h=>!(h.input===input && h.channel===channel));
        this.emitChannel(channel);
      } else if (d1 === 121) {
        this.sustain.delete(key);
        this.held=this.held.filter(h=>!(h.input===input && h.channel===channel && h.released));
        this.emitChannel(channel); this.bend(channel,input,0);
        for (const r of this.routes) if(r.channel===channel)this.cb.control(r.id,d1,d2);
      } else if ([7,10,11,80,81].includes(d1)) {
        for (const r of this.routes) if(r.channel===channel)this.cb.control(r.id,d1,d2);
      }
    }
  }
  removeInput(input: string) {
    const affected=new Set(this.held.filter(h=>h.input===input).map(h=>h.channel));
    this.held=this.held.filter(h=>h.input!==input);
    for (let channel=1; channel<=16; channel++) this.sustain.delete(owner(input,channel));
    const bent=new Set(this.bends.filter(b=>b.input===input).map(b=>b.channel));
    this.bends=this.bends.filter(b=>b.input!==input);
    for (const channel of bent) this.emitBend(channel);
    for (const channel of affected) this.emitChannel(channel);
  }
  panic() {
    this.held=[]; this.sustain.clear(); this.bends=[];
    for (const route of this.routes) { this.cb.note(route.id,null,0); this.cb.bend(route.id,0); }
  }
}
