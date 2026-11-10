/** A drawing is also the physical graph sent to the Rust/Wasm airway engine. */
export type Point = { x: number; y: number };
export type Wall = "rigid" | "soft" | "cartilage" | "nasal";
export type SourceKind = "folds" | "syrinx" | "reed" | "whistle" | "air";
type Base = { id: string; name: string };
export type TubePart = Base & { kind: "tube"; points: Point[]; length: number; areaStart: number; areaEnd: number; wall: Wall };
export type CavityPart = Base & { kind: "cavity"; x: number; y: number; volume: number; wall: Wall };
export type SourcePart = Base & { kind: "source"; x: number; y: number; source: SourceKind; pitch: number; pressure: number; strength: number; tension: number };
export type OutletPart = Base & { kind: "outlet"; x: number; y: number };
export type Part = TubePart | CavityPart | SourcePart | OutletPart;
export type End = { id: string; end: 0 | 1 };
export type Link = { a: End; b: End };
export type Design = {
  version: 1; id: string; name: string; description: string;
  basePitch: number; attack: number; release: number; vibrato: number; vibratoRate: number; pulseDepth: number; pulseRate: number; outputGain: number;
  parts: Part[]; links: Link[];
};
export type Track = { id: string; name: string; design: Design; level: number; mute: boolean; steps: (number | null)[] };
export type Band = { version: 1; id: string; name: string; bpm: number; tracks: Track[] };

export const uid = () => crypto.randomUUID();
export const copy = <T,>(v: T): T => structuredClone(v);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
export const newDesign = (): Design => ({ version: 1, id: uid(), name: "Untitled instrument", description: "A new physical instrument.", basePitch: 220, attack: 0.02, release: 0.08, vibrato: 0, vibratoRate: 5, pulseDepth: 0, pulseRate: 4, outputGain: 1, parts: [], links: [] });
export const newBand = (): Band => ({ version: 1, id: uid(), name: "Untitled band", bpm: 108, tracks: [] });
export const newPart = (kind: "source" | "cavity" | "outlet", p: Point): Part => {
  const base = { id: uid(), x: p.x, y: p.y };
  if (kind === "source") return { ...base, kind, name: "Air & folds", source: "folds", pitch: 220, pressure: 12, strength: 0.5, tension: 0.5 };
  if (kind === "cavity") return { ...base, kind, name: "Chamber", volume: 20, wall: "soft" };
  return { ...base, kind, name: "Outlet" };
};
export const pathLength = (points: Point[]) => points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);
export const makeTube = (points: Point[]): TubePart => ({ id: uid(), kind: "tube", name: "Duct", points, length: Math.round(clamp(pathLength(points) / 10, 0.6, 300) * 10) / 10, areaStart: 2, areaEnd: 2, wall: "soft" });
export const anchor = (part: Part, end: number): Point => part.kind === "tube" ? part.points[end === 0 ? 0 : part.points.length - 1] : part;
export const endKey = (a: End) => `${a.id}:${a.end}`;

/** Explain what must be connected before an instrument is compiled. */
export function graphError(d: Design): string | null {
  if (!d.parts.some(p => p.kind === "source")) return "Add an energy source.";
  if (!d.parts.some(p => p.kind === "outlet")) return "Add an outlet for sound.";
  if (!d.parts.some(p => p.kind === "tube" || p.kind === "cavity")) return "Draw a duct or add a chamber.";
  const parts = new Map(d.parts.map(p => [p.id, p]));
  const edges = new Map<string, string[]>();
  const specials = new Set<string>();
  const pairs = new Set<string>();
  for (const { a, b } of d.links) {
    const x = parts.get(a.id), y = parts.get(b.id);
    if (!x || !y || x.id === y.id || ![0, 1].includes(a.end) || ![0, 1].includes(b.end)) return "A connection is invalid.";
    if ((x.kind !== "tube" && a.end !== 0) || (y.kind !== "tube" && b.end !== 0)) return "A connection uses an invalid anchor.";
    const specialX = x.kind === "source" || x.kind === "outlet", specialY = y.kind === "source" || y.kind === "outlet";
    if (specialX && specialY) return "Connect sources and outlets to a duct or chamber.";
    const pair = [endKey(a), endKey(b)].sort().join("/");
    if (pairs.has(pair)) return "Remove the duplicate connection.";
    pairs.add(pair);
    for (const p of [x, y]) if (p.kind === "source" || p.kind === "outlet") {
      if (specials.has(p.id)) return "Each source and outlet needs exactly one connection.";
      specials.add(p.id);
    }
    edges.set(x.id, [...(edges.get(x.id) ?? []), y.id]);
    edges.set(y.id, [...(edges.get(y.id) ?? []), x.id]);
  }
  if (d.parts.some(p => (p.kind === "source" || p.kind === "outlet") && !specials.has(p.id))) return "Connect every source and outlet to a duct or chamber.";
  const seen = new Set<string>();
  const todo = [d.parts.find(p => p.kind === "source")!.id];
  while (todo.length) { const id = todo.pop()!; if (!seen.has(id)) { seen.add(id); todo.push(...(edges.get(id) ?? [])); } }
  if (seen.size !== d.parts.length) return "Connect every part into the same instrument.";
  return null;
}

/** Strictly validate imported data before it can reach the real-time engine or local storage. */
export function isDesign(v: unknown): v is Design {
  if (!v || typeof v !== "object") return false;
  const d = v as Design;
  const num = (n: number, lo: number, hi: number) => typeof n === "number" && Number.isFinite(n) && n >= lo && n <= hi;
  const str = (s: string, n = 100) => typeof s === "string" && s.length <= n;
  const point = (p: Point) => p && num(p.x, 0, 1000) && num(p.y, 0, 650);
  if (d.version !== 1 || !str(d.id, 80) || !d.id || !str(d.name) || !str(d.description, 400) || !num(d.basePitch, 20, 8000) || !num(d.attack, .002, 2) || !num(d.release, .005, 3) || !num(d.vibrato, 0, 200) || !num(d.vibratoRate, .1, 15) || !num(d.pulseDepth, 0, 1) || !num(d.pulseRate, .1, 30) || !num(d.outputGain, .02, 10) || !Array.isArray(d.parts) || d.parts.length > 32 || !Array.isArray(d.links) || d.links.length > 64) return false;
  const ids = new Set<string>();
  for (const p of d.parts) {
    if (!p || !str(p.id, 80) || !p.id || ids.has(p.id) || !str(p.name)) return false;
    ids.add(p.id);
    if (p.kind === "tube") {
      if (!Array.isArray(p.points) || p.points.length < 2 || p.points.length > 100 || !p.points.every(point) || !num(p.length, .6, 300) || !num(p.areaStart, .02, 50) || !num(p.areaEnd, .02, 50) || !["rigid", "soft", "cartilage", "nasal"].includes(p.wall)) return false;
    } else if (p.kind === "cavity") {
      if (!point(p) || !num(p.volume, .1, 3000) || !["rigid", "soft", "cartilage", "nasal"].includes(p.wall)) return false;
    } else if (p.kind === "source") {
      if (!point(p) || !["folds", "syrinx", "reed", "whistle", "air"].includes(p.source) || !num(p.pitch, 20, 8000) || !num(p.pressure, .2, 80) || !num(p.strength, .01, 1) || !num(p.tension, 0, 1)) return false;
    } else if (p.kind === "outlet") { if (!point(p)) return false; }
    else return false;
  }
  return d.links.every(l => l && l.a && l.b && typeof l.a.id === "string" && typeof l.b.id === "string" && [0, 1].includes(l.a.end) && [0, 1].includes(l.b.end));
}
export function isBand(v: unknown): v is Band {
  if (!v || typeof v !== "object") return false;
  const b = v as Band;
  return b.version === 1 && typeof b.id === "string" && b.id.length <= 80 && typeof b.name === "string" && b.name.length <= 100 && Number.isFinite(b.bpm) && b.bpm >= 40 && b.bpm <= 220 && Array.isArray(b.tracks) && b.tracks.length <= 4 && b.tracks.every(t => t && typeof t.id === "string" && t.id.length <= 80 && typeof t.name === "string" && t.name.length <= 100 && isDesign(t.design) && !graphError(t.design) && Number.isFinite(t.level) && t.level >= 0 && t.level <= 1 && typeof t.mute === "boolean" && Array.isArray(t.steps) && t.steps.length === 16 && t.steps.every(n => n === null || Number.isInteger(n) && n >= 24 && n <= 108));
}
