import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { ArrowDown, AudioLines, Check, ChevronDown, CircleHelp, Download, FileUp, Music2, Pause, Play, Plus, Save, Trash2, Volume2, VolumeX } from 'lucide-react';
import { audio } from '../audio/AudioEngine';
import { isPlayable } from '../model/graph';
import { copy, makeId, type Band, type Instrument, type Track } from '../model/types';
import { artworkUrl } from './Canvas';

interface Props {
  band: Band;
  setBand: Dispatch<SetStateAction<Band>>;
  bands: Band[];
  instruments: Instrument[];
  current: Instrument;
  onSave: () => void;
  onNew: () => void;
  onLoad: (band: Band) => void;
  onDelete: (id: string) => void;
  onImport: (file: File) => void;
  onExport: () => void;
  onAudio: () => void;
  onError: (message: string) => void;
}
const offsets = [0, 2, 4, 7, 12];
const pitches = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (midi: number) => `${pitches[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;

export function BandStudio({ band, setBand, bands, instruments, current, onSave, onNew, onLoad, onDelete, onImport, onExport, onAudio, onError }: Props) {
  const [playing, setPlaying] = useState(false);
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [paint, setPaint] = useState(0);
  const [loadOpen, setLoadOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);
  const starting = useRef(false);
  const highlightTimers = useRef<number[]>([]);
  const nextTime = useRef(0); const nextStep = useRef(0);
  const bandRef = useRef(band); bandRef.current = band;
  const instrumentsRef = useRef(instruments); instrumentsRef.current = instruments;
  const alive = useRef(true);
  const stop = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    for (const id of highlightTimers.current) window.clearTimeout(id);
    highlightTimers.current = [];
    audio.stop(); setPlaying(false); setActiveStep(null);
  };
  useEffect(() => () => {
    alive.current = false;
    if (timer.current !== null) window.clearInterval(timer.current);
    for (const id of highlightTimers.current) window.clearTimeout(id);
    audio.stop();
  }, []);
  const schedule = () => {
    const context = audio.context; if (!context) return;
    // If the tab was suspended, skip stale notes rather than scheduling a burst.
    if (nextTime.current < context.currentTime - .2) nextTime.current = context.currentTime + .05;
    while (nextTime.current < context.currentTime + .16) {
      const step = nextStep.current, at = nextTime.current;
      const snapshot = bandRef.current;
      for (const track of snapshot.tracks) {
        const offset = track.steps[step];
        const instrument = instrumentsRef.current.find((item) => item.id === track.instrumentId) ?? track.instrumentSnapshot;
        if (!track.muted && offset !== null && isPlayable(instrument.parts, instrument.connections)) {
          const duration = 60 / snapshot.bpm * .44;
          audio.note(instrument, Math.min(108, track.note + offset), duration, at, track.volume * .8);
        }
      }
      const timeout = window.setTimeout(() => { setActiveStep(step); highlightTimers.current = highlightTimers.current.filter((id) => id !== timeout); }, Math.max(0, (at - context.currentTime) * 1000));
      highlightTimers.current.push(timeout);
      nextTime.current += 60 / snapshot.bpm / 4;
      nextStep.current = (step + 1) % 16;
    }
  };
  const togglePlay = async () => {
    if (playing) { stop(); return; }
    if (starting.current) return;
    if (!band.tracks.length) { onError('Add a voice to your band first.'); return; }
    starting.current = true;
    try {
      await audio.start(); if (!alive.current) return; onAudio();
      nextTime.current = (audio.context?.currentTime ?? 0) + .08; nextStep.current = 0;
      setPlaying(true); schedule(); timer.current = window.setInterval(schedule, 35);
    } catch { onError('Audio could not start. Please try again in a supported browser.'); } finally { starting.current = false; }
  };
  const updateTrack = (id: string, patch: Partial<Track>) => setBand((b) => ({ ...b, tracks: b.tracks.map((track) => track.id === id ? { ...track, ...patch } : track) }));
  const addTrack = () => {
    if (band.tracks.length >= 16) { onError('A band can have up to 16 voices.'); return; }
    const instrument = current.parts.length ? current : instruments[0];
    if (!instrument) return;
    setBand((b) => ({ ...b, tracks: [...b.tracks, { id: makeId('voice'), name: 'New voice', instrumentId: instrument.id, instrumentSnapshot: copy(instrument), note: 60, volume: .7, muted: false, steps: Array(16).fill(null) }] }));
  };
  return <main className="band-page page-content">
    <div className="page-heading"><div><div className="breadcrumb">YOUR WORKSPACE <span>/</span> BAND STUDIO</div><div className="title-line"><h1>Better together.</h1><span className="title-spark">✳</span></div><p>Give every creature a part. Make a little noise together.</p></div><div className="heading-actions"><div className="load-wrapper"><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }}/><button className="button secondary" onClick={() => setLoadOpen(!loadOpen)} aria-expanded={loadOpen}>Saved bands <span className="small-count">{bands.length}</span><ChevronDown size={14}/></button>{loadOpen && <div className="load-menu"><span className="menu-eyebrow">YOUR SAVED BANDS</span><button className="new-band-menu" onClick={() => { stop(); onNew(); setLoadOpen(false); }}><Plus size={14}/> New empty band</button><button onClick={() => { importRef.current?.click(); setLoadOpen(false); }}><FileUp size={14}/> Import band JSON</button><button className="new-band-menu" onClick={() => { onExport(); setLoadOpen(false); }}><Download size={14}/> Export current band</button>{bands.length ? bands.map((item) => <div key={item.id}><button onClick={() => { stop(); onLoad(item); setLoadOpen(false); }}><Music2 size={14}/>{item.name}</button><button className="delete-saved-band" onClick={() => onDelete(item.id)} aria-label={`Delete ${item.name}`}><Trash2 size={14}/></button></div>) : <p>No bands saved yet.</p>}</div>}</div><button className="button secondary" onClick={onSave}><Save size={15}/> Save band</button><button className="button primary" onClick={() => void togglePlay()}>{playing ? <Pause size={15} fill="currentColor"/> : <Play size={15} fill="currentColor"/>}{playing ? 'Stop band' : 'Play band'}</button></div></div>
    <div className="band-intro"><div className="band-icon"><AudioLines size={22}/></div><div><span className="eyebrow">YOUR ARRANGEMENT</span><label className="band-name-label"><input aria-label="Band name" value={band.name} maxLength={60} onChange={(event) => setBand((b) => ({ ...b, name: event.target.value }))}/></label><p>16 steps · {band.tracks.length} {band.tracks.length === 1 ? 'voice' : 'voices'} · infinite possibilities</p></div><div className="tempo"><span>TEMPO</span><div><input aria-label="Tempo in BPM" type="number" min="50" max="180" value={band.bpm} onChange={(event) => setBand((b) => ({ ...b, bpm: Math.max(50, Math.min(180, Number(event.target.value) || 50)) }))}/><strong>BPM</strong></div></div><div className="band-intro-art"><span>✳</span><i/><i/><i/><i/><i/><i/><i/><i/></div></div>
    <div className="sequencer-card">
      <div className="sequencer-heading"><div><span className="eyebrow">THE BAND ROOM</span><h2>Build your arrangement</h2><p>Choose a pitch, then tap steps to paint notes. Tap the same note again to erase it.</p></div><button className="button secondary" onClick={addTrack}><Plus size={15}/> Add voice</button></div>
      <div className="paint-row"><div><span className="paint-label">NOTE PAINT</span><div className="paint-options">{offsets.map((offset) => <button key={offset} className={paint === offset ? 'active' : ''} onClick={() => setPaint(offset)}>{offset === 0 ? 'Root' : `+${offset}`}{paint === offset && <Check size={12}/>}</button>)}</div><span className="paint-hint">semitones from each voice’s root note</span></div><span className="step-help"><CircleHelp size={14}/> Click the grid to compose</span></div>
      <div className="sequencer-scroll"><div className="sequencer-inner">
        <div className="step-numbers"><span>VOICE / INSTRUMENT</span><div>{Array.from({ length: 16 }, (_, i) => <span key={i} className={i % 4 === 0 ? 'beat-number' : ''}>{String(i+1).padStart(2, '0')}</span>)}</div></div>
        {band.tracks.map((track, trackIndex) => {
          const selected = instruments.find((item) => item.id === track.instrumentId) ?? track.instrumentSnapshot;
          return <div className={`track-row ${track.muted ? 'muted' : ''}`} key={track.id}>
            <div className="track-info"><div className="track-top"><div className="track-thumb">{selected.artwork !== 'blank' ? <img src={artworkUrl(selected.artwork)} alt=""/> : <span>✳</span>}</div><div className="track-inputs"><input aria-label={`Voice ${trackIndex+1} name`} value={track.name} maxLength={40} onChange={(event) => updateTrack(track.id, { name: event.target.value })}/><select aria-label={`Voice ${trackIndex+1} instrument`} value={track.instrumentId} onChange={(event) => { const instrument = instruments.find((item) => item.id === event.target.value); if (instrument) updateTrack(track.id, { instrumentId: instrument.id, instrumentSnapshot: copy(instrument) }); }}>
              {!instruments.some((item) => item.id === track.instrumentId) && <option value={track.instrumentId}>{track.instrumentSnapshot.name} (saved snapshot)</option>}
              {instruments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></div><button className={`track-mute ${track.muted ? 'is-muted' : ''}`} onClick={() => updateTrack(track.id, { muted: !track.muted })} title={track.muted ? 'Unmute voice' : 'Mute voice'} aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`}>{track.muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</button><button className="track-remove" onClick={() => setBand((b) => ({ ...b, tracks: b.tracks.filter((item) => item.id !== track.id) }))} aria-label={`Remove ${track.name}`} title="Remove voice"><Trash2 size={14}/></button></div>
            <div className="track-bottom"><label>ROOT <select aria-label={`${track.name} root note`} value={track.note} onChange={(event) => updateTrack(track.id, { note: Number(event.target.value) })}>{Array.from({ length: 61 }, (_, i) => i + 24).map((note) => <option value={note} key={note}>{noteName(note)}</option>)}</select></label><label className="track-volume">LEVEL <input aria-label={`${track.name} volume`} type="range" min="0" max="1" step=".01" value={track.volume} onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) })}/></label></div></div>
            <div className="step-grid">{track.steps.map((step, i) => <button key={i} className={`step ${step !== null ? 'on' : ''} ${i % 4 === 0 ? 'beat' : ''} ${activeStep === i ? 'playing' : ''}`} onClick={() => { const steps = [...track.steps]; steps[i] = step === paint ? null : paint; updateTrack(track.id, { steps }); }} aria-label={`${track.name} step ${i+1}${step === null ? ', empty' : `, ${noteName(track.note+step)}`}`} title={step === null ? `Step ${i+1}: empty` : `Step ${i+1}: ${noteName(track.note+step)}`}><span>{step !== null ? (step === 0 ? '•' : `+${step}`) : ''}</span></button>)}</div>
          </div>;
        })}
        {!band.tracks.length && <div className="empty-tracks">No voices yet. Add one to start your band.</div>}
      </div></div>
      <div className="sequencer-footer"><span><span className="foot-status"/> {playing ? 'PLAYING YOUR BAND' : 'READY WHEN YOU ARE'}</span><span>Changes apply on the next scheduled note <ArrowDown size={13}/></span></div>
    </div>
    <div className="band-tip"><span>✳</span><div><strong>A band of your own making.</strong><p>Use example instruments or save your own in the lab, then assign them to a voice. Your band and instrument library stay on this device.</p></div></div>
  </main>;
}
