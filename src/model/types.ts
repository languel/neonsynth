export type PartKind = 'source' | 'resonator' | 'tube' | 'modulator' | 'outlet' | 'body';
export type Excitation = 'air' | 'glottis' | 'syrinx' | 'reed' | 'jet' | 'string' | 'strike';
export type Category = 'Marine' | 'Birds' | 'Prehistoric' | 'Fantasy' | 'Instruments' | 'Objects' | 'Custom';
export type Artwork = 'whale' | 'songbird' | 'dinosaur' | 'dragon' | 'instrument' | 'flute' | 'glass' | 'kettle' | 'blank';

export interface Point { x: number; y: number }
export interface PartParams {
  pressure: number;
  tension: number;
  breathiness: number;
  size: number;
  damping: number;
  resonance: number;
  rate: number;
  depth: number;
  openness: number;
  pitch: number;
}
export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  excitation: Excitation;
  x: number;
  y: number;
  /** Freehand outline in coordinates relative to the part's centre. */
  points: Point[];
  params: PartParams;
}
export interface Connection { from: string; to: string }
export interface Instrument {
  version: 1;
  id: string;
  name: string;
  description: string;
  category: Category;
  artwork: Artwork;
  parts: Part[];
  connections: Connection[];
}
export interface Track {
  id: string;
  name: string;
  instrumentId: string;
  /** A fallback keeps an arrangement playable if a library instrument is later deleted. */
  instrumentSnapshot: Instrument;
  note: number;
  volume: number;
  muted: boolean;
  steps: (number | null)[];
}
export interface Band {
  version: 1;
  id: string;
  name: string;
  bpm: number;
  tracks: Track[];
}

export const KIND_LABELS: Record<PartKind, string> = {
  source: 'Energy source',
  resonator: 'Resonator',
  tube: 'Airway / tube',
  modulator: 'Modulator',
  outlet: 'Sound outlet',
  body: 'Body / outline',
};
export const EXCITATION_LABELS: Record<Excitation, string> = {
  air: 'Air / pressure',
  glottis: 'Vocal folds',
  syrinx: 'Bird syrinx',
  reed: 'Reed / lip buzz',
  jet: 'Air jet',
  string: 'Plucked string',
  strike: 'Strike / impact',
};
export const DEFAULT_PARAMS: PartParams = {
  pressure: 0.72, tension: 0.5, breathiness: 0.18, size: 0.52,
  damping: 0.35, resonance: 0.65, rate: 0.35, depth: 0.45, openness: 0.8, pitch: 0,
};
export const makeId = (prefix = 'id') => `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
export const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function newPart(kind: PartKind, x = 500, y = 280): Part {
  return {
    id: makeId('part'), name: KIND_LABELS[kind], kind,
    excitation: kind === 'source' ? 'glottis' : 'air', x, y, points: [],
    params: { ...DEFAULT_PARAMS },
  };
}

export function blankInstrument(): Instrument {
  return { version: 1, id: makeId('instrument'), name: 'Untitled instrument',
    description: 'A new voice, waiting to be imagined.', category: 'Custom', artwork: 'blank', parts: [], connections: [] };
}

/** A drawn outline seeds acoustic size; it is an expressive mapping, not a measurement in cm. */
export function sizeFromOutline(points: Point[]): number {
  if (points.length < 2) return DEFAULT_PARAMS.size;
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys);
  return Math.max(.08, Math.min(.95, Math.sqrt(width * height) / 420));
}
