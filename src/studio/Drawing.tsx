import { useRef, useState } from "react";
import { anchor, clamp, makeTube, newPart, type End, type Part, type Point, type TubePart } from "./model.ts";
import { useStudio } from "./store.ts";

type Tool = "select" | "duct" | "cavity" | "source" | "outlet" | "connect";
const INFO: Record<Tool, string> = {
  select: "Select a part to edit it. Drag it to move its drawing.",
  duct: "Draw a centerline. Its length becomes a physical tube; tune its areas in the part panel.",
  cavity: "Click to place a resonating chamber.",
  source: "Click to place an air or energy source; choose its mechanism in the part panel.",
  outlet: "Click to place an opening where sound radiates.",
  connect: "Click two glowing anchors to connect them. Each source and outlet needs one connection.",
};
const pointsAttr = (points: Point[]) => points.map(p => `${p.x},${p.y}`).join(" ");
const names: Record<Part["kind"], string> = { tube: "Duct", cavity: "Chamber", source: "Source", outlet: "Outlet" };
/** Code-drawn duct walls follow the hand-drawn centerline and taper with its acoustic areas. */
function ductWalls(part: TubePart): [Point[], Point[]] {
  let distance = 0;
  const lengths = part.points.map((p,i) => { if (i) distance += Math.hypot(p.x-part.points[i-1].x,p.y-part.points[i-1].y); return distance; });
  const left: Point[] = [], right: Point[] = [];
  part.points.forEach((p,i) => {
    const before=part.points[Math.max(0,i-1)], after=part.points[Math.min(part.points.length-1,i+1)];
    const dx=after.x-before.x, dy=after.y-before.y, mag=Math.hypot(dx,dy) || 1;
    const t=distance ? lengths[i]/distance : 0;
    const area=part.areaStart+(part.areaEnd-part.areaStart)*t;
    const width=5+Math.sqrt(area)*4;
    const nx=-dy/mag*width, ny=dx/mag*width;
    left.push({x:p.x+nx,y:p.y+ny}); right.push({x:p.x-nx,y:p.y-ny});
  });
  return [left,right];
}

export function Drawing() {
  const design = useStudio(s => s.design), selected = useStudio(s => s.selected);
  const select = useStudio(s => s.select), addPart = useStudio(s => s.addPart), patchPart = useStudio(s => s.patchPart), link = useStudio(s => s.link);
  const [tool, setTool] = useState<Tool>("select");
  const [wireStart, setWireStart] = useState<End | null>(null);
  const [draft, setDraft] = useState<Point[]>([]);
  const svg = useRef<SVGSVGElement>(null);
  const drawing = useRef<Point[] | null>(null);
  const dragging = useRef<{ id: string; at: Point; part: Part } | null>(null);
  const pt = (e: React.PointerEvent): Point => {
    const el = svg.current!;
    const p = el.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const transformed = p.matrixTransform(el.getScreenCTM()!.inverse());
    return { x: clamp(transformed.x, 0, 1000), y: clamp(transformed.y, 0, 650) };
  };
  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const p = pt(e);
    if (tool === "duct") { drawing.current = [p]; setDraft([p]); e.currentTarget.setPointerCapture(e.pointerId); }
    else if (tool === "source" || tool === "cavity" || tool === "outlet") { addPart(newPart(tool, p)); setTool("select"); }
    else if (tool === "select") select(null);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pt(e);
    if (drawing.current) {
      const prev = drawing.current.at(-1)!;
      if (Math.hypot(prev.x-p.x, prev.y-p.y) > 6 && drawing.current.length < 99) { drawing.current.push(p); setDraft([...drawing.current]); }
    } else if (dragging.current) {
      const { id, at, part } = dragging.current;
      const dx = p.x - at.x, dy = p.y - at.y;
      if (part.kind === "tube") patchPart(id, { points: part.points.map(q => ({ x: clamp(q.x+dx,0,1000), y: clamp(q.y+dy,0,650) })) } as Partial<Part>);
      else patchPart(id, { x: clamp(part.x+dx,0,1000), y: clamp(part.y+dy,0,650) } as Partial<Part>);
    }
  };
  const up = (e: React.PointerEvent<SVGSVGElement>) => {
    if (drawing.current) {
      const points = drawing.current;
      const end = pt(e);
      if (Math.hypot(points[0].x-end.x, points[0].y-end.y) > 12) { points.push(end); addPart(makeTube(points)); setTool("select"); }
      drawing.current = null; setDraft([]);
    }
    dragging.current = null;
  };
  const selectPart = (e: React.PointerEvent, part: Part) => {
    if (tool !== "select") return;
    e.stopPropagation(); select(part.id); dragging.current = { id: part.id, at: pt(e), part: structuredClone(part) };
    svg.current?.setPointerCapture(e.pointerId);
  };
  const chooseEnd = (e: React.PointerEvent, end: End) => {
    if (tool !== "connect") return;
    e.stopPropagation();
    if (!wireStart) setWireStart(end);
    else { link(wireStart, end); setWireStart(null); }
  };
  const byId = new Map(design.parts.map(p => [p.id,p]));
  return <div className="drawing-wrap">
    <div className="drawing-tools" role="toolbar" aria-label="Drawing tools">
      {([ ["select","Select"], ["duct","Draw duct"], ["cavity","Chamber"], ["source","Source"], ["outlet","Outlet"], ["connect","Connect"] ] as [Tool,string][]).map(([t,label]) => <button key={t} type="button" className={`chip${tool === t ? " on" : ""}`} aria-pressed={tool === t} onClick={() => { setTool(t); setWireStart(null); }}>{label}</button>)}
    </div>
    <svg ref={svg} className={`drawing drawing-${tool}`} viewBox="0 0 1000 650" aria-label="Instrument drawing canvas" role="application" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <defs>
        <pattern id="studio-grid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#17364b" strokeWidth="1" /></pattern>
        <filter id="studio-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="1000" height="650" fill="#000"/><rect width="1000" height="650" fill="url(#studio-grid)" opacity=".7"/>
      <g className="drawing-guides" aria-hidden="true"><text x="27" y="36">INSTRUMENT / AIRWAY NETWORK</text><text x="27" y="625">{design.parts.length} PARTS · {design.links.length} CONNECTIONS</text><text x="973" y="625" textAnchor="end">DRAWN / NOT TO SCALE</text></g>
      {design.links.map((l,i) => { const a=byId.get(l.a.id), b=byId.get(l.b.id); if (!a || !b) return null; const p=anchor(a,l.a.end), q=anchor(b,l.b.end); return <line key={i} x1={p.x} y1={p.y} x2={q.x} y2={q.y} className="drawing-link"/>; })}
      {design.parts.map(part => {
        const active = selected === part.id;
        const color = active ? "#eef6f8" : part.kind === "source" ? "#ffb340" : part.kind === "outlet" ? "#5be381" : "#4fb6f2";
        const labelPos = part.kind === "tube" ? part.points[Math.floor(part.points.length/2)] : part;
        const walls = part.kind === "tube" ? ductWalls(part) : null;
        const cavityRadius = part.kind === "cavity" ? clamp(20+Math.cbrt(part.volume)*3, 24, 64) : 0;
        return <g key={part.id} className="drawing-part" aria-label={`${names[part.kind]}: ${part.name}`} onPointerDown={e => selectPart(e,part)}>
          {part.kind === "tube" ? <>
            <polygon points={pointsAttr([...walls![0], ...walls![1].slice().reverse()])} fill="#123447" opacity=".45"/>
            <polyline points={pointsAttr(part.points)} fill="none" stroke={color} opacity=".45" strokeWidth="1.5" strokeDasharray="4 7"/>
            {walls!.map((side,i) => <polyline key={i} points={pointsAttr(side)} fill="none" stroke={color} strokeWidth={active ? 3 : 2.2} strokeLinecap="round" strokeLinejoin="round" filter="url(#studio-glow)"/>)}
            <polyline points={pointsAttr(part.points)} fill="none" stroke="transparent" strokeWidth="55"/>
          </> : part.kind === "cavity" ? <>
            <circle cx={part.x} cy={part.y} r={cavityRadius} fill="#000" stroke={color} strokeWidth="3" filter="url(#studio-glow)"/>
            <ellipse cx={part.x} cy={part.y} rx={cavityRadius*.7} ry={cavityRadius*.5} fill="none" stroke={color} strokeWidth="1.5" opacity=".7"/>
            <circle cx={part.x} cy={part.y} r={cavityRadius+10} fill="transparent"/>
          </> : part.kind === "source" ? <>
            <circle cx={part.x} cy={part.y} r="36" fill="#000" stroke={color} strokeWidth="3" filter="url(#studio-glow)"/>
            <path d={`M${part.x-20} ${part.y} q 8 -23 16 0 t 16 0 t 16 0`} fill="none" stroke={color} strokeWidth="3"/>
            <circle cx={part.x} cy={part.y} r="43" fill="transparent"/>
          </> : <>
            <circle cx={part.x} cy={part.y} r="22" fill="#000" stroke={color} strokeWidth="3" filter="url(#studio-glow)"/>
            <path d={`M ${part.x+29} ${part.y-19} q 18 19 0 38 M ${part.x+39} ${part.y-30} q 29 30 0 60`} fill="none" stroke={color} strokeWidth="2"/>
            <circle cx={part.x} cy={part.y} r="35" fill="transparent"/>
          </>}
          <text x={labelPos.x} y={labelPos.y - (part.kind === "cavity" ? cavityRadius+13 : part.kind === "source" ? 49 : 22)} textAnchor="middle" className="drawing-name" fill={color}>{part.name.toUpperCase().slice(0,24)}</text>
          {(part.kind === "tube" ? [0,1] : [0]).map(end => { const p = anchor(part,end); const armed = wireStart?.id === part.id && wireStart.end === end; return <g key={end} onPointerDown={e => chooseEnd(e,{id:part.id,end:end as 0|1})}>
            <circle cx={p.x} cy={p.y} r={tool === "connect" ? 18 : 8} fill="#000" stroke={armed ? "#fff" : color} strokeWidth="2.5"/>
            {tool === "connect" && <circle cx={p.x} cy={p.y} r="29" fill="transparent"/>}
          </g>; })}
        </g>;
      })}
      {draft.length > 1 && <polyline points={pointsAttr(draft)} fill="none" stroke="#eef6f8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
    </svg>
    <p className="drawing-help">{wireStart ? "Now choose the anchor to connect to." : INFO[tool]}</p>
  </div>;
}
