import { describe, expect, test } from "bun:test";
import { initEngine, WasmVoice } from "./harness.ts";
await initEngine();
const { blankScore, isScore, placeNote, planScore, scoreFromDemo } = await import("../src/ui/songScore.ts");
const { DEMO_SONGS, lyricsToSyllables } = await import("../src/wasm/engine.ts");
const body = { female: 0, child: 0 };
const n = (id: string, start: number, length: number, midi = 48) => ({ id, start, length, midi });
const energy = (a: Float32Array, from: number, to: number) => Math.sqrt(a.slice(Math.round(from*48000),Math.round(to*48000)).reduce((s,x)=>s+x*x,0)/Math.round((to-from)*48000));

describe("editable singing score", () => {
  test("drawing, moving and resizing stays monophonic and preserves real rests", () => {
    let notes = placeNote([n("old", 0, 8)], n("new", 4, 2, 52), 16);
    expect(notes).toEqual([n("old",0,4), n("new",4,2,52)]);
    notes = placeNote(notes, n("new", 9, 4, 55), 16);
    expect(notes).toEqual([n("old",0,4), n("new",9,4,55)]);
    notes = placeNote(notes, n("last", 15, 20), 16);
    expect(notes.at(-1)).toEqual(n("last",15,1));
    const score = { ...blankScore(16), notes };
    expect(isScore(score)).toBe(true);
    expect(isScore({ ...score, notes: [...notes,n("bad",2,3)] })).toBe(false);
    expect(isScore({ ...score, notes: [null] })).toBe(false);
    expect(isScore({ ...score, automation: { ...score.automation, jaw: [Infinity] } })).toBe(false);
  });
  test("built-in melodies become editable notes in the chosen body's register", () => {
    const score=scoreFromDemo(DEMO_SONGS[1],"male");
    expect(isScore(score)).toBe(true);
    expect(score.notes[0].midi).toBe(DEMO_SONGS[1].notes[0][0]-12);
    expect(score.bpm).toBe(DEMO_SONGS[1].bpm);
  });
  test("planned notes and rests render through the actual singing voice", () => {
    const score={...blankScore(16),bpm:120,notes:[n("one",0,4,45),n("two",8,4,52)]};
    const plan=planScore(score,lyricsToSyllables("ah ah"),body,0);
    expect(plan.times[1][0]-plan.times[0][1]).toBeCloseTo(.5,8);
    const voice=new WasmVoice(); voice.schedule(plan.gestures,.03,true);
    const out=voice.render(120000);
    const first=energy(out,.65,.8), rest=energy(out,1.12,1.3), second=energy(out,1.65,1.8);
    expect(first).toBeGreaterThan(.00001);
    expect(second).toBeGreaterThan(.00001);
    expect(rest).toBeLessThan(first*.1);
  },120_000);
  test("each drawn automation lane becomes a real engine gesture and changes audio", () => {
    const score={...blankScore(16),bpm:100,notes:[n("one",0,12,48)]};
    const words=lyricsToSyllables("ah");
    const base=planScore(score,words,body,0);
    const render=(plan:typeof base) => { const voice=new WasmVoice(); voice.schedule(plan.gestures,.03,true); return voice.render(72000); };
    const reference=render(base);
    for (const lane of ["breath","vibrato","jaw"] as const) {
      const changed=structuredClone(score);
      changed.automation[lane].fill(lane === "breath" ? .15 : .9);
      const edited=planScore(changed,words,body,0);
      if(lane==="jaw") expect(edited.gestures.some(g=>g.label==="jaw automation" && g.targets.jaw!>2)).toBe(true);
      if(lane==="vibrato") expect(edited.gestures.some(g=>g.label==="vibrato automation" && g.targets.vibrato===90)).toBe(true);
      if(lane==="breath") expect(edited.gestures.filter(g=>g.label==="breath").every(g=>g.targets.breath!<.22)).toBe(true);
      const actual=render(edited);
      const difference=actual.reduce((sum,v,i)=>sum+Math.abs(v-reference[i]),0)/actual.length;
      expect(difference).toBeGreaterThan(1e-5);
      if(lane==="breath") expect(energy(reference,.8,1.1)).toBeGreaterThan(energy(actual,.8,1.1)*1.2);
    }
  },120_000);
});
