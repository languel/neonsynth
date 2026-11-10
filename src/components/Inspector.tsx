import { ArrowDownRight, CircleDot, Info, SlidersHorizontal, Trash2, Wind, X } from 'lucide-react';
import { EXCITATION_LABELS, KIND_LABELS, sizeFromOutline, type Connection, type Excitation, type Part, type PartKind, type PartParams } from '../model/types';

interface Props {
  part: Part | undefined;
  parts: Part[];
  connections: Connection[];
  onChange: (part: Part) => void;
  onDelete: (id: string) => void;
  onRemoveConnection: (from: string, to: string) => void;
}
function Slider({ label, value, onChange, hint, bipolar = false }: { label: string; value: number; onChange: (value: number) => void; hint?: string; bipolar?: boolean }) {
  const display = bipolar ? `${value > 0 ? '+' : ''}${value} st` : `${Math.round(value*100)}%`;
  return <label className="slider-field"><span className="slider-line"><span>{label}</span><strong>{display}</strong></span><input type="range" min={bipolar ? -24 : 0} max={bipolar ? 24 : 1} step={bipolar ? 1 : .01} value={value} onChange={(event) => onChange(Number(event.target.value))} style={{ '--slider-fill': `${bipolar ? (value+24)/48*100 : value*100}%` } as React.CSSProperties}/>{hint && <small>{hint}</small>}</label>;
}
export function Inspector({ part, parts, connections, onChange, onDelete, onRemoveConnection }: Props) {
  const setParam = (key: keyof PartParams, value: number) => { if (part) onChange({ ...part, params: { ...part.params, [key]: value } }); };
  const outgoing = connections.filter((edge) => edge.from === part?.id);
  const incoming = connections.filter((edge) => edge.to === part?.id);
  return <aside className="inspector">
    <div className="inspector-header"><div><span className="eyebrow">MAKE IT YOURS</span><h2>Part inspector</h2></div><span className="inspector-heading-icon"><SlidersHorizontal size={17}/></span></div>
    {part ? <>
      <div className="inspector-intro"><div className={`inspector-part-icon ${part.kind}`}>{part.kind === 'source' ? <Wind size={21}/> : <CircleDot size={21}/>}</div><div><span>SELECTED PART</span><strong>{part.name}</strong><small>{KIND_LABELS[part.kind]}</small></div><button className="delete-part" onClick={() => onDelete(part.id)} title="Delete part" aria-label="Delete selected part"><Trash2 size={16}/></button></div>
      <div className="inspector-body">
        <label className="field"><span>PART NAME</span><input value={part.name} maxLength={60} onChange={(event) => onChange({ ...part, name: event.target.value })} aria-label="Part name"/></label>
        <label className="field"><span>PART TYPE</span><select value={part.kind} onChange={(event) => onChange({ ...part, kind: event.target.value as PartKind })} aria-label="Part type">{Object.entries(KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {part.kind === 'source' && <label className="field"><span>ENERGY / SOURCE</span><select value={part.excitation} onChange={(event) => onChange({ ...part, excitation: event.target.value as Excitation })} aria-label="Energy source">{Object.entries(EXCITATION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
        {part.points.length > 2 && <div className="outline-tools"><span>DRAWN OUTLINE</span><div><button aria-label="Shrink outline" onClick={() => { const points = part.points.map((point) => ({ x: point.x * .9, y: point.y * .9 })); onChange({ ...part, points, params: { ...part.params, size: sizeFromOutline(points) } }); }}>−</button><button aria-label="Enlarge outline" onClick={() => { const points = part.points.map((point) => ({ x: point.x * 1.1, y: point.y * 1.1 })); onChange({ ...part, points, params: { ...part.params, size: sizeFromOutline(points) } }); }}>+</button></div></div>}
        <div className="inspector-section-title"><span>BEHAVIOR</span><Info size={13}/></div>
        {part.kind === 'source' && <>
          <Slider label="Pressure" value={part.params.pressure} onChange={(v) => setParam('pressure', v)} hint="The energy driving this part"/>
          {part.excitation !== 'air' && <Slider label="Tension" value={part.params.tension} onChange={(v) => setParam('tension', v)}/>}
          {(part.excitation === 'string' || part.excitation === 'strike') && <Slider label="Damping" value={part.params.damping} onChange={(v) => setParam('damping', v)}/>}
          {(part.excitation === 'air' || part.excitation === 'glottis' || part.excitation === 'jet') && <Slider label="Breathiness" value={part.params.breathiness} onChange={(v) => setParam('breathiness', v)}/>}
          {part.excitation !== 'air' && <Slider label="Pitch offset" value={part.params.pitch} onChange={(v) => setParam('pitch', v)} bipolar/>}
        </>}
        {(part.kind === 'resonator' || part.kind === 'tube') && <>
          <Slider label={part.kind === 'tube' ? 'Tube length' : 'Chamber size'} value={part.params.size} onChange={(v) => setParam('size', v)} hint="Larger spaces emphasize lower frequencies"/>
          <Slider label="Resonance" value={part.params.resonance} onChange={(v) => setParam('resonance', v)}/>
          <Slider label="Damping" value={part.params.damping} onChange={(v) => setParam('damping', v)}/>
        </>}
        {part.kind === 'modulator' && <><Slider label="Pulse rate" value={part.params.rate} onChange={(v) => setParam('rate', v)}/><Slider label="Depth" value={part.params.depth} onChange={(v) => setParam('depth', v)}/></>}
        {part.kind === 'body' && <p className="connection-empty">A visual-only outline for your creature or object. It does not carry sound.</p>}
        {part.kind === 'outlet' && <Slider label="Openness" value={part.params.openness} onChange={(v) => setParam('openness', v)} hint="How much sound escapes"/>}
        <div className="inspector-section-title signal-title"><span>SIGNAL CONNECTIONS</span><span className="signal-count">{incoming.length + outgoing.length}</span></div>
        {incoming.length + outgoing.length === 0 ? <p className="connection-empty">Not connected yet. Use the <strong>connect tool</strong> on the canvas.</p> : <div className="connection-list">
          {incoming.map((edge) => <div key={`${edge.from}-${edge.to}`}><ArrowDownRight size={13}/><span>From <strong>{parts.find((p) => p.id === edge.from)?.name}</strong></span><button onClick={() => onRemoveConnection(edge.from, edge.to)} aria-label={`Remove connection from ${parts.find((p) => p.id === edge.from)?.name}`}><X size={13}/></button></div>)}
          {outgoing.map((edge) => <div key={`${edge.from}-${edge.to}`}><ArrowDownRight size={13}/><span>To <strong>{parts.find((p) => p.id === edge.to)?.name}</strong></span><button onClick={() => onRemoveConnection(edge.from, edge.to)} aria-label={`Remove connection to ${parts.find((p) => p.id === edge.to)?.name}`}><X size={13}/></button></div>)}
        </div>}
      </div>
    </> : <div className="inspector-empty"><div><CircleDot size={24}/></div><h3>Nothing selected yet</h3><p>Choose a part on the canvas to name it and shape how it behaves.</p></div>}
    <div className="inspector-note"><div className="note-icon">✳</div><p><strong>Good to know</strong><br/>Sound travels from an energy source, through your parts, and out into the world.</p></div>
  </aside>;
}
