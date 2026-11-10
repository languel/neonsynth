import { useEffect, useRef, useState } from "react";
import { Screen } from "../ui/components/Screen.tsx";
import { useStore } from "../ui/store.ts";
import { studioAudio } from "./audio.ts";
import { ensureStudioAudio } from "./Builder.tsx";
import { EXAMPLES } from "./examples.ts";
import { clamp, graphError, newBand, type Design, type Track } from "./model.ts";
import { NumberInput } from "./NumberInput.tsx";
import { download, importFile } from "./storage.ts";
import { useStudio } from "./store.ts";

const noteName = (n: number) => `${["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][n%12]}${Math.floor(n/12)-1}`;
const NOTES = Array.from({length: 73}, (_,i) => i + 24);
function BandTrack({ track, step }: { track: Track; step: number }) {
  const patch = useStudio(s=>s.patchTrack), remove = useStudio(s=>s.removeTrack);
  const [brush, setBrush] = useState(clamp(track.steps.find(n=>n!==null) ?? Math.round(69+12*Math.log2(track.design.basePitch/440)),24,108));
  return <section className="band-track" aria-label={`Band part ${track.name}`}>
    <div className="track-heading">
      <label><span className="sr-only">Part name</span><input className="track-name" aria-label="Part name" value={track.name} maxLength={100} onChange={e=>patch(track.id,{name:e.target.value})}/></label>
      <span className="track-design">{track.design.name} / {track.design.parts.length} parts</span>
      <button className={`chip${track.mute ? " on" : ""}`} aria-pressed={track.mute} onClick={()=>patch(track.id,{mute:!track.mute})}>Mute</button>
      <button className="track-remove" aria-label={`Remove ${track.name}`} onClick={()=>remove(track.id)}>×</button>
    </div>
    <div className="track-content">
      <div className="track-controls">
        <label>Note to place <select aria-label={`Note to place for ${track.name}`} value={clamp(brush,24,108)} onChange={e=>setBrush(Number(e.target.value))}>{NOTES.map(n=><option key={n} value={n}>{noteName(n)}</option>)}</select></label>
        <label>Level <input aria-label={`Level for ${track.name}`} type="range" min="0" max="1" step=".05" value={track.level} onChange={e=>patch(track.id,{level:Number(e.target.value)})}/></label>
      </div>
      <div className="steps" role="group" aria-label={`${track.name} pattern`}>
        {track.steps.map((note,i)=><button key={i} className={`step${note!==null ? " on" : ""}${step===i ? " playing" : ""}`} aria-label={`${track.name} step ${i+1}: ${note === null ? "rest" : noteName(note)}`} aria-pressed={note!==null} onClick={()=>{const steps=track.steps.slice(); steps[i]=steps[i]===brush ? null : brush; patch(track.id,{steps});}}><span>{i+1}</span><b>{note===null ? "·" : noteName(note)}</b></button>)}
      </div>
    </div>
  </section>;
}
function BandLibrary() {
  const { band, bands, setBand, saveBand, deleteBand, setMessage } = useStudio();
  const input = useRef<HTMLInputElement>(null);
  return <div className="studio-panel">
    <label className="studio-field"><span>Band name</span><input aria-label="Band name" value={band.name} maxLength={100} onChange={e=>useStudio.getState().patchBand({name:e.target.value})}/></label>
    <label className="studio-field"><span>Saved bands</span><select aria-label="Saved bands" value="" onChange={e=>{const b=bands.find(x=>x.id===e.target.value);if(b)setBand(b);}}><option value="">Choose a saved band…</option>{bands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
    <div className="studio-actions">
      <button className="chip" onClick={()=>setBand(newBand())}>New band</button>
      <button className="chip" onClick={saveBand}>Save band</button>
      <button className="chip" onClick={()=>download(band,"band")}>Export</button>
      <button className="chip" onClick={()=>input.current?.click()}>Import</button>
      <input ref={input} className="sr-only" type="file" accept="application/json,.json" aria-label="Import band file" onChange={async e=>{const file=e.target.files?.[0];e.target.value="";if(!file)return;try { const item=await importFile(file); if(item.type!=="band")throw new Error("Choose a band file, not an instrument.");setBand(item.value);setMessage("Band imported. Save it to keep it in this browser."); } catch(err) {setMessage(err instanceof Error?err.message:"Could not import file.");}}}/>
      {bands.some(b=>b.id===band.id) && <button className="chip" onClick={()=>deleteBand(band.id)}>Delete saved</button>}
    </div>
    <p className="studio-muted">A band saves each instrument's complete design with its notes, so parts remain portable even if the original changes.</p>
  </div>;
}
function AddVoice() {
  const { design, instruments, addTrack, setMessage } = useStudio();
  const [id,setId] = useState("current");
  const options: Design[] = [...EXAMPLES,...instruments];
  return <div className="studio-panel">
    <label className="studio-field"><span>Instrument for a new part</span><select aria-label="Instrument for a new part" value={id} onChange={e=>setId(e.target.value)}><option value="current">Current drawing — {design.name}</option><optgroup label="Examples">{EXAMPLES.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</optgroup>{instruments.length>0 && <optgroup label="Saved instruments">{instruments.map(d=><option value={d.id} key={d.id}>{d.name}</option>)}</optgroup>}</select></label>
    <button className="chip amber" onClick={()=>{const d=id==="current" ? design : options.find(x=>x.id===id);if(!d)return; const error=graphError(d);if(error)setMessage(error);else addTrack(d);}}>Add voice</button>
    <p className="studio-muted">Up to four independent physical voices share the same transport. Pick a note, then tap steps to write a part.</p>
  </div>;
}
export function BandPage() {
  const { band, patchBand, message, setMessage } = useStudio();
  const [status,setStatus] = useState(studioAudio.status);
  useEffect(()=>studioAudio.subscribe(setStatus),[]);
  useEffect(()=>{if(studioAudio.status.mode === "band")studioAudio.stop();},[band]);
  const play = async () => {
    if(status.mode === "band") {studioAudio.stop(); return;}
    try {
      if(!band.tracks.length)throw new Error("Add a voice to the band first.");
      const revision = studioAudio.revision;
      await ensureStudioAudio();
      if (revision !== studioAudio.revision || useStore.getState().mode !== "band" || useStudio.getState().band !== band) return;
      studioAudio.band(band.tracks, band.bpm);
    }
    catch(e){setMessage(e instanceof Error?e.message:"Could not play band.");}
  };
  return <main className="band-wall">
    <Screen focus className="band-sequencer" title="Band" sub="Four independent physical voices / 16 steps">
      <div className="band-body">
        <div className="band-transport"><button className="primary" onClick={()=>void play()}>{status.mode === "band" ? "Stop band" : "Play band"}</button><label>Tempo <NumberInput aria-label="Tempo" min={40} max={220} value={band.bpm} onChange={bpm=>patchBand({bpm})}/> BPM</label><span className="studio-meter">{status.mode === "band" ? `${status.voices} VOICES · STEP ${status.step+1} · LOAD ${Math.round(status.load * 100)}%` : "TRANSPORT / STOPPED"}</span></div>
        <p className="studio-muted">Choose a note in each part and tap the 16 steps. Tap it again to clear; choosing another note replaces it. Editing stops playback so the physical graph can be rebuilt safely.</p>
        <div className="band-tracks">{band.tracks.map(t=><BandTrack key={t.id} track={t} step={status.mode === "band" ? status.step : -1}/>)}</div>
        {!band.tracks.length && <p className="band-empty">NO VOICES YET<br/><span>Add a voice from the panel to begin.</span></p>}
        {status.mode === "band" && status.load > .85 && <p className="studio-warning">High audio load. Stop playback and mute or remove a voice if the sound breaks up.</p>}
        {status.error && <p className="studio-warning">{status.error}</p>}
        {message && <p role="status" className="studio-status">{message}</p>}
      </div>
    </Screen>
    <aside className="band-side"><Screen title="Add a voice" sub="Instrument / part"><AddVoice/></Screen><Screen title="Band library" sub="Save / import / export"><BandLibrary/></Screen><Screen title="Signal path" sub="What you hear"><div className="studio-panel"><p className="studio-muted">Each part instantiates its own Chimera Rust airway and source models. Their radiated signals are mixed on the audio thread—voices sound together, not one after another.</p><p className="studio-muted">Examples are creative physical sketches, not recordings or claims of exact animal anatomy.</p></div></Screen></aside>
  </main>;
}
