import { describe, expect, test } from "bun:test";
import { EXAMPLES } from "../src/studio/examples.ts";
import { copy, graphError, isBand, isDesign, makeTube, newBand, normalizeBand } from "../src/studio/model.ts";

describe("physical instrument graphs", () => {
  test("all examples are valid, connected and cover the requested families", () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(8);
    for (const design of EXAMPLES) {
      expect(isDesign(design)).toBe(true);
      expect(graphError(design)).toBeNull();
      expect(design.parts.some(p=>p.kind === "source")).toBe(true);
      expect(design.parts.some(p=>p.kind === "outlet")).toBe(true);
    }
    for (const name of ["Whale", "songbird", "Dinosaur", "Dragon", "Brass", "flute", "Glass"]) expect(EXAMPLES.some(d=>d.name.toLowerCase().includes(name.toLowerCase()))).toBe(true);
  });
  test("hand-drawn path length defines the initial physical tube", () => {
    const duct = makeTube([{x:0,y:0},{x:30,y:40},{x:60,y:80}]);
    expect(duct.length).toBe(10);
    expect(duct.points).toHaveLength(3);
  });
  test("disconnected sources and malformed imported files are rejected", () => {
    const d = copy(EXAMPLES[0]);
    d.links.pop();
    expect(graphError(d)).toMatch(/Connect/);
    expect(isDesign({...d, basePitch: Infinity})).toBe(false);
    expect(isDesign({...d, parts: [...d.parts,d.parts[0]]})).toBe(false);
    expect(isBand({...newBand(), bpm: 1000})).toBe(false);
  });
  test("a band stores complete designs and valid 16-step notes", () => {
    const band = {...newBand(), tracks: [{ id:"one",name:"Lead",design:copy(EXAMPLES[0]),channel:1,level:.5,pan:0,expression:1,mute:false,solo:false,steps:Array(16).fill(60) }]};
    expect(isBand(band)).toBe(true);
    band.tracks[0].steps[0] = 999;
    expect(isBand(band)).toBe(false);
  });
  test("migrates old band files without losing explicit mixer settings", () => {
    const legacyTrack = (id: string) => ({id,name:id,design:copy(EXAMPLES[0]),level:.6,mute:false,steps:Array(16).fill(null)});
    const old = {...newBand(),tracks:[legacyTrack("old-a"),legacyTrack("old-b")]};
    const migrated=normalizeBand(old)!;
    expect(migrated.tracks.map(t=>[t.channel,t.pan,t.expression,t.solo])).toEqual([[1,0,1,false],[2,0,1,false]]);
    expect(isBand(migrated)).toBe(true);
    expect("channel" in old.tracks[0]).toBe(false); // normalization does not mutate imports
    const partial={...old,tracks:[legacyTrack("old"),{...legacyTrack("new"),channel:1,pan:.8,expression:.4,solo:true}]};
    const partialResult=normalizeBand(partial)!;
    expect(partialResult.tracks.map(t=>t.channel)).toEqual([2,1]);
    expect(partialResult.tracks[1]).toMatchObject({pan:.8,expression:.4,solo:true});
    expect(normalizeBand({...old,tracks:[{...legacyTrack("bad"),pan:3}]})).toBeNull();
    expect(normalizeBand({...old,tracks:[legacyTrack("duplicate"),legacyTrack("duplicate")]})).toBeNull();
  });

});
