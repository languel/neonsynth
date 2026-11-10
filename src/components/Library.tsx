import { useRef, useState } from 'react';
import { ArrowRight, Download, FileUp, Heart, LibraryBig, Play, Search, Sparkles, Trash2 } from 'lucide-react';
import { artworkUrl } from './Canvas';
import type { Instrument } from '../model/types';

interface Props {
  presets: Instrument[];
  saved: Instrument[];
  onOpen: (instrument: Instrument) => void;
  onPreview: (instrument: Instrument) => void;
  onDelete: (id: string) => void;
  onExport: (instrument: Instrument) => void;
  onImport: (file: File) => void;
  onNew: () => void;
}
const categories = ['All', 'Marine', 'Birds', 'Prehistoric', 'Fantasy', 'Instruments', 'Objects'];
export function Library({ presets, saved, onOpen, onPreview, onDelete, onExport, onImport, onNew }: Props) {
  const [tab, setTab] = useState<'examples' | 'saved'>('examples');
  const [category, setCategory] = useState('All');
  const [query, setQuery] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const items = (tab === 'examples' ? presets : saved).filter((item) =>
    (tab === 'saved' || category === 'All' || item.category === category) && `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(query.toLowerCase()));
  return <main className="library-page page-content">
    <div className="page-heading library-heading"><div><div className="breadcrumb">YOUR WORKSPACE <span>/</span> INSTRUMENT LIBRARY</div><div className="title-line"><h1>A world of voices.</h1><span className="title-spark">✳</span></div><p>Meet the instruments. Take one apart, make it yours, or dream up something entirely new.</p></div><div className="heading-actions"><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.target.value = ''; }}/><button className="button secondary" onClick={() => fileRef.current?.click()}><FileUp size={15}/> Import JSON</button><button className="button primary" onClick={onNew}><Sparkles size={15}/> Create instrument</button></div></div>
    <div className="library-controls"><div className="library-tabs"><button className={tab === 'examples' ? 'active' : ''} onClick={() => setTab('examples')}>Explore examples <span>{presets.length}</span></button><button className={tab === 'saved' ? 'active' : ''} onClick={() => setTab('saved')}>My instruments <span>{saved.length}</span></button></div><label className="search-box"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search instruments" aria-label="Search instruments"/></label></div>
    {tab === 'examples' && <div className="filter-row">{categories.map((value) => <button key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{value}</button>)}</div>}
    {items.length ? <div className="library-grid">{items.map((item, index) => <article className="library-card" key={item.id}>
      <button className="library-image" onClick={() => onOpen(item)} aria-label={`Open ${item.name} in lab`}>
        {item.artwork !== 'blank' ? <img src={artworkUrl(item.artwork)} alt=""/> : <div className="blank-thumb"><CircleMark/></div>}
        <span className="library-card-index">{tab === 'examples' ? 'EXAMPLE' : 'YOUR INSTRUMENT'} / {String(index+1).padStart(2, '0')}</span>
        <span className="image-arrow"><ArrowRight size={16}/></span>
      </button>
      <div className="library-card-body"><div className="library-card-meta"><span>{item.category.toUpperCase()}</span><span>● &nbsp;{item.parts.length} PARTS</span></div><h3>{item.name}</h3><p>{item.description}</p><div className="library-card-actions"><button className="open-link" onClick={() => onOpen(item)}>Open in lab <ArrowRight size={14}/></button><div><button className="mini-icon" onClick={() => onPreview(item)} title={`Hear ${item.name}`} aria-label={`Hear ${item.name}`}><Play size={14} fill="currentColor"/></button>{tab === 'saved' && <><button className="mini-icon" onClick={() => onExport(item)} title="Export JSON" aria-label={`Export ${item.name}`}><Download size={15}/></button><button className="mini-icon danger-hover" onClick={() => onDelete(item.id)} title="Delete instrument" aria-label={`Delete ${item.name}`}><Trash2 size={15}/></button></>}</div></div></div>
    </article>)}</div> : <div className="empty-library"><span><LibraryBig size={25}/></span><h3>{tab === 'saved' && !saved.length ? 'Your collection starts here.' : 'No instruments found.'}</h3><p>{tab === 'saved' && !saved.length ? 'Save an instrument from the lab and it will live here on this device.' : 'Try a different search or category.'}</p>{tab === 'saved' && !saved.length && <button className="button primary" onClick={() => setTab('examples')}><Heart size={15}/> Explore examples</button>}</div>}
  </main>;
}
function CircleMark() { return <div className="circle-mark">✳</div>; }
