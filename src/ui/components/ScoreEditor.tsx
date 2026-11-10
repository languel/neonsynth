import { useEffect, useRef, useState } from "react";
import { NumberInput } from "../../studio/NumberInput.tsx";
import { nearestBody } from "../body.ts";
import { useStore } from "../store.ts";
import { DEMO_SONGS, playScore, stopScore, tickSinging, useSing } from "../singing.ts";
import { LANES, noteId, scoreFromDemo, useSongScore, type Lane, type ScoreNote } from "../songScore.ts";
import { Chip } from "./Screen.tsx";

const LEFT = 48, STEP = 30, TOP = 27, ROW = 22, ROWS = 13;
const AUTO = TOP + ROW * ROWS + 32, AUTO_H = 70, HEIGHT = AUTO + AUTO_H + 20;
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const name = (n: number) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const black = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
type Drag =
  | { type: "draw"; anchor: number; midi: number; note: ScoreNote }
  | { type: "move"; anchor: number; pitch: number; note: ScoreNote }
  | { type: "resize"; note: ScoreNote }
  | { type: "automation"; step: number; value: number | null };

/** Editable vector piano roll; mouse, pen and touch all use the same snapped gestures. */
export function ScoreEditor() {
  const score = useSongScore(s => s.score), putNote = useSongScore(s => s.putNote), remove = useSongScore(s => s.removeNote);
  const setAutomation = useSongScore(s => s.setAutomation);
  const body = useStore(s => s.body), startAudio = useStore(s => s.start);
  const lyrics = useSing(s => s.syllables), setLyrics = useSing(s => s.setLyrics);
  const playing = useSing(s => s.scorePlaying), playhead = useSing(s => s.scoreStep), error = useSing(s => s.scoreError);
  const [bottom, setBottom] = useState(() => nearestBody(body) === "male" ? 48 : 60);
  const [selected, setSelected] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane>("breath"), [erase, setErase] = useState(false), [autoStep, setAutoStep] = useState(1);
  const [draft, setDraft] = useState<ScoreNote | null>(null);
  const svg = useRef<SVGSVGElement>(null), drag = useRef<Drag | null>(null);
  const draftRef = useRef<ScoreNote | null>(null);
  const preview = (n: ScoreNote | null) => { draftRef.current = n; setDraft(n); };
  const selectedNote = score.notes.find(n => n.id === selected);
  const laneInfo = LANES.find(l => l.id === lane)!;
  const activeStep = clamp(autoStep, 1, score.steps);
  const laneValue = score.automation[lane][activeStep - 1];
  const width = LEFT + score.steps * STEP + 1;

  useEffect(() => {
    let raf = 0;
    const tick = () => { tickSinging(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const position = (e: React.PointerEvent) => {
    const p = svg.current!.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: q.x, y: q.y, step: clamp(Math.floor((q.x - LEFT) / STEP), 0, score.steps - 1), midi: clamp(bottom + ROWS - 1 - Math.floor((q.y - TOP) / ROW), bottom, bottom + ROWS - 1) };
  };
  const capture = (e: React.PointerEvent) => { svg.current?.setPointerCapture(e.pointerId); e.preventDefault(); };
  const paint = (fromStep: number, fromValue: number | null, toStep: number, toValue: number | null) => {
    const direction = fromStep <= toStep ? 1 : -1, changes: { step: number; value: number | null }[] = [];
    for (let s = fromStep; ; s += direction) {
      const t = fromStep === toStep ? 1 : (s - fromStep) / (toStep - fromStep);
      changes.push({ step: s, value: toValue === null || fromValue === null ? toValue : fromValue + (toValue - fromValue) * t });
      if (s === toStep) break;
    }
    setAutomation(lane, changes); setAutoStep(toStep + 1);
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = position(e);
    if (p.x < LEFT) return;
    if (p.y >= TOP && p.y < TOP + ROW * ROWS) {
      const n = { id: noteId(), start: p.step, length: 1, midi: p.midi };
      setSelected(n.id); preview(n); drag.current = { type: "draw", anchor: p.step, midi: p.midi, note: n }; capture(e);
    } else if (p.y >= AUTO && p.y <= AUTO + AUTO_H) {
      const value = erase ? null : clamp(1 - (p.y - AUTO) / AUTO_H, 0, 1);
      drag.current = { type: "automation", step: p.step, value }; paint(p.step, value, p.step, value); capture(e);
    }
  };
  const noteDown = (e: React.PointerEvent, note: ScoreNote) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = position(e), right = LEFT + (note.start + note.length) * STEP;
    setSelected(note.id); preview(note);
    drag.current = p.x >= right - Math.min(10, STEP * note.length * .4) ? { type: "resize", note } : { type: "move", anchor: p.step, pitch: p.midi, note };
    capture(e);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current; if (!d) return;
    const p = position(e);
    if (d.type === "automation") {
      const v = erase ? null : clamp(1 - (p.y - AUTO) / AUTO_H, 0, 1);
      paint(d.step, d.value, p.step, v); d.step = p.step; d.value = v;
    } else if (d.type === "draw") {
      preview({ ...d.note, start: Math.min(d.anchor, p.step), length: Math.abs(d.anchor - p.step) + 1, midi: d.midi });
    } else if (d.type === "resize") {
      preview({ ...d.note, length: clamp(p.step - d.note.start + 1, 1, score.steps - d.note.start) });
    } else {
      preview({ ...d.note, start: clamp(d.note.start + p.step - d.anchor, 0, score.steps - d.note.length), midi: clamp(d.note.midi + p.midi - d.pitch, 24, 108) });
    }
  };
  const up = (cancel = false) => {
    if (!cancel && drag.current && drag.current.type !== "automation" && draftRef.current) putNote(draftRef.current);
    drag.current = null; preview(null);
  };
  const keyNote = (e: React.KeyboardEvent, n: ScoreNote) => {
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); remove(n.id); setSelected(null); return; }
    const changes: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (!(e.key in changes)) return;
    e.preventDefault(); e.stopPropagation();
    const [x, y] = changes[e.key];
    putNote(e.shiftKey && x ? { ...n, length: clamp(n.length + x, 1, score.steps - n.start) } : { ...n, start: clamp(n.start + x, 0, score.steps - n.length), midi: clamp(n.midi + y, 24, 108) });
  };
  const shown = draft ? [...score.notes.filter(n => n.id !== draft.id), draft].sort((a, b) => a.start - b.start) : score.notes;
  const syllable = (n: ScoreNote) => {
    const index = shown.findIndex(x => x.id === n.id);
    return lyrics.length ? lyrics[index % lyrics.length]?.text : "ah";
  };
  const add = () => {
    const occupied = new Set(score.notes.flatMap(n => Array.from({ length: n.length }, (_, i) => n.start + i)));
    const step = Array.from({ length: score.steps }, (_, i) => i).find(i => !occupied.has(i));
    if (step === undefined) return;
    const n = { id: noteId(), start: step, length: 1, midi: clamp(bottom + 5, 24, 108) };
    putNote(n); setSelected(n.id);
  };
  return <div className="score-editor">
    <div className="score-transport">
      <button className={`primary${playing ? " on" : ""}`} onClick={() => {
        if (playing) stopScore();
        else void playScore(body, async () => { await startAudio(); if (!useStore.getState().started) throw new Error(useStore.getState().startError ?? "Could not start audio."); });
      }}>{playing ? "Stop score" : "Play score"}</button>
      <label>Tempo <NumberInput aria-label="Score tempo" value={score.bpm} min={40} max={220} step={1} onChange={useSongScore.getState().setBpm}/> bpm</label>
      <label>Length <select aria-label="Score length" value={score.steps} onChange={e => { useSongScore.getState().setSteps(Number(e.target.value)); setSelected(null); }}>{[16,32,64,128].map(n=><option key={n} value={n}>{n/16} {n===16 ? "bar" : "bars"}</option>)}</select></label>
      <label className="score-load">Load melody <select aria-label="Load an editable demo melody" value="" onChange={e => {
        const song = DEMO_SONGS.find(s => s.name === e.target.value); if (!song) return;
        stopScore(); setLyrics(song.lyrics); const next = scoreFromDemo(song, nearestBody(body)); useSongScore.getState().load(next);
        setBottom(clamp(Math.floor((next.notes[0]?.midi ?? 60) / 12) * 12, 24, 96)); setSelected(null);
      }}><option value="">Choose…</option>{DEMO_SONGS.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}</select></label>
    </div>
    <div className="score-toolbar">
      <div className="score-octave"><span>Pitch {name(bottom)}–{name(bottom+12)}</span><Chip toggle={false} aria-label="Lower score octave" onClick={() => setBottom(n => Math.max(24,n-12))} disabled={bottom<=24}>−</Chip><Chip toggle={false} aria-label="Raise score octave" onClick={() => setBottom(n => Math.min(96,n+12))} disabled={bottom>=96}>+</Chip></div>
      <Chip toggle={false} onClick={add} disabled={score.notes.reduce((sum,n)=>sum+n.length,0)>=score.steps}>Add note</Chip>
      <Chip toggle={false} onClick={() => { useSongScore.getState().clearNotes(); setSelected(null); }}>Clear notes</Chip>
      <span className="score-hint">Drag to draw · drag a note to move · drag its right edge to resize</span>
    </div>
    <div className="score-scroll" aria-label="Scrollable score editor">
      <svg ref={svg} className="score-grid" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="application" aria-label="Editable piano roll and automation. Drag to draw notes or automation. Select a note for keyboard editing." onPointerDown={down} onPointerMove={move} onPointerUp={() => up()} onPointerCancel={() => up(true)}>
        <rect width={width} height={HEIGHT} fill="#000"/>
        {Array.from({length:ROWS}, (_,i) => { const midi = bottom + ROWS - 1 - i, y = TOP+i*ROW; return <g key={midi}>
          <rect x={LEFT} y={y} width={score.steps*STEP} height={ROW} fill={black(midi) ? "#08131b" : "#020709"}/>
          <line x1={LEFT} x2={width} y1={y+ROW} y2={y+ROW} stroke={midi%12===0 ? "#1f5f8c" : "#102a39"} />
          <text x={LEFT-6} y={y+15} textAnchor="end" className="score-pitch" fill={midi%12===0 ? "#4fb6f2" : "#276383"}>{name(midi)}</text>
        </g>; })}
        {Array.from({length:score.steps+1}, (_,i) => <g key={i}>
          <line x1={LEFT+i*STEP} x2={LEFT+i*STEP} y1={TOP} y2={AUTO+AUTO_H} stroke={i%16===0 ? "#367fab" : i%4===0 ? "#1e536f" : "#112c3a"} strokeWidth={i%16===0 ? 1.3 : 1}/>
          {i<score.steps && i%4===0 && <text x={LEFT+i*STEP+4} y={17} className="score-ruler">{i%16===0 ? `BAR ${i/16+1}` : String(i%16/4+1)}</text>}
        </g>)}
        <line x1={LEFT} x2={width} y1={AUTO} y2={AUTO} stroke="#2a668a"/>
        <line x1={LEFT} x2={width} y1={AUTO+AUTO_H/2} y2={AUTO+AUTO_H/2} stroke="#173b50" strokeDasharray="2 5"/>
        <line x1={LEFT} x2={width} y1={AUTO+AUTO_H} y2={AUTO+AUTO_H} stroke="#2a668a"/>
        <text x="4" y={AUTO+10} className="score-ruler">MAX</text><text x="4" y={AUTO+AUTO_H} className="score-ruler">MIN</text>
        {score.automation[lane].map((v,i) => v === null ? null : <g key={i} pointerEvents="none">
          <rect x={LEFT+i*STEP+2} y={AUTO+(1-v)*AUTO_H} width={STEP-4} height={Math.max(2,v*AUTO_H)} fill={laneInfo.color} opacity=".18"/>
          <line x1={LEFT+i*STEP+2} x2={LEFT+(i+1)*STEP-2} y1={AUTO+(1-v)*AUTO_H} y2={AUTO+(1-v)*AUTO_H} stroke={laneInfo.color} strokeWidth="2"/>
        </g>)}
        {shown.map(n => {
          if (n.midi < bottom || n.midi > bottom + ROWS - 1) return null;
          const x = LEFT+n.start*STEP, y = TOP+(bottom+ROWS-1-n.midi)*ROW+2, w = n.length*STEP;
          const isSelected = selected === n.id;
          return <g key={n.id} role="button" tabIndex={0} aria-label={`Note ${name(n.midi)}, step ${n.start+1}, ${n.length} steps. Arrow keys move; shift and left or right resize; delete removes.`} onPointerDown={e => noteDown(e,n)} onKeyDown={e => keyNote(e,n)} onFocus={() => setSelected(n.id)} className="score-note">
            <rect x={x+1} y={y} width={Math.max(2,w-2)} height={ROW-4} fill={isSelected ? "#153e2e" : "#08271b"} stroke={isSelected ? "#e5ffed" : "#5be381"} strokeWidth={isSelected ? 1.7 : 1.2}/>
            <line x1={x+w-7} x2={x+w-7} y1={y+3} y2={y+ROW-7} stroke="#5be381" opacity=".8"/>
            <text x={x+5} y={y+13} fill="#b5f7c6" className="score-note-text" pointerEvents="none">{syllable(n)?.toUpperCase()}</text>
          </g>;
        })}
        {playhead>=0 && playhead<score.steps && <line x1={LEFT+playhead*STEP} x2={LEFT+playhead*STEP} y1={TOP} y2={AUTO+AUTO_H} stroke="#eef6f8" strokeWidth="1.5" strokeDasharray="4 5" opacity=".8" pointerEvents="none"/>}
      </svg>
    </div>
    <div className="score-selection">
      {selectedNote ? <>
        <span className="score-caption">Selected note</span>
        <label>Pitch <NumberInput aria-label="Selected note MIDI pitch" value={selectedNote.midi} min={24} max={108} step={1} onChange={midi=>putNote({...selectedNote,midi})}/></label>
        <label>Step <NumberInput aria-label="Selected note start step" value={selectedNote.start+1} min={1} max={score.steps} step={1} onChange={start=>putNote({...selectedNote,start:start-1})}/></label>
        <label>Steps <NumberInput aria-label="Selected note length" value={selectedNote.length} min={1} max={score.steps-selectedNote.start} step={1} onChange={length=>putNote({...selectedNote,length})}/></label>
        <Chip toggle={false} onClick={() => { remove(selectedNote.id); setSelected(null); }}>Delete note</Chip>
      </> : <span className="score-hint">Select a note to edit its exact pitch, start and length. Notes are monophonic; overlaps trim the older note.</span>}
    </div>
    <div className="score-automation">
      <label>Automation <select aria-label="Automation parameter" value={lane} onChange={e=>{setLane(e.target.value as Lane);setErase(false);}}>{LANES.map(l=><option key={l.id} value={l.id}>{l.label} · {l.range}</option>)}</select></label>
      <Chip on={erase} onClick={()=>setErase(!erase)}>Erase</Chip>
      <Chip toggle={false} onClick={()=>useSongScore.getState().clearLane(lane)}>Clear lane</Chip>
      <label>Step <NumberInput aria-label="Automation step" value={activeStep} min={1} max={score.steps} step={1} onChange={setAutoStep}/></label>
      <label className="score-auto-value">Value <input aria-label={`${laneInfo.label} automation value`} type="range" min={0} max={100} value={Math.round((laneValue ?? .5)*100)} onChange={e=>setAutomation(lane,[{step:activeStep-1,value:Number(e.target.value)/100}])}/><span>{laneValue === null ? "—" : `${Math.round(laneValue*100)}%`}</span></label>
      <Chip toggle={false} onClick={()=>setAutomation(lane,[{step:activeStep-1,value:null}])} disabled={laneValue===null}>Clear point</Chip>
    </div>
    <p className="score-hint">Draw in the lower lane to set {laneInfo.label.toLowerCase()} per sixteenth note. Blank steps use the voice's normal setting. {playing ? "Edits play next time." : "The score and lyrics are kept in this browser."}</p>
    {error && <p className="score-error" role="status">{error}</p>}
  </div>;
}
