import { useEffect, useRef, useState } from "react";
import { engine } from "../audio/AudioEngine.ts";
import { Screen } from "../ui/components/Screen.tsx";
import { useStore } from "../ui/store.ts";
import { studioAudio } from "./audio.ts";
import { Drawing } from "./Drawing.tsx";
import { EXAMPLES } from "./examples.ts";
import { graphError, newDesign, type Part, type Wall, type SourceKind } from "./model.ts";
import { NumberInput } from "./NumberInput.tsx";
import { download, importFile } from "./storage.ts";
import { useStudio } from "./store.ts";

const WALLS: [Wall,string][] = [["soft","Soft tissue"],["cartilage","Cartilage"],["nasal","Lossy tissue"],["rigid","Rigid wall"]];
const SOURCES: [SourceKind,string][] = [["folds","Vocal folds"],["syrinx","Syrinx labia"],["reed","Lip reed"],["whistle","Whistling jet"],["air","Turbulent air"]];
function NumberField({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void }) {
  return <label className="studio-field"><span>{label}{unit && <small> / {unit}</small>}</span><NumberInput value={value} min={min} max={max} step={step} onChange={onChange} /></label>;
}
function WallField({ value, onChange }: { value: Wall; onChange: (v: Wall) => void }) {
  return <label className="studio-field"><span>Wall material</span><select value={value} onChange={e => onChange(e.target.value as Wall)}>{WALLS.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></label>;
}
function PartInspector() {
  const { design, selected, patchPart, removePart, removeLink } = useStudio();
  const part = design.parts.find(p => p.id === selected);
  const patch = (p: Partial<Part>) => { if (part) patchPart(part.id,p); };
  return <div className="studio-panel">
    {!part ? <p className="studio-muted">Select a drawn part to edit its physical dimensions, material and source. Use Connect to join the glowing anchors.</p> : <>
      <div className="studio-caption">{part.kind === "tube" ? "Drawn duct" : part.kind === "cavity" ? "Resonating chamber" : part.kind === "source" ? "Air / energy source" : "Sound outlet"}</div>
      <label className="studio-field"><span>Part name</span><input value={part.name} maxLength={100} onChange={e => patch({ name: e.target.value })}/></label>
      {part.kind === "tube" && <>
        <NumberField label="Length" unit="cm" value={part.length} min={.6} max={300} step={.1} onChange={length => patch({length} as Partial<Part>)}/>
        <NumberField label="Entry area" unit="cm²" value={part.areaStart} min={.02} max={50} step={.1} onChange={areaStart => patch({areaStart} as Partial<Part>)}/>
        <NumberField label="Exit area" unit="cm²" value={part.areaEnd} min={.02} max={50} step={.1} onChange={areaEnd => patch({areaEnd} as Partial<Part>)}/>
        <WallField value={part.wall} onChange={wall => patch({wall} as Partial<Part>)}/>
        <p className="studio-muted">The drawn centerline sets the initial length. Areas taper along the simulated tube.</p>
      </>}
      {part.kind === "cavity" && <><NumberField label="Volume" unit="cm³" value={part.volume} min={.1} max={3000} step={1} onChange={volume => patch({volume} as Partial<Part>)}/><WallField value={part.wall} onChange={wall => patch({wall} as Partial<Part>)}/></>}
      {part.kind === "source" && <>
        <label className="studio-field"><span>Mechanism</span><select value={part.source} onChange={e => patch({ source: e.target.value as SourceKind } as Partial<Part>)}>{SOURCES.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></label>
        <NumberField label="Rest pitch" unit="Hz" value={part.pitch} min={20} max={8000} step={1} onChange={pitch => patch({pitch} as Partial<Part>)}/>
        <NumberField label="Pressure" unit="cm H₂O" value={part.pressure} min={.2} max={80} step={1} onChange={pressure => patch({pressure} as Partial<Part>)}/>
        <NumberField label="Source strength" value={part.strength} min={.01} max={1} step={.05} onChange={strength => patch({strength} as Partial<Part>)}/>
        <NumberField label="Tension" value={part.tension} min={0} max={1} step={.05} onChange={tension => patch({tension} as Partial<Part>)}/>
        <p className="studio-muted">{part.source === "air" ? "Pressure and strength set the turbulent airflow. Pitch and tension do not affect a noise-only source." : part.source === "whistle" ? "The jet's physical oscillator is coupled to the airway pressure. Tension is not used by this mechanism." : "Pitch follows played notes relative to the instrument's reference pitch."}</p>
      </>}
      {part.kind === "outlet" && <p className="studio-muted">An open end radiates sound from the connected node.</p>}
      <button className="ghost studio-delete" onClick={() => removePart(part.id)}>Remove part</button>
    </>}
    {design.links.length > 0 && <div className="connection-list"><div className="studio-caption">Connections</div>{design.links.map((l,i) => {
      const a=design.parts.find(p=>p.id===l.a.id), b=design.parts.find(p=>p.id===l.b.id);
      return <div className="connection" key={i}><span>{a?.name ?? "?"} {a?.kind === "tube" ? l.a.end ? "end" : "start" : ""} ↔ {b?.name ?? "?"} {b?.kind === "tube" ? l.b.end ? "end" : "start" : ""}</span><button onClick={() => removeLink(i)} aria-label={`Remove connection ${i+1}`}>×</button></div>;
    })}</div>}
  </div>;
}
function Library() {
  const { design, instruments, setDesign, saveDesign, deleteDesign, addTrack, setMessage } = useStudio();
  const input = useRef<HTMLInputElement>(null);
  const [choice, setChoice] = useState("");
  return <div className="studio-panel library-panel">
    <p className="studio-muted">Start from a physical example, or draw a new instrument.</p>
    <label className="studio-field"><span>Examples & saved instruments</span><select aria-label="Examples and saved instruments" value={choice} onChange={e => {
      const id=e.target.value; setChoice(id); const d=[...EXAMPLES,...instruments].find(x=>x.id===id); if(d) setDesign(d);
    }}><option value="">Choose a design…</option><optgroup label="Examples">{EXAMPLES.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>{instruments.length > 0 && <optgroup label="Saved in this browser">{instruments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}</select></label>
    <div className="studio-actions">
      <button className="chip" onClick={() => { setDesign(newDesign()); setChoice(""); }}>New drawing</button>
      <button className="chip" onClick={saveDesign}>Save instrument</button>
      <button className="chip" onClick={() => download(design,"instrument")}>Export</button>
      <button className="chip" onClick={() => input.current?.click()}>Import</button>
      <input ref={input} className="sr-only" type="file" accept="application/json,.json" aria-label="Import instrument file" onChange={async e => { const file=e.target.files?.[0]; e.target.value=""; if (!file) return; try { const item=await importFile(file); if (item.type !== "instrument") throw new Error("Choose an instrument file, not a band."); setDesign(item.value); setChoice(""); setMessage("Instrument imported. Save it to keep it in this browser."); } catch(err) { setMessage(err instanceof Error ? err.message : "Could not import file."); } }}/>
      {instruments.some(d=>d.id===design.id) && <button className="chip" onClick={() => { deleteDesign(design.id); setChoice(""); }}>Delete saved</button>}
      <button className="chip amber" onClick={() => { const error=graphError(design); if(error) setMessage(error); else addTrack(design); }}>Add to band</button>
    </div>
  </div>;
}
function Behavior() {
  const { design, patchDesign } = useStudio();
  return <div className="studio-panel studio-fields">
    <label className="studio-field"><span>Instrument name</span><input value={design.name} maxLength={100} onChange={e=>patchDesign({name:e.target.value})}/></label>
    <NumberField label="Reference pitch" unit="Hz" value={design.basePitch} min={20} max={8000} step={1} onChange={basePitch=>patchDesign({basePitch})}/>
    <NumberField label="Attack" unit="s" value={design.attack} min={.002} max={2} step={.01} onChange={attack=>patchDesign({attack})}/>
    <NumberField label="Release" unit="s" value={design.release} min={.005} max={3} step={.01} onChange={release=>patchDesign({release})}/>
    <NumberField label="Vibrato depth" unit="cents" value={design.vibrato} min={0} max={200} step={1} onChange={vibrato=>patchDesign({vibrato})}/>
    <NumberField label="Vibrato rate" unit="Hz" value={design.vibratoRate} min={.1} max={15} step={.1} onChange={vibratoRate=>patchDesign({vibratoRate})}/>
    <NumberField label="Pulse depth" value={design.pulseDepth} min={0} max={1} step={.05} onChange={pulseDepth=>patchDesign({pulseDepth})}/>
    <NumberField label="Pulse rate" unit="Hz" value={design.pulseRate} min={.1} max={30} step={.1} onChange={pulseRate=>patchDesign({pulseRate})}/>
    <NumberField label="Output trim" unit="×" value={design.outputGain} min={.02} max={10} step={.1} onChange={outputGain=>patchDesign({outputGain})}/>
  </div>;
}
const NOTES = [48,50,52,53,55,57,59,60,62,64,65,67,69];
const noteName = (n: number) => `${["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][n%12]}${Math.floor(n/12)-1}`;
export async function ensureStudioAudio() {
  const s = useStore.getState(); await s.start();
  if (!useStore.getState().started || !engine.ctx) throw new Error(useStore.getState().startError ?? "Could not start audio.");
  await studioAudio.start(engine.ctx); studioAudio.setVolume(useStore.getState().volume);
}
function Perform() {
  const design = useStudio(s=>s.design), message = useStudio(s=>s.setMessage);
  const [status,setStatus] = useState(studioAudio.status);
  const held = useRef(0);
  useEffect(() => studioAudio.subscribe(setStatus),[]);
  useEffect(() => { if (studioAudio.status.mode === "audition") studioAudio.stop(); }, [design]);
  const error = graphError(design);
  const load = async () => {
    if (error) throw new Error(error);
    const revision = studioAudio.revision;
    await ensureStudioAudio();
    // A slow worklet load must not start a stale drawing after the user switched tabs or edited it.
    if (revision !== studioAudio.revision || useStore.getState().mode !== "build" || useStudio.getState().design !== design) return false;
    if (studioAudio.status.mode !== "audition") studioAudio.audition(design);
    return true;
  };
  const hold = async () => {
    const token = ++held.current;
    if (status.mode === "audition") { studioAudio.stop(); return; }
    try { if (await load() && held.current === token) studioAudio.note(null,1); }
    catch (e) { message(e instanceof Error ? e.message : "Could not play instrument."); }
  };
  const down = (n:number) => {
    const token=++held.current;
    void load().then(loaded => { if (loaded && held.current === token) studioAudio.note(n,1); }).catch(e=>message(e instanceof Error ? e.message : "Could not play note."));
  };
  const up = () => { held.current++; studioAudio.note(null,0); };
  return <div className="studio-panel perform">
    <div className="perform-top"><button className="primary" onClick={() => void hold()}>{status.mode === "audition" ? "Stop instrument" : "Hear instrument"}</button><span className="studio-meter">{status.mode === "audition" ? `OUTPUT ${Math.round(status.rms * 1000) / 10}% · LOAD ${Math.round(status.load * 100)}%` : "PHYSICAL VOICE / READY"}</span></div>
    {error ? <p className="studio-warning">{error}</p> : <p className="studio-muted">Hold a note below, or hear the reference pitch. Each source breathes into the connected network.</p>}
    {status.error && <p className="studio-warning">{status.error}</p>}
    <div className="studio-keyboard" role="group" aria-label="Instrument notes">{NOTES.map(n=><button key={n} type="button" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);down(n);}} onPointerUp={up} onPointerCancel={up} aria-label={`Play ${noteName(n)}`}>{noteName(n)}</button>)}</div>
  </div>;
}
export function Builder() {
  const design = useStudio(s=>s.design), message = useStudio(s=>s.message);
  return <main className="studio-wall">
    <Screen className="studio-drawing-screen" focus title="Instrument" sub="Draw / connect / listen"><Drawing/></Screen>
    <div className="studio-side">
      <Screen title="Library" sub="Physical examples & saved designs"><Library/></Screen>
      <Screen title="Part" sub="Dimensions / material / source"><PartInspector/></Screen>
      <Screen title="Behavior" sub="All sources"><Behavior/></Screen>
      <Screen title="Perform" sub="Rust / Wasm physical engine"><Perform/></Screen>
    </div>
    <div className="studio-bottom"><p>{design.description}</p>{message && <p role="status">{message}</p>}</div>
  </main>;
}
