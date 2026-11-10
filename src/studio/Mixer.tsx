import { Screen } from "../ui/components/Screen.tsx";
import { bandMidi, type MidiState } from "./midi.ts";
import { useStudio } from "./store.ts";
import type { Band, Track } from "./model.ts";

type Meter = { id: string; rms: number; note: number | null };
const noteName = (n: number) => `${["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][n%12]}${Math.floor(n/12)-1}`;
const panName = (p: number) => Math.abs(p)<.02 ? "C" : `${p<0 ? "L" : "R"}${Math.round(Math.abs(p)*100)}`;
function Strip({ track, meter, silent }: { track: Track; meter?: Meter; silent: boolean }) {
  const patch=useStudio(s=>s.patchTrack);
  const value=silent ? 0 : Math.min(1,(meter?.rms ?? 0)*track.level*track.expression*4);
  return <section className="mixer-strip" aria-label={`Mixer ${track.name}`}>
    <div className="mixer-strip-head"><strong>{track.name}</strong><span>{meter?.note !== null && meter?.note !== undefined ? noteName(meter.note) : "—"}</span></div>
    <label className="mixer-control">MIDI channel <select aria-label={`MIDI channel for ${track.name}`} value={track.channel} onChange={e=>patch(track.id,{channel:Number(e.target.value)})}>{Array.from({length:16},(_,i)=><option key={i+1} value={i+1}>Channel {i+1}</option>)}</select></label>
    <label className="mixer-control"><span>Level <output>{Math.round(track.level*100)}%</output></span><input aria-label={`Mixer level for ${track.name}`} type="range" min="0" max="1" step=".01" value={track.level} onChange={e=>patch(track.id,{level:Number(e.target.value)})}/></label>
    <label className="mixer-control"><span>Pan <output>{panName(track.pan)}</output></span><input aria-label={`Pan for ${track.name}`} type="range" min="-1" max="1" step=".01" value={track.pan} onChange={e=>patch(track.id,{pan:Number(e.target.value)})}/></label>
    <label className="mixer-control"><span>Expression <output>{Math.round(track.expression*100)}%</output></span><input aria-label={`Expression for ${track.name}`} type="range" min="0" max="1" step=".01" value={track.expression} onChange={e=>patch(track.id,{expression:Number(e.target.value)})}/></label>
    <div className="mixer-buttons"><button className={`chip${track.mute ? " on" : ""}`} aria-label={`Mute ${track.name}`} aria-pressed={track.mute} onClick={()=>patch(track.id,{mute:!track.mute})}>Mute</button><button className={`chip${track.solo ? " on" : ""}`} aria-label={`Solo ${track.name}`} aria-pressed={track.solo} onClick={()=>patch(track.id,{solo:!track.solo})}>Solo</button></div>
    <div className="mixer-meter" role="meter" aria-label={`Output for ${track.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value*100)}><span style={{width:`${value*100}%`}}/></div>
  </section>;
}
export function Mixer({band,midi,meters,connect,disconnect}: { band: Band; midi: MidiState; meters: Meter[]; connect: () => void; disconnect: () => void }) {
  const anySolo=band.tracks.some(t=>t.solo);
  return <Screen title="Mixer" sub="MIDI channels / physical voices" focus>
    <div className="mixer-body">
      <div className="midi-toolbar">
        {midi.status === "on" ? <button className="chip on" onClick={disconnect}>Disconnect MIDI</button> : midi.status === "connecting" ? <button className="chip" onClick={disconnect}>Cancel MIDI request</button> : <button className="chip" onClick={connect}>Connect MIDI</button>}
        <label>MIDI input <select aria-label="MIDI input" value={midi.selected===null ? "" : `device:${midi.selected}`} disabled={midi.status!=="on"} onChange={e=>bandMidi.select(e.target.value ? e.target.value.slice(7) : null)}><option value="">All inputs</option>{midi.inputs.map(d=><option key={d.id} value={`device:${d.id}`}>{d.name}</option>)}</select></label>
        <button className="chip" onClick={()=>bandMidi.panic()} disabled={midi.status!=="on"}>All MIDI notes off</button>
        <span className="studio-meter" role="status">{midi.status === "on" ? (midi.inputs.length ? `${midi.inputs.length} INPUT${midi.inputs.length===1 ? "" : "S"} / LIVE` : "CONNECTED / NO INPUTS") : midi.status === "connecting" ? "AWAITING PERMISSION" : midi.status === "unsupported" ? "MIDI / UNAVAILABLE" : midi.status === "denied" ? "MIDI / NOT ENABLED" : "MIDI / OFF"}</span>
      </div>
      {midi.error && <p className="studio-warning">{midi.error}</p>}
      <p className="studio-muted">Assign each voice a MIDI channel. Notes, velocity, sustain and pitch bend play live; CC 7 / 10 / 11 control level, pan and expression. CC 80 / 81 switch mute / solo (64–127 on).</p>
      <div className="mixer-strips">{band.tracks.map(t=><Strip key={t.id} track={t} meter={meters.find(m=>m.id===t.id)} silent={t.mute || anySolo && !t.solo}/>)}</div>
      {!band.tracks.length && <p className="studio-muted">Add a voice to create a mixer channel.</p>}
    </div>
  </Screen>;
}
