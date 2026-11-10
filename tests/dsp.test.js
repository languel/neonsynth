import test from 'node:test';
import assert from 'node:assert/strict';
import { compileGraph, glottalShape, midiFrequency, PhysicalVoice, SyrinxLabia } from '../src/audio/dsp.js';

const instrument = (excitation = 'glottis', size = .6) => ({ parts: [
  { id: 'air', kind: 'source', excitation: 'air', params: { pressure: .9 } },
  { id: 'voice', kind: 'source', excitation, params: { pressure: .8, tension: .5 } },
  { id: 'cavity', kind: 'resonator', params: { size, damping: .2, resonance: .8 } },
  { id: 'mouth', kind: 'outlet', params: { openness: .8 } },
], connections: [{ from: 'air', to: 'voice' }, { from: 'voice', to: 'cavity' }, { from: 'cavity', to: 'mouth' }] });

const render = (definition, note = 60) => {
  const voice = new PhysicalVoice(definition, note, 48000, .8, 0, 12000, 'test');
  return Array.from({ length: 24000 }, (_, frame) => voice.next(frame));
};
const energy = (xs) => Math.sqrt(xs.reduce((sum, x) => sum + x*x, 0) / xs.length);

test('Chimera glottal area pulse opens and closes', () => {
  assert.equal(glottalShape(0, .62, .62, .6), 0);
  assert.ok(glottalShape(.3, .62, .62, .6) > .8);
  assert.equal(glottalShape(.7, .62, .62, .6), 0);
  assert.equal(midiFrequency(69), 440);
});
test('syrinx integration stays finite and produces a moving valve', () => {
  const source = new SyrinxLabia(48000, 700, .6, .4);
  const values = Array.from({ length: 6000 }, () => source.next());
  assert.ok(values.every(Number.isFinite));
  assert.ok(Math.max(...values) - Math.min(...values) > .1);
});
test('connected graphs render finite, audible audio and release', () => {
  for (const source of ['glottis', 'syrinx', 'reed', 'jet', 'string', 'strike']) {
    const samples = render(instrument(source));
    assert.ok(samples.every(Number.isFinite), source);
    assert.ok(energy(samples.slice(2000, 10000)) > .0001, `${source} should make sound`);
    assert.equal(samples.at(-1), 0, `${source} should finish its release`);
  }
});
test('resonator parameters change the rendered sound', () => {
  const a = render(instrument('glottis', .2));
  const b = render(instrument('glottis', .85));
  assert.ok(energy(a.map((x, i) => x - b[i])) > .0001);
});
test('disconnected or cyclic networks cannot produce sound', () => {
  const disconnected = instrument(); disconnected.connections = [];
  assert.equal(energy(render(disconnected)), 0);
  const cyclic = instrument(); cyclic.connections.push({ from: 'mouth', to: 'air' });
  assert.equal(compileGraph(cyclic), null);
  assert.equal(energy(render(cyclic)), 0);
});


test('the exposed source tension and damping controls affect the sound', () => {
  for (const source of ['glottis', 'syrinx', 'reed', 'jet', 'string', 'strike']) {
    const low = instrument(source), high = instrument(source);
    low.parts[1].params.tension = .15; high.parts[1].params.tension = .9;
    const a = render(low), b = render(high);
    assert.ok(energy(a.map((x, i) => x - b[i])) > .00001, `${source} tension should change its sound`);
  }
  for (const source of ['string', 'strike']) {
    const low = instrument(source), high = instrument(source);
    low.parts[1].params.damping = .1; high.parts[1].params.damping = .9;
    const a = render(low), b = render(high);
    assert.ok(energy(a.map((x, i) => x - b[i])) > .00001, `${source} damping should change its sound`);
  }
});
