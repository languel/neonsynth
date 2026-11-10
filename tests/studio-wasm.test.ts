import { describe, expect, test } from "bun:test";
import { wasmModule } from "./harness.ts";
import { EXAMPLES } from "../src/studio/examples.ts";
import type { Design } from "../src/studio/model.ts";

type Fn = (...args: number[]) => number;
type Exports = { memory: WebAssembly.Memory } & Record<string, Fn>;
const instance = () => new WebAssembly.Instance(wasmModule, {}).exports as unknown as Exports;
function make(x: Exports, design: Design) {
  const data = new TextEncoder().encode(JSON.stringify(design));
  const p = x.chimera_alloc(data.length);
  new Uint8Array(x.memory.buffer,p,data.length).set(data);
  const h = x.studio_new(48000,p,data.length); x.chimera_free(p,data.length);
  return h;
}
function render(x: Exports, h: number, n: number) {
  const result = new Float32Array(n);
  for (let i=0; i<n; i+=128) { const len=Math.min(128,n-i); const p=x.studio_render(h,len); result.set(new Float32Array(x.memory.buffer,p,len),i); }
  return result;
}

describe("custom physical voices through the Wasm ABI", () => {
  test("every example is accepted, radiates sound and remains finite", () => {
    const x=instance();
    for (const design of EXAMPLES) {
      const h=make(x,design); expect(h).not.toBe(0);
      x.studio_set(h,1,1);
      const out=render(x,h,24000);
      let peak=0, energy=0;
      expect(out.every(Number.isFinite)).toBe(true);
      for (const s of out) { peak=Math.max(peak,Math.abs(s)); energy+=s*s; }
      console.log(`${design.name}: peak ${peak.toExponential(2)}, rms ${Math.sqrt(energy/out.length).toExponential(2)}`);
      expect(peak).toBeGreaterThan(0.00001);
      x.studio_free(h);
    }
  }, 120_000);
  test("two separately allocated voices sound at once and can release independently", () => {
    const x=instance();
    const a=make(x,EXAMPLES[0]), b=make(x,EXAMPLES[1]);
    expect(a).not.toBe(0); expect(b).not.toBe(0);
    x.studio_set(a,1,1); x.studio_set(b,1,1);
    const aa=render(x,a,12000), bb=render(x,b,12000);
    expect(aa.some(v=>Math.abs(v)>1e-5)).toBe(true);
    expect(bb.some(v=>Math.abs(v)>1e-5)).toBe(true);
    x.studio_set(a,1,0); render(x,a,48000);
    const silent=render(x,a,4096), still=render(x,b,4096);
    const rms=(v:Float32Array)=>Math.sqrt(v.reduce((sum,s)=>sum+s*s,0)/v.length);
    expect(rms(silent)).toBeLessThan(.001);
    expect(rms(still)).toBeGreaterThan(.000001);
    x.studio_free(a); x.studio_free(b);
  }, 120_000);
  test("bad graph data cannot create an engine handle", () => {
    const x=instance(); const bad=new TextEncoder().encode("{}"); const p=x.chimera_alloc(bad.length);
    new Uint8Array(x.memory.buffer,p,bad.length).set(bad);
    expect(x.studio_new(48000,p,bad.length)).toBe(0); x.chimera_free(p,bad.length);
  });
});
