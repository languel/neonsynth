import { DEFAULT_PARAMS, type Artwork, type Band, type Category, type Connection, type Excitation, type Instrument, type Part, type PartKind } from './types';

const PREFIX = 'neonsynth.v1.';
export const readStore = <T,>(key: string, fallback: T): T => {
  try { const value = localStorage.getItem(PREFIX + key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
};
export const writeStore = (key: string, value: unknown): boolean => {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
  catch { return false; }
};

const kinds: PartKind[] = ['source', 'resonator', 'tube', 'modulator', 'outlet', 'body'];
const excitations: Excitation[] = ['air', 'glottis', 'syrinx', 'reed', 'jet', 'string', 'strike'];
const artworks: Artwork[] = ['whale', 'songbird', 'dinosaur', 'dragon', 'instrument', 'flute', 'glass', 'kettle', 'blank'];
const categories: Category[] = ['Marine', 'Birds', 'Prehistoric', 'Fantasy', 'Instruments', 'Objects', 'Custom'];
const clamp = (value: unknown, low: number, high: number, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
const text = (value: unknown, fallback: string, max = 80) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

/** Treat imports and old localStorage as untrusted, bounded data. */
export function parseInstrument(value: unknown): Instrument | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  if (!Array.isArray(obj.parts) || !Array.isArray(obj.connections) || obj.parts.length > 64 || obj.connections.length > 256) return null;
  const ids = new Set<string>();
  const parts: Part[] = [];
  for (const raw of obj.parts) {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id || p.id.length > 100 || ids.has(p.id) || !kinds.includes(p.kind as PartKind)) return null;
    ids.add(p.id);
    const params = p.params && typeof p.params === 'object' ? p.params as Record<string, unknown> : {};
    const points = Array.isArray(p.points) ? p.points.slice(0, 1000).flatMap((point) => {
      if (!point || typeof point !== 'object') return [];
      const q = point as Record<string, unknown>;
      return [{ x: clamp(q.x, -1000, 1000, 0), y: clamp(q.y, -560, 560, 0) }];
    }) : [];
    parts.push({ id: p.id, name: text(p.name, 'Part'), kind: p.kind as PartKind,
      excitation: excitations.includes(p.excitation as Excitation) ? p.excitation as Excitation : 'air',
      x: clamp(p.x, 0, 1000, 500), y: clamp(p.y, 0, 560, 280), points,
      params: {
        pressure: clamp(params.pressure, 0, 1, DEFAULT_PARAMS.pressure), tension: clamp(params.tension, 0, 1, DEFAULT_PARAMS.tension),
        breathiness: clamp(params.breathiness, 0, 1, DEFAULT_PARAMS.breathiness), size: clamp(params.size, 0, 1, DEFAULT_PARAMS.size),
        damping: clamp(params.damping, 0, 1, DEFAULT_PARAMS.damping), resonance: clamp(params.resonance, 0, 1, DEFAULT_PARAMS.resonance),
        rate: clamp(params.rate, 0, 1, DEFAULT_PARAMS.rate), depth: clamp(params.depth, 0, 1, DEFAULT_PARAMS.depth),
        openness: clamp(params.openness, 0, 1, DEFAULT_PARAMS.openness), pitch: Math.round(clamp(params.pitch, -24, 24, 0)),
      },
    });
  }
  const connections: Connection[] = [];
  for (const raw of obj.connections) {
    if (!raw || typeof raw !== 'object') return null;
    const edge = raw as Record<string, unknown>;
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string' || !ids.has(edge.from) || !ids.has(edge.to) || edge.from === edge.to) return null;
    if (!connections.some((e) => e.from === edge.from && e.to === edge.to)) connections.push({ from: edge.from, to: edge.to });
  }
  // Reject feedback instead of letting imported graphs lock up the audio thread.
  const visiting = new Set<string>(), visited = new Set<string>();
  const cyclic = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const found = connections.some((edge) => edge.from === id && cyclic(edge.to));
    visiting.delete(id); visited.add(id); return found;
  };
  if (parts.some((p) => cyclic(p.id))) return null;
  return { version: 1, id: text(obj.id, 'imported', 100), name: text(obj.name, 'Imported instrument'),
    description: text(obj.description, 'An instrument made in Neonsynth.', 240),
    category: categories.includes(obj.category as Category) ? obj.category as Category : 'Custom',
    artwork: artworks.includes(obj.artwork as Artwork) ? obj.artwork as Artwork : 'blank', parts, connections };
}

export function storedInstruments(): Instrument[] {
  const data = readStore<unknown>('instruments', []);
  return Array.isArray(data) ? data.flatMap((item) => { const p = parseInstrument(item); return p ? [p] : []; }) : [];
}

/** Validate saved bands and their embedded instrument snapshots before using them. */
export function parseBand(value: unknown): Band | null {
  if (!value || typeof value !== 'object') return null;
  const b = value as Record<string, unknown>;
  if (!Array.isArray(b.tracks) || b.tracks.length > 16) return null;
  const tracks: Band['tracks'] = [];
  const ids = new Set<string>();
  for (const raw of b.tracks) {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Record<string, unknown>;
    const snapshot = parseInstrument(t.instrumentSnapshot);
    if (!snapshot || typeof t.id !== 'string' || !t.id || ids.has(t.id) || !Array.isArray(t.steps)) return null;
    ids.add(t.id);
    tracks.push({ id: t.id, name: text(t.name, 'Voice'), instrumentId: text(t.instrumentId, snapshot.id, 100), instrumentSnapshot: snapshot,
      note: Math.round(clamp(t.note, 24, 96, 60)), volume: clamp(t.volume, 0, 1, 0.7), muted: t.muted === true,
      steps: Array.from({ length: 16 }, (_, i) => typeof (t.steps as unknown[])[i] === 'number' ? Math.round(clamp((t.steps as unknown[])[i], -12, 24, 0)) : null),
    });
  }
  return { version: 1, id: text(b.id, 'band', 100), name: text(b.name, 'Untitled band'), bpm: Math.round(clamp(b.bpm, 50, 180, 96)), tracks };
}
export function storedBands(): Band[] {
  const data = readStore<unknown>('bands', []);
  return Array.isArray(data) ? data.flatMap((item) => { const band = parseBand(item); return band ? [band] : []; }) : [];
}
