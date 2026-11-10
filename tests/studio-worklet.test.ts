import { describe, expect, test } from "bun:test";
import { wasmModule } from "./harness.ts";
import { EXAMPLES } from "../src/studio/examples.ts";

describe("band AudioWorklet", () => {
  test("mixes independent physical voices, follows the step clock, and skips muted parts", async () => {
    type Proc = { port: { onmessage: ((e: {data: unknown}) => void) | null }; process: (i: unknown, o: Float32Array[][]) => boolean };
    let Ctor: (new (o: unknown) => Proc) | null = null;
    const posted: {type: string; message?: string; step?: number; voices?: number}[] = [];
    const g = globalThis as Record<string, unknown>;
    g.sampleRate = 48000;
    g.AudioWorkletProcessor = class { port = { onmessage: null as unknown, postMessage: (m: {type:string})=>posted.push(m) }; };
    g.registerProcessor = (_name: string, ctor: typeof Ctor) => { Ctor = ctor; };
    // @ts-expect-error force a fresh worklet registration for this test
    await import("../src/worklet/studioProcessor.ts?studio-abi");
    expect(Ctor).not.toBeNull();
    const enc = new TextEncoder();
    const run = (muteA: boolean, muteB: boolean) => {
      const p = new Ctor!({processorOptions:{module:wasmModule}});
      const tracks = [EXAMPLES[0],EXAMPLES[1]].map((d,i)=>({bytes:enc.encode(JSON.stringify(d)),basePitch:d.basePitch,steps:Array(16).fill(i ? 84 : 36),level:.5,mute:i ? muteB : muteA}));
      posted.length=0;
      p.port.onmessage!({data:{type:"load",mode:"band",tracks,bpm:120}});
      expect(posted.some(m=>m.type === "error")).toBe(false);
      const result=new Float32Array(16000);
      for(let i=0;i<result.length;i+=128) {
        const block=new Float32Array(Math.min(128,result.length-i));
        p.process([],[[block]]); result.set(block,i);
      }
      expect(posted.some(m=>m.type === "telemetry" && (m.step ?? -1)>0 && m.voices===2)).toBe(true);
      p.port.onmessage!({data:{type:"stop"}});
      return result;
    };
    const both=run(false,false), onlyA=run(false,true), onlyB=run(true,false), neither=run(true,true);
    const energy=(a:Float32Array,b?:Float32Array)=>a.reduce((sum,v,i)=>sum+(v-(b?.[i] ?? 0))**2,0)/a.length;
    expect(energy(both)).toBeGreaterThan(1e-7);
    expect(energy(both,onlyA)).toBeGreaterThan(1e-7);
    expect(energy(both,onlyB)).toBeGreaterThan(1e-7);
    expect(energy(neither)).toBe(0);
  }, 120_000);
});
