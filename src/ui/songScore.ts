/** A small, monophonic singing score. Positions are sixteenth-note steps, not wall-clock time. */
import { create } from "zustand";
import { planSong } from "../wasm/engine.ts";
import type { BodyMix, DemoSong, Gesture, Plan, SungNote, Syllable } from "../wasm/types.ts";

export type Lane = "breath" | "vibrato" | "jaw";
export type ScoreNote = { id: string; start: number; length: number; midi: number };
export type Score = { version: 1; steps: number; bpm: number; notes: ScoreNote[]; automation: Record<Lane, (number | null)[]> };
export const LANES: { id: Lane; label: string; range: string; color: string }[] = [
  { id: "breath", label: "Breath", range: "0–140 %", color: "#ffb340" },
  { id: "vibrato", label: "Vibrato", range: "0–100 cents", color: "#ff73cf" },
  { id: "jaw", label: "Jaw", range: "0–2.4 cm", color: "#ff5d40" },
];
const STORAGE = "neonsynth-sing-score-v1", WORDS = "neonsynth-sing-lyrics-v1";
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const emptyLanes = (steps: number): Score["automation"] => ({ breath: Array(steps).fill(null), vibrato: Array(steps).fill(null), jaw: Array(steps).fill(null) });
export const noteId = () => globalThis.crypto.randomUUID();
export const blankScore = (steps = 32): Score => ({ version: 1, steps, bpm: 100, notes: [], automation: emptyLanes(steps) });
const initialScore = (): Score => ({ ...blankScore(), notes: [
  { id: "intro-1", start: 0, length: 3, midi: 48 }, { id: "intro-2", start: 4, length: 3, midi: 52 },
  { id: "intro-3", start: 8, length: 3, midi: 55 }, { id: "intro-4", start: 12, length: 4, midi: 52 },
] });

/** New notes take precedence; intersecting notes are trimmed or removed, never layered. */
export function placeNote(notes: readonly ScoreNote[], note: ScoreNote, steps: number): ScoreNote[] {
  const n = { ...note, start: clamp(Math.round(note.start), 0, steps - 1), midi: clamp(Math.round(note.midi), 24, 108), length: Math.max(1, Math.round(note.length)) };
  n.length = Math.min(n.length, steps - n.start);
  const end = n.start + n.length;
  const kept: ScoreNote[] = [];
  for (const old of notes) {
    if (old.id === n.id) continue;
    const oldEnd = old.start + old.length;
    if (oldEnd <= n.start || old.start >= end) kept.push(old);
    else if (old.start < n.start) kept.push({ ...old, length: n.start - old.start });
    else if (oldEnd > end) kept.push({ ...old, start: end, length: oldEnd - end });
  }
  return [...kept, n].sort((a, b) => a.start - b.start);
}

export function isScore(value: unknown): value is Score {
  if (!value || typeof value !== "object") return false;
  const v = value as Score;
  if (v.version !== 1 || ![16, 32, 64, 128].includes(v.steps) || !Number.isFinite(v.bpm) || v.bpm < 40 || v.bpm > 220 || !Array.isArray(v.notes) || v.notes.length > v.steps || !v.automation || typeof v.automation !== "object") return false;
  if (v.notes.some(n => !n || typeof n !== "object")) return false;
  const ids = new Set<string>();
  let end = 0;
  for (const n of [...v.notes].sort((a, b) => a.start - b.start)) {
    if (!n || typeof n.id !== "string" || !n.id || n.id.length > 80 || ids.has(n.id) || !Number.isInteger(n.start) || n.start < end || !Number.isInteger(n.length) || n.length < 1 || n.start + n.length > v.steps || !Number.isInteger(n.midi) || n.midi < 24 || n.midi > 108) return false;
    ids.add(n.id); end = n.start + n.length;
  }
  return LANES.every(({ id }) => Array.isArray(v.automation[id]) && v.automation[id].length === v.steps && v.automation[id].every(x => x === null || typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1));
}
function readScore(): Score {
  try { const v: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "null"); if (isScore(v)) return v; } catch { /* storage can be blocked */ }
  return initialScore();
}
export function savedLyrics(fallback: string): string {
  try { const text = localStorage.getItem(WORDS); return text !== null && text.length <= 4000 ? text : fallback; } catch { return fallback; }
}
export function saveLyrics(text: string): void { try { localStorage.setItem(WORDS, text.slice(0, 4000)); } catch { /* session still works without storage */ } }
function save(score: Score): void { try { localStorage.setItem(STORAGE, JSON.stringify(score)); } catch { /* session still works without storage */ } }

type ScoreStore = {
  score: Score;
  setBpm: (bpm: number) => void;
  setSteps: (steps: number) => void;
  putNote: (n: ScoreNote) => void;
  removeNote: (id: string) => void;
  clearNotes: () => void;
  setAutomation: (lane: Lane, values: { step: number; value: number | null }[]) => void;
  clearLane: (lane: Lane) => void;
  load: (score: Score) => void;
};
export const useSongScore = create<ScoreStore>((set, get) => {
  const update = (score: Score) => { save(score); set({ score }); };
  return {
    score: readScore(),
    setBpm: bpm => update({ ...get().score, bpm: clamp(Math.round(Number.isFinite(bpm) ? bpm : 100), 40, 220) }),
    setSteps: steps => {
      if (![16, 32, 64, 128].includes(steps)) return;
      const s = get().score, automation = emptyLanes(steps);
      for (const { id } of LANES) for (let i = 0; i < Math.min(s.steps, steps); i++) automation[id][i] = s.automation[id][i];
      update({ ...s, steps, notes: s.notes.filter(n => n.start < steps).map(n => ({ ...n, length: Math.min(n.length, steps - n.start) })), automation });
    },
    putNote: n => { const s = get().score; update({ ...s, notes: placeNote(s.notes, n, s.steps) }); },
    removeNote: id => { const s = get().score; update({ ...s, notes: s.notes.filter(n => n.id !== id) }); },
    clearNotes: () => update({ ...get().score, notes: [] }),
    setAutomation: (lane, values) => {
      const s = get().score, arr = s.automation[lane].slice();
      for (const { step, value } of values) if (Number.isInteger(step) && step >= 0 && step < s.steps && (value === null || Number.isFinite(value))) arr[step] = value === null ? null : clamp(value, 0, 1);
      update({ ...s, automation: { ...s.automation, [lane]: arr } });
    },
    clearLane: lane => { const s = get().score; update({ ...s, automation: { ...s.automation, [lane]: Array(s.steps).fill(null) } }); },
    load: score => { if (isScore(score)) update(structuredClone(score)); },
  };
});

/** Load a demo as editable sixteenth notes, preserving its lyrics separately in Sing. */
export function scoreFromDemo(song: DemoSong, body: "male" | "female" | "child"): Score {
  let at = 0;
  const notes = song.notes.map(([midi, beats], i) => {
    const length = Math.max(1, Math.round(beats * 4));
    const n = { id: `song-${i}`, midi: Math.round(midi + song.octave[body] * 12), start: at, length };
    at += length;
    return n;
  });
  const steps = [16, 32, 64, 128].find(n => n >= at) ?? 128;
  return { ...blankScore(steps), bpm: song.bpm, notes: notes.filter(n => n.start < steps).map(n => ({ ...n, length: Math.min(n.length, steps - n.start) })) };
}

const AH: Syllable = { text: "ah", onset: [], nucleus: { ipa: "ɑ", stress: 1 }, coda: [], wordEnd: true, phraseEnd: false };
export type ScorePlan = Plan & { times: [number, number][]; notes: ScoreNote[]; syllables: Syllable[]; stepSeconds: number; start: number };
/** Plan each contiguous run as an independent phrase so empty steps really are rests. */
export function planScore(score: Score, syllables: Syllable[], body: BodyMix, vibrato: number): ScorePlan {
  const ordered = [...score.notes].sort((a, b) => a.start - b.start);
  const syls = syllables.length ? syllables : [AH];
  const assigned = ordered.map((_, i) => syls[i % syls.length]);
  const stepSeconds = 60 / score.bpm / 4, start = 0.35;
  const times = ordered.map(n => [start + n.start * stepSeconds, start + (n.start + n.length) * stepSeconds] as [number, number]);
  const gestures: Gesture[] = [], segments: Plan["segments"] = [];
  let end = start + score.steps * stepSeconds;
  for (let i = 0; i < ordered.length;) {
    let j = i + 1;
    while (j < ordered.length && ordered[j - 1].start + ordered[j - 1].length === ordered[j].start) j++;
    const sung: SungNote[] = ordered.slice(i, j).map((n, k) => {
      let syl = assigned[i + k];
      // A held-vowel marker after a rest needs its parent's vowel, but no onset consonant.
      if (k === 0 && syl.melisma) {
        let p = i - 1; while (p >= 0 && assigned[p].melisma) p--;
        syl = { ...(p >= 0 ? assigned[p] : AH), onset: [], melisma: false };
      }
      return { midi: n.midi, beats: n.length / 4, syl };
    });
    const plan = planSong(sung, { body, bpm: score.bpm, t0: times[i][0], vibrato });
    gestures.push(...plan.gestures); segments.push(...plan.segments); end = Math.max(end, plan.end);
    i = j;
  }
  const valueAt = (lane: Lane, time: number, fallback: number) => {
    const step = clamp(Math.floor((time - start) / stepSeconds), 0, score.steps - 1);
    return score.automation[lane][step] ?? fallback;
  };
  // The planner owns the breath envelopes. Split only its breath gestures, preserving their
  // attack/release, and scale the physical breath target at the sixteenth-note boundaries.
  if (score.automation.breath.some(v => v !== null)) {
    for (let i = gestures.length - 1; i >= 0; i--) {
      const g = gestures[i];
      if (g.label !== "breath" || g.targets.breath === undefined || g.t1 <= g.t0) continue;
      const cuts = [g.t0];
      for (let s = 1; s < score.steps; s++) { const t = start + s * stepSeconds; if (t > g.t0 && t < g.t1) cuts.push(t); }
      cuts.push(g.t1);
      const parts = cuts.slice(0, -1).map((a, k): Gesture => ({ ...g, t0: a, t1: cuts[k + 1], rampIn: k === 0 ? g.rampIn : .008, rampOut: k === cuts.length - 2 ? g.rampOut : .008, targets: { ...g.targets, breath: g.targets.breath! * valueAt("breath", (a + cuts[k + 1]) / 2, 1 / 1.4) * 1.4 } }));
      gestures.splice(i, 1, ...parts);
    }
  }
  // Vibrato is a source control; jaw is a real articulator blended with the sung phonemes.
  // Missing values leave the original behavior alone, or use the song vibrato between painted steps.
  if (score.automation.vibrato.some(v => v !== null)) {
    for (let i = gestures.length - 1; i >= 0; i--) if (gestures[i].label === "vibrato") gestures.splice(i, 1);
    for (const [a, b] of times) for (let step = 0; step < score.steps; step++) {
      const lo = Math.max(a, start + step * stepSeconds), hi = Math.min(b - .02, start + (step + 1) * stepSeconds);
      if (hi <= lo) continue;
      const v = score.automation.vibrato[step];
      gestures.push({ t0: lo, t1: hi, rampIn: .025, rampOut: .025, strength: 40, targets: { vibrato: v === null ? vibrato : v * 100 }, label: "vibrato automation" });
    }
  }
  score.automation.jaw.forEach((v, step) => {
    if (v === null) return;
    const t0 = start + step * stepSeconds;
    gestures.push({ t0, t1: t0 + stepSeconds, rampIn: .025, rampOut: .025, strength: 40, targets: { jaw: v * 2.4 }, label: "jaw automation" });
  });
  if (gestures.length > 4000) throw new Error("This score has too many gestures. Use fewer notes or simpler lyrics.");
  return { gestures, segments, end, times, notes: ordered, syllables: assigned, stepSeconds, start };
}
