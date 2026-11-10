import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, AudioLines, BookOpen, Check, ChevronRight, CircleHelp, LibraryBig, Music2, Pencil, Play, Plus, Save, Sparkles, Volume2, X } from 'lucide-react';
import { audio } from './audio/AudioEngine';
import { BandStudio } from './components/BandStudio';
import { artworkUrl, InstrumentCanvas, PartsStrip } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { Keyboard, Waveform } from './components/Keyboard';
import { Library } from './components/Library';
import { connectionError, isPlayable } from './model/graph';
import { DEMO_BAND, findPreset, PRESET_IDS, PRESETS } from './model/presets';
import { parseBand, parseInstrument, readStore, storedBands, storedInstruments, writeStore } from './model/storage';
import { blankInstrument, copy, makeId, type Band, type Instrument, type Part } from './model/types';

type Page = 'lab' | 'library' | 'band';

function Logo() {
  return <div className="brand"><div className="brand-mark"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M6 16c0-5.6 4.4-10 10-10s10 4.4 10 10-4.4 10-10 10S6 21.6 6 16Z" stroke="currentColor" strokeWidth="1.6"/><path d="M10 16c0-3.4 2.6-6 6-6s6 2.6 6 6-2.6 6-6 6-6-2.6-6-6Z" stroke="currentColor" strokeWidth="1.6"/><path d="M13.4 16a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 0 0-5.2 0Z" fill="currentColor"/><path d="M16 2v4M16 26v4M2 16h4M26 16h4" stroke="currentColor" strokeWidth="1.4"/></svg></div><div className="brand-text"><strong>NEON<span>SYNTH</span></strong><small>GIVE ANYTHING A VOICE</small></div></div>;
}

function SaveDialog({ instrument, onClose, onSave }: { instrument: Instrument; onClose: () => void; onSave: (name: string, description: string) => void }) {
  const [name, setName] = useState(instrument.name);
  const [description, setDescription] = useState(instrument.description);
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onSave(name.trim(), description.trim()); };
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="save-title" onSubmit={submit}>
    <div className="modal-head"><span className="modal-icon"><Save size={20}/></span><button type="button" onClick={onClose} aria-label="Close dialog"><X size={18}/></button></div>
    <span className="eyebrow">KEEP THE MAGIC</span><h2 id="save-title">Save your instrument</h2><p>Give this voice a name. It will be saved in your library on this device.</p>
    <label className="field"><span>INSTRUMENT NAME</span><input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)}/></label>
    <label className="field"><span>A LITTLE ABOUT IT</span><textarea maxLength={240} rows={3} value={description} onChange={(event) => setDescription(event.target.value)}/></label>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit"><Save size={15}/> Save instrument</button></div>
  </form></div>;
}
function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><div className="modal-head"><span className="modal-icon"><Sparkles size={20}/></span><button onClick={onClose} aria-label="Close help"><X size={18}/></button></div><span className="eyebrow">A LITTLE FIELD GUIDE</span><h2 id="help-title">Give anything a voice.</h2><p>Every instrument is a little network of energy, movement, and resonating spaces.</p><ol><li><strong>Make a part.</strong> Draw a shape on the canvas or choose Add part. Give it a name and a behavior in the inspector.</li><li><strong>Connect the sound.</strong> Use the connection tool, then select a source and the part it feeds. Make a path from an energy source to a sound outlet.</li><li><strong>Listen and save.</strong> Play the keys, tune the parameters, and save to your local library. Export JSON to back up or share an instrument.</li><li><strong>Start a band.</strong> Assign instruments to voices, choose root notes, and paint a 16-step arrangement.</li></ol><div className="help-credit">Source models adapted from <a href="https://github.com/jamesondh/chimera-vocal-synth" target="_blank" rel="noreferrer">Chimera Vocal Synth</a>. Neonsynth uses a simplified resonator network, not Chimera’s full airway simulation.</div><button className="button primary" onClick={onClose}>Let’s make something <ArrowRight size={15}/></button></div></div>;
}

function App() {
  const [page, setPage] = useState<Page>('lab');
  const [saved, setSaved] = useState<Instrument[]>(storedInstruments);
  const [bands, setBands] = useState<Band[]>(storedBands);
  const [current, setCurrent] = useState<Instrument>(() => parseInstrument(readStore('draft', null)) ?? copy(PRESETS[0]));
  const [band, setBand] = useState<Band>(() => parseBand(readStore('bandDraft', null)) ?? copy(DEMO_BAND));
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const draft = parseInstrument(readStore('draft', null)); return draft?.parts.find((p) => p.kind === 'source' && p.excitation !== 'air')?.id ?? draft?.parts[0]?.id ?? 'folds';
  });
  const [dirty, setDirty] = useState(() => readStore('draftDirty', false));
  const [audioOn, setAudioOn] = useState(false);
  const [auditioning, setAuditioning] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toast, setToast] = useState('');
  const allInstruments = useMemo(() => {
    const items = [...PRESETS, ...saved];
    return items.some((instrument) => instrument.id === current.id) ? items : [...items, current];
  }, [saved, current]);
  const selected = current.parts.find((part) => part.id === selectedId);

  useEffect(() => { writeStore('instruments', saved); }, [saved]);
  useEffect(() => { writeStore('bands', bands); }, [bands]);
  useEffect(() => { writeStore('draftDirty', dirty); }, [dirty]);
  useEffect(() => { const t = window.setTimeout(() => writeStore('draft', current), 250); return () => window.clearTimeout(t); }, [current]);
  useEffect(() => { const t = window.setTimeout(() => writeStore('bandDraft', band), 250); return () => window.clearTimeout(t); }, [band]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 3300); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { if (!auditioning) return; const t = window.setTimeout(() => setAuditioning(false), 2200); return () => window.clearTimeout(t); }, [auditioning]);

  const openInstrument = (instrument: Instrument) => {
    if (dirty && !window.confirm('Your current edits are not saved to your library. Switch instruments anyway?')) return;
    audio.stop(); setAuditioning(false); setCurrent(copy(instrument)); setSelectedId(instrument.parts.find((p) => p.kind === 'source' && p.excitation !== 'air')?.id ?? instrument.parts[0]?.id ?? null); setDirty(false); setPage('lab');
  };
  const changePart = (part: Part) => {
    setCurrent((instrument) => ({ ...instrument, parts: instrument.parts.map((p) => p.id === part.id ? part : p),
      // An outlet is a terminal, so changing a part to an outlet removes its outgoing links.
      connections: part.kind === 'body' ? instrument.connections.filter((edge) => edge.from !== part.id && edge.to !== part.id) : part.kind === 'outlet' ? instrument.connections.filter((edge) => edge.from !== part.id) : instrument.connections })); setDirty(true);
  };
  const movePart = (id: string, x: number, y: number) => {
    setCurrent((instrument) => ({ ...instrument, parts: instrument.parts.map((part) => part.id === id ? { ...part, x, y } : part) })); setDirty(true);
  };
  const addPart = (part: Part) => {
    if (current.parts.length >= 64) { setToast('An instrument can have up to 64 parts.'); return; }
    setCurrent((instrument) => ({ ...instrument, parts: [...instrument.parts, part] })); setDirty(true); setToast('Part added. Connect it to make it part of the sound.');
  };
  const connect = (from: string, to: string) => {
    const error = connectionError(current.parts, current.connections, from, to);
    if (error) { setToast(error); return false; }
    setCurrent((instrument) => ({ ...instrument, connections: [...instrument.connections, { from, to }] })); setDirty(true); setToast('Parts connected.'); return true;
  };
  const removeConnection = (from: string, to: string) => { setCurrent((instrument) => ({ ...instrument, connections: instrument.connections.filter((edge) => edge.from !== from || edge.to !== to) })); setDirty(true); };
  const deletePart = (id: string) => {
    const part = current.parts.find((p) => p.id === id);
    if (!part || !window.confirm(`Delete “${part.name}” and its connections?`)) return;
    setCurrent((instrument) => ({ ...instrument, parts: instrument.parts.filter((p) => p.id !== id), connections: instrument.connections.filter((edge) => edge.from !== id && edge.to !== id) })); setSelectedId(null); setDirty(true);
  };
  const reset = () => {
    const original = findPreset(current.id) ?? saved.find((item) => item.id === current.id);
    if (!window.confirm(original ? 'Reset this canvas to its last saved version?' : 'Clear all parts from this canvas?')) return;
    const next = original ? copy(original) : { ...current, parts: [], connections: [] };
    setCurrent(next); setSelectedId(next.parts[0]?.id ?? null); setDirty(!original);
  };
  const saveInstrument = (name: string, description: string) => {
    const item: Instrument = { ...copy(current), id: PRESET_IDS.has(current.id) ? makeId('instrument') : current.id, name, description: description || 'An instrument made in Neonsynth.', category: 'Custom' };
    const next = [...saved.filter((existing) => existing.id !== item.id), item];
    if (!writeStore('instruments', next)) { setToast('Could not save: browser storage is unavailable or full. Export a JSON backup.'); return; }
    setSaved(next); setCurrent(item); setDirty(false); setSaveOpen(false); setToast('Saved to your instrument library.');
  };
  const exportInstrument = (instrument: Instrument) => {
    const blob = new Blob([JSON.stringify(instrument, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${instrument.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'instrument'}.neonsynth.json`; link.click(); URL.revokeObjectURL(url);
    setToast('Instrument exported as JSON.');
  };
  const importInstrument = async (file: File) => {
    if (file.size > 1_000_000) { setToast('That file is too large. Instrument JSON must be under 1 MB.'); return; }
    try {
      const parsed = parseInstrument(JSON.parse(await file.text()));
      if (!parsed) throw new Error('Invalid instrument');
      const item = { ...parsed, id: makeId('instrument'), category: 'Custom' as const };
      const next = [...saved, item];
      if (!writeStore('instruments', next)) throw new Error('Storage is full');
      setSaved(next); setToast('Instrument imported into My instruments.');
    } catch { setToast('Could not import that file. Please choose a valid Neonsynth instrument JSON.'); }
  };
  const deleteInstrument = (id: string) => {
    const item = saved.find((instrument) => instrument.id === id); if (!item || !window.confirm(`Delete “${item.name}” from your library? Saved bands keep a snapshot.`)) return;
    setBand((b) => ({ ...b, tracks: b.tracks.map((track) => track.instrumentId === id ? { ...track, instrumentSnapshot: copy(item) } : track) }));
    setSaved((items) => items.filter((instrument) => instrument.id !== id)); setToast('Instrument removed from your library.');
  };
  const saveBand = () => {
    if (!band.name.trim()) { setToast('Give your band a name first.'); return; }
    const item: Band = { ...copy(band), id: band.id === 'draft-band' ? makeId('band') : band.id, name: band.name.trim(), tracks: band.tracks.map((track) => ({ ...copy(track), instrumentSnapshot: copy(allInstruments.find((instrument) => instrument.id === track.instrumentId) ?? track.instrumentSnapshot) })) };
    const next = [...bands.filter((existing) => existing.id !== item.id), item];
    if (!writeStore('bands', next)) { setToast('Could not save: browser storage is unavailable or full.'); return; }
    setBands(next); setBand(item); setToast('Band saved on this device.');
  };
  const audition = async (instrument: Instrument) => {
    if (auditioning && instrument.id === current.id) { audio.stop(); setAuditioning(false); return; }
    if (!isPlayable(instrument.parts, instrument.connections)) { setToast('Connect an energy source to an outlet before playing.'); return; }
    try {
      await audio.start(); setAudioOn(true); audio.stop();
      const root = instrument.category === 'Birds' ? 72 : instrument.category === 'Marine' || instrument.id === 'parasaur' || instrument.id === 'dragon' ? 48 : 60;
      const now = (audio.context?.currentTime ?? 0) + .05;
      [0, 4, 7, 12].forEach((offset, index) => audio.note(instrument, root + offset, .6, now + index * .3, .8));
      setAuditioning(true);
    } catch { setToast('Audio could not start. Please try again in a supported browser.'); }
  };
  const enableAudio = async () => { try { await audio.start(); setAudioOn(true); setToast('Audio is ready. Play a few notes!'); } catch { setToast('Audio could not start. Please try again in a supported browser.'); } };
  const newInstrument = () => openInstrument(blankInstrument());
  const setView = (next: Page) => { audio.stop(); setAuditioning(false); setPage(next); };

  return <div className="app-shell">
    <header className="topbar"><Logo/><div className="top-divider"/><div className="top-product">THE SOUND DESIGN STUDIO <span>✳</span></div><nav className="top-nav" aria-label="Main navigation"><button className={page === 'lab' ? 'active' : ''} onClick={() => setView('lab')}><Sparkles size={15}/> Instrument lab</button><button className={page === 'library' ? 'active' : ''} onClick={() => setView('library')}><LibraryBig size={15}/> Library</button><button className={page === 'band' ? 'active' : ''} onClick={() => setView('band')}><Music2 size={15}/> Band studio</button></nav><div className="top-right"><button className="audio-status" onClick={() => void enableAudio()}><span className={audioOn ? 'status-light on' : 'status-light'}/><span>{audioOn ? 'AUDIO READY' : 'ENABLE AUDIO'}</span></button><button className="help-button" onClick={() => setHelpOpen(true)} aria-label="Open guide"><CircleHelp size={18}/></button><button className="button primary top-save" onClick={() => setSaveOpen(true)}><Save size={15}/> Save instrument</button></div></header>
    <div className="app-body"><aside className="sidebar"><div className="sidebar-top"><div className="side-overline">YOUR CREATIVE SPACE <span>✳</span></div><h2>Sound starts<br/><em>with imagination.</em></h2><p>Build a voice for anything you can dream up.</p><button className="new-instrument" onClick={newInstrument}><Plus size={16}/><span>New instrument</span><ArrowRight size={15}/></button></div>
      <div className="side-list-heading"><span>EXAMPLE INSTRUMENTS</span><button onClick={() => setView('library')}>VIEW ALL <ChevronRight size={12}/></button></div>
      <div className="example-list">{PRESETS.map((preset, index) => <button key={preset.id} className={`example-item ${page === 'lab' && current.id === preset.id ? 'active' : ''}`} onClick={() => openInstrument(preset)}><span className="example-thumb"><img src={artworkUrl(preset.artwork)} alt=""/></span><span className="example-copy"><strong>{preset.name}</strong><small>{preset.category.toUpperCase()} <span>·</span> {String(index+1).padStart(2, '0')}</small></span>{page === 'lab' && current.id === preset.id && <span className="active-example-dot"/>}</button>)}</div>
      <div className="sidebar-bottom"><div className="sidebar-tip-icon">✳</div><p><strong>Curious how it works?</strong><br/>A little science. A lot of imagination.</p><button onClick={() => setHelpOpen(true)}>Explore the guide <ArrowRight size={13}/></button></div>
      <div className="sidebar-credit">INSPIRED BY <a href="https://github.com/jamesondh/chimera-vocal-synth" target="_blank" rel="noreferrer">CHIMERA ↗</a><span>© NEONSYNTH</span></div>
    </aside>
    <div className="content-scroll">{page === 'lab' ? <main className="lab-page page-content"><div className="lab-heading"><div><div className="breadcrumb">INSTRUMENT LAB <span>/</span> {PRESET_IDS.has(current.id) ? 'EXAMPLE INSTRUMENT' : 'YOUR INSTRUMENT'} <span>/</span> <b>{current.name.toUpperCase()}</b></div><div className="instrument-title"><h1>{current.name}</h1><button className="rename-button" onClick={() => setSaveOpen(true)} aria-label="Name and save instrument"><Pencil size={14}/></button><span className="example-badge">{PRESET_IDS.has(current.id) ? 'EXAMPLE' : 'YOUR CREATION'}</span>{dirty && <span className="unsaved-badge">UNSAVED CHANGES</span>}</div><p>{current.description}</p></div><div className="lab-heading-actions"><div className="model-tag"><span>✳</span><div><strong>PHYSICAL SOUND</strong><small>Made, not sampled</small></div></div><button className="button audition" onClick={() => void audition(current)}>{auditioning ? <AudioLines size={16}/> : <Play size={14} fill="currentColor"/>}{auditioning ? 'Stop preview' : 'Hear it'} </button></div></div>
      <div className="editor-layout"><div className="editor-main"><InstrumentCanvas instrument={current} selectedId={selectedId} onSelect={setSelectedId} onMove={movePart} onAdd={addPart} onConnect={connect} onReset={reset}/><PartsStrip instrument={current} selectedId={selectedId} onSelect={setSelectedId}/><Keyboard instrument={current} onAudio={() => setAudioOn(true)} onError={setToast}/></div><div className="editor-side"><Inspector part={selected} parts={current.parts} connections={current.connections} onChange={changePart} onDelete={deletePart} onRemoveConnection={removeConnection}/><div className="monitor-card"><div><span className="eyebrow">SOUND MONITOR</span><span className="monitor-status"><span className="foot-status"/> {audioOn ? 'LIVE' : 'STANDBY'}</span></div><Waveform active={audioOn}/><div className="monitor-bottom"><span><Volume2 size={13}/> OUTPUT</span><strong>{isPlayable(current.parts, current.connections) ? 'SIGNAL PATH READY' : 'CONNECT A PATH'}</strong></div></div></div></div>
      <div className="workspace-footer"><span><BookOpen size={14}/> Designed for curious ears.</span><button onClick={() => setView('library')}>Discover more instruments <ArrowRight size={14}/></button></div></main> : page === 'library' ? <Library presets={PRESETS} saved={saved} onOpen={openInstrument} onPreview={(instrument) => void audition(instrument)} onDelete={deleteInstrument} onExport={exportInstrument} onImport={(file) => void importInstrument(file)} onNew={newInstrument}/> : <BandStudio band={band} setBand={setBand} bands={bands} instruments={allInstruments} current={current} onSave={saveBand} onNew={() => { if (window.confirm('Start a new empty band? Save your current arrangement first if you want to keep it.')) { setBand({ version: 1, id: 'draft-band', name: 'Untitled band', bpm: 100, tracks: [] }); setToast('New band ready.'); } }} onLoad={(value) => { setBand(copy(value)); setToast('Band loaded.'); }} onDelete={(id) => { if (window.confirm('Delete this saved band?')) { setBands((values) => values.filter((value) => value.id !== id)); setToast('Band removed.'); } }} onAudio={() => setAudioOn(true)} onError={setToast}/>}
    </div></div>
    {saveOpen && <SaveDialog instrument={current} onClose={() => setSaveOpen(false)} onSave={saveInstrument}/>}{helpOpen && <HelpDialog onClose={() => setHelpOpen(false)}/>} {toast && <div className="toast" role="status"><span><Check size={14}/></span>{toast}<button onClick={() => setToast('')} aria-label="Dismiss message"><X size={14}/></button></div>}
  </div>;
}
export default App;
