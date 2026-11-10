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
      const tracks = [EXAMPLES[0],EXAMPLES[1]].map((d,i)=>({id:`track-${i}`,bytes:enc.encode(JSON.stringify(d)),basePitch:d.basePitch,release:d.release,steps:Array(16).fill(i ? 84 : 36),level:.5,pan:0,expression:1,mute:i ? muteB : muteA}));
      posted.length=0;
      p.port.onmessage!({data:{type:"load",mode:"band",tracks,bpm:120,playing:true}});
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
  test("live MIDI overrides the sequencer, while pitch bend and velocity reach the physical voice", async () => {
    type Proc = { port: { onmessage: (e:{data:unknown})=>void }; process: (i:unknown,o:Float32Array[][])=>boolean; x: Record<string,any>; cursor:number; voices: {handle:number}[] };
    let Ctor: (new (o:unknown)=>Proc) | null=null;
    const posted: {type:string; message?:string}[]=[];
    const g=globalThis as Record<string,unknown>;
    g.sampleRate=48000;
    g.AudioWorkletProcessor=class { port={onmessage:null,postMessage:(m:{type:string})=>posted.push(m)}; };
    g.registerProcessor=(_name:string,ctor:typeof Ctor)=>{Ctor=ctor;};
    // @ts-expect-error register a fresh processor
    await import("../src/worklet/studioProcessor.ts?studio-live");
    const p=new Ctor!({processorOptions:{module:wasmModule}});
    const d=EXAMPLES[0], enc=new TextEncoder();
    const track={id:"one",bytes:enc.encode(JSON.stringify(d)),basePitch:d.basePitch,release:d.release,steps:Array(16).fill(48),level:.8,pan:0,expression:1,mute:false};
    const send=(data:unknown)=>p.port.onmessage({data});
    send({type:"load",mode:"band",tracks:[track],bpm:120,playing:true});
    const raw=p.x, calls: {h:number;ratio:number;gate:number}[]=[];
    p.x={...raw,studio_set:(h:number,ratio:number,gate:number)=>{calls.push({h,ratio,gate});return raw.studio_set(h,ratio,gate);}};
    const tick=()=>p.process([],[[new Float32Array(128),new Float32Array(128)]]);
    const ratio=(note:number)=>440*Math.pow(2,(note-69)/12)/d.basePitch;
    tick(); expect(calls.at(-1)!.ratio).toBeCloseTo(ratio(48),8); expect(calls.at(-1)!.gate).toBe(1);
    send({type:"midi-note",id:"one",note:60,velocity:64}); send({type:"midi-bend",id:"one",amount:1});
    tick(); expect(calls.at(-1)!.ratio).toBeCloseTo(ratio(62),8); expect(calls.at(-1)!.gate).toBeCloseTo(64/127,8);
    const handle=p.voices[0].handle, cursor=p.cursor;
    send({type:"mix",tracks:[{...track,level:.4,expression:.6,pan:-.5}],bpm:120});
    expect(p.voices[0].handle).toBe(handle); expect(p.cursor).toBe(cursor); // no physical rebuild or transport restart
    send({type:"midi-note",id:"one",note:null,velocity:0}); tick();
    expect(calls.at(-1)!.ratio).toBeCloseTo(ratio(50),8); // falls back to sequence, wheel still held
    expect(calls.at(-1)!.gate).toBe(1);
    send({type:"transport",playing:false}); tick(); expect(calls.at(-1)!.gate).toBe(0);
    send({type:"midi-note",id:"one",note:57,velocity:110}); tick();
    expect(calls.at(-1)!.ratio).toBeCloseTo(ratio(59),8); expect(calls.at(-1)!.gate).toBeCloseTo(110/127,8);
    expect(posted.filter(m=>m.type==="error")).toEqual([]);
    send({type:"stop"});
  },120_000);

  test("stereo pan, expression and mute affect real rendered audio without stale held notes", async () => {
    type Proc = { port:{onmessage:(e:{data:unknown})=>void}; process:(i:unknown,o:Float32Array[][])=>boolean };
    let Ctor: (new(o:unknown)=>Proc) | null=null;
    const posted: {type:string;message?:string}[]=[];
    const g=globalThis as Record<string,unknown>; g.sampleRate=48000;
    g.AudioWorkletProcessor=class {port={onmessage:null,postMessage:(m:{type:string})=>posted.push(m)};};
    g.registerProcessor=(_name:string,ctor:typeof Ctor)=>{Ctor=ctor;};
    // @ts-expect-error register a fresh processor
    await import("../src/worklet/studioProcessor.ts?studio-mixer");
    const p=new Ctor!({processorOptions:{module:wasmModule}});
    const d=EXAMPLES[0], enc=new TextEncoder();
    const mix={id:"one",steps:Array(16).fill(null),level:.8,pan:-1,expression:1,mute:false};
    const track={...mix,bytes:enc.encode(JSON.stringify(d)),basePitch:d.basePitch,release:d.release};
    const send=(data:unknown)=>p.port.onmessage({data});
    const render=(frames:number)=>{
      let l=0,r=0;
      for(let i=0;i<frames;i+=128) {
        const left=new Float32Array(128),right=new Float32Array(128); p.process([],[[left,right]]);
        for(let j=0;j<128;j++){l+=left[j]*left[j];r+=right[j]*right[j];}
      }
      return [l/frames,r/frames];
    };
    send({type:"load",mode:"band",tracks:[track],bpm:120,playing:false});
    send({type:"midi-note",id:"one",note:36,velocity:127});
    render(24000); const left=render(12000);
    expect(left[0]).toBeGreaterThan(1e-7); expect(left[1]).toBeLessThan(left[0]*1e-6);
    send({type:"mix",tracks:[{...mix,pan:1}],bpm:120});
    render(12000); const right=render(12000);
    expect(right[1]).toBeGreaterThan(1e-7); expect(right[0]).toBeLessThan(right[1]*1e-6);
    send({type:"mix",tracks:[{...mix,pan:1,expression:0}],bpm:120});
    render(12000); const silent=render(12000); expect(silent[1]).toBeLessThan(right[1]*1e-6);
    send({type:"mix",tracks:[{...mix,pan:1,mute:true}],bpm:120});
    send({type:"midi-note",id:"one",note:null,velocity:0});
    render(120000); // finish the physical release while the part is muted
    send({type:"mix",tracks:[{...mix,pan:1}],bpm:120});
    const after=render(12000); expect(after[1]).toBeLessThan(right[1]*.001);
    expect(posted.filter(m=>m.type==="error")).toEqual([]);
    send({type:"stop"});
  },120_000);

});
