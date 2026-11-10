import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ArrowUpRight, Cable, ChevronDown, CircleDot, Eraser, Hand, Minus, MousePointer2, Pencil, Plus, RotateCcw, Waves, Wind, X } from 'lucide-react';
import { KIND_LABELS, newPart, sizeFromOutline, type Instrument, type Part, type PartKind, type Point } from '../model/types';

export type CanvasTool = 'select' | 'draw' | 'connect';
export const artworkUrl = (artwork: Instrument['artwork']) => artwork === 'blank' ? '' : `${import.meta.env.BASE_URL}${artwork}-studio.webp`;
const partIcon = (kind: PartKind) => kind === 'source' ? Wind : kind === 'resonator' ? CircleDot : kind === 'tube' ? Waves : kind === 'modulator' ? RotateCcw : kind === 'body' ? Pencil : ArrowUpRight;

interface Props {
  instrument: Instrument;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onAdd: (part: Part) => void;
  onConnect: (from: string, to: string) => boolean;
  onReset: () => void;
}

export function InstrumentCanvas({ instrument, selectedId, onSelect, onMove, onAdd, onConnect, onReset }: Props) {
  const [tool, setTool] = useState<CanvasTool>('select');
  const [addOpen, setAddOpen] = useState(false);
  const [showAnatomy, setShowAnatomy] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [drawing, setDrawing] = useState<Point[]>([]);
  const drawingRef = useRef<Point[]>([]);
  const drag = useRef<{ id: string; start: Point; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const toPoint = (event: ReactPointerEvent): Point => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: Math.max(0, Math.min(1000, transformed.x)), y: Math.max(0, Math.min(560, transformed.y)) };
  };
  const changeTool = (value: CanvasTool) => { setTool(value); setPendingFrom(null); setShowAnatomy(true); };
  const pointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (tool !== 'draw' || !showAnatomy) { if (tool === 'select') onSelect(null); return; }
    event.preventDefault();
    const p = toPoint(event);
    drawingRef.current = [p]; setDrawing([p]);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const partPointerDown = (event: ReactPointerEvent<SVGGElement>, part: Part) => {
    if (tool === 'draw') return;
    event.stopPropagation(); event.preventDefault();
    if (tool === 'connect') {
      if (!pendingFrom) { setPendingFrom(part.id); onSelect(part.id); }
      else { if (onConnect(pendingFrom, part.id)) onSelect(part.id); setPendingFrom(null); }
      return;
    }
    onSelect(part.id);
    drag.current = { id: part.id, start: toPoint(event), x: part.x, y: part.y };
    svgRef.current?.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (drag.current) {
      const point = toPoint(event), d = drag.current;
      onMove(d.id, Math.max(0, Math.min(1000, d.x + point.x - d.start.x)), Math.max(0, Math.min(560, d.y + point.y - d.start.y)));
    } else if (drawingRef.current.length) {
      const next = toPoint(event), last = drawingRef.current[drawingRef.current.length - 1];
      if (Math.hypot(next.x - last.x, next.y - last.y) > 3 && drawingRef.current.length < 800) {
        drawingRef.current = [...drawingRef.current, next]; setDrawing(drawingRef.current);
      }
    }
  };
  const pointerUp = () => {
    drag.current = null;
    const points = drawingRef.current;
    if (points.length >= 3) {
      const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
      const x = (Math.min(...xs) + Math.max(...xs)) / 2, y = (Math.min(...ys) + Math.max(...ys)) / 2;
      const part = newPart('resonator', x, y);
      part.name = 'Drawn chamber'; part.points = points.map((p) => ({ x: p.x - x, y: p.y - y }));
      part.params.size = sizeFromOutline(part.points);
      onAdd(part); onSelect(part.id); changeTool('select');
    }
    drawingRef.current = []; setDrawing([]);
  };
  const addPart = (kind: PartKind) => {
    const shift = Math.min(instrument.parts.length * 18, 150);
    const part = newPart(kind, 420 + shift, 220 + shift * .5);
    onAdd(part); onSelect(part.id); setAddOpen(false); changeTool('select');
  };
  const byId = new Map(instrument.parts.map((part) => [part.id, part]));
  const width = 1000 / zoom, height = 560 / zoom;
  const instruction = tool === 'draw' ? 'Draw a closed shape to create a part' : tool === 'connect'
    ? pendingFrom ? 'Now select the part receiving energy' : 'Select a part to start a connection'
    : showAnatomy ? 'Select a part to edit · drag to move' : 'Artwork view · switch to anatomy to edit';

  return <section className="canvas-card" aria-label="Instrument drawing canvas">
    <div className="canvas-toolbar">
      <div className="canvas-title"><span className="canvas-title-icon"><CircleDot size={15}/></span><span>ANATOMY CANVAS</span><span className="toolbar-divider"/><span className="canvas-count">{String(instrument.parts.length).padStart(2, '0')} PARTS <span>·</span> {String(instrument.connections.length).padStart(2, '0')} LINKS</span></div>
      <div className="canvas-actions">
        <div className="tool-group" aria-label="Canvas tools">
          <button className={tool === 'select' ? 'tool active' : 'tool'} onClick={() => changeTool('select')} title="Select and move" aria-label="Select and move"><MousePointer2 size={15}/></button>
          <button className={tool === 'draw' ? 'tool active' : 'tool'} onClick={() => changeTool('draw')} title="Draw a part" aria-label="Draw a part"><Pencil size={15}/></button>
          <button className={tool === 'connect' ? 'tool active' : 'tool'} onClick={() => changeTool('connect')} title="Connect parts" aria-label="Connect parts"><Cable size={16}/></button>
        </div>
        <div className="add-wrapper">
          <button className="add-part-btn" onClick={() => setAddOpen(!addOpen)} aria-expanded={addOpen}><Plus size={15}/> <span>Add part</span> <ChevronDown size={12}/></button>
          {addOpen && <div className="add-menu" role="menu">
            <div className="menu-eyebrow">ADD TO CANVAS</div>
            {(['source', 'resonator', 'tube', 'modulator', 'outlet', 'body'] as PartKind[]).map((kind) => { const Icon = partIcon(kind); return <button key={kind} role="menuitem" onClick={() => addPart(kind)}><Icon size={15}/><span>{KIND_LABELS[kind]}</span><Plus size={13}/></button>; })}
          </div>}
        </div>
      </div>
    </div>
    <div className="canvas-viewport">
      <svg ref={svgRef} className={`anatomy-svg ${tool}`} viewBox={`${(1000-width)/2} ${(560-height)/2} ${width} ${height}`}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
        aria-label="Editable anatomy. Use the canvas tools to draw parts or connect them.">
        <defs>
          <pattern id="canvas-grid" width="25" height="25" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" fill="#51716d" opacity=".23"/></pattern>
          <marker id="connection-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M 0 0 L 6 3 L 0 6 z" fill="#a6eacb"/></marker>
          <filter id="node-glow"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        <rect x="0" y="0" width="1000" height="560" fill="#071114"/>
        {instrument.artwork !== 'blank' ? <image href={artworkUrl(instrument.artwork)} x="0" y="0" width="1000" height="560" preserveAspectRatio="xMidYMid slice"/> : <>
          <rect x="0" y="0" width="1000" height="560" fill="url(#canvas-grid)"/>
          <circle cx="500" cy="280" r="158" fill="none" stroke="#82bba5" strokeOpacity=".08"/>
          <circle cx="500" cy="280" r="210" fill="none" stroke="#82bba5" strokeOpacity=".05"/>
          {instrument.parts.length === 0 && <text x="500" y="275" textAnchor="middle" className="blank-canvas-text">A blank canvas for a new voice<tspan x="500" dy="24" className="blank-canvas-sub">Draw a shape or add your first part above</tspan></text>}
        </>}
        {showAnatomy && <g className="anatomy-layer">
          {instrument.connections.map((connection) => {
            const from = byId.get(connection.from), to = byId.get(connection.to);
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const d = `M ${from.x} ${from.y} C ${from.x + dx * .48} ${from.y}, ${to.x - dx * .48} ${to.y}, ${to.x} ${to.y}`;
            return <g key={`${connection.from}-${connection.to}`}><path d={d} fill="none" stroke="#88e7bf" strokeWidth="8" opacity=".05" filter="url(#node-glow)"/><path d={d} fill="none" stroke="#a6eacb" strokeWidth="1.3" strokeDasharray="4 5" opacity=".75" markerEnd="url(#connection-arrow)"/></g>;
          })}
          {instrument.parts.map((part, i) => {
            const active = part.id === selectedId, pending = part.id === pendingFrom;
            const path = part.points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
            const labelWidth = Math.min(165, Math.max(82, part.name.length * 6.3 + 34));
            return <g key={part.id} transform={`translate(${part.x} ${part.y})`} onPointerDown={(event) => partPointerDown(event, part)}
              role="button" aria-label={`${part.name}, ${KIND_LABELS[part.kind]}`} tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(part.id); } }} className={`canvas-part ${active ? 'selected' : ''}`}>
              {part.points.length > 2 && <path d={`${path} Z`} fill="#78efb7" fillOpacity=".12" stroke="#a4f2c9" strokeWidth="1.8" strokeDasharray="4 3"/>}
              <circle r={active || pending ? 28 : 23} fill="#b5ffd9" opacity={active ? '.1' : '.05'}/>
              <circle r={active || pending ? 21 : 18} fill="#0b2724" fillOpacity=".8" stroke={active || pending ? '#c7f7dc' : '#80c5ad'} strokeWidth={active ? '1.5' : '1'} strokeDasharray={pending ? '3 2' : undefined}/>
              <circle r="8" fill={part.kind === 'source' ? '#c8f5b5' : '#82d7bb'} fillOpacity=".95"/>
              <circle r="3" fill="#0a2824"/>
              {active && <><path d="M -33 0 H -27 M 27 0 H 33 M 0 -33 V -27 M 0 27 V 33" stroke="#bfffe0" strokeWidth="1"/></>}
              <g transform={`translate(${-labelWidth/2} 32)`}>
                <rect width={labelWidth} height="25" rx="4" fill="#0b1719" fillOpacity=".94" stroke={active ? '#7fd4ae' : '#486d62'} strokeOpacity=".8"/>
                <text x="9" y="16" fill="#9bc6b7" className="canvas-number">{String(i + 1).padStart(2, '0')}</text>
                <text x="29" y="16" fill={active ? '#e3fff0' : '#bbd8ce'} className="canvas-label">{part.name.length > 20 ? `${part.name.slice(0, 19)}…` : part.name}</text>
              </g>
            </g>;
          })}
          {drawing.length > 0 && <path d={drawing.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#d0ffd8" strokeWidth="2" strokeDasharray="5 3"/>}
        </g>}
      </svg>
      <div className="canvas-corner top-left"><span className="corner-dot"/> LIVE DESIGN <span className="corner-sep">/</span> {instrument.artwork === 'blank' ? 'BLANK CANVAS' : 'SPECIMEN VIEW'}</div>
      <div className="canvas-view-toggle" aria-label="Canvas display"><button className={showAnatomy ? 'active' : ''} onClick={() => setShowAnatomy(true)}>Anatomy</button><button className={!showAnatomy ? 'active' : ''} onClick={() => setShowAnatomy(false)}>Artwork</button></div>
      <div className="canvas-instruction">{tool === 'draw' ? <Pencil size={13}/> : tool === 'connect' ? <Cable size={14}/> : <Hand size={13}/>} {instruction}{pendingFrom && <button onClick={() => setPendingFrom(null)} aria-label="Cancel connection"><X size={12}/></button>}</div>
      <div className="canvas-zoom"><button onClick={() => setZoom((z) => Math.max(.8, Math.round((z-.1)*10)/10))} aria-label="Zoom out"><Minus size={13}/></button><span>{Math.round(zoom*100)}%</span><button onClick={() => setZoom((z) => Math.min(1.5, Math.round((z+.1)*10)/10))} aria-label="Zoom in"><Plus size={13}/></button></div>
    </div>
    <div className="canvas-footer"><div><span className="foot-status"/> <strong>READY TO CREATE</strong><span className="footer-separator"/> Every part shapes the sound</div><button onClick={onReset}><Eraser size={13}/> Reset canvas</button></div>
  </section>;
}

export function PartsStrip({ instrument, selectedId, onSelect }: { instrument: Instrument; selectedId: string | null; onSelect: (id: string) => void }) {
  return <section className="parts-section">
    <div className="section-heading"><div><span className="eyebrow">THE BUILDING BLOCKS</span><h3>Parts of this instrument <span>{String(instrument.parts.length).padStart(2, '0')}</span></h3></div><span className="section-helper">Select a part to shape its sound <ArrowUpRight size={14}/></span></div>
    {instrument.parts.length ? <div className="parts-strip">{instrument.parts.map((part, index) => {
      const Icon = partIcon(part.kind);
      return <button key={part.id} className={`part-chip ${selectedId === part.id ? 'selected' : ''}`} onClick={() => onSelect(part.id)}>
        <span className={`part-chip-icon ${part.kind}`}><Icon size={16}/></span><span className="part-chip-copy"><strong>{part.name}</strong><small>{KIND_LABELS[part.kind]}</small></span><span className="part-chip-num">{String(index+1).padStart(2, '0')}</span>
      </button>;
    })}</div> : <div className="empty-parts">No parts yet. Draw a shape or use <strong>+ Add part</strong> to get started.</div>}
  </section>;
}
