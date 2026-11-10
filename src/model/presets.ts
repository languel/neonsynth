import { DEFAULT_PARAMS, copy, type Artwork, type Category, type Excitation, type Instrument, type Part, type PartKind, type PartParams, type Track, type Band } from './types';

const part = (id: string, name: string, kind: PartKind, x: number, y: number,
  excitation: Excitation = 'air', params: Partial<PartParams> = {}): Part =>
  ({ id, name, kind, x, y, excitation, points: [], params: { ...DEFAULT_PARAMS, ...params } });
const instrument = (id: string, name: string, description: string, category: Category, artwork: Artwork,
  parts: Part[], pairs: [string, string][]): Instrument => ({
  version: 1, id, name, description, category, artwork, parts,
  connections: pairs.map(([from, to]) => ({ from, to })),
});

/** Each example is a working, editable signal graph, not a prerecorded sample. */
export const PRESETS: Instrument[] = [
  instrument('whale', 'Humpback Whale', 'A deep-sea voice shaped by breath, folds, and a cavernous resonance.', 'Marine', 'whale', [
    part('air', 'Air sac', 'source', 330, 276, 'air', { pressure: 0.88, breathiness: 0.12 }),
    part('folds', 'Vocal folds', 'source', 500, 310, 'glottis', { pressure: 0.84, tension: 0.33, breathiness: 0.15 }),
    part('chamber', 'Resonance chamber', 'resonator', 675, 257, 'air', { size: 0.82, damping: 0.24, resonance: 0.82 }),
    part('mouth', 'Mouth', 'outlet', 843, 225, 'air', { openness: 0.78 }),
  ], [['air', 'folds'], ['folds', 'chamber'], ['chamber', 'mouth']]),
  instrument('songbird', 'Songbird', 'Two tiny syrinx voices meet in a bright, singing airway.', 'Birds', 'songbird', [
    part('air', 'Air sacs', 'source', 400, 325, 'air', { pressure: 0.8, breathiness: 0.1 }),
    part('left', 'Left syrinx', 'source', 535, 300, 'syrinx', { tension: 0.44, pressure: 0.8, pitch: 0 }),
    part('right', 'Right syrinx', 'source', 538, 383, 'syrinx', { tension: 0.62, pressure: 0.58, pitch: 7 }),
    part('throat', 'Trachea', 'tube', 640, 256, 'air', { size: 0.2, damping: 0.18, resonance: 0.62 }),
    part('beak', 'Beak', 'outlet', 710, 212, 'air', { openness: 0.9 }),
  ], [['air', 'left'], ['air', 'right'], ['left', 'throat'], ['right', 'throat'], ['throat', 'beak']]),
  instrument('parasaur', 'Parasaurolophus', 'A prehistoric call traveling through a long, hollow crest.', 'Prehistoric', 'dinosaur', [
    part('air', 'Lungs', 'source', 475, 303, 'air', { pressure: 0.96, breathiness: 0.14 }),
    part('folds', 'Larynx', 'source', 650, 270, 'glottis', { tension: 0.29, pressure: 0.95, pitch: -12 }),
    part('crest', 'Hollow crest', 'resonator', 762, 160, 'air', { size: 0.7, resonance: 0.92, damping: 0.2 }),
    part('nose', 'Nasal opening', 'outlet', 840, 242, 'air', { openness: 0.65 }),
  ], [['air', 'folds'], ['folds', 'crest'], ['crest', 'nose']]),
  instrument('dragon', 'Ember Dragon', 'A mythical furnace of air, growl, and shimmering overtones.', 'Fantasy', 'dragon', [
    part('bellows', 'Fire bellows', 'source', 470, 286, 'air', { pressure: 0.98, breathiness: 0.3 }),
    part('reed', 'Dragon reed', 'source', 650, 295, 'reed', { pressure: 0.85, tension: 0.75, pitch: -12 }),
    part('chest', 'Ember chamber', 'resonator', 738, 245, 'air', { size: 0.7, resonance: 0.9, damping: 0.27 }),
    part('mouth', 'Dragon mouth', 'outlet', 835, 220, 'air', { openness: 0.9 }),
  ], [['bellows', 'reed'], ['reed', 'chest'], ['chest', 'mouth']]),
  instrument('flute', 'Concert Flute', 'An air jet finds its pitch inside a bright, narrow tube.', 'Instruments', 'flute', [
    part('breath', 'Breath', 'source', 200, 280, 'air', { pressure: 0.7, breathiness: 0.22 }),
    part('jet', 'Air jet', 'source', 380, 276, 'jet', { pressure: 0.72, breathiness: 0.3, tension: 0.34 }),
    part('tube', 'Flute tube', 'tube', 586, 270, 'air', { size: 0.28, damping: 0.2, resonance: 0.82 }),
    part('end', 'Open end', 'outlet', 790, 254, 'air', { openness: 0.85 }),
  ], [['breath', 'jet'], ['jet', 'tube'], ['tube', 'end']]),
  instrument('lyre', 'Celestial Lyre', 'An imaginary string instrument with a long, glassy body.', 'Fantasy', 'instrument', [
    part('string', 'Moon string', 'source', 360, 265, 'string', { pressure: 0.86, tension: 0.6, damping: 0.18 }),
    part('body', 'Star chamber', 'resonator', 574, 300, 'air', { size: 0.48, damping: 0.12, resonance: 0.84 }),
    part('out', 'Radiating body', 'outlet', 763, 235, 'air', { openness: 0.85 }),
  ], [['string', 'body'], ['body', 'out']]),
  instrument('glass', 'Glass Armonica', 'A struck glass voice with delicate, ringing resonances.', 'Instruments', 'glass', [
    part('touch', 'Glass excitation', 'source', 330, 267, 'strike', { pressure: 0.65, tension: 0.67, damping: 0.18 }),
    part('bowl', 'Glass bowl', 'resonator', 530, 280, 'air', { size: 0.35, damping: 0.08, resonance: 0.96 }),
    part('out', 'Radiating surface', 'outlet', 750, 254, 'air', { openness: 0.82 }),
  ], [['touch', 'bowl'], ['bowl', 'out']]),
  instrument('kettle', 'Singing Kettle', 'An everyday object becomes a breathy, whistling instrument.', 'Objects', 'kettle', [
    part('steam', 'Steam pressure', 'source', 315, 280, 'air', { pressure: 0.88, breathiness: 0.3 }),
    part('whistle', 'Whistle', 'source', 500, 259, 'jet', { pressure: 0.75, tension: 0.67, pitch: 12 }),
    part('body', 'Metal body', 'resonator', 645, 289, 'air', { size: 0.4, damping: 0.3, resonance: 0.7 }),
    part('spout', 'Spout', 'outlet', 790, 235, 'air', { openness: 0.72 }),
  ], [['steam', 'whistle'], ['whistle', 'body'], ['body', 'spout']]),
];

export const PRESET_IDS = new Set(PRESETS.map((p) => p.id));
export const findPreset = (id: string) => PRESETS.find((preset) => preset.id === id);

function track(id: string, name: string, instrumentId: string, note: number, volume: number, hits: [number, number][]): Track {
  const instrument = PRESETS.find((item) => item.id === instrumentId)!;
  const steps: (number | null)[] = Array(16).fill(null);
  for (const [index, pitch] of hits) steps[index] = pitch;
  return { id, name, instrumentId, instrumentSnapshot: copy(instrument), note, volume, muted: false, steps };
}
export const DEMO_BAND: Band = {
  version: 1, id: 'draft-band', name: 'The Ocean Choir', bpm: 96,
  tracks: [
    track('voice-whale', 'Deep calls', 'whale', 40, 0.8, [[0, 0], [7, 7], [10, 2]]),
    track('voice-bird', 'Little melody', 'songbird', 72, 0.52, [[2, 0], [4, 4], [6, 7], [10, 4], [12, 2], [14, 7]]),
    track('voice-lyre', 'Shimmer', 'lyre', 60, 0.65, [[0, 0], [4, 7], [8, 4], [12, 7]]),
  ],
};
