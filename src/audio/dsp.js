/**
 * Neonsynth's small, editable real-time acoustic graph.
 *
 * The glottal pulse shape and the bird-syrinx normal form/table interpolation below are
 * adapted from Chimera (glottis.rs and syrinx.rs, commit d361a82), MIT © 2026 Jameson Hodge.
 * See LICENSE-CHIMERA.txt. The resonant graph and UI are Neonsynth's own simplified model;
 * this is not Chimera's full FDTD airway solver.
 */
import { rawSyrinxTable } from './syrinx-table.js';

const TAU = 2 * Math.PI;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;

/** Port of Chimera's parametric glottal area pulse, sources/glottis.rs. */
export function glottalShape(phase, openQuotient, skew, sharpness) {
  if (phase >= openQuotient) return 0;
  const t = phase / openQuotient;
  const s = clamp(skew, 0.3, 0.9);
  if (t < s) return 0.5 - 0.5 * Math.cos((Math.PI * t) / s);
  const u = (t - s) / (1 - s);
  const soft = 0.5 + 0.5 * Math.cos(Math.PI * u);
  const hard = Math.cos(0.5 * Math.PI * u);
  return soft + (hard - soft) * sharpness;
}

// Chimera fills missing limit-cycle cells from their neighbours before interpolation.
function buildSyrinxTable(raw) {
  const table = { alphas: raw.alphas, betas: raw.betas, T: raw.T.map((r) => [...r]), lo: raw.lo.map((r) => [...r]), hi: raw.hi.map((r) => [...r]) };
  for (let bi = 0; bi < table.betas.length; bi++) {
    for (let ai = table.alphas.length - 1; ai >= 0; ai--) {
      if (table.T[bi][ai] == null || !Number.isFinite(table.T[bi][ai])) {
        table.T[bi][ai] = table.T[bi]?.[ai + 1] ?? table.T[bi + 1]?.[ai] ?? 10;
        table.lo[bi][ai] = table.lo[bi]?.[ai + 1] ?? -1;
        table.hi[bi][ai] = table.hi[bi]?.[ai + 1] ?? 1;
      }
    }
  }
  for (const key of ['T', 'lo', 'hi']) table[key] = table[key].map((row) => row.map((x) => x ?? 0));
  return table;
}
const SYRINX = buildSyrinxTable(rawSyrinxTable);
function bilinear(grid, a, b) {
  const as = SYRINX.alphas, bs = SYRINX.betas;
  const fa = clamp(((a - as[0]) / (as[as.length - 1] - as[0])) * (as.length - 1), 0, as.length - 1.0001);
  const fb = clamp(((b - bs[0]) / (bs[bs.length - 1] - bs[0])) * (bs.length - 1), 0, bs.length - 1.0001);
  const ia = Math.floor(fa), ib = Math.floor(fb), u = fa - ia, w = fb - ib;
  return (1 - w) * ((1 - u) * grid[ib][ia] + u * grid[ib][ia + 1]) + w * ((1 - u) * grid[ib + 1][ia] + u * grid[ib + 1][ia + 1]);
}
function syrinxRhs(x, y, a, b) {
  return [y, -a - b * x - x * x * x - x * x * y + x * x - x * y];
}
/** Gardner–Mindlin labial oscillator and RK4 integration ported from Chimera's syrinx.rs. */
export class SyrinxLabia {
  constructor(sampleRate, frequency, drive, tension, seed = 0) {
    this.x = 0.2 + 0.05 * seed; this.y = 0; this.gate = 0;
    const a = 0.09 + 0.51 * clamp(drive, 0, 1), b = 0.2 + 1.1 * clamp(tension, 0, 1);
    this.a = a; this.b = b;
    this.lo = bilinear(SYRINX.lo, a, b); this.hi = bilinear(SYRINX.hi, a, b);
    this.dtau = bilinear(SYRINX.T, a, b) * clamp(frequency, 20, 4000) / sampleRate;
    this.steps = Math.max(1, Math.ceil(this.dtau / 0.06));
    this.h = this.dtau / this.steps;
  }
  next() {
    let { x, y } = this; const { a, b, h } = this;
    for (let i = 0; i < this.steps; i++) {
      // Scalar RK4 avoids allocating temporary arrays on the audio thread.
      const k1x = y, k1y = -a - b*x - x*x*x - x*x*y + x*x - x*y;
      let xx = x + 0.5*h*k1x, yy = y + 0.5*h*k1y;
      const k2x = yy, k2y = -a - b*xx - xx*xx*xx - xx*xx*yy + xx*xx - xx*yy;
      xx = x + 0.5*h*k2x; yy = y + 0.5*h*k2y;
      const k3x = yy, k3y = -a - b*xx - xx*xx*xx - xx*xx*yy + xx*xx - xx*yy;
      xx = x + h*k3x; yy = y + h*k3y;
      const k4x = yy, k4y = -a - b*xx - xx*xx*xx - xx*xx*yy + xx*xx - xx*yy;
      x += h/6 * (k1x + 2*k2x + 2*k3x + k4x);
      y += h/6 * (k1y + 2*k2y + 2*k3y + k4y);
    }
    if (!Number.isFinite(x) || Math.abs(x) > 10 || !Number.isFinite(y)) { x = 0.2; y = 0; }
    this.x = x; this.y = y;
    const u = clamp((x - this.lo) / Math.max(1e-3, this.hi - this.lo), 0, 1);
    this.gate += (1 - this.gate) * 0.002;
    return u * u * this.gate;
  }
}
// Keep the pure RHS visible to tests/documentation without using allocations in rendering.
export { syrinxRhs };

export function midiFrequency(midi) { return 440 * 2 ** ((midi - 69) / 12); }

/** Topological sort; invalid/cyclic graphs produce silence, never runaway feedback. */
export function compileGraph(instrument) {
  if (!instrument || !Array.isArray(instrument.parts) || !Array.isArray(instrument.connections) || instrument.parts.length > 64 || instrument.connections.length > 256) return null;
  const byId = new Map();
  for (const part of instrument.parts) {
    if (!part || typeof part.id !== 'string' || byId.has(part.id)) return null;
    byId.set(part.id, part);
  }
  const indegree = new Map([...byId.keys()].map((id) => [id, 0]));
  const incoming = new Map([...byId.keys()].map((id) => [id, []]));
  const outgoing = new Map([...byId.keys()].map((id) => [id, []]));
  for (const edge of instrument.connections) {
    if (!edge || !byId.has(edge.from) || !byId.has(edge.to) || edge.from === edge.to) return null;
    incoming.get(edge.to).push(edge.from); outgoing.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }
  const queue = [...byId.keys()].filter((id) => indegree.get(id) === 0);
  const sorted = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]; sorted.push(id);
    for (const next of outgoing.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (sorted.length !== byId.size) return null;
  const indices = new Map(sorted.map((id, index) => [id, index]));
  return sorted.map((id) => ({ part: byId.get(id), inputs: incoming.get(id).map((source) => indices.get(source)) }));
}

function makeFilter(sampleRate, size, damping, resonance, tube) {
  // Stable, damped acoustic mode: chamber length shifts its formant and wall loss sets its Q.
  const frequency = clamp((tube ? 300 : 105) + (tube ? 3900 : 3000) * (1 - size) ** 2, 60, sampleRate * 0.4);
  const q = 0.7 + (1 - damping) * 4 + resonance * 2;
  const omega = TAU * frequency / sampleRate, alpha = Math.sin(omega) / (2 * q), a0 = 1 + alpha;
  return { b0: alpha / a0, b2: -alpha / a0, a1: -2 * Math.cos(omega) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}
function filterStep(f, input) {
  const value = f.b0 * input + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1; f.x1 = input; f.y2 = f.y1; f.y1 = value;
  return value;
}
function normalizedParams(part) {
  const p = part.params || {};
  const n = (name, fallback) => clamp(finite(p[name], fallback), 0, 1);
  return { pressure: n('pressure', .7), tension: n('tension', .5), breathiness: n('breathiness', .15), size: n('size', .5),
    damping: n('damping', .35), resonance: n('resonance', .65), rate: n('rate', .35), depth: n('depth', .45), openness: n('openness', .8), pitch: clamp(finite(p.pitch, 0), -24, 24) };
}

/** One self-contained graph per note; note duration/release are in sample frames. */
export class PhysicalVoice {
  constructor(instrument, midi, sampleRate, velocity = 1, startFrame = 0, endFrame = Infinity, id = '') {
    this.id = id; this.fs = sampleRate; this.start = Math.max(0, startFrame); this.end = endFrame;
    this.releaseSamples = Math.max(1, Math.round(sampleRate * 0.24));
    this.velocity = clamp(finite(velocity, 1), 0, 1); this.lastX = 0; this.lastY = 0;
    this.seed = 1009; this.graph = compileGraph(instrument) || [];
    this.values = new Float64Array(this.graph.length);
    const base = clamp(midiFrequency(clamp(finite(midi, 60), 24, 108)), 20, 4000);
    this.nodes = this.graph.map(({ part }, index) => {
      const params = normalizedParams(part);
      const frequency = clamp(base * 2 ** (params.pitch / 12), 20, 4000);
      const state = { part, params, frequency, phase: index * 0.07, filter: null, syrinx: null, string: null, stringIndex: 0 };
      if (part.kind === 'resonator' || part.kind === 'tube') state.filter = makeFilter(sampleRate, params.size, params.damping, params.resonance, part.kind === 'tube');
      if (part.kind === 'source' && part.excitation === 'syrinx') state.syrinx = new SyrinxLabia(sampleRate, frequency, params.pressure, params.tension, index);
      if (part.kind === 'source' && part.excitation === 'string') {
        state.string = new Float32Array(Math.max(2, Math.round(sampleRate / frequency)));
        for (let i = 0; i < state.string.length; i++) state.string[i] = this.random() * 0.8;
      }
      return state;
    });
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return (this.seed / 0x80000000) - 1;
  }
  release(frame, fast = false) {
    this.end = Math.min(this.end, frame);
    if (fast) this.releaseSamples = Math.min(this.releaseSamples, Math.round(this.fs * 0.025));
  }
  done(frame) { return frame > this.end + this.releaseSamples; }
  next(frame) {
    if (frame < this.start || this.done(frame) || !this.nodes.length) return 0;
    const age = (frame - this.start) / this.fs;
    let output = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const state = this.nodes[i], { part, params: p } = state, inputs = this.graph[i].inputs;
      let input = 0;
      for (let j = 0; j < inputs.length; j++) input += this.values[inputs[j]];
      if (inputs.length > 1) input /= Math.sqrt(inputs.length);
      let value = 0;
      if (part.kind === 'source') {
        state.phase += state.frequency / this.fs;
        if (state.phase >= 1) state.phase -= Math.floor(state.phase);
        const carrier = inputs.length ? clamp(Math.abs(input), 0, 1.3) : 1;
        switch (part.excitation) {
          case 'air': value = (0.65 + this.random() * p.breathiness * 0.45) * p.pressure * carrier; break;
          case 'syrinx': value = ((state.syrinx ? state.syrinx.next() : 0) - 0.25) * 1.4 * p.pressure * carrier; break;
          case 'reed': value = Math.tanh((Math.sin(TAU * state.phase) + 0.38 * Math.sin(TAU * state.phase * 2)) * (1.4 + p.tension * 3)) * p.pressure * carrier; break;
          case 'jet': value = (Math.sin(TAU * state.phase) * (0.9 - p.breathiness * .25) + this.random() * p.breathiness * 0.24) * p.pressure * carrier; break;
          case 'string': {
            const buffer = state.string, idx = state.stringIndex, next = (idx + 1) % buffer.length;
            value = buffer[idx] * p.pressure * carrier;
            buffer[idx] = (buffer[idx] + buffer[next]) * 0.5 * (0.992 + (1 - p.damping) * 0.007);
            state.stringIndex = next; break;
          }
          case 'strike': value = (Math.sin(TAU * state.phase) * Math.exp(-age * (1.7 + p.damping * 4)) + this.random() * Math.exp(-age * 32) * .3) * p.pressure * carrier; break;
          case 'glottis':
          default: {
            const oq = clamp(.72 - p.tension * .22, .25, .98);
            const pulse = glottalShape(state.phase, oq, .62, .55 + p.tension * .3);
            value = (pulse * 1.5 + this.random() * p.breathiness * .08) * p.pressure * carrier;
          }
        }
      } else if (part.kind === 'resonator' || part.kind === 'tube') {
        const resonated = filterStep(state.filter, input);
        value = input * (part.kind === 'tube' ? .48 : .36) + resonated * (.65 + p.resonance * 1.1);
      } else if (part.kind === 'modulator') {
        const modulation = .5 + .5 * Math.sin(TAU * age * (.5 + p.rate * 11));
        value = input * (1 - p.depth + p.depth * modulation);
      } else if (part.kind === 'outlet') {
        value = input * (.2 + .8 * p.openness); output += value;
      }
      this.values[i] = Number.isFinite(value) ? clamp(value, -4, 4) : 0;
    }
    // Remove DC from pressure sources and prevent accidental loud bursts.
    const dc = output - this.lastX + .995 * this.lastY;
    this.lastX = output; this.lastY = Number.isFinite(dc) ? dc : 0;
    const attack = Math.min(1, age / .035);
    const release = frame < this.end ? 1 : Math.max(0, 1 - (frame - this.end) / this.releaseSamples);
    return Math.tanh(this.lastY * 1.1) * attack * release * this.velocity * .32;
  }
}
